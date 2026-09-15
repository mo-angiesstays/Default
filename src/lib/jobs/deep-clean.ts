import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createTask, resolveChecklistTemplate } from "@/lib/tasks";
import { atLocalTime } from "@/lib/time";

export type DeepCleanSummary = {
  monthsGenerated: string[];
  created: number;
  skipped: number;
  warnings: string[];
};

/**
 * Generates the monthly deep clean for every property that has it switched on.
 *
 * The deep clean is placed on the property's chosen day of the month, and
 * nudged to the first free day if a guest is in residence — a deep clean can't
 * happen mid-stay. It runs for the current month and `monthsAhead` after it,
 * and is idempotent through a per-property-per-month dedupe key.
 */
export async function generateDeepCleans(options?: {
  monthsAhead?: number;
  now?: Date;
}): Promise<DeepCleanSummary> {
  const monthsAhead = options?.monthsAhead ?? 2;
  const now = options?.now ?? new Date();

  const summary: DeepCleanSummary = {
    monthsGenerated: [],
    created: 0,
    skipped: 0,
    warnings: [],
  };

  const properties = await prisma.property.findMany({
    where: { active: true, deepCleanEnabled: true },
  });

  for (const property of properties) {
    const zone = property.timezone || env.defaultTimezone;
    const template = await resolveChecklistTemplate(property.id, "DEEP_CLEAN");
    if (!template) {
      summary.warnings.push(
        `${property.name}: no deep-clean checklist found — the task was created without one.`,
      );
    }

    for (let offset = 0; offset <= monthsAhead; offset += 1) {
      const month = DateTime.fromJSDate(now, { zone }).plus({ months: offset }).startOf("month");
      const monthKey = month.toFormat("yyyy-LL");
      if (!summary.monthsGenerated.includes(monthKey)) summary.monthsGenerated.push(monthKey);

      const dedupeKey = `deepclean:${property.id}:${monthKey}`;
      const existing = await prisma.task.findUnique({ where: { dedupeKey } });
      if (existing) {
        summary.skipped += 1;
        continue;
      }

      const targetDay = Math.min(Math.max(property.deepCleanDayOfMonth ?? 1, 1), month.daysInMonth ?? 28);
      let target = month.set({ day: targetDay });

      // Don't schedule a deep clean in the past when catching up mid-month.
      const today = DateTime.fromJSDate(now, { zone }).startOf("day");
      if (target < today) {
        if (offset === 0) {
          summary.skipped += 1;
          continue;
        }
        target = today;
      }

      const slot = await firstFreeDay(property.id, target, zone, month.endOf("month"));
      if (!slot) {
        summary.warnings.push(
          `${property.name}: fully booked in ${monthKey}, no gap for a deep clean.`,
        );
        summary.skipped += 1;
        continue;
      }

      const start = atLocalTime(slot.toJSDate(), property.checkOutTime, zone);
      await createTask({
        propertyId: property.id,
        type: "DEEP_CLEAN",
        source: "RECURRING",
        dedupeKey,
        scheduledStart: start,
        estimatedMinutes: property.deepCleanMinutes,
        // End of the working day, not midnight — a deep clean that slips past
        // 18:00 should read as late, and a midnight deadline reads as nonsense
        // to anyone in a different timezone from the property.
        dueAt: atLocalTime(slot.toJSDate(), "18:00", zone),
        priority: "NORMAL",
        title: `Deep clean — ${property.name} (${month.toFormat("LLLL yyyy")})`,
        description: `Monthly deep clean for ${month.toFormat("LLLL yyyy")}.${
          slot.toISODate() !== target.toISODate()
            ? ` Moved from the ${targetDay}${ordinal(targetDay)} because the property was occupied.`
            : ""
        }`,
        checklistTemplateId: template?.id ?? null,
        skipChecklist: !template,
      });
      summary.created += 1;
    }
  }

  return summary;
}

/**
 * Walks forward from `from` to the first day with no guest in residence,
 * staying inside the month where possible.
 */
async function firstFreeDay(
  propertyId: string,
  from: DateTime,
  zone: string,
  limit: DateTime,
): Promise<DateTime | null> {
  const windowStart = from.startOf("day").toJSDate();
  const windowEnd = limit.endOf("day").toJSDate();

  const reservations = await prisma.reservation.findMany({
    where: {
      propertyId,
      status: { notIn: ["CANCELLED", "INQUIRY"] },
      checkOut: { gte: windowStart },
      checkIn: { lte: windowEnd },
    },
    select: { checkIn: true, checkOut: true },
  });

  for (let day = from.startOf("day"); day <= limit; day = day.plus({ days: 1 })) {
    const dayStart = day.toJSDate();
    const dayEnd = day.endOf("day").toJSDate();
    // A stay blocks the day unless the guest leaves that morning — a
    // check-out day is exactly when a deep clean can happen.
    const occupied = reservations.some(
      (r) =>
        r.checkIn < dayEnd &&
        r.checkOut > dayStart &&
        DateTime.fromJSDate(r.checkOut, { zone }).toISODate() !== day.toISODate(),
    );
    if (!occupied) return day;
  }
  return null;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export async function runDeepCleanGeneration() {
  const run = await prisma.jobRun.create({ data: { job: "deep-clean-generation" } });
  try {
    const summary = await generateDeepCleans();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), summary: summary as object },
    });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    throw error;
  }
}
