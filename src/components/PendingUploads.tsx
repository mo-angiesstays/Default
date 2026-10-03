"use client";

import { useCallback, useEffect, useState } from "react";
import { drain, listQueued, offlineSupported, remove, type QueuedPhoto } from "@/lib/offline-queue";
import { IconCamera } from "@/components/icons";

/**
 * Banner for photos parked offline. Drains on mount, whenever the browser
 * says it's back online, and on demand.
 */
export function PendingUploads() {
  const [queued, setQueued] = useState<QueuedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!offlineSupported()) return;
    setQueued(await listQueued().catch(() => []));
  }, []);

  const run = useCallback(async () => {
    if (!offlineSupported()) return;
    setBusy(true);
    try {
      const result = await drain();
      if (result.uploaded) {
        setNote(`${result.uploaded} photo${result.uploaded === 1 ? "" : "s"} uploaded.`);
        setTimeout(() => setNote(null), 5000);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh().then(() => {
      if (navigator.onLine) void run();
    });
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh, run]);

  if (note) {
    return (
      <div className="mb-4 rounded-xl border border-moss-200 bg-moss-50 px-4 py-2.5 text-sm text-moss-900">
        {note}
      </div>
    );
  }

  if (!queued.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-ochre-200 bg-ochre-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconCamera size={18} className="text-ochre-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ochre-900">
            {queued.length} photo{queued.length === 1 ? "" : "s"} waiting to upload
          </p>
          <p className="text-xs text-ochre-800">
            {navigator.onLine
              ? "Saved on this device. They'll go up as soon as the connection holds."
              : "You're offline. These are safe on this device and will upload automatically."}
          </p>
        </div>
        <button type="button" className="btn-secondary py-1.5 text-xs" disabled={busy} onClick={run}>
          {busy ? "Uploading…" : "Try now"}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5 text-xs text-rust-700"
          onClick={async () => {
            for (const photo of queued) await remove(photo.id);
            await refresh();
          }}
        >
          Discard
        </button>
      </div>
      {queued.some((p) => p.lastError) ? (
        <p className="mt-1.5 text-xs text-ochre-800">
          Last error: {queued.find((p) => p.lastError)?.lastError}
        </p>
      ) : null}
    </div>
  );
}
