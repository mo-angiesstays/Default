import { z } from "zod";
import { forbidden, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { minutesBetween } from "@/lib/time";
import { dateish } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  clockInAt: dateish.optional(),
  clockOutAt: dateish.nullish(),
  notes: z.string().nullish(),
});

/** Managers can correct a mis-punched shift; the edit is flagged on the row. */
export const PATCH = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  if (viewer.role !== "MANAGER") throw forbidden("Only a manager can edit a timesheet entry");

  const { id } = await context.params;
  const input = await parseBody(request, schema);

  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) throw notFound("No such time entry");

  const clockInAt = input.clockInAt ?? existing.clockInAt;
  const clockOutAt =
    input.clockOutAt === undefined ? existing.clockOutAt : (input.clockOutAt ?? null);

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: {
      clockInAt,
      clockOutAt,
      minutes: clockOutAt ? Math.max(0, minutesBetween(clockInAt, clockOutAt)) : null,
      notes: input.notes ?? existing.notes,
      edited: true,
    },
  });

  return ok({ entry });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  if (viewer.role !== "MANAGER") throw forbidden("Only a manager can delete a timesheet entry");
  const { id } = await context.params;
  await prisma.timeEntry.delete({ where: { id } });
  return ok({ ok: true });
});
