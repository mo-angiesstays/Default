import { badRequest, handler, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buildStorageKey, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Formats a phone camera can realistically produce. */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

/**
 * Receives a photo from a phone.
 *
 * The browser downscales and re-encodes before sending (see PhotoCapture), so
 * what arrives here is normally a few hundred KB rather than a 12-megapixel
 * original. The cap is a backstop against a client that skipped that step.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();

  const form = await request.formData().catch(() => null);
  if (!form) throw badRequest("Send the photo as multipart/form-data");

  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was attached");

  const contentType = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    throw badRequest(`${contentType} isn't an image format we accept`);
  }

  if (file.size === 0) throw badRequest("That file is empty");
  if (file.size > env.storage.maxUploadBytes) {
    const mb = Math.round(env.storage.maxUploadBytes / 1024 / 1024);
    throw badRequest(`That photo is larger than the ${mb}MB limit`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Trust the bytes over the declared type — a mislabelled upload is rejected.
  const sniffed = sniffImageType(buffer);
  if (!sniffed) throw badRequest("That file isn't a readable image");

  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;

  const key = buildStorageKey(file.name || "photo", sniffed);
  await storage().put(key, buffer, sniffed);

  const asset = await prisma.mediaAsset.create({
    data: {
      storageKey: key,
      contentType: sniffed,
      bytes: buffer.byteLength,
      width,
      height,
      filename: file.name || null,
      uploadedById: viewer.id,
    },
  });

  // Callers store this URL, never a bucket path — see the MediaAsset model.
  return ok({ id: asset.id, url: `/api/media/${asset.id}`, bytes: asset.bytes }, 201);
});

/** Magic-number check so a renamed executable can't be stored as a photo. */
function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";

  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    if (buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  }

  // HEIC/HEIF from iPhones: an ISO-BMFF box whose brand starts "heic"/"mif1".
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }

  return null;
}
