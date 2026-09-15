import { env } from "@/lib/env";
import { localDriver } from "@/lib/storage/local";
import { s3Driver } from "@/lib/storage/s3";

/**
 * Where uploaded photos live.
 *
 * Two drivers: local disk, so a self-hosted install works with no cloud
 * account at all, and any S3-compatible bucket (AWS, Cloudflare R2, MinIO,
 * Backblaze) for everyone else. Nothing outside this module knows which is in
 * use, and no storage URL is ever persisted — see the MediaAsset model.
 */

export type StoredObject = {
  storageKey: string;
};

export type ReadResult =
  /** Stream the bytes back ourselves (local disk, private buckets). */
  | { kind: "stream"; body: ReadableStream<Uint8Array>; contentType: string; bytes: number }
  /** Hand the browser a short-lived direct link instead of proxying. */
  | { kind: "redirect"; url: string };

export type StorageDriver = {
  name: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  read(key: string, contentType: string): Promise<ReadResult>;
  delete(key: string): Promise<void>;
};

export function storage(): StorageDriver {
  return env.storage.driver === "s3" ? s3Driver() : localDriver();
}

/**
 * Builds a collision-proof key that also keeps uploads browsable by date,
 * which matters when someone has to go spelunking in a bucket.
 */
export function buildStorageKey(filename: string, contentType: string): string {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const id = crypto.randomUUID();
  return `photos/${datePart}/${id}${extensionFor(filename, contentType)}`;
}

function extensionFor(filename: string, contentType: string): string {
  const fromName = filename.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1]?.toLowerCase();
  if (fromName) return `.${fromName}`;
  const fromType = contentType.split("/")[1]?.split("+")[0];
  return fromType ? `.${fromType.toLowerCase()}` : "";
}
