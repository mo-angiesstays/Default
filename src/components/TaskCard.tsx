"use client";

import Link from "next/link";
import {
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  TASK_STATUS_CLASS,
  TASK_STATUS_LABEL,
  TASK_TYPE_CLASS,
  TASK_TYPE_LABEL,
} from "@/lib/labels";
import { Avatar, Chip, LocalTime, ProgressBar } from "@/components/ui";

export type TaskSummary = {
  id: string;
  title: string;
  type: keyof typeof TASK_TYPE_LABEL;
  status: keyof typeof TASK_STATUS_LABEL;
  priority: keyof typeof PRIORITY_LABEL;
  scheduledStart: string | null;
  dueAt: string | null;
  estimatedMinutes: number;
  property: { id: string; name: string; city?: string | null; color?: string } | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
  checklistDone?: number;
  checklistTotal?: number;
  openIssueCount?: number;
};

export function TaskCard({ task, showAssignee = true }: { task: TaskSummary; showAssignee?: boolean }) {
  const overdue =
    task.dueAt &&
    new Date(task.dueAt) < new Date() &&
    !["COMPLETED", "VERIFIED", "CANCELLED"].includes(task.status);

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="card card-pad block transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 h-10 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: task.property?.color ?? "#61708d" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip className={TASK_TYPE_CLASS[task.type]}>{TASK_TYPE_LABEL[task.type]}</Chip>
            <Chip className={TASK_STATUS_CLASS[task.status]}>{TASK_STATUS_LABEL[task.status]}</Chip>
            {task.priority !== "NORMAL" ? (
              <Chip className={PRIORITY_CLASS[task.priority]}>{PRIORITY_LABEL[task.priority]}</Chip>
            ) : null}
            {task.openIssueCount ? (
              <Chip className="bg-red-50 text-red-700 ring-red-200">
                ⚠ {task.openIssueCount} open issue{task.openIssueCount === 1 ? "" : "s"}
              </Chip>
            ) : null}
          </div>

          <p className="mt-1.5 truncate font-medium text-ink-900">{task.title}</p>
          <p className="truncate text-sm text-ink-500">
            {task.property?.name}
            {task.property?.city ? ` · ${task.property.city}` : ""}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <span>
              🕒 <LocalTime value={task.scheduledStart} />
            </span>
            {task.dueAt ? (
              <span className={overdue ? "font-medium text-red-600" : ""}>
                {overdue ? "⚠ was due " : "due by "}
                <LocalTime value={task.dueAt} format="time" />
              </span>
            ) : null}
            <span>~{task.estimatedMinutes}m</span>
          </div>

          {task.checklistTotal ? (
            <div className="mt-2">
              <ProgressBar done={task.checklistDone ?? 0} total={task.checklistTotal} />
            </div>
          ) : null}
        </div>

        {showAssignee ? (
          <div className="shrink-0">
            {task.assignee ? (
              <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={30} />
            ) : (
              <span className="chip bg-amber-100 text-amber-800 ring-amber-200">Unassigned</span>
            )}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
