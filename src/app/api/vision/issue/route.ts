import { z } from "zod";
import { badRequest, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { analyzeIssuePhotos } from "@/lib/vision/analyze";
import { loadImages, mediaIdsFromUrls } from "@/lib/vision/media";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ issueId: z.string().min(1) });

/**
 * Triages a reported issue from its photos.
 *
 * The result is stored next to the issue and shown as a suggestion. It never
 * changes the severity the person chose — a manager decides whether to take
 * the advice.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const { issueId } = await parseBody(request, schema);

  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { property: { select: { id: true, name: true } } },
  });
  if (!issue) throw notFound("No such issue");
  if (!issue.photoUrls.length) {
    throw badRequest("That issue has no photos to look at");
  }

  const mediaIds = mediaIdsFromUrls(issue.photoUrls);
  const images = await loadImages(mediaIds);
  if (!images.length) throw badRequest("Couldn't read the photos back from storage");

  // Prior issues at the property are useful context — a stain that was already
  // reported twice is a different conversation from a new one.
  const history = await prisma.issue.findMany({
    where: { propertyId: issue.propertyId, id: { not: issue.id } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, status: true, carryCount: true },
  });

  const result = await analyzeIssuePhotos({
    images,
    title: issue.title,
    description: issue.description,
    propertyName: issue.property.name,
    priorHistory: history.length
      ? history
          .map((h) => `${h.title} (${h.status.toLowerCase()}, carried ${h.carryCount}x)`)
          .join("; ")
      : null,
  });

  const analysis = await prisma.visionAnalysis.create({
    data: {
      kind: "ISSUE_TRIAGE",
      issueId: issue.id,
      propertyId: issue.propertyId,
      mediaIds,
      result: result as object,
      model: env.anthropic.visionModel,
      requestedById: viewer.id,
    },
  });

  return ok({ analysis: { id: analysis.id, createdAt: analysis.createdAt }, result });
});
