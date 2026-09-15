import type {
  ChecklistType,
  Prisma,
  TaskPriority,
  TaskSource,
  TaskType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";

/** Checklist type that naturally pairs with each kind of task. */
export function checklistTypeForTask(type: TaskType): ChecklistType {
  switch (type) {
    case "TURNOVER":
      return "TURNOVER";
    case "DEEP_CLEAN":
      return "DEEP_CLEAN";
    case "MAINTENANCE":
      return "MAINTENANCE";
    case "INSPECTION":
      return "INSPECTION";
    default:
      return "CUSTOM";
  }
}

/**
 * Picks the checklist for a property: the property's own template wins, and a
 * global template of the same type is the fallback.
 */
export async function resolveChecklistTemplate(propertyId: string, type: ChecklistType) {
  return prisma.checklistTemplate.findFirst({
    where: { type, active: true, OR: [{ propertyId }, { propertyId: null }] },
    // propertyId sorts nulls last on Postgres for desc, putting the
    // property-specific template ahead of the global default.
    orderBy: [{ propertyId: "desc" }, { updatedAt: "desc" }],
    include: { items: { orderBy: { position: "asc" } } },
  });
}

export type CreateTaskInput = {
  propertyId: string;
  type: TaskType;
  title?: string;
  description?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  dueAt?: Date | null;
  estimatedMinutes?: number;
  priority?: TaskPriority;
  source?: TaskSource;
  assigneeId?: string | null;
  createdById?: string | null;
  reservationId?: string | null;
  dedupeKey?: string | null;
  /** Override the checklist that would otherwise be resolved by type. */
  checklistTemplateId?: string | null;
  /** Skip attaching a checklist entirely. */
  skipChecklist?: boolean;
};

/**
 * Creates a task, snapshots the right checklist onto it, and carries every
 * unresolved property issue forward so it reappears on this visit.
 */
export async function createTask(input: CreateTaskInput) {
  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: { id: true, name: true, turnoverMinutes: true, deepCleanMinutes: true },
  });
  if (!property) throw new Error(`Property ${input.propertyId} not found`);

  const estimatedMinutes =
    input.estimatedMinutes ??
    (input.type === "DEEP_CLEAN"
      ? property.deepCleanMinutes
      : input.type === "TURNOVER"
        ? property.turnoverMinutes
        : 60);

  const scheduledEnd =
    input.scheduledEnd ??
    (input.scheduledStart
      ? new Date(input.scheduledStart.getTime() + estimatedMinutes * 60_000)
      : null);

  let items: Prisma.TaskChecklistItemCreateWithoutTaskInput[] = [];
  if (!input.skipChecklist) {
    const template = input.checklistTemplateId
      ? await prisma.checklistTemplate.findUnique({
          where: { id: input.checklistTemplateId },
          include: { items: { orderBy: { position: "asc" } } },
        })
      : await resolveChecklistTemplate(input.propertyId, checklistTypeForTask(input.type));

    items =
      template?.items.map((item, index) => ({
        section: item.section,
        title: item.title,
        description: item.description,
        position: item.position ?? index,
        required: item.required,
        photoRequired: item.photoRequired,
      })) ?? [];
  }

  const task = await prisma.task.create({
    data: {
      propertyId: input.propertyId,
      type: input.type,
      title: input.title ?? defaultTitle(input.type, property.name),
      description: input.description ?? null,
      scheduledStart: input.scheduledStart ?? null,
      scheduledEnd,
      dueAt: input.dueAt ?? null,
      estimatedMinutes,
      priority: input.priority ?? "NORMAL",
      source: input.source ?? "MANUAL",
      status: input.assigneeId ? "ASSIGNED" : "UNASSIGNED",
      assigneeId: input.assigneeId ?? null,
      createdById: input.createdById ?? null,
      reservationId: input.reservationId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      checklistItems: items.length ? { create: items } : undefined,
    },
  });

  await carryOpenIssues(task.id, input.propertyId);

  if (task.assigneeId) {
    await notifyUsers([task.assigneeId], {
      title: `New ${labelForType(task.type)} assigned`,
      body: `${property.name}${task.scheduledStart ? ` — ${task.scheduledStart.toISOString()}` : ""}`,
      link: `/tasks/${task.id}`,
      kind: "task",
    });
  }

  return task;
}

/**
 * Attaches every unresolved issue on the property to the task. This is what
 * makes a reported problem follow the property across turnovers: it shows up
 * on each new visit, with a carry count, until somebody resolves it.
 */
export async function carryOpenIssues(taskId: string, propertyId: string): Promise<number> {
  const open = await prisma.issue.findMany({
    where: { propertyId, status: { not: "RESOLVED" } },
    select: { id: true },
  });
  if (!open.length) return 0;

  const created = await prisma.taskIssueCarry.createMany({
    data: open.map((issue) => ({ issueId: issue.id, taskId })),
    skipDuplicates: true,
  });

  if (created.count > 0) {
    await prisma.issue.updateMany({
      where: { id: { in: open.map((i) => i.id) } },
      data: { carryCount: { increment: 1 } },
    });
  }
  return created.count;
}

export function defaultTitle(type: TaskType, propertyName: string): string {
  return `${labelForType(type)} — ${propertyName}`;
}

export function labelForType(type: TaskType): string {
  switch (type) {
    case "TURNOVER":
      return "Turnover clean";
    case "DEEP_CLEAN":
      return "Deep clean";
    case "MAINTENANCE":
      return "Maintenance";
    case "INSPECTION":
      return "Inspection";
    default:
      return "Task";
  }
}

/** Blocking checklist items that must be ticked before a task can complete. */
export async function outstandingRequiredItems(taskId: string) {
  return prisma.taskChecklistItem.findMany({
    where: { taskId, required: true, completed: false },
    select: { id: true, title: true, section: true },
    orderBy: { position: "asc" },
  });
}
