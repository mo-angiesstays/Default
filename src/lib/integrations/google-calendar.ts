import { google, type calendar_v3 } from "googleapis";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { labelForType } from "@/lib/tasks";
import { formatInZone } from "@/lib/time";

/**
 * Google Calendar mirror.
 *
 * Every scheduled task becomes a calendar event with the assignee (and the
 * managers) as attendees, so staff get a real invite in the calendar they
 * already use. Uses a service account; attendee invitations require
 * domain-wide delegation, so GOOGLE_IMPERSONATE_USER must name a Workspace
 * user the service account may act as.
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getCalendar(): calendar_v3.Calendar {
  if (!env.google.enabled) {
    throw new Error(
      "Google Calendar is not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }
  const auth = new google.auth.JWT({
    email: env.google.clientEmail,
    key: env.google.privateKey,
    scopes: SCOPES,
    subject: env.google.impersonateUser || undefined,
  });
  return google.calendar({ version: "v3", auth });
}

export type CalendarSyncResult = {
  created: number;
  updated: number;
  cancelled: number;
  failed: { taskId: string; error: string }[];
  skipped: number;
};

export type TaskForCalendar = {
  id: string;
  title: string;
  type: "TURNOVER" | "DEEP_CLEAN" | "MAINTENANCE" | "INSPECTION" | "CUSTOM";
  description: string | null;
  status: string;
  priority: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  dueAt: Date | null;
  estimatedMinutes: number;
  googleEventId: string | null;
  googleCalendarId: string | null;
  assignee: { name: string; email: string } | null;
  property: {
    name: string;
    timezone: string;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    accessNotes: string | null;
  };
};

/** Exported so the event shape can be asserted without calling Google. */
export function buildCalendarEvent(
  task: TaskForCalendar,
  attendees: string[],
): calendar_v3.Schema$Event {
  const start = task.scheduledStart!;
  const end =
    task.scheduledEnd ?? new Date(start.getTime() + task.estimatedMinutes * 60_000);

  const location = [
    task.property.addressLine1,
    task.property.city,
    task.property.state,
    task.property.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `${labelForType(task.type)} at ${task.property.name}`,
    task.assignee ? `Assigned to: ${task.assignee.name}` : "Unassigned",
    `Estimated: ${task.estimatedMinutes} minutes`,
    task.dueAt
      ? `Must be finished by ${formatInZone(task.dueAt, task.property.timezone)}`
      : null,
    task.description ? `\n${task.description}` : null,
    task.property.accessNotes ? `\nAccess: ${task.property.accessNotes}` : null,
    `\nOpen in TurnKeep: ${env.appUrl}/tasks/${task.id}`,
  ].filter(Boolean);

  return {
    summary: `${task.priority === "URGENT" ? "🔴 " : ""}${task.title}`,
    description: lines.join("\n"),
    location: location || undefined,
    start: { dateTime: start.toISOString(), timeZone: task.property.timezone },
    end: { dateTime: end.toISOString(), timeZone: task.property.timezone },
    attendees: attendees.map((email) => ({ email })),
    guestsCanModify: false,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 10 },
      ],
    },
    // Lets us find the event again even if our stored id is lost.
    extendedProperties: { private: { turnkeepTaskId: task.id } },
  };
}

