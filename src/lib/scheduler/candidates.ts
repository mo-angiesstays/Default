import { DateTime } from "luxon";
import type { Role, Task, TaskType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localDayOfWeek, localMinutes } from "@/lib/time";

/**
 * Builds the eligible-worker list for a task.
 *
 * Everything in here is a *hard* constraint: a person who fails one is never
 * offered to the AI. The AI may only choose among the survivors, so no prompt
 * — or prompt injection — can put somebody on a job they're barred from.
 */

export type CandidateFact = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  skills: string[];
  score: number;
  reasons: string[];
  /** Jobs already on this person's plate that day. */
  tasksThatDay: number;
  maxDailyTasks: number;
  /** 1 = first-choice for the property, null = no preference set. */
  preferencePriority: number | null;
  /** Times this person has worked this property before. */
  historyCount: number;
  /** Minutes of gap from their previous job that day, null if it's their first. */
  gapFromPreviousMin: number | null;
  /** Straight-line km from their previous job that day. */
  travelKm: number | null;
};

export type CandidateResult = {
  eligible: CandidateFact[];
  /** People excluded, with the reason — shown to managers so "why nobody?" is answerable. */
  rejected: { userId: string; name: string; reason: string }[];
};

/**
 * Who may take a task, split into the people whose job it actually is and the
 * people who can cover it at a pinch. Both are eligible; the fallback group is
 * scored down so a manager never beats an available cleaner on a clean.
 */
export function rolesForTaskType(type: TaskType): { primary: Role[]; fallback: Role[] } {
  switch (type) {
    case "MAINTENANCE":
      return { primary: ["MAINTENANCE"], fallback: ["MANAGER"] };
    case "INSPECTION":
      return { primary: ["MANAGER"], fallback: ["MAINTENANCE", "CLEANER"] };
    default:
      return { primary: ["CLEANER"], fallback: ["MANAGER"] };
  }
}

type TaskForScheduling = Pick<
  Task,
  | "id"
  | "propertyId"
  | "type"
  | "scheduledStart"
  | "scheduledEnd"
  | "estimatedMinutes"
  | "dueAt"
  | "priority"
>;

