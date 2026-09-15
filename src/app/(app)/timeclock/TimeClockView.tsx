"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { api, fetcher } from "@/lib/client";
import { humanDuration } from "@/lib/time";
import { Avatar, EmptyState, ErrorNote, LocalTime, Spinner } from "@/components/ui";

type Entry = {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  minutes: number | null;
  notes: string | null;
  edited: boolean;
  user: { id: string; name: string; avatarColor: string };
  task: { id: string; title: string } | null;
  property: { id: string; name: string } | null;
};

export function TimeClockView({ viewer }: { viewer: { id: string; role: Role } }) {
  const isManager = viewer.role === "MANAGER";
  const [scope, setScope] = useState<"me" | "team">("me");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState("");

  const { data: me, mutate: mutateMe } = useSWR<{ openShift: { id: string; clockInAt: string } | null }>(
    "/api/auth/me",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const query = new URLSearchParams();
  if (scope === "me" || !isManager) query.set("userId", viewer.id);
  query.set("from", startOfPayPeriod().toISOString());

  const { data, isLoading, mutate } = useSWR<{ entries: Entry[]; totalMinutes: number }>(
    `/api/time-entries?${query}`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const { data: myTasks } = useSWR<{ tasks: { id: string; title: string }[] }>(
    "/api/tasks?open=true&mine=true",
    fetcher,
  );

  const running = me?.openShift ?? null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const position = await currentPosition();
      await api(running ? "/api/time-entries/clock-out" : "/api/time-entries/clock-in", {
        method: "POST",
        json: {
          ...(running ? {} : { taskId: taskId || null }),
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        },
      });
      await Promise.all([mutateMe(), mutate()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't update the clock");
    } finally {
      setBusy(false);
    }
  };

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Time clock</h1>
        <p className="text-sm text-ink-500">
          Optional — clock in if you want your hours tracked. Nothing else depends on it.
        </p>
      </div>

      <div
        className={`card card-pad space-y-3 ${
          running ? "border-emerald-300 bg-emerald-50/50" : ""
        }`}
      >
        {running ? (
          <>
            <p className="text-sm text-emerald-900">
              On the clock since <LocalTime value={running.clockInAt} format="time" />
            </p>
            <Elapsed since={running.clockInAt} />
          </>
        ) : (
          <>
            <p className="text-sm text-ink-600">You&apos;re not clocked in.</p>
            {myTasks?.tasks.length ? (
              <div>
                <label className="label">Working on (optional)</label>
                <select
                  className="input"
                  value={taskId}
                  onChange={(event) => setTaskId(event.target.value)}
                >
                  <option value="">No specific job</option>
                  {myTasks.tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        )}

        <ErrorNote error={error} />
        <button
          type="button"
          className={running ? "btn-danger w-full sm:w-auto" : "btn-primary w-full sm:w-auto"}
          disabled={busy}
          onClick={toggle}
        >
          {busy ? "Saving…" : running ? "⏹ Clock out" : "⏱ Clock in"}
        </button>
      </div>

      {isManager ? (
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1 sm:w-64">
          {(["me", "team"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={`flex-1 rounded-md px-3 py-1 text-sm ${
                scope === value ? "bg-white font-medium shadow-sm" : "text-ink-600"
              }`}
            >
              {value === "me" ? "My hours" : "Whole team"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="card card-pad flex items-center justify-between">
        <span className="text-sm text-ink-500">This pay period</span>
        <span className="text-lg font-semibold text-ink-900">
          {humanDuration(data?.totalMinutes ?? 0)}
        </span>
      </div>

      {isLoading ? <Spinner /> : null}
      {!isLoading && !entries.length ? (
        <EmptyState title="No shifts recorded yet" />
      ) : (
        <div className="card divide-y divide-ink-100">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
              {scope === "team" && isManager ? (
                <Avatar name={entry.user.name} color={entry.user.avatarColor} size={30} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">
                  {entry.task ? (
                    <Link href={`/tasks/${entry.task.id}`} className="hover:underline">
                      {entry.task.title}
                    </Link>
                  ) : (
                    (entry.property?.name ?? "General work")
                  )}
                </p>
                <p className="text-xs text-ink-500">
                  {scope === "team" && isManager ? `${entry.user.name} · ` : ""}
                  <LocalTime value={entry.clockInAt} format="date" />{" "}
                  <LocalTime value={entry.clockInAt} format="time" />
                  {" – "}
                  {entry.clockOutAt ? (
                    <LocalTime value={entry.clockOutAt} format="time" />
                  ) : (
                    <span className="text-emerald-600">still running</span>
                  )}
                  {entry.edited ? " · edited" : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-ink-700">
                {entry.minutes != null ? humanDuration(entry.minutes) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <p className="text-3xl font-semibold tabular-nums text-emerald-700">
      {hh}:{mm}:{ss}
    </p>
  );
}

/** Best-effort location stamp — never blocks the punch if it's denied. */
async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: 4000, maximumAge: 60_000 },
    );
  });
}

function startOfPayPeriod(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  date.setHours(0, 0, 0, 0);
  return date;
}
