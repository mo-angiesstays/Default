import { z } from "zod";
import { badRequest, forbidden, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { checkTurnoverPhoto } from "@/lib/vision/analyze";
import { loadImages, mediaIdsFromUrls } from "@/lib/vision/media";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ checklistItemId: z.string().min(1) });

/**
 * Reviews a checklist photo.
 *
 * Manager-initiated only, and advisory: it never ticks, unticks or fails
 * anything. A cleaner's photo is not auto-graded — see the note in
 * lib/vision/analyze.ts.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  if (viewer.role !== "MANAGER") throw forbidden("Only a manager can run a photo check");

  const { checklistItemId } = await parseBody(request, schema);

  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: checklistItemId },
    include: { task: { include: { property: { select: { id: true, name: true } } } } },
  });
  if (!item) throw notFound("No such checklist item");
  if (!item.photoUrl) throw badRequest("That item has no photo");

  const mediaIds = mediaIdsFromUrls([item.photoUrl]);
  const images = await loadImages(mediaIds);
  if (!images.length) throw badRequest("Couldn't read the photo back from storage");

  const result = await checkTurnoverPhoto({
    images,
    itemTitle: item.title,
    propertyName: item.task.property.name,
  });

  const analysis = await prisma.visionAnalysis.create({
    data: {
      kind: "TURNOVER_CHECK",
      taskId: item.taskId,
      propertyId: item.task.property.id,
      mediaIds,
      result: result as object,
      model: env.anthropic.visionModel,
      requestedById: viewer.id,
    },
  });

  return ok({ analysis: { id: analysis.id }, result });
});
