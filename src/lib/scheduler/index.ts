import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";
import { decideAssignment, ruleBasedDecision, type SchedulingContext } from "@/lib/scheduler/ai";
import { findCandidates } from "@/lib/scheduler/candidates";
import { labelForType } from "@/lib/tasks";
import { formatInZone } from "@/lib/time";

export type AssignmentProposal = {
  taskId: string;
  taskTitle: string;
  propertyName: string;
  scheduledStart: Date | null;
  chosenUserId: string | null;
  chosenUserName: string | null;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  method: "ai" | "rules";
  ruleConflicts: string[];
  candidates: { userId: string; name: string; score: number; reasons: string[] }[];
  rejected: { name: string; reason: string }[];
};

/** Works out who should take a task without writing anything. */
export async function proposeAssignment(taskId: string): Promise<AssignmentProposal> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      property: true,
      reservation: { select: { sameDayTurn: true } },
    },
  });

  const { eligible, rejected } = await findCandidates(task);

  const [rules, openIssues] = await Promise.all([
    prisma.schedulingRule.findMany({
      where: {
        active: true,
        hard: false,
        OR: [{ propertyId: null }, { propertyId: task.propertyId }],
      },
      orderBy: { weight: "desc" },
    }),
    prisma.issue.findMany({
      where: { propertyId: task.propertyId, status: { not: "RESOLVED" } },
      orderBy: { severity: "desc" },
      take: 10,
    }),
  ]);

  const applicableRules = rules.filter(
    (rule) => rule.taskTypes.length === 0 || rule.taskTypes.includes(task.type),
  );

  const context: SchedulingContext = {
    task: {
      id: task.id,
      type: task.type,
      title: task.title,
      scheduledStart: task.scheduledStart?.toISOString() ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      estimatedMinutes: task.estimatedMinutes,
      priority: task.priority,
      sameDayTurn: task.reservation?.sameDayTurn ?? false,
    },
    property: {
      name: task.property.name,
      city: task.property.city,
      bedrooms: task.property.bedrooms,
      bathrooms: task.property.bathrooms,
      timezone: task.property.timezone,
    },
    openIssues: openIssues.map((i) => ({
      title: i.title,
      severity: i.severity,
      category: i.category,
      carryCount: i.carryCount,
    })),
    rules: applicableRules.map((r) => ({
      name: r.name,
      instruction: r.instruction,
      kind: r.kind,
      weight: r.weight,
    })),
    candidates: eligible,
  };

  const decision = eligible.length
    ? await decideAssignment(context)
    : ruleBasedDecision(eligible);

  const chosen = eligible.find((c) => c.userId === decision.chosen_user_id) ?? null;

  return {
    taskId: task.id,
    taskTitle: task.title,
    propertyName: task.property.name,
    scheduledStart: task.scheduledStart,
    chosenUserId: chosen?.userId ?? null,
    chosenUserName: chosen?.name ?? null,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    method: decision.method,
    ruleConflicts: decision.rule_conflicts,
    candidates: eligible.map((c) => ({
      userId: c.userId,
      name: c.name,
      score: c.score,
      reasons: c.reasons,
    })),
    rejected: rejected.filter((r) => r.userId).map((r) => ({ name: r.name, reason: r.reason })),
  };
}

/** Applies a proposal: assigns the task, notifies, and queues a calendar push. */
export async function applyAssignment(
  proposal: AssignmentProposal,
  options?: { auto?: boolean },
): Promise<boolean> {
  if (!proposal.chosenUserId) return false;

  const task = await prisma.task.update({
    where: { id: proposal.taskId },
    data: {
      assigneeId: proposal.chosenUserId,
      status: "ASSIGNED",
      autoAssigned: options?.auto ?? true,
      assignmentReason: `${proposal.method === "ai" ? "AI" : "Rules"} · ${proposal.confidence} confidence — ${proposal.reasoning}`,
      assignmentScore:
        proposal.candidates.find((c) => c.userId === proposal.chosenUserId)?.score ?? null,
      // Force a calendar refresh so the invite lands with the new assignee.
      googleSyncedAt: null,
    },
    include: { property: { select: { name: true, timezone: true } } },
  });

  await notifyUsers([proposal.chosenUserId], {
    title: `${labelForType(task.type)} assigned to you`,
    body: `${task.property.name}${
      task.scheduledStart
        ? ` — ${formatInZone(task.scheduledStart, task.property.timezone)}`
        : ""
    }`,
    link: `/tasks/${task.id}`,
    kind: "task",
  });

  return true;
}

export type AutoScheduleResult = {
  considered: number;
  assigned: number;
  unassigned: { taskId: string; title: string; reason: string }[];
  proposals: AssignmentProposal[];
};

/**
 * Fills every unassigned task in the window.
 *
 * Tasks are handled in schedule order so earlier jobs claim their preferred
 * cleaner first and later ones plan around what's already booked.
 */
export async function autoScheduleUnassigned(options?: {
  daysAhead?: number;
  dryRun?: boolean;
  taskIds?: string[];
}): Promise<AutoScheduleResult> {
  const daysAhead = options?.daysAhead ?? 14;
  const horizon = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: options?.taskIds?.length
      ? { id: { in: options.taskIds } }
      : {
          status: "UNASSIGNED",
          assigneeId: null,
          scheduledStart: { not: null, lte: horizon },
        },
    orderBy: { scheduledStart: "asc" },
    select: { id: true, title: true },
  });

  const result: AutoScheduleResult = {
    considered: tasks.length,
    assigned: 0,
    unassigned: [],
    proposals: [],
  };

  for (const task of tasks) {
    const proposal = await proposeAssignment(task.id);
    result.proposals.push(proposal);

    if (!proposal.chosenUserId) {
      result.unassigned.push({
        taskId: task.id,
        title: task.title,
        reason: proposal.reasoning,
      });
      continue;
    }

    if (!options?.dryRun) {
      const applied = await applyAssignment(proposal, { auto: true });
      if (applied) result.assigned += 1;
    } else {
      result.assigned += 1;
    }
  }

  return result;
}

export async function runAutoScheduler(options?: { daysAhead?: number }) {
  const run = await prisma.jobRun.create({ data: { job: "auto-scheduler" } });
  try {
    const result = await autoScheduleUnassigned(options);
    const summary = {
      considered: result.considered,
      assigned: result.assigned,
      unassigned: result.unassigned,
    };
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), summary: summary as object },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    throw error;
  }
}
