import { NextResponse } from "next/server";
import { handler, notFound, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Serves an uploaded photo.
 *
 * Every read goes through a session check, so buckets and upload directories
 * stay private — a leaked storage path is worth nothing on its own. Local
 * files are streamed; S3 objects are handed over as a short-lived presigned
 * redirect so image traffic doesn't run through the app server.
 */
export const GET = handler(async (_request: Request, context: Context) => {
  await requireUser();
  const { id } = await context.params;

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw notFound("That photo is no longer available");

  const result = await storage()
    .read(asset.storageKey, asset.contentType)
    .catch(() => null);
  if (!result) throw notFound("That photo is no longer available");

  if (result.kind === "redirect") {
    return NextResponse.redirect(result.url, {
      // Don't let a browser cache the redirect past the signature's life.
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.bytes),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${sanitise(asset.filename ?? "photo")}"`,
      // Uploaded content is never same-origin script.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
});

function sanitise(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}
