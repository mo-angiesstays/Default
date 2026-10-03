import { z } from "zod";
import { handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const schema = z.object({
  analysisId: z.string().min(1),
  /** Indexes into the analysis's findings array that the person agreed with. */
  acceptIndexes: z.array(z.number().int().min(0)).min(1),
});

type Finding = {
  at_timestamp: string;
  what: string;
  suggested_severity: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  suggested_category:
    | "MAINTENANCE" | "DAMAGE" | "SUPPLIES" | "SAFETY" | "CLEANLINESS" | "APPLIANCE" | "OTHER";
};

/**
 * Turns the findings a person ticked into real issues.
 *
 * Deliberately a second step: the model proposes, a human decides. Auto-raising
 * every finding would bury the board in false positives within a week.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const { analysisId, acceptIndexes } = await parseBody(request, schema);

  const analysis = await prisma.visionAnalysis.findUnique({
    where: { id: analysisId },
    include: { property: { select: { id: true, name: true } } },
  });
  if (!analysis || !analysis.property) throw notFound("No such analysis");

  const findings = ((analysis.result as { findings?: Finding[] })?.findings ?? []).filter(
    (_, index) => acceptIndexes.includes(index),
  );
  if (!findings.length) throw notFound("None of those findings exist on this analysis");

  const created: { id: string; title: string }[] = [];

  for (const finding of findings) {
    const issue = await prisma.issue.create({
      data: {
        propertyId: analysis.property.id,
        title: finding.what.slice(0, 160),
        description: `Spotted in a walkthrough video at ${finding.at_timestamp}, confirmed by ${viewer.name}.`,
        severity: finding.suggested_severity,
        category: finding.suggested_category,
        reportedById: viewer.id,
        status: "OPEN",
      },
    });

    // Same carry-forward behaviour as a hand-reported issue.
    const future = await prisma.task.findMany({
      where: {
        propertyId: analysis.property.id,
        status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] },
      },
      select: { id: true },
    });
    if (future.length) {
      await prisma.taskIssueCarry.createMany({
        data: future.map((t) => ({ issueId: issue.id, taskId: t.id })),
        skipDuplicates: true,
      });
    }

    if (finding.suggested_severity === "HIGH" || finding.suggested_severity === "URGENT") {
      const task = await createTask({
        propertyId: analysis.property.id,
        type: "MAINTENANCE",
        source: "ISSUE",
        title: `Fix: ${finding.what.slice(0, 140)}`,
        priority: finding.suggested_severity === "URGENT" ? "URGENT" : "HIGH",
        createdById: viewer.id,
      });
      await prisma.issue.update({
        where: { id: issue.id },
        data: { maintenanceTaskId: task.id, status: "ACKNOWLEDGED" },
      });
    }

    created.push({ id: issue.id, title: issue.title });
  }

  return ok({ created });
});
