import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { badRequest, handler, notFound, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { analyzeWalkthrough } from "@/lib/vision/analyze";
import { extractFrames, FfmpegMissingError, formatTimestamp } from "@/lib/vision/frames";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES ?? 200 * 1024 * 1024);

/**
 * Walks a property video and turns it into a list of findings.
 *
 * The video itself is never stored — it's sampled to frames, analysed, and the
 * file is discarded. A two-minute clip is 50MB of storage for something whose
 * value is entirely in the findings, and keeping guest-facing footage around
 * is a liability nobody asked for. Findings become issues only when the person
 * ticks the ones they agree with.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();

  const form = await request.formData().catch(() => null);
  if (!form) throw badRequest("Send the video as multipart/form-data");

  const file = form.get("file");
  const propertyId = String(form.get("propertyId") ?? "");
  const note = (form.get("note") as string | null) ?? null;

  if (!(file instanceof File)) throw badRequest("No video was attached");
  if (!propertyId) throw badRequest("A propertyId is required");
  if (!file.type.startsWith("video/")) throw badRequest(`${file.type} isn't a video`);
  if (file.size > MAX_VIDEO_BYTES) {
    throw badRequest(`That video is over the ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB limit`);
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true },
  });
  if (!property) throw notFound("No such property");

  const dir = await mkdtemp(path.join(tmpdir(), "turnkeep-video-"));
  const videoPath = path.join(dir, "upload");

  try {
    await writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

    const { frames, info, intervalSeconds } = await extractFrames(videoPath, {
      everySeconds: Number(form.get("everySeconds")) || 3,
      maxFrames: Number(form.get("maxFrames")) || 20,
    });
    if (!frames.length) throw badRequest("No frames could be read from that video");

    const result = await analyzeWalkthrough({
      frames,
      propertyName: property.name,
      note,
    });

    const analysis = await prisma.visionAnalysis.create({
      data: {
        kind: "WALKTHROUGH",
        propertyId: property.id,
        result: result as object,
        model: env.anthropic.visionModel,
        frameCount: frames.length,
        requestedById: viewer.id,
      },
    });

    return ok({
      analysis: { id: analysis.id },
      result,
      video: {
        durationSeconds: Math.round(info.durationSeconds),
        duration: formatTimestamp(Math.round(info.durationSeconds)),
        framesSampled: frames.length,
        intervalSeconds,
      },
    });
  } catch (error) {
    if (error instanceof FfmpegMissingError) throw badRequest(error.message);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
