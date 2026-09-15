import { handler, ok, requireManager } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireManager();

  const [recentRuns, linkedProperties, unlinkedProperties, pendingCalendar] = await Promise.all([
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.property.count({ where: { hostawayListingId: { not: null }, active: true } }),
    prisma.property.count({ where: { hostawayListingId: null, active: true } }),
    prisma.task.count({
      where: {
        scheduledStart: { not: null },
        status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] },
        googleEventId: null,
      },
    }),
  ]);

  return ok({
    hostaway: {
      configured: env.hostaway.enabled,
      baseUrl: env.hostaway.baseUrl,
      linkedProperties,
      unlinkedProperties,
    },
    google: {
      configured: env.google.enabled,
      calendarId: env.google.calendarId,
      impersonating: env.google.impersonateUser || null,
      // Without delegation the events are created but nobody gets invited.
      canInviteAttendees: Boolean(env.google.impersonateUser),
      pendingCalendar,
    },
    ai: { configured: env.anthropic.enabled, model: env.anthropic.model },
    cron: { configured: Boolean(env.cronSecret) },
    recentRuns,
  });
});
