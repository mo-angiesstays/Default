"use client";

/**
 * Offline queue for photos.
 *
 * The retry button in PhotoCapture only survives while the tab is open. A
 * cleaner in a basement with no signal who closes the app loses the shot, and
 * on a required-photo item that means they can't finish the job. This parks
 * the file in IndexedDB instead, so it survives a reload, and drains when the
 * connection comes back.
 *
 * IndexedDB rather than localStorage because localStorage is strings only and
 * capped around 5MB — one photo would fill it.
 */

const DB_NAME = "turnkeep-offline";
const STORE = "pending-photos";
const VERSION = 1;

export type QueuedPhoto = {
  id: string;
  blob: Blob;
  filename: string;
  width: number | null;
  height: number | null;
  /** Where the URL should land once it uploads. */
  target:
    | { kind: "checklist-item"; taskId: string; itemId: string }
    | { kind: "detached" };
  queuedAt: number;
  attempts: number;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = fn(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export function offlineSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function enqueue(photo: Omit<QueuedPhoto, "id" | "queuedAt" | "attempts">): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await tx("readwrite", (store) =>
    store.put({ ...photo, id, queuedAt: Date.now(), attempts: 0 } satisfies QueuedPhoto),
  );
  return id;
}

export async function listQueued(): Promise<QueuedPhoto[]> {
  if (!offlineSupported()) return [];
  const all = await tx<QueuedPhoto[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedPhoto[]>);
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function remove(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

async function markAttempt(photo: QueuedPhoto, error: string): Promise<void> {
  await tx("readwrite", (store) =>
    store.put({ ...photo, attempts: photo.attempts + 1, lastError: error }),
  );
}

export type DrainResult = { uploaded: number; failed: number; remaining: number };

/**
 * Tries every queued photo once. Called on load, when the browser reports it
 * is back online, and from the pending-uploads banner.
 */
export async function drain(): Promise<DrainResult> {
  if (!offlineSupported()) return { uploaded: 0, failed: 0, remaining: 0 };

  const queued = await listQueued();
  let uploaded = 0;
  let failed = 0;

  for (const photo of queued) {
    try {
      const form = new FormData();
      form.append("file", new File([photo.blob], photo.filename, { type: photo.blob.type }));
      if (photo.width) form.append("width", String(photo.width));
      if (photo.height) form.append("height", String(photo.height));

      const response = await fetch("/api/media", { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${response.status})`);
      }
      const { url } = (await response.json()) as { url: string };

      // Attach it wherever it was meant to go.
      if (photo.target.kind === "checklist-item") {
        const attach = await fetch(
          `/api/tasks/${photo.target.taskId}/checklist/${photo.target.itemId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoUrl: url }),
          },
        );
        if (!attach.ok) throw new Error("Uploaded, but couldn't attach it to the checklist item");
      }

      await remove(photo.id);
      uploaded += 1;
    } catch (error) {
      failed += 1;
      await markAttempt(photo, error instanceof Error ? error.message : "Upload failed");
    }
  }

  return { uploaded, failed, remaining: (await listQueued()).length };
}
