"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { fetcher } from "@/lib/client";
import { TASK_STATUS_CLASS, TASK_TYPE_LABEL } from "@/lib/labels";
import { EmptyState, ErrorNote, Spinner } from "@/components/ui";
import type { TaskSummary } from "@/components/TaskCard";

export function CalendarView({ role }: { role: Role }) {
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<"week" | "month">("week");

  const { from, to, days } = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 7);
      return { from: start, to: end, days: buildDays(start, 7) };
    }
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(monthStart);
    const gridDays = 42;
    return { from: gridStart, to: addDays(gridStart, gridDays), days: buildDays(gridStart, gridDays) };
  }, [anchor, view]);

  const { data, error, isLoading } = useSWR<{ tasks: TaskSummary[] }>(
    `/api/tasks?from=${from.toISOString()}&to=${to.toISOString()}&limit=500`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const byDay = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const task of data?.tasks ?? []) {
      if (!task.scheduledStart) continue;
      const key = dayKey(new Date(task.scheduledStart));
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const shift = (direction: number) =>
    setAnchor((current) =>
      view === "week"
        ? addDays(current, direction * 7)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Calendar</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
            {(["week", "month"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`rounded-md px-3 py-1 text-sm capitalize ${
                  view === value ? "bg-white font-medium shadow-sm" : "text-ink-600"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary px-2" onClick={() => shift(-1)}>
            ←
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setAnchor(startOfWeek(new Date()))}
          >
            Today
          </button>
          <button type="button" className="btn-secondary px-2" onClick={() => shift(1)}>
            →
          </button>
        </div>
      </div>

      <p className="text-sm text-ink-500">
        {from.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </p>

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="bg-ink-50 px-2 py-1.5 text-center text-xs font-semibold text-ink-500">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const tasks = byDay.get(dayKey(day)) ?? [];
          const isToday = dayKey(day) === dayKey(new Date());
          const outOfMonth = view === "month" && day.getMonth() !== anchor.getMonth();

          return (
            <div
              key={day.toISOString()}
              className={`min-h-28 bg-white p-1.5 ${outOfMonth ? "opacity-40" : ""}`}
            >
              <p
                className={`mb-1 text-xs font-medium ${
                  isToday
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white"
                    : "text-ink-500"
                }`}
              >
                {day.getDate()}
              </p>
              <div className="space-y-1">
                {tasks.slice(0, 4).map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    title={`${task.title}${task.assignee ? ` — ${task.assignee.name}` : " — unassigned"}`}
                    className={`block truncate rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${
                      TASK_STATUS_CLASS[task.status]
                    }`}
                  >
                    {new Date(task.scheduledStart!).toLocaleTimeString(undefined, {
                      hour: "numeric",
                    })}{" "}
                    {task.property?.name ?? TASK_TYPE_LABEL[task.type]}
                  </Link>
                ))}
                {tasks.length > 4 ? (
                  <p className="px-1 text-[11px] text-ink-400">+{tasks.length - 4} more</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && !data?.tasks.length ? (
        <EmptyState
          title="Nothing scheduled in this range"
          body={
            role === "MANAGER"
              ? "Turnovers appear here as Hostaway check-outs sync in."
              : "You have no jobs scheduled in this range."
          }
        />
      ) : null}
    </div>
  );
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function buildDays(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
