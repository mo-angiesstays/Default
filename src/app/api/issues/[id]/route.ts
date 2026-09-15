import { forbidden, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";
import { updateIssueSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  await requireUser();
  const { id } = await context.params;

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true } },
      reportedBy: { select: { id: true, name: true, avatarColor: true } },
      resolvedBy: { select: { id: true, name: true } },
      originTask: { select: { id: true, title: true, scheduledStart: true } },
      maintenanceTask: { select: { id: true, title: true, status: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
      },
      carries: {
        orderBy: { createdAt: "desc" },
        include: {
          task: {
            select: { id: true, title: true, scheduledStart: true, status: true, type: true },
          },
        },
      },
    },
  });
  if (!issue) throw notFound("No such issue");

  return ok({ issue });
});

/**
 * Cleaners and maintenance staff can mark a job done — that's the whole point
 * of the carry-forward loop. Resolving it detaches it from future tasks.
 */
export const PATCH = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, updateIssueSchema);

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: { property: { select: { name: true } } },
  });
  if (!issue) throw notFound("No such issue");

  const isManager = viewer.role === "MANAGER";
  const isReporter = issue.reportedById === viewer.id;
  const canWork = isManager || viewer.role === "MAINTENANCE" || viewer.role === "CLEANER";
  if (!canWork) throw forbidden("You can't change this issue");

  const data: Record<string, unknown> = {};

  // Editing the description of somebody else's report stays with managers.
  if (isManager || isReporter) {
    for (const key of ["title", "description", "category", "severity", "photoUrls"] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }
  }

  if (input.resolutionNotes !== undefined) data.resolutionNotes = input.resolutionNotes;

  if (input.status && input.status !== issue.status) {
    data.status = input.status;
    if (input.status === "RESOLVED") {
      data.resolvedAt = new Date();
      data.resolvedById = viewer.id;
    } else if (issue.status === "RESOLVED") {
      // Reopening clears the resolution.
      data.resolvedAt = null;
      data.resolvedById = null;
    }
  }

  const updated = await prisma.issue.update({ where: { id }, data });

  if (data.status === "RESOLVED") {
    // Stop carrying it onto work that hasn't started yet.
    await prisma.taskIssueCarry.deleteMany({
      where: {
        issueId: id,
        task: { status: { in: ["UNASSIGNED", "ASSIGNED", "ACCEPTED"] } },
      },
    });

    // Close out the maintenance job opened for it, if it's still open.
    if (issue.maintenanceTaskId) {
      await prisma.task.updateMany({
        where: {
          id: issue.maintenanceTaskId,
          status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] },
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completionNotes: input.resolutionNotes ?? `Resolved by ${viewer.name}`,
        },
      });
    }

    const watchers = await prisma.user.findMany({
      where: { OR: [{ role: "MANAGER", active: true }, { id: issue.reportedById ?? "" }] },
      select: { id: true },
    });
    await notifyUsers(
      watchers.map((w) => w.id).filter((userId) => userId !== viewer.id),
      {
        title: "Issue resolved",
        body: `${viewer.name} closed out "${issue.title}" at ${issue.property.name}`,
        link: "/issues",
        kind: "issue",
      },
    );
  }

  return ok({ issue: updated });
});
