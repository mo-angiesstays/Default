"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { fetcher } from "@/lib/client";
import { TASK_TYPE_LABEL } from "@/lib/labels";
import { EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { TaskCard, type TaskSummary } from "@/components/TaskCard";
import { NewTaskButton } from "@/components/NewTaskDialog";

type Filter = "open" | "today" | "overdue" | "unassigned" | "done" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

export function TasksView({ role }: { role: Role }) {
  return (
    <Suspense fallback={<Spinner />}>
      <TasksInner role={role} />
    </Suspense>
  );
}

function TasksInner({ role }: { role: Role }) {
  const searchParams = useSearchParams();
  const isManager = role === "MANAGER";

  const initial = (searchParams.get("filter") as Filter) ?? "open";
  const [filter, setFilter] = useState<Filter>(
    searchParams.get("assignee") === "unassigned" ? "unassigned" : initial,
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (typeFilter) params.set("type", typeFilter);

    switch (filter) {
      case "open":
        params.set("open", "true");
        break;
      case "today": {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        params.set("from", start.toISOString());
        params.set("to", end.toISOString());
        break;
      }
      case "overdue":
        params.set("open", "true");
        params.set("to", new Date().toISOString());
        break;
      case "unassigned":
        params.set("open", "true");
        if (isManager) params.set("assigneeId", "unassigned");
        break;
      case "done":
        params.append("status", "COMPLETED");
        params.append("status", "VERIFIED");
        break;
      default:
        break;
    }
    return params.toString();
  }, [filter, search, typeFilter, isManager]);

  const { data, error, isLoading, mutate } = useSWR<{ tasks: TaskSummary[] }>(
    `/api/tasks?${query}`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const grouped = useMemo(() => groupByDay(data?.tasks ?? []), [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Tasks</h1>
        {isManager ? <NewTaskButton onCreated={() => mutate()} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1">
          {FILTERS.filter((item) => isManager || item.key !== "unassigned").map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                filter === item.key
                  ? "bg-white font-medium text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <select
          className="input w-auto"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="">All types</option>
          {Object.entries(TASK_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input
          className="input w-auto flex-1 sm:max-w-xs"
          placeholder="Search tasks or properties…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}

      {!isLoading && !data?.tasks.length ? (
        <EmptyState
          title="No tasks match"
          body="Try a different filter, or wait for the next Hostaway sync to bring in check-outs."
        />
      ) : null}

      <div className="space-y-5">
        {grouped.map(([day, tasks]) => (
          <section key={day} className="space-y-2">
            <h2 className="section-title">{day}</h2>
            <div className="grid gap-2 lg:grid-cols-2">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} showAssignee={isManager} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function groupByDay(tasks: TaskSummary[]): [string, TaskSummary[]][] {
  const groups = new Map<string, TaskSummary[]>();

  for (const task of tasks) {
    const label = task.scheduledStart ? dayLabel(new Date(task.scheduledStart)) : "Unscheduled";
    const list = groups.get(label) ?? [];
    list.push(task);
    groups.set(label, list);
  }

  return [...groups.entries()];
}

function dayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
