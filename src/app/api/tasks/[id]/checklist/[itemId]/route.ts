import { z } from "zod";
import { forbidden, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; itemId: string }> };

const schema = z.object({
  completed: z.boolean().optional(),
  notes: z.string().nullish(),
  photoUrl: z.string().nullish(),
});

export const PATCH = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id, itemId } = await context.params;
  const input = await parseBody(request, schema);

  const item = await prisma.taskChecklistItem.findFirst({
    where: { id: itemId, taskId: id },
    include: { task: { select: { assigneeId: true, status: true } } },
  });
  if (!item) throw notFound("That checklist item isn't on this task");

  if (viewer.role !== "MANAGER" && item.task.assigneeId !== viewer.id) {
    throw forbidden("That task isn't assigned to you");
  }

  const data: Record<string, unknown> = {};
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.photoUrl !== undefined) data.photoUrl = input.photoUrl;

  if (input.completed !== undefined) {
    data.completed = input.completed;
    data.completedAt = input.completed ? new Date() : null;
    data.completedById = input.completed ? viewer.id : null;
  }

  const updated = await prisma.taskChecklistItem.update({ where: { id: itemId }, data });

  // First tick on a fresh job starts the clock on it.
  if (input.completed && item.task.status === "ASSIGNED") {
    await prisma.task.update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  }

  const [total, done] = await Promise.all([
    prisma.taskChecklistItem.count({ where: { taskId: id } }),
    prisma.taskChecklistItem.count({ where: { taskId: id, completed: true } }),
  ]);

  return ok({ item: updated, progress: { done, total } });
});
