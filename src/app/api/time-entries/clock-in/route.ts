import { conflict, handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { clockInSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Starts a shift. The time clock is opt-in — nothing else in the app depends
 * on it — but a person can only have one shift running at a time.
 */
export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, clockInSchema);

  const open = await prisma.timeEntry.findFirst({
    where: { userId: viewer.id, clockOutAt: null },
  });
  if (open) {
    throw conflict("You're already clocked in — clock out before starting another shift");
  }

  // Default the property from the task so the timesheet reads sensibly.
  let propertyId = input.propertyId ?? null;
  if (!propertyId && input.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: input.taskId },
      select: { propertyId: true },
    });
    propertyId = task?.propertyId ?? null;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: viewer.id,
      taskId: input.taskId ?? null,
      propertyId,
      clockInAt: new Date(),
      notes: input.notes ?? null,
      clockInLat: input.lat ?? null,
      clockInLng: input.lng ?? null,
    },
    include: {
      task: { select: { id: true, title: true } },
      property: { select: { id: true, name: true } },
    },
  });

  // Clocking in on an assigned job moves it into progress.
  if (input.taskId) {
    await prisma.task.updateMany({
      where: { id: input.taskId, assigneeId: viewer.id, status: { in: ["ASSIGNED", "ACCEPTED"] } },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  }

  return ok({ entry }, 201);
});
