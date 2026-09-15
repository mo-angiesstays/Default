import { DateTime } from "luxon";
import { handler, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const viewer = await requireUser();
  const zone = viewer.timezone;

  const todayStart = DateTime.now().setZone(zone).startOf("day").toJSDate();
  const todayEnd = DateTime.now().setZone(zone).endOf("day").toJSDate();
  const weekEnd = DateTime.now().setZone(zone).plus({ days: 7 }).endOf("day").toJSDate();

  const isManager = viewer.role === "MANAGER";
  const scope = isManager ? {} : { assigneeId: viewer.id };

  const [today, upcoming, overdue, unassigned, openIssues, openShift, recentlyCompleted] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          ...scope,
          scheduledStart: { gte: todayStart, lte: todayEnd },
          status: { notIn: ["CANCELLED"] },
        },
        orderBy: { scheduledStart: "asc" },
        include: {
          property: { select: { id: true, name: true, city: true, color: true } },
          assignee: { select: { id: true, name: true, avatarColor: true } },
          _count: { select: { checklistItems: true, carriedIssues: true } },
          checklistItems: { where: { completed: true }, select: { id: true } },
        },
      }),
      prisma.task.findMany({
        where: {
          ...scope,
          scheduledStart: { gt: todayEnd, lte: weekEnd },
          status: { notIn: ["CANCELLED", "COMPLETED", "VERIFIED"] },
        },
        orderBy: { scheduledStart: "asc" },
        take: 25,
        include: {
          property: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, avatarColor: true } },
        },
      }),
      // Past its deadline and still not finished.
      prisma.task.findMany({
        where: {
          ...scope,
          status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] },
          OR: [
            { dueAt: { lt: new Date() } },
            { scheduledStart: { lt: todayStart } },
          ],
        },
        orderBy: { scheduledStart: "asc" },
        take: 25,
        include: {
          property: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, avatarColor: true } },
        },
      }),
      isManager
        ? prisma.task.count({
            where: {
              status: "UNASSIGNED",
              scheduledStart: { not: null, lte: weekEnd },
            },
          })
        : Promise.resolve(0),
      prisma.issue.findMany({
        where: {
          status: { not: "RESOLVED" },
          ...(isManager ? {} : { OR: [{ reportedById: viewer.id }, { severity: "URGENT" }] }),
        },
        orderBy: [{ severity: "desc" }, { carryCount: "desc" }],
        take: 15,
        include: {
          property: { select: { id: true, name: true } },
          reportedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.timeEntry.findFirst({
        where: { userId: viewer.id, clockOutAt: null },
        include: {
          task: { select: { id: true, title: true } },
          property: { select: { id: true, name: true } },
        },
      }),
      prisma.task.count({
        where: {
          ...scope,
          status: { in: ["COMPLETED", "VERIFIED"] },
          completedAt: { gte: DateTime.now().minus({ days: 7 }).toJSDate() },
        },
      }),
    ]);

  const withProgress = today.map(({ checklistItems, ...task }) => ({
    ...task,
    checklistDone: checklistItems.length,
    checklistTotal: task._count.checklistItems,
    openIssueCount: task._count.carriedIssues,
  }));

  return ok({
    today: withProgress,
    upcoming,
    overdue,
    stats: {
      todayCount: today.length,
      todayDone: today.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length,
      upcomingCount: upcoming.length,
      overdueCount: overdue.length,
      unassignedCount: unassigned,
      openIssueCount: openIssues.length,
      completedThisWeek: recentlyCompleted,
    },
    openIssues,
    openShift,
  });
});