/** Pushes one task to Google. Returns the event id, or null when not syncable. */
export async function syncTaskToCalendar(taskId: string): Promise<string | null> {
  const task = (await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { name: true, email: true } },
      property: {
        select: {
          name: true,
          timezone: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          accessNotes: true,
        },
      },
    },
  })) as TaskForCalendar | null;

  if (!task) throw new Error(`Task ${taskId} not found`);
  if (!task.scheduledStart) return null;

  const calendar = getCalendar();
  const calendarId = task.googleCalendarId ?? env.google.calendarId;

  // Cancelled or finished work shouldn't keep sitting on anyone's calendar.
  if (task.status === "CANCELLED") {
    if (task.googleEventId) {
      await calendar.events
        .delete({ calendarId, eventId: task.googleEventId, sendUpdates: "all" })
        .catch(() => undefined);
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: null, googleSyncedAt: new Date(), googleSyncError: null },
      });
    }
    return null;
  }

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { email: true },
  });

  const attendees = [
    ...(task.assignee?.email ? [task.assignee.email] : []),
    ...managers.map((m) => m.email),
  ].filter((email, index, all) => all.indexOf(email) === index);

  const body = buildCalendarEvent(task, attendees);

  try {
    let eventId = task.googleEventId;

    if (eventId) {
      const response = await calendar.events.update({
        calendarId,
        eventId,
        sendUpdates: "all",
        requestBody: body,
      });
      eventId = response.data.id ?? eventId;
    } else {
      const response = await calendar.events.insert({
        calendarId,
        sendUpdates: "all",
        requestBody: body,
      });
      eventId = response.data.id ?? null;
    }

    await prisma.task.update({
      where: { id: task.id },
      data: {
        googleEventId: eventId,
        googleCalendarId: calendarId,
        googleSyncedAt: new Date(),
        googleSyncError: null,
      },
    });
    return eventId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // A deleted event upstream should be recreated, not retried forever.
    if (task.googleEventId && /not found|deleted|410|404/i.test(message)) {
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: null },
      });
      return syncTaskToCalendar(taskId);
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { googleSyncError: message.slice(0, 500), googleSyncedAt: new Date() },
    });
    throw error;
  }
}

/** Pushes every task that is scheduled but not yet mirrored (or has drifted). */
export async function syncPendingTasks(options?: {
  daysAhead?: number;
  limit?: number;
}): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    created: 0,
    updated: 0,
    cancelled: 0,
    failed: [],
    skipped: 0,
  };

  if (!env.google.enabled) {
    result.skipped = -1; // signals "integration off" to the caller
    return result;
  }

  const horizon = new Date(Date.now() + (options?.daysAhead ?? 60) * 24 * 60 * 60 * 1000);

  // Staleness is tracked explicitly: every write that changes what the event
  // should say (time, assignee, title, status) clears googleSyncedAt. Comparing
  // updatedAt against googleSyncedAt instead would re-push on every run — the
  // sync's own write bumps updatedAt a moment after the timestamp it stores,
  // which would mail a fresh invite to every attendee each time the job ran.
  const tasks = await prisma.task.findMany({
    where: {
      scheduledStart: { not: null, lte: horizon },
      status: { notIn: ["COMPLETED", "VERIFIED"] },
      OR: [
        { googleSyncedAt: null },
        { googleEventId: null, status: { not: "CANCELLED" } },
      ],
    },
    orderBy: { scheduledStart: "asc" },
    take: options?.limit ?? 200,
    select: { id: true, googleEventId: true, status: true },
  });

  for (const task of tasks) {
    try {
      const hadEvent = Boolean(task.googleEventId);
      const eventId = await syncTaskToCalendar(task.id);
      if (task.status === "CANCELLED") result.cancelled += 1;
      else if (!eventId) result.skipped += 1;
      else if (hadEvent) result.updated += 1;
      else result.created += 1;
    } catch (error) {
      result.failed.push({
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  if (!env.google.enabled) {
    return { ok: false, message: "GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY are not set." };
  }
  try {
    const calendar = getCalendar();
    const response = await calendar.calendars.get({ calendarId: env.google.calendarId });
    const warning = env.google.impersonateUser
      ? ""
      : " Note: GOOGLE_IMPERSONATE_USER is unset, so attendee invites will not be delivered.";
    return {
      ok: true,
      message: `Connected to "${response.data.summary ?? env.google.calendarId}".${warning}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function runCalendarSync() {
  const run = await prisma.jobRun.create({ data: { job: "calendar-sync" } });
  try {
    const summary = await syncPendingTasks();
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
