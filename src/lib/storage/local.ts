import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import type { ReadResult, StorageDriver, StoredObject } from "@/lib/storage";

/**
 * Local-disk driver. Good enough for a single-box install; note that on an
 * ephemeral filesystem (most container platforms) the directory needs to be a
 * mounted volume or photos vanish on redeploy.
 */
export function localDriver(): StorageDriver {
  const root = path.resolve(env.storage.localDir);

  /** Refuses any key that would escape the upload directory. */
  const resolveKey = (key: string): string => {
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  };

  return {
    name: "local",

    async put(key, body, _contentType): Promise<StoredObject> {
      const full = resolveKey(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { storageKey: key };
    },

    async read(key, contentType): Promise<ReadResult> {
      const full = resolveKey(key);
      const info = await stat(full);
      const stream = Readable.toWeb(
        createReadStream(full),
      ) as ReadableStream<Uint8Array>;
      return { kind: "stream", body: stream, contentType, bytes: info.size };
    },

    async delete(key): Promise<void> {
      await unlink(resolveKey(key)).catch(() => undefined);
    },
  };
}
