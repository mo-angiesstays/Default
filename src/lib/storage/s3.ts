import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import type { ReadResult, StorageDriver, StoredObject } from "@/lib/storage";

/**
 * Any S3-compatible bucket: AWS S3, Cloudflare R2, MinIO, Backblaze B2.
 *
 * The bucket should stay private. Reads hand the browser a short-lived
 * presigned URL rather than proxying the bytes, so image loads don't run
 * through the app server.
 */

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: env.storage.s3.region,
    // R2 and MinIO need an explicit endpoint; AWS derives one from the region.
    ...(env.storage.s3.endpoint ? { endpoint: env.storage.s3.endpoint } : {}),
    // MinIO and most self-hosted gateways only support path-style addressing.
    forcePathStyle: env.storage.s3.forcePathStyle,
    ...(env.storage.s3.accessKeyId && env.storage.s3.secretAccessKey
      ? {
          credentials: {
            accessKeyId: env.storage.s3.accessKeyId,
            secretAccessKey: env.storage.s3.secretAccessKey,
          },
        }
      : {}),
  });
  return client;
}

export function s3Driver(): StorageDriver {
  const bucket = env.storage.s3.bucket;

  return {
    name: "s3",

    async put(key, body, contentType): Promise<StoredObject> {
      await getClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // A year — the key contains a UUID, so an object is never replaced.
          CacheControl: "private, max-age=31536000, immutable",
        }),
      );
      return { storageKey: key };
    },

    async read(key): Promise<ReadResult> {
      const url = await getSignedUrl(
        getClient(),
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: env.storage.s3.signedUrlSeconds },
      );
      return { kind: "redirect", url };
    },

    async delete(key): Promise<void> {
      await getClient()
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        .catch(() => undefined);
    },
  };
}