export async function findCandidates(task: TaskForScheduling): Promise<CandidateResult> {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: task.propertyId },
    select: { id: true, name: true, timezone: true, lat: true, lng: true },
  });
  const zone = property.timezone;

  const start = task.scheduledStart;
  if (!start) {
    return {
      eligible: [],
      rejected: [{ userId: "", name: "—", reason: "Task has no scheduled start to plan around" }],
    };
  }
  const end =
    task.scheduledEnd ?? new Date(start.getTime() + (task.estimatedMinutes || 120) * 60_000);

  const { primary, fallback } = rolesForTaskType(task.type);
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: [...primary, ...fallback] } },
    include: {
      availability: true,
      timeOff: { where: { startsAt: { lte: end }, endsAt: { gte: start } } },
      propertyAssignments: { where: { propertyId: property.id } },
    },
  });

  const dayStart = DateTime.fromJSDate(start, { zone }).startOf("day").toJSDate();
  const dayEnd = DateTime.fromJSDate(start, { zone }).endOf("day").toJSDate();

  const sameDayTasks = await prisma.task.findMany({
    where: {
      assigneeId: { in: users.map((u) => u.id) },
      status: { notIn: ["CANCELLED", "COMPLETED", "VERIFIED"] },
      scheduledStart: { gte: dayStart, lte: dayEnd },
      id: { not: task.id },
    },
    select: {
      id: true,
      assigneeId: true,
      scheduledStart: true,
      scheduledEnd: true,
      estimatedMinutes: true,
      propertyId: true,
      property: { select: { lat: true, lng: true, name: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  const historyRows = await prisma.task.groupBy({
    by: ["assigneeId"],
    where: {
      propertyId: property.id,
      status: { in: ["COMPLETED", "VERIFIED"] },
      assigneeId: { in: users.map((u) => u.id) },
    },
    _count: { _all: true },
  });
  const historyByUser = new Map(
    historyRows.map((row) => [row.assigneeId ?? "", row._count._all]),
  );

  const hardRules = await prisma.schedulingRule.findMany({
    where: {
      active: true,
      hard: true,
      OR: [{ propertyId: null }, { propertyId: property.id }],
    },
  });

  const eligible: CandidateFact[] = [];
  const rejected: { userId: string; name: string; reason: string }[] = [];

  for (const user of users) {
    const reject = (reason: string) => rejected.push({ userId: user.id, name: user.name, reason });

    if (user.propertyAssignments.some((a) => a.excluded)) {
      reject(`Blocked from ${property.name}`);
      continue;
    }
    if (user.timeOff.length > 0) {
      reject("On time off during this window");
      continue;
    }

    // Weekly availability: if any windows are defined, the task must fall inside
    // one. An urgent job is the exception — a burst pipe or a jammed lock can't
    // wait for office hours, so we offer everyone who isn't otherwise blocked
    // and let the manager see who was out of hours.
    let outOfHours = false;
    if (user.availability.length > 0) {
      const dow = localDayOfWeek(start, zone);
      const startMin = localMinutes(start, zone);
      const endMin = localMinutes(end, zone);
      const fits = user.availability.some(
        (slot) => slot.dayOfWeek === dow && slot.startMin <= startMin && slot.endMin >= endMin,
      );
      if (!fits) {
        if (task.priority !== "URGENT") {
          reject("Outside their stated working hours");
          continue;
        }
        outOfHours = true;
      }
    }

    const mine = sameDayTasks.filter((t) => t.assigneeId === user.id);

    const overlap = mine.find((t) => {
      if (!t.scheduledStart) return false;
      const tEnd =
        t.scheduledEnd ?? new Date(t.scheduledStart.getTime() + t.estimatedMinutes * 60_000);
      return t.scheduledStart < end && tEnd > start;
    });
    if (overlap) {
      reject("Already booked at that time");
      continue;
    }

    if (mine.length >= user.maxDailyTasks) {
      reject(`At their daily cap (${user.maxDailyTasks} jobs)`);
      continue;
    }

    const hardViolation = checkHardRules(hardRules, {
      taskType: task.type,
      tasksThatDay: mine.length,
      skills: user.skills,
    });
    if (hardViolation) {
      reject(hardViolation);
      continue;
    }

    // ── Scoring (soft preferences only, from here down) ──
    const preference = user.propertyAssignments[0]?.priority ?? null;
    const history = historyByUser.get(user.id) ?? 0;

    const previous = mine
      .filter((t) => t.scheduledStart && t.scheduledStart <= start)
      .sort((a, b) => (b.scheduledStart!.getTime() ?? 0) - (a.scheduledStart!.getTime() ?? 0))[0];

    const previousEnd = previous?.scheduledStart
      ? (previous.scheduledEnd ??
        new Date(previous.scheduledStart.getTime() + previous.estimatedMinutes * 60_000))
      : null;
    const gapFromPreviousMin = previousEnd
      ? Math.round((start.getTime() - previousEnd.getTime()) / 60_000)
      : null;
    const travelKm =
      previous && property.lat != null && property.lng != null
        ? haversineKm(previous.property.lat, previous.property.lng, property.lat, property.lng)
        : null;

    let score = 50;
    const reasons: string[] = [];

    if (outOfHours) {
      score -= 20;
      reasons.push("Outside their usual hours — offered because the job is urgent");
    }

    // Someone covering outside their own role is a fallback, not a first pick.
    if (!primary.includes(user.role)) {
      score -= 25;
      reasons.push(`Covering outside their role (${user.role.toLowerCase()})`);
    }

    if (preference === 1) {
      score += 30;
      reasons.push(`First-choice cleaner for ${property.name}`);
    } else if (preference != null) {
      score += Math.max(0, 22 - preference * 6);
      reasons.push(`Preference #${preference} for ${property.name}`);
    }

    if (history > 0) {
      const bump = Math.min(15, history * 3);
      score += bump;
      reasons.push(`Has completed ${history} job${history === 1 ? "" : "s"} here`);
    }

    // Lighter days win, so work spreads instead of piling on one person.
    const loadPenalty = mine.length * 8;
    score -= loadPenalty;
    if (mine.length === 0) reasons.push("Free all day");
    else reasons.push(`${mine.length} other job${mine.length === 1 ? "" : "s"} that day`);

    if (travelKm != null) {
      if (travelKm < 3) {
        score += 12;
        reasons.push(`Previous job is ${travelKm.toFixed(1)} km away`);
      } else if (travelKm > 30) {
        score -= 12;
        reasons.push(`Long hop — ${travelKm.toFixed(0)} km from their previous job`);
      }
    }

    if (gapFromPreviousMin != null && gapFromPreviousMin < 30) {
      score -= 10;
      reasons.push(`Only ${gapFromPreviousMin}m after their previous job`);
    }

    if (task.type === "DEEP_CLEAN" && user.skills.includes("deep-clean")) {
      score += 10;
      reasons.push("Tagged for deep cleans");
    }

    eligible.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      skills: user.skills,
      score: Math.round(score),
      reasons,
      tasksThatDay: mine.length,
      maxDailyTasks: user.maxDailyTasks,
      preferencePriority: preference,
      historyCount: history,
      gapFromPreviousMin,
      travelKm: travelKm == null ? null : Number(travelKm.toFixed(1)),
    });
  }

  eligible.sort((a, b) => b.score - a.score);
  return { eligible, rejected };
}

type HardRuleConfig = {
  maxPerDay?: number;
  requireSkill?: string;
  requireAnySkill?: string[];
};

function checkHardRules(
  rules: { instruction: string; config: unknown; taskTypes: TaskType[] }[],
  context: { taskType: TaskType; tasksThatDay: number; skills: string[] },
): string | null {
  for (const rule of rules) {
    if (rule.taskTypes.length && !rule.taskTypes.includes(context.taskType)) continue;
    const config = (rule.config ?? {}) as HardRuleConfig;

    if (typeof config.maxPerDay === "number" && context.tasksThatDay >= config.maxPerDay) {
      return `Rule "${rule.instruction}" caps them at ${config.maxPerDay} jobs a day`;
    }
    if (config.requireSkill && !context.skills.includes(config.requireSkill)) {
      return `Rule "${rule.instruction}" requires the "${config.requireSkill}" skill`;
    }
    if (config.requireAnySkill?.length) {
      const has = config.requireAnySkill.some((skill) => context.skills.includes(skill));
      if (!has) {
        return `Rule "${rule.instruction}" requires one of: ${config.requireAnySkill.join(", ")}`;
      }
    }
  }
  return null;
}

export function haversineKm(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
