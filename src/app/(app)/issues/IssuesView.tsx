"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { api, fetcher } from "@/lib/client";
import {
  ISSUE_STATUS_CLASS,
  ISSUE_STATUS_LABEL,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
} from "@/lib/labels";
import { Avatar, Chip, EmptyState, ErrorNote, LocalTime, Modal, Spinner } from "@/components/ui";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";

type Issue = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  severity: keyof typeof SEVERITY_LABEL;
  status: keyof typeof ISSUE_STATUS_LABEL;
  carryCount: number;
  createdAt: string;
  resolutionNotes: string | null;
  photoUrls: string[];
  property: { id: string; name: string; color: string };
  reportedBy: { id: string; name: string; avatarColor: string } | null;
  resolvedBy: { name: string } | null;
  maintenanceTask: { id: string; status: string } | null;
  _count: { carries: number; comments: number };
};

export function IssuesView({ viewer }: { viewer: { id: string; role: Role } }) {
  const [showResolved, setShowResolved] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [detail, setDetail] = useState<Issue | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ issues: Issue[] }>(
    `/api/issues?open=${showResolved ? "false" : "true"}`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const { data: properties } = useSWR<{ properties: { id: string; name: string }[] }>(
    "/api/properties",
    fetcher,
  );

  const issues = data?.issues ?? [];
  const open = issues.filter((issue) => issue.status !== "RESOLVED");
  const sticky = open.filter((issue) => issue.carryCount >= 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Issues</h1>
          <p className="text-sm text-ink-500">
            An issue rides along on every turnover at its property until it&apos;s marked done.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setReportOpen(true)}>
          ⚠ Report an issue
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowResolved(false)}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            !showResolved ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600"
          }`}
        >
          Open ({open.length})
        </button>
        <button
          type="button"
          onClick={() => setShowResolved(true)}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            showResolved ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600"
          }`}
        >
          Everything
        </button>
      </div>

      {sticky.length ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{sticky.length}</strong> issue{sticky.length === 1 ? " has" : "s have"} been
          carried onto two or more visits without being fixed.
        </div>
      ) : null}

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}

      {!isLoading && !issues.length ? (
        <EmptyState
          title="No issues"
          body="Nothing reported. Cleaners can raise issues from any task."
        />
      ) : null}

      <div className="grid gap-2 lg:grid-cols-2">
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => setDetail(issue)}
            className="card card-pad text-left transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-1 h-10 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: issue.property.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip className={SEVERITY_CLASS[issue.severity]}>
                    {SEVERITY_LABEL[issue.severity]}
                  </Chip>
                  <Chip className={ISSUE_STATUS_CLASS[issue.status]}>
                    {ISSUE_STATUS_LABEL[issue.status]}
                  </Chip>
                  {issue.carryCount > 1 ? (
                    <Chip className="bg-ink-100 text-ink-600 ring-ink-200">
                      Carried {issue.carryCount}×
                    </Chip>
                  ) : null}
                  {issue.maintenanceTask ? (
                    <Chip className="bg-orange-50 text-orange-700 ring-orange-200">
                      Maintenance job open
                    </Chip>
                  ) : null}
                </div>
                <p className="mt-1.5 font-medium text-ink-900">{issue.title}</p>
                <p className="truncate text-sm text-ink-500">{issue.property.name}</p>
                <p className="mt-1 text-xs text-ink-400">
                  {issue.reportedBy?.name ?? "Someone"} ·{" "}
                  <LocalTime value={issue.createdAt} format="relative" />
                </p>
              </div>
              {issue.reportedBy ? (
                <Avatar
                  name={issue.reportedBy.name}
                  color={issue.reportedBy.avatarColor}
                  size={28}
                />
              ) : null}
            </div>
          </button>
        ))}
      </div>

      <ReportIssueDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        propertyId={properties?.properties[0]?.id ?? ""}
        onCreated={() => {
          setReportOpen(false);
          mutate();
        }}
      />

      <IssueDetailModal
        issue={detail}
        viewer={viewer}
        onClose={() => setDetail(null)}
        onChanged={() => {
          setDetail(null);
          mutate();
        }}
      />
    </div>
  );
}

function IssueDetailModal({
  issue,
  viewer,
  onClose,
  onChanged,
}: {
  issue: Issue | null;
  viewer: { id: string; role: Role };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!issue) return null;

  const update = async (json: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/issues/${issue.id}`, { method: "PATCH", json });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={issue.title}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className={SEVERITY_CLASS[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Chip>
          <Chip className={ISSUE_STATUS_CLASS[issue.status]}>
            {ISSUE_STATUS_LABEL[issue.status]}
          </Chip>
          <Chip className="bg-ink-100 text-ink-600 ring-ink-200">{issue.category}</Chip>
        </div>

        <p className="text-sm text-ink-500">
          <Link href={`/properties/${issue.property.id}`} className="text-brand-600 hover:underline">
            {issue.property.name}
          </Link>
          {" · reported by "}
          {issue.reportedBy?.name ?? "someone"} <LocalTime value={issue.createdAt} format="relative" />
        </p>

        {issue.description ? (
          <p className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
            {issue.description}
          </p>
        ) : null}

        {issue.photoUrls.length ? (
          <div className="flex flex-wrap gap-2">
            {issue.photoUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand-600 hover:underline"
              >
                📷 View photo
              </a>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-ink-500">
          Carried onto {issue._count.carries} visit{issue._count.carries === 1 ? "" : "s"}.
        </p>

        {issue.maintenanceTask ? (
          <Link
            href={`/tasks/${issue.maintenanceTask.id}`}
            className="block rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 hover:bg-orange-100"
          >
            Maintenance job — {issue.maintenanceTask.status.toLowerCase().replace("_", " ")} →
          </Link>
        ) : null}

        {issue.status === "RESOLVED" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-medium">Resolved by {issue.resolvedBy?.name ?? "someone"}</p>
            {issue.resolutionNotes ? <p>{issue.resolutionNotes}</p> : null}
          </div>
        ) : (
          <div className="space-y-2 border-t border-ink-100 pt-3">
            <label className="label">Resolution notes</label>
            <textarea
              className="input min-h-16"
              placeholder="What was done?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <ErrorNote error={error} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => update({ status: "RESOLVED", resolutionNotes: notes || undefined })}
              >
                Mark job completed
              </button>
              {issue.status === "OPEN" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => update({ status: "ACKNOWLEDGED" })}
                >
                  Acknowledge
                </button>
              ) : null}
              {issue.status !== "IN_PROGRESS" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => update({ status: "IN_PROGRESS" })}
                >
                  Being fixed
                </button>
              ) : null}
              {viewer.role === "MANAGER" ? (
                <select
                  className="input w-auto"
                  value={issue.severity}
                  disabled={busy}
                  onChange={(event) => update({ severity: event.target.value })}
                >
                  {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      Severity: {label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
