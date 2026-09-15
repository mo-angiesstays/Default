import { handler, notFound, ok, parseBody, requireManager, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { updatePropertySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  await requireUser();
  const { id } = await context.params;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, role: true, avatarColor: true } } },
        orderBy: { priority: "asc" },
      },
      checklistTemplates: {
        where: { active: true },
        select: { id: true, name: true, type: true, _count: { select: { items: true } } },
      },
      issues: {
        where: { status: { not: "RESOLVED" } },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
        include: { reportedBy: { select: { id: true, name: true } } },
      },
      schedulingRules: { where: { active: true } },
    },
  });
  if (!property) throw notFound("No such property");

  const [upcomingTasks, nextReservations] = await Promise.all([
    prisma.task.findMany({
      where: { propertyId: id, status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] } },
      orderBy: { scheduledStart: "asc" },
      take: 20,
      include: { assignee: { select: { id: true, name: true, avatarColor: true } } },
    }),
    prisma.reservation.findMany({
      where: { propertyId: id, checkOut: { gte: new Date() }, status: { notIn: ["CANCELLED"] } },
      orderBy: { checkIn: "asc" },
      take: 10,
    }),
  ]);

  return ok({ property, upcomingTasks, nextReservations });
});

export const PATCH = handler(async (request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  const input = await parseBody(request, updatePropertySchema);

  const property = await prisma.property.update({
    where: { id },
    data: {
      ...input,
      hostawayListingId:
        input.hostawayListingId === undefined ? undefined : input.hostawayListingId || null,
    },
  });
  return ok({ property });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  // Archive instead of deleting so the task history survives.
  await prisma.property.update({ where: { id }, data: { active: false } });
  return ok({ ok: true });
});
