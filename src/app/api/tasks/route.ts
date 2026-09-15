import type { Prisma } from "@prisma/client";
import { badRequest, handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createTask } from "@/lib/tasks";
import { createTaskSchema, taskStatusEnum, taskTypeEnum } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const viewer = await requireUser();
  const params = new URL(request.url).searchParams;

  const where: Prisma.TaskWhereInput = {};

  // Cleaners and maintenance only ever see their own board.
  const mine = params.get("mine") === "true" || viewer.role !== "MANAGER";
  if (mine) where.assigneeId = viewer.id;

  const assigneeId = params.get("assigneeId");
  if (assigneeId && viewer.role === "MANAGER") {
    where.assigneeId = assigneeId === "unassigned" ? null : assigneeId;
  }

  const propertyId = params.get("propertyId");
  if (propertyId) where.propertyId = propertyId;

  const status = taskStatusEnum.array().safeParse(params.getAll("status"));
  if (status.success && status.data.length) where.status = { in: status.data };
  else if (params.get("open") === "true") {
    where.status = { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] };
  }

  const type = taskTypeEnum.array().safeParse(params.getAll("type"));
  if (type.success && type.data.length) where.type = { in: type.data };

  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    where.scheduledStart = {};
    if (from) {
      const date = new Date(from);
      if (Number.isNaN(date.getTime())) throw badRequest("`from` is not a valid date");
      where.scheduledStart.gte = date;
    }
    if (to) {
      const date = new Date(to);
      if (Number.isNaN(date.getTime())) throw badRequest("`to` is not a valid date");
      where.scheduledStart.lte = date;
    }
  }

  const search = params.get("q");
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { property: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const take = Math.min(Number(params.get("limit") ?? 200), 500);

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
    take,
    include: {
      property: { select: { id: true, name: true, city: true, color: true, timezone: true } },
      assignee: { select: { id: true, name: true, avatarColor: true } },
      _count: {
        select: {
          checklistItems: true,
          carriedIssues: true,
        },
      },
      checklistItems: { where: { completed: true }, select: { id: true } },
    },
  });

  return ok({
    tasks: tasks.map(({ checklistItems, ...task }) => ({
      ...task,
      checklistDone: checklistItems.length,
      checklistTotal: task._count.checklistItems,
      openIssueCount: task._count.carriedIssues,
    })),
  });
});

export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, createTaskSchema);

  // Non-managers can raise work but can't hand it to somebody else.
  const assigneeId =
    viewer.role === "MANAGER" ? (input.assigneeId ?? null) : null;

  const task = await createTask({
    propertyId: input.propertyId,
    type: input.type,
    title: input.title,
    description: input.description,
    scheduledStart: input.scheduledStart ?? null,
    scheduledEnd: input.scheduledEnd ?? null,
    dueAt: input.dueAt ?? null,
    estimatedMinutes: input.estimatedMinutes,
    priority: input.priority,
    source: "MANUAL",
    assigneeId,
    createdById: viewer.id,
    checklistTemplateId: input.checklistTemplateId,
    skipChecklist: input.skipChecklist,
  });

  return ok({ task }, 201);
});
