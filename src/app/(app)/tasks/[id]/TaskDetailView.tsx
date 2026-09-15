"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { api, fetcher } from "@/lib/client";
import {
  ISSUE_STATUS_CLASS,
  ISSUE_STATUS_LABEL,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  TASK_STATUS_CLASS,
  TASK_STATUS_LABEL,
  TASK_TYPE_CLASS,
  TASK_TYPE_LABEL,
} from "@/lib/labels";
import { Avatar, Chip, ErrorNote, LocalTime, ProgressBar, Spinner } from "@/components/ui";
import { ReportIssueButton } from "@/components/ReportIssueDialog";
import { PhotoCapture, PhotoStrip } from "@/components/PhotoCapture";
import { AssignPanel } from "@/components/AssignPanel";

type ChecklistItem = {
  id: string;
  section: string;
  title: string;
  description: string | null;
  required: boolean;
  photoRequired: boolean;
  completed: boolean;
  notes: string | null;
  photoUrl: string | null;
  completedBy: { name: string } | null;
  completedAt: string | null;
};

type CarriedIssue = {
  id: string;
  acknowledged: boolean;
  issue: {
    id: string;
    title: string;
    description: string | null;
    severity: keyof typeof SEVERITY_LABEL;
    status: keyof typeof ISSUE_STATUS_LABEL;
    category: string;
    carryCount: number;
    createdAt: string;
    photoUrls: string[];
    reportedBy: { name: string } | null;
  };
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  type: keyof typeof TASK_TYPE_LABEL;
  status: keyof typeof TASK_STATUS_LABEL;
  priority: keyof typeof PRIORITY_LABEL;
  scheduledStart: string | null;
  dueAt: string | null;
  estimatedMinutes: number;
  completionNotes: string | null;
  assignmentReason: string | null;
  autoAssigned: boolean;
  googleEventId: string | null;
  googleSyncError: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string; phone: string | null; avatarColor: string } | null;
  property: {
    id: string;
    name: string;
    addressLine1: string | null;
    city: string | null;
    accessNotes: string | null;
    parkingNotes: string | null;
    wifiName: string | null;
    supplyNotes: string | null;
  };
  reservation: { guestName: string | null; checkOut: string; sameDayTurn: boolean } | null;
  checklistItems: ChecklistItem[];
  carriedIssues: CarriedIssue[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    user: { id: string; name: string; avatarColor: string };
  }[];
  timeEntries: {
    id: string;
    clockInAt: string;
    clockOutAt: string | null;
    minutes: number | null;
    user: { name: string };
  }[];
};

