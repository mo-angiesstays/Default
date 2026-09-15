import { z } from "zod";
import { forbidden, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({ body: z.string().min(1).max(4000) });

export const POST = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const { body } = await parseBody(request, schema);

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, title: true, assigneeId: true, createdById: true },
  });
  if (!task) throw notFound("That task no longer exists");
  if (viewer.role !== "MANAGER" && task.assigneeId !== viewer.id) {
    throw forbidden("That task isn't assigned to you");
  }

  const comment = await prisma.taskComment.create({
    data: { taskId: id, userId: viewer.id, body },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });
  const recipients = [...managers.map((m) => m.id), task.assigneeId].filter(
    (userId): userId is string => Boolean(userId) && userId !== viewer.id,
  );

  await notifyUsers(recipients, {
    title: `${viewer.name} commented on a task`,
    body: body.slice(0, 140),
    link: `/tasks/${id}`,
    kind: "comment",
  });

  return ok({ comment }, 201);
});
