"use client";

import Link from "next/link";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { fetcher } from "@/lib/client";
import { SEVERITY_CLASS, SEVERITY_LABEL } from "@/lib/labels";
import { Chip, EmptyState, ErrorNote, LocalTime, Spinner, StatCard } from "@/components/ui";
import { TaskCard, type TaskSummary } from "@/components/TaskCard";

type DashboardData = {
  today: TaskSummary[];
  upcoming: TaskSummary[];
  overdue: TaskSummary[];
  stats: {
    todayCount: number;
    todayDone: number;
    upcomingCount: number;
    overdueCount: number;
    unassignedCount: number;
    openIssueCount: number;
    completedThisWeek: number;
  };
  openIssues: {
    id: string;
    title: string;
    severity: keyof typeof SEVERITY_LABEL;
    carryCount: number;
    property: { id: string; name: string };
    reportedBy: { name: string } | null;
  }[];
  openShift: { id: string; clockInAt: string } | null;
};

export function DashboardView({ role, name }: { role: Role; name: string }) {
  const { data, error, isLoading } = useSWR<DashboardData>("/api/dashboard", fetcher, {
    refreshInterval: 60_000,
  });

  const isManager = role === "MANAGER";
  const firstName = name.split(" ")[0];

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Spinner />;

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-ink-500">
          {stats.todayCount === 0
            ? "Nothing scheduled for today."
            : `${stats.todayDone} of ${stats.todayCount} jobs done today.`}
        </p>
      </div>

      {data.openShift ? (
        <Link
          href="/timeclock"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <span aria-hidden>⏱</span>
          <span>
            You&apos;re on the clock since <LocalTime value={data.openShift.clockInAt} format="time" />.
          </span>
          <span className="ml-auto font-medium underline">Clock out</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Today" value={`${stats.todayDone}/${stats.todayCount}`} hint="jobs done" />
        <StatCard
          label="Overdue"
          value={stats.overdueCount}
          tone={stats.overdueCount ? "danger" : "default"}
          href="/tasks?filter=overdue"
        />
        <StatCard label="Next 7 days" value={stats.upcomingCount} href="/tasks" />
        {isManager ? (
          <StatCard
            label="Unassigned"
            value={stats.unassignedCount}
            tone={stats.unassignedCount ? "warn" : "default"}
            href="/tasks?assignee=unassigned"
          />
        ) : null}
        <StatCard
          label="Open issues"
          value={stats.openIssueCount}
          tone={stats.openIssueCount ? "warn" : "good"}
          href="/issues"
        />
      </div>

      {data.overdue.length ? (
        <section className="space-y-2">
          <h2 className="section-title text-red-600">Needs attention now</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.overdue.map((task) => (
              <TaskCard key={task.id} task={task} showAssignee={isManager} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Today</h2>
          <Link href="/tasks" className="text-sm text-brand-600 hover:underline">
            All tasks →
          </Link>
        </div>
        {data.today.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {data.today.map((task) => (
              <TaskCard key={task.id} task={task} showAssignee={isManager} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing on today"
            body={
              isManager
                ? "No check-outs are scheduled. Reservations sync from Hostaway automatically."
                : "You have no jobs scheduled today."
            }
          />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="section-title">Coming up</h2>
          {data.upcoming.length ? (
            <div className="card divide-y divide-ink-100">
              {data.upcoming.slice(0, 8).map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50"
                >
                  <span
                    aria-hidden
                    className="h-8 w-1 rounded-full"
                    style={{ backgroundColor: task.property?.color ?? "#61708d" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{task.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      <LocalTime value={task.scheduledStart} />
                    </p>
                  </div>
                  {task.assignee ? (
                    <span className="shrink-0 text-xs text-ink-500">{task.assignee.name}</span>
                  ) : (
                    <span className="chip shrink-0 bg-amber-100 text-amber-800 ring-amber-200">
                      Unassigned
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing scheduled in the next week" />
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Open issues</h2>
            <Link href="/issues" className="text-sm text-brand-600 hover:underline">
              All issues →
            </Link>
          </div>
          {data.openIssues.length ? (
            <div className="card divide-y divide-ink-100">
              {data.openIssues.map((issue) => (
                <Link
                  key={issue.id}
                  href={`/issues?issue=${issue.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 hover:bg-ink-50"
                >
                  <Chip className={`${SEVERITY_CLASS[issue.severity]} mt-0.5 shrink-0`}>
                    {SEVERITY_LABEL[issue.severity]}
                  </Chip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{issue.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      {issue.property.name}
                      {issue.carryCount > 0
                        ? ` · carried onto ${issue.carryCount} visit${issue.carryCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No open issues" body="Every reported problem has been closed out." />
          )}
        </section>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
