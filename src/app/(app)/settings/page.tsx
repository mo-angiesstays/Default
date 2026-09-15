"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { ErrorNote, LocalTime, Spinner } from "@/components/ui";

type Status = {
  hostaway: {
    configured: boolean;
    baseUrl: string;
    linkedProperties: number;
    unlinkedProperties: number;
  };
  google: {
    configured: boolean;
    calendarId: string;
    impersonating: string | null;
    canInviteAttendees: boolean;
    pendingCalendar: number;
  };
  ai: { configured: boolean; model: string };
  cron: { configured: boolean };
  recentRuns: {
    id: string;
    job: string;
    status: "RUNNING" | "SUCCESS" | "FAILED";
    startedAt: string;
    finishedAt: string | null;
    summary: Record<string, unknown> | null;
    error: string | null;
  }[];
};

export default function SettingsPage() {
  const { data, error, isLoading, mutate } = useSWR<Status>("/api/integrations/status", fetcher, {
    refreshInterval: 30_000,
  });
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (key: string, path: string) => {
    setBusy(key);
    try {
      const response = await api<Record<string, unknown>>(path, { method: "POST" });
      setMessages((current) => ({ ...current, [key]: summarise(response) }));
      mutate();
    } catch (caught) {
      setMessages((current) => ({
        ...current,
        [key]: caught instanceof Error ? caught.message : "Failed",
      }));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Settings & integrations</h1>
        <p className="text-sm text-ink-500">
          Credentials live in environment variables, not in the database.
        </p>
      </div>

      <IntegrationCard
        title="Hostaway"
        configured={data.hostaway.configured}
        configuredHint={`${data.hostaway.linkedProperties} propert${
          data.hostaway.linkedProperties === 1 ? "y" : "ies"
        } linked${
          data.hostaway.unlinkedProperties
            ? `, ${data.hostaway.unlinkedProperties} not linked yet`
            : ""
        }`}
        missingHint="Set HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY, then restart."
        description="One-way pull. Check-outs become turnover tasks; we never write back to Hostaway."
        actions={[
          { key: "ha-test", label: "Test connection", path: "/api/integrations/hostaway/test" },
          {
            key: "ha-import",
            label: "Import listings",
            path: "/api/integrations/hostaway/import-listings",
          },
          { key: "ha-sync", label: "Sync reservations now", path: "/api/integrations/hostaway/sync" },
        ]}
        busy={busy}
        messages={messages}
        onCall={call}
      />

      <IntegrationCard
        title="Google Calendar"
        configured={data.google.configured}
        configuredHint={`Calendar: ${data.google.calendarId}${
          data.google.canInviteAttendees
            ? ` · inviting as ${data.google.impersonating}`
            : " · ⚠ GOOGLE_IMPERSONATE_USER is unset, so attendees won't receive invites"
        }${data.google.pendingCalendar ? ` · ${data.google.pendingCalendar} task(s) not yet on the calendar` : ""}`}
        missingHint="Set GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_IMPERSONATE_USER."
        description="Every scheduled task becomes a calendar event with the assignee and managers invited."
        actions={[
          { key: "gc-test", label: "Test connection", path: "/api/integrations/google/test" },
          { key: "gc-sync", label: "Push tasks to calendar", path: "/api/integrations/google/sync" },
        ]}
        busy={busy}
        messages={messages}
        onCall={call}
      />

      <IntegrationCard
        title="AI scheduling"
        configured={data.ai.configured}
        configuredHint={`Using ${data.ai.model}.`}
        missingHint="Set ANTHROPIC_API_KEY to turn on AI-assisted assignment. Without it the scheduler still runs on its built-in scoring."
        description="Reads your plain-English rules and picks who takes each job. It can only ever choose from people who already passed every hard constraint."
        actions={[
          { key: "sched-run", label: "Run scheduler now", path: "/api/scheduler/run" },
        ]}
        busy={busy}
        messages={messages}
        onCall={call}
      />

      <IntegrationCard
        title="Nightly pipeline"
        configured={data.cron.configured}
        configuredHint="CRON_SECRET is set — point your scheduler at POST /api/cron."
        missingHint="Set CRON_SECRET so an external scheduler can trigger the pipeline without a login."
        description="Hostaway sync → monthly deep cleans → auto-assign → calendar push. Each step is independent."
        actions={[{ key: "cron", label: "Run the whole pipeline", path: "/api/cron" }]}
        busy={busy}
        messages={messages}
        onCall={call}
      />

      <section className="card card-pad space-y-2">
        <h2 className="section-title">Recent job runs</h2>
        {data.recentRuns.length ? (
          <ul className="divide-y divide-ink-100 text-sm">
            {data.recentRuns.map((run) => (
              <li key={run.id} className="py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`chip ${
                      run.status === "SUCCESS"
                        ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                        : run.status === "FAILED"
                          ? "bg-red-100 text-red-800 ring-red-200"
                          : "bg-amber-100 text-amber-800 ring-amber-200"
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="font-medium text-ink-800">{run.job}</span>
                  <span className="ml-auto text-xs text-ink-400">
                    <LocalTime value={run.startedAt} format="relative" />
                  </span>
                </div>
                {run.error ? <p className="mt-1 text-xs text-red-700">{run.error}</p> : null}
                {run.summary ? (
                  <p className="mt-1 text-xs text-ink-500">{summarise(run.summary)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">Nothing has run yet.</p>
        )}
      </section>
    </div>
  );
}

function IntegrationCard({
  title,
  configured,
  configuredHint,
  missingHint,
  description,
  actions,
  busy,
  messages,
  onCall,
}: {
  title: string;
  configured: boolean;
  configuredHint: string;
  missingHint: string;
  description: string;
  actions: { key: string; label: string; path: string }[];
  busy: string | null;
  messages: Record<string, string>;
  onCall: (key: string, path: string) => void;
}) {
  return (
    <section className="card card-pad space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-ink-900">{title}</h2>
        <span
          className={`chip ${
            configured
              ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
              : "bg-amber-100 text-amber-800 ring-amber-200"
          }`}
        >
          {configured ? "Configured" : "Not configured"}
        </span>
      </div>

      <p className="text-sm text-ink-600">{description}</p>
      <p className="text-xs text-ink-500">{configured ? configuredHint : missingHint}</p>

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="btn-secondary"
            disabled={busy === action.key || !configured}
            onClick={() => onCall(action.key, action.path)}
          >
            {busy === action.key ? "Working…" : action.label}
          </button>
        ))}
      </div>

      {actions
        .filter((action) => messages[action.key])
        .map((action) => (
          <p
            key={action.key}
            className="rounded-lg bg-ink-50 p-2 text-xs text-ink-700"
          >
            <span className="font-medium">{action.label}:</span> {messages[action.key]}
          </p>
        ))}
    </section>
  );
}

/** Turns a job summary object into one readable line. */
function summarise(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;

  const inner = record.summary ?? record.result ?? record;
  if (typeof inner !== "object" || inner === null) return String(inner);

  return Object.entries(inner as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([key, v]) => `${humanKey(key)}: ${Array.isArray(v) ? v.length : String(v)}`)
    .join(" · ");
}

function humanKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
