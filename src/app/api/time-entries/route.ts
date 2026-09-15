import type { Prisma } from "@prisma/client";
import { forbidden, handler, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const viewer = await requireUser();
  const params = new URL(request.url).searchParams;

  const where: Prisma.TimeEntryWhereInput = {};

  const requestedUser = params.get("userId");
  if (viewer.role === "MANAGER") {
    if (requestedUser) where.userId = requestedUser;
  } else {
    // Staff only ever see their own timesheet.
    if (requestedUser && requestedUser !== viewer.id) {
      throw forbidden("You can only see your own hours");
    }
    where.userId = viewer.id;
  }

  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    where.clockInAt = {};
    if (from) where.clockInAt.gte = new Date(from);
    if (to) where.clockInAt.lte = new Date(to);
  }

  if (params.get("open") === "true") where.clockOutAt = null;

  const entries = await prisma.timeEntry.findMany({
    where,
    orderBy: { clockInAt: "desc" },
    take: Math.min(Number(params.get("limit") ?? 200), 500),
    include: {
      user: { select: { id: true, name: true, avatarColor: true } },
      task: { select: { id: true, title: true, type: true } },
      property: { select: { id: true, name: true } },
    },
  });

  const totalMinutes = entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);

  return ok({ entries, totalMinutes });
});
