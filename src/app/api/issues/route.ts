import type { Prisma } from "@prisma/client";
import { handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notifyManagers } from "@/lib/notifications";
import { createTask } from "@/lib/tasks";
import { createIssueSchema, issueStatusEnum } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const viewer = await requireUser();
  const params = new URL(request.url).searchParams;

  const where: Prisma.IssueWhereInput = {};

  const propertyId = params.get("propertyId");
  if (propertyId) where.propertyId = propertyId;

  const status = issueStatusEnum.array().safeParse(params.getAll("status"));
  if (status.success && status.data.length) where.status = { in: status.data };
  else if (params.get("open") !== "false") where.status = { not: "RESOLVED" };

  if (params.get("mine") === "true") where.reportedById = viewer.id;

  const issues = await prisma.issue.findMany({
    where,
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "asc" }],
    include: {
      property: { select: { id: true, name: true, color: true } },
      reportedBy: { select: { id: true, name: true, avatarColor: true } },
      resolvedBy: { select: { id: true, name: true } },
      maintenanceTask: { select: { id: true, status: true, assigneeId: true } },
      _count: { select: { carries: true, comments: true } },
    },
  });

  return ok({ issues });
});

/**
 * Reports an issue against a property. From here it rides along on every
 * future task at that property until somebody resolves it.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, createIssueSchema);

  const property = await prisma.property.findUniqueOrThrow({
    where: { id: input.propertyId },
    select: { id: true, name: true },
  });

  const issue = await prisma.issue.create({
    data: {
      propertyId: input.propertyId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      severity: input.severity,
      photoUrls: input.photoUrls,
      reportedById: viewer.id,
      originTaskId: input.originTaskId ?? null,
      status: "OPEN",
    },
  });

  // Surface it immediately on the task it was reported from.
  if (input.originTaskId) {
    await prisma.taskIssueCarry.createMany({
      data: [{ issueId: issue.id, taskId: input.originTaskId }],
      skipDuplicates: true,
    });
  }

  // Also attach to any already-scheduled future work at this property, so a
  // problem raised today is visible on tomorrow's turnover without a re-sync.
  const futureTasks = await prisma.task.findMany({
    where: {
      propertyId: input.propertyId,
      status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] },
      id: { not: input.originTaskId ?? undefined },
    },
    select: { id: true },
  });
  if (futureTasks.length) {
    await prisma.taskIssueCarry.createMany({
      data: futureTasks.map((task) => ({ issueId: issue.id, taskId: task.id })),
      skipDuplicates: true,
    });
  }

  let maintenanceTaskId: string | null = null;
  const urgent = input.severity === "URGENT" || input.severity === "HIGH";
  if (input.createMaintenanceTask || urgent) {
    const task = await createTask({
      propertyId: input.propertyId,
      type: "MAINTENANCE",
      source: "ISSUE",
      title: `Fix: ${input.title}`,
      description: [
        input.description,
        `Reported by ${viewer.name} (${input.severity.toLowerCase()} severity).`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      priority: input.severity === "URGENT" ? "URGENT" : urgent ? "HIGH" : "NORMAL",
      scheduledStart: input.severity === "URGENT" ? new Date() : null,
      createdById: viewer.id,
    });
    maintenanceTaskId = task.id;
    await prisma.issue.update({
      where: { id: issue.id },
      data: { maintenanceTaskId: task.id, status: "ACKNOWLEDGED" },
    });
  }

  await notifyManagers({
    title: `${input.severity} issue at ${property.name}`,
    body: `${input.title} — reported by ${viewer.name}`,
    link: `/issues`,
    kind: input.severity === "URGENT" ? "alert" : "issue",
  });

  return ok({ issue: { ...issue, maintenanceTaskId } }, 201);
});
