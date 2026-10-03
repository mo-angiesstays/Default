import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

/** Pulls stored photos back out of storage as base64 for the vision call. */
export async function loadImages(
  mediaIds: string[],
): Promise<{ base64: string; mediaType: string }[]> {
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: mediaIds } } });
  const driver = storage();
  const images: { base64: string; mediaType: string }[] = [];

  for (const asset of assets) {
    const result = await driver.read(asset.storageKey, asset.contentType);
    if (result.kind === "stream") {
      const buffer = Buffer.from(await new Response(result.body).arrayBuffer());
      images.push({ base64: buffer.toString("base64"), mediaType: asset.contentType });
    } else {
      // S3 hands back a signed URL; fetch it server-side rather than streaming
      // through the browser.
      const response = await fetch(result.url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      images.push({ base64: buffer.toString("base64"), mediaType: asset.contentType });
    }
  }
  return images;
}

/** `/api/media/<id>` → `<id>`, so stored URLs can be resolved back to assets. */
export function mediaIdsFromUrls(urls: string[]): string[] {
  return urls
    .map((url) => url.match(/\/api\/media\/([A-Za-z0-9_-]+)/)?.[1])
    .filter((id): id is string => Boolean(id));
}