export function TaskDetailView({
  taskId,
  viewer,
}: {
  taskId: string;
  viewer: { id: string; role: Role; name: string };
}) {
  const { data, error, isLoading, mutate } = useSWR<{ task: TaskDetail }>(
    `/api/tasks/${taskId}`,
    fetcher,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Spinner />;

  const task = data.task;
  const isManager = viewer.role === "MANAGER";
  const isAssignee = task.assigneeId === viewer.id;
  const canWork = isManager || isAssignee;

  const done = task.checklistItems.filter((item) => item.completed).length;
  const total = task.checklistItems.length;
  const untickedRequired = task.checklistItems.filter(
    (item) => item.required && !item.completed,
  ).length;
  const missingPhotos = task.checklistItems.filter(
    (item) => item.photoRequired && !item.photoUrl,
  ).length;
  const blockers = untickedRequired + missingPhotos;

  const sections = [...new Set(task.checklistItems.map((item) => item.section))];
  const openIssues = task.carriedIssues.filter((carry) => carry.issue.status !== "RESOLVED");

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await mutate();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: string) =>
    act(() =>
      api(`/api/tasks/${taskId}`, {
        method: "PATCH",
        json: { status, ...(notes !== null ? { completionNotes: notes } : {}) },
      }),
    );

  const toggleItem = (item: ChecklistItem) =>
    act(() =>
      api(`/api/tasks/${taskId}/checklist/${item.id}`, {
        method: "PATCH",
        json: { completed: !item.completed },
      }),
    );

  return (
    <div className="space-y-4">
      <Link href="/tasks" className="text-sm text-brand-600 hover:underline">
        ← All tasks
      </Link>

      <div className="card card-pad space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className={TASK_TYPE_CLASS[task.type]}>{TASK_TYPE_LABEL[task.type]}</Chip>
          <Chip className={TASK_STATUS_CLASS[task.status]}>{TASK_STATUS_LABEL[task.status]}</Chip>
          {task.priority !== "NORMAL" ? (
            <Chip className={PRIORITY_CLASS[task.priority]}>{PRIORITY_LABEL[task.priority]}</Chip>
          ) : null}
          {task.reservation?.sameDayTurn ? (
            <Chip className="bg-red-50 text-red-700 ring-red-200">Same-day turn</Chip>
          ) : null}
          {task.googleEventId ? (
            <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200">📅 On calendar</Chip>
          ) : null}
        </div>

        <div>
          <h1 className="text-xl font-semibold text-ink-900">{task.title}</h1>
          <Link
            href={`/properties/${task.property.id}`}
            className="text-sm text-brand-600 hover:underline"
          >
            {task.property.name}
            {task.property.city ? ` · ${task.property.city}` : ""}
          </Link>
        </div>

        <div className="grid gap-2 text-sm text-ink-600 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Scheduled</p>
            <p>
              <LocalTime value={task.scheduledStart} />
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Must finish by</p>
            <p>{task.dueAt ? <LocalTime value={task.dueAt} /> : "No hard deadline"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Assigned to</p>
            {task.assignee ? (
              <span className="flex items-center gap-1.5">
                <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={20} />
                {task.assignee.name}
              </span>
            ) : (
              <span className="text-amber-600">Nobody yet</span>
            )}
          </div>
        </div>

        {task.description ? (
          <p className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
            {task.description}
          </p>
        ) : null}

        {task.assignmentReason ? (
          <p className="text-xs text-ink-500">
            <span className="font-medium">
              {task.autoAssigned ? "Auto-assigned" : "Assigned"}:
            </span>{" "}
            {task.assignmentReason}
          </p>
        ) : null}

        {task.googleSyncError ? (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            Calendar sync problem: {task.googleSyncError}
          </p>
        ) : null}

        <ErrorNote error={actionError} />

        {canWork ? (
          <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
            {["ASSIGNED", "ACCEPTED"].includes(task.status) ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => setStatus("IN_PROGRESS")}
              >
                Start work
              </button>
            ) : null}
            {task.status === "IN_PROGRESS" ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy || blockers > 0}
                title={
                  blockers > 0
                    ? [
                        untickedRequired ? `${untickedRequired} item(s) still open` : null,
                        missingPhotos ? `${missingPhotos} item(s) still need a photo` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : undefined
                }
                onClick={() => setStatus("COMPLETED")}
              >
                {blockers > 0
                  ? missingPhotos && !untickedRequired
                    ? `${missingPhotos} photo${missingPhotos === 1 ? "" : "s"} needed`
                    : `${blockers} item${blockers === 1 ? "" : "s"} left`
                  : "Mark complete"}
              </button>
            ) : null}
            {!["COMPLETED", "VERIFIED", "CANCELLED", "BLOCKED"].includes(task.status) ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setStatus("BLOCKED")}
              >
                Can&apos;t complete — flag it
              </button>
            ) : null}
            {task.status === "BLOCKED" ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setStatus("IN_PROGRESS")}
              >
                Unblock
              </button>
            ) : null}
            {isManager && task.status === "COMPLETED" ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => setStatus("VERIFIED")}
              >
                Verify
              </button>
            ) : null}

            <ReportIssueButton
              propertyId={task.property.id}
              taskId={task.id}
              onCreated={() => mutate()}
            />

            <ClockButton taskId={task.id} />
          </div>
        ) : null}
      </div>

      {openIssues.length ? (
        <section className="card card-pad space-y-2 border-amber-300 bg-amber-50/50">
          <div className="flex items-center justify-between">
            <h2 className="section-title text-amber-800">
              Open issues at this property ({openIssues.length})
            </h2>
          </div>
          <p className="text-xs text-amber-800">
            These stay on every visit until somebody marks the work done.
          </p>
          <div className="space-y-2">
            {openIssues.map((carry) => (
              <IssueRow
                key={carry.id}
                carry={carry}
                canResolve={canWork}
                onChanged={() => mutate()}
              />
            ))}
          </div>
        </section>
      ) : null}

      {total ? (
        <section className="card card-pad space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Checklist</h2>
            <div className="w-40">
              <ProgressBar done={done} total={total} />
            </div>
          </div>

          {sections.map((section) => (
            <div key={section} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                {section}
              </p>
              <ul className="divide-y divide-ink-100">
                {task.checklistItems
                  .filter((item) => item.section === section)
                  .map((item) => (
                    <ChecklistRow
                      key={item.id}
                      taskId={task.id}
                      item={item}
                      canWork={canWork}
                      busy={busy}
                      onToggle={() => toggleItem(item)}
                      onChanged={() => mutate()}
                    />
                  ))}
              </ul>
            </div>
          ))}

          {task.status === "IN_PROGRESS" && canWork ? (
            <div>
              <label className="label">Completion notes</label>
              <textarea
                className="input min-h-16"
                placeholder="Anything the manager should know"
                value={notes ?? task.completionNotes ?? ""}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PropertyInfo property={task.property} reservation={task.reservation} />

        <div className="space-y-4">
          {isManager ? <AssignPanel taskId={task.id} onAssigned={() => mutate()} /> : null}
          <CommentThread taskId={task.id} comments={task.comments} onPosted={() => mutate()} />
        </div>
      </div>

      {task.timeEntries.length ? (
        <section className="card card-pad space-y-2">
          <h2 className="section-title">Time logged</h2>
          <ul className="divide-y divide-ink-100 text-sm">
            {task.timeEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between py-1.5">
                <span className="text-ink-700">{entry.user.name}</span>
                <span className="text-ink-500">
                  <LocalTime value={entry.clockInAt} format="time" />
                  {" – "}
                  {entry.clockOutAt ? (
                    <LocalTime value={entry.clockOutAt} format="time" />
                  ) : (
                    <span className="text-emerald-600">running</span>
                  )}
                  {entry.minutes != null ? ` · ${entry.minutes}m` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * One checklist line. An item flagged photoRequired shows a camera button and
 * keeps the task open until a picture is attached — the flag is a real gate,
 * not a suggestion.
 */
function ChecklistRow({
  taskId,
  item,
  canWork,
  busy,
  onToggle,
  onChanged,
}: {
  taskId: string;
  item: ChecklistItem;
  canWork: boolean;
  busy: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const needsPhoto = item.photoRequired && !item.photoUrl;

  const setPhoto = async (urls: string[]) => {
    setSaving(true);
    try {
      await api(`/api/tasks/${taskId}/checklist/${item.id}`, {
        method: "PATCH",
        json: { photoUrl: urls[0] ?? null },
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={item.completed}
        disabled={!canWork || busy}
        onChange={onToggle}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${item.completed ? "text-ink-400 line-through" : "text-ink-900"}`}>
          {item.title}
          {item.required ? null : <span className="ml-1 text-xs text-ink-400">(optional)</span>}
          {needsPhoto ? (
            <span className="ml-1.5 chip bg-amber-100 text-amber-800 ring-amber-200">
              📷 photo needed
            </span>
          ) : null}
        </p>
        {item.description ? <p className="text-xs text-ink-500">{item.description}</p> : null}

        {item.photoRequired && canWork ? (
          <div className="mt-1.5">
            <PhotoCapture
              value={item.photoUrl ? [item.photoUrl] : []}
              onChange={setPhoto}
              max={1}
              disabled={saving}
              label="Photo"
            />
          </div>
        ) : item.photoUrl ? (
          <div className="mt-1.5">
            <PhotoStrip urls={[item.photoUrl]} size={56} />
          </div>
        ) : null}

        {item.completed && item.completedBy ? (
          <p className="mt-1 text-xs text-ink-400">
            {item.completedBy.name} · <LocalTime value={item.completedAt} format="time" />
          </p>
        ) : null}
      </div>
    </li>
  );
}

function IssueRow({
  carry,
  canResolve,
  onChanged,
}: {
  carry: CarriedIssue;
  canResolve: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const issue = carry.issue;

  const resolve = async () => {
    setBusy(true);
    try {
      // An "after" photo goes on the issue as a comment, so the original
      // report and the proof of the fix sit side by side in its history.
      if (proof.length) {
        await api(`/api/issues/${issue.id}/comments`, {
          method: "POST",
          json: { body: notes || "Fixed — photo attached.", photoUrls: proof },
        });
      }
      await api(`/api/issues/${issue.id}`, {
        method: "PATCH",
        json: { status: "RESOLVED", resolutionNotes: notes || undefined },
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip className={SEVERITY_CLASS[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Chip>
        <Chip className={ISSUE_STATUS_CLASS[issue.status]}>{ISSUE_STATUS_LABEL[issue.status]}</Chip>
        {issue.carryCount > 1 ? (
          <Chip className="bg-ink-100 text-ink-600 ring-ink-200">
            Carried {issue.carryCount}×
          </Chip>
        ) : null}
      </div>
      <p className="mt-1.5 font-medium text-ink-900">{issue.title}</p>
      {issue.description ? (
        <p className="text-sm text-ink-600">{issue.description}</p>
      ) : null}
      {issue.photoUrls.length ? (
        <div className="mt-1.5">
          <PhotoStrip urls={issue.photoUrls} size={56} />
        </div>
      ) : null}
      <p className="mt-1 text-xs text-ink-400">
        Reported by {issue.reportedBy?.name ?? "someone"} ·{" "}
        <LocalTime value={issue.createdAt} format="relative" />
      </p>

      {canResolve ? (
        expanded ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="input min-h-16"
              placeholder="What did you do to fix it?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <PhotoCapture
              value={proof}
              onChange={setProof}
              max={3}
              label="Photo of the fix"
              hint="Optional, but it settles any question about whether it was done."
            />
            <div className="flex gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={resolve}>
                {busy ? "Saving…" : "Mark job completed"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setExpanded(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary mt-2"
            onClick={() => setExpanded(true)}
          >
            Mark job completed
          </button>
        )
      ) : null}
    </div>
  );
}

function PropertyInfo({
  property,
  reservation,
}: {
  property: TaskDetail["property"];
  reservation: TaskDetail["reservation"];
}) {
  const rows = [
    ["Address", [property.addressLine1, property.city].filter(Boolean).join(", ")],
    ["Access", property.accessNotes],
    ["Parking", property.parkingNotes],
    ["Wi-Fi", property.wifiName],
    ["Supplies", property.supplyNotes],
    ["Departing guest", reservation?.guestName],
  ].filter(([, value]) => Boolean(value));

  if (!rows.length) return null;

  return (
    <section className="card card-pad space-y-2">
      <h2 className="section-title">Property notes</h2>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label as string}>
            <dt className="text-xs uppercase tracking-wide text-ink-400">{label}</dt>
            <dd className="whitespace-pre-wrap text-ink-700">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CommentThread({
  taskId,
  comments,
  onPosted,
}: {
  taskId: string;
  comments: TaskDetail["comments"];
  onPosted: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${taskId}/comments`, { method: "POST", json: { body } });
      setBody("");
      onPosted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad space-y-3">
      <h2 className="section-title">Notes & comments</h2>
      <div className="space-y-2">
        {comments.length ? (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              <Avatar name={comment.user.name} color={comment.user.avatarColor} size={26} />
              <div className="min-w-0 flex-1 rounded-lg bg-ink-50 px-3 py-2">
                <p className="text-xs text-ink-500">
                  {comment.user.name} · <LocalTime value={comment.createdAt} format="relative" />
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink-800">{comment.body}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-400">No comments yet.</p>
        )}
      </div>
      <form onSubmit={post} className="flex gap-2">
        <input
          className="input"
          placeholder="Add a note…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={busy || !body.trim()}>
          Post
        </button>
      </form>
    </section>
  );
}

function ClockButton({ taskId }: { taskId: string }) {
  const { data, mutate } = useSWR<{ openShift: { id: string } | null }>("/api/auth/me", fetcher);
  const [busy, setBusy] = useState(false);
  const running = Boolean(data?.openShift);

  const toggle = async () => {
    setBusy(true);
    try {
      await api(running ? "/api/time-entries/clock-out" : "/api/time-entries/clock-in", {
        method: "POST",
        json: running ? {} : { taskId },
      });
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn-secondary" disabled={busy} onClick={toggle}>
      {running ? "⏹ Clock out" : "⏱ Clock in"}
    </button>
  );
}
