import { handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { minutesBetween } from "@/lib/time";
import { clockOutSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, clockOutSchema);

  const open = await prisma.timeEntry.findFirst({
    where: { userId: viewer.id, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) throw notFound("You're not clocked in right now");

  const clockOutAt = new Date();
  const entry = await prisma.timeEntry.update({
    where: { id: open.id },
    data: {
      clockOutAt,
      minutes: Math.max(0, minutesBetween(open.clockInAt, clockOutAt)),
      notes: input.notes ?? open.notes,
      clockOutLat: input.lat ?? null,
      clockOutLng: input.lng ?? null,
    },
    include: {
      task: { select: { id: true, title: true } },
      property: { select: { id: true, name: true } },
    },
  });

  return ok({ entry });
});
