import type { TaskStatus } from "@prisma/client";
import {
  badRequest,
  forbidden,
  handler,
  notFound,
  ok,
  parseBody,
  requireUser,
} from "@/lib/api";
import { prisma } from "@/lib/db";
import { notifyManagers, notifyUsers } from "@/lib/notifications";
import { outstandingRequiredItems } from "@/lib/tasks";
import { updateTaskSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      property: true,
      assignee: { select: { id: true, name: true, email: true, phone: true, avatarColor: true } },
      createdBy: { select: { id: true, name: true } },
      reservation: true,
      checklistItems: {
        orderBy: [{ position: "asc" }],
        include: { completedBy: { select: { id: true, name: true } } },
      },
      carriedIssues: {
        include: {
          issue: {
            include: {
              reportedBy: { select: { id: true, name: true } },
              resolvedBy: { select: { id: true, name: true } },
            },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
      },
      timeEntries: {
        orderBy: { clockInAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!task) throw notFound("That task no longer exists");

  if (viewer.role !== "MANAGER" && task.assigneeId !== viewer.id) {
    throw forbidden("That task isn't assigned to you");
  }

  return ok({ task });
});

/** Which status moves make sense from where. */
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  UNASSIGNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "IN_PROGRESS", "UNASSIGNED", "BLOCKED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "BLOCKED", "UNASSIGNED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "BLOCKED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "ASSIGNED", "CANCELLED"],
  COMPLETED: ["VERIFIED", "IN_PROGRESS"],
  VERIFIED: ["IN_PROGRESS"],
  CANCELLED: ["UNASSIGNED", "ASSIGNED"],
};

export const PATCH = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, updateTaskSchema);

  const task = await prisma.task.findUnique({
    where: { id },
    include: { property: { select: { name: true } } },
  });
  if (!task) throw notFound("That task no longer exists");

  const isManager = viewer.role === "MANAGER";
  const isAssignee = task.assigneeId === viewer.id;
  if (!isManager && !isAssignee) throw forbidden("That task isn't assigned to you");

  const data: Record<string, unknown> = {};

  // Scheduling, reassignment and priority stay with managers.
  if (isManager) {
    for (const key of [
      "title",
      "description",
      "priority",
      "scheduledStart",
      "scheduledEnd",
      "dueAt",
      "estimatedMinutes",
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }

    if (input.assigneeId !== undefined) {
      data.assigneeId = input.assigneeId || null;
      data.autoAssigned = false;
      data.assignmentReason = `Assigned by ${viewer.name}`;
      if (input.assigneeId && task.status === "UNASSIGNED") data.status = "ASSIGNED";
      if (!input.assigneeId) data.status = "UNASSIGNED";
    }
  }

  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;

  if (input.status && input.status !== task.status) {
    const allowed = ALLOWED_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(input.status) && !isManager) {
      throw badRequest(`A ${task.status} task can't move straight to ${input.status}`);
    }

    // Finishing a job means the required checklist is actually done.
    if (input.status === "COMPLETED") {
      const outstanding = await outstandingRequiredItems(id);
      if (outstanding.length) {
        throw badRequest(
          `${outstanding.length} required checklist item${
            outstanding.length === 1 ? " is" : "s are"
          } still open: ${outstanding
            .slice(0, 3)
            .map((i) => i.title)
            .join(", ")}${outstanding.length > 3 ? "…" : ""}`,
        );
      }
      data.completedAt = new Date();
    }

    if (input.status === "IN_PROGRESS" && !task.startedAt) data.startedAt = new Date();
    if (input.status === "VERIFIED") {
      if (!isManager) throw forbidden("Only a manager can verify a task");
      data.verifiedAt = new Date();
    }
    data.status = input.status;
  }

  // Anything that changes the event needs a calendar re-push.
  const calendarFields = ["scheduledStart", "scheduledEnd", "assigneeId", "title", "status"];
  if (calendarFields.some((field) => field in data)) data.googleSyncedAt = null;

  const updated = await prisma.task.update({
    where: { id },
    data,
    include: {
      property: { select: { name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  if (data.assigneeId && data.assigneeId !== task.assigneeId) {
    await notifyUsers([data.assigneeId as string], {
      title: "A job was assigned to you",
      body: `${updated.title} at ${updated.property.name}`,
      link: `/tasks/${id}`,
      kind: "task",
    });
  }

  if (data.status === "COMPLETED") {
    await notifyManagers({
      title: "Job completed",
      body: `${updated.assignee?.name ?? "Someone"} finished ${updated.title}`,
      link: `/tasks/${id}`,
      kind: "task",
    });
  }

  if (data.status === "BLOCKED") {
    await notifyManagers({
      title: "Job blocked",
      body: `${updated.title} at ${updated.property.name} needs attention`,
      link: `/tasks/${id}`,
      kind: "alert",
    });
  }

  return ok({ task: updated });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  if (viewer.role !== "MANAGER") throw forbidden("Only a manager can cancel a task");
  const { id } = await context.params;

  const task = await prisma.task.update({
    where: { id },
    data: { status: "CANCELLED", googleSyncedAt: null },
  });
  return ok({ task });
});
