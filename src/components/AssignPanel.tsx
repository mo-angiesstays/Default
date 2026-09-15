"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { Avatar, ErrorNote } from "@/components/ui";

type Proposal = {
  chosenUserId: string | null;
  chosenUserName: string | null;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  method: "ai" | "rules";
  ruleConflicts: string[];
  candidates: { userId: string; name: string; score: number; reasons: string[] }[];
  rejected: { name: string; reason: string }[];
};

const CONFIDENCE_CLASS = {
  high: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-100 text-amber-800 ring-amber-200",
  low: "bg-red-100 text-red-800 ring-red-200",
};

/** Manager-only: ask the scheduler who should take this job, then apply it. */
export function AssignPanel({
  taskId,
  onAssigned,
}: {
  taskId: string;
  onAssigned: () => void;
}) {
  const { data: users } = useSWR<{ users: { id: string; name: string; role: string }[] }>(
    "/api/users",
    fetcher,
  );
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const suggest = async (apply: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ proposal: Proposal; applied: boolean }>(
        "/api/scheduler/propose",
        { method: "POST", json: { taskId, apply } },
      );
      setProposal(response.proposal);
      if (response.applied) onAssigned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The scheduler couldn't run");
    } finally {
      setBusy(false);
    }
  };

  const assignTo = async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tasks/${taskId}`, { method: "PATCH", json: { assigneeId: userId || null } });
      onAssigned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad space-y-3">
      <h2 className="section-title">Assignment</h2>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => suggest(false)}>
          {busy ? "Thinking…" : "✨ Suggest a cleaner"}
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => suggest(true)}>
          Auto-assign
        </button>
      </div>

      <ErrorNote error={error} />

      {proposal ? (
        <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`chip ${CONFIDENCE_CLASS[proposal.confidence]}`}>
              {proposal.confidence} confidence
            </span>
            <span className="chip bg-ink-100 text-ink-600 ring-ink-200">
              {proposal.method === "ai" ? "AI decision" : "Rule scoring"}
            </span>
          </div>

          {proposal.chosenUserName ? (
            <p className="font-medium text-ink-900">→ {proposal.chosenUserName}</p>
          ) : (
            <p className="font-medium text-red-700">No suitable person available</p>
          )}
          <p className="text-sm text-ink-700">{proposal.reasoning}</p>

          {proposal.ruleConflicts.length ? (
            <ul className="list-inside list-disc text-xs text-amber-800">
              {proposal.ruleConflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          ) : null}

          {proposal.chosenUserId ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => assignTo(proposal.chosenUserId!)}
            >
              Assign {proposal.chosenUserName}
            </button>
          ) : null}

          <button
            type="button"
            className="text-xs text-brand-600 hover:underline"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Hide" : "Show"} all {proposal.candidates.length} candidate
            {proposal.candidates.length === 1 ? "" : "s"}
            {proposal.rejected.length ? ` and ${proposal.rejected.length} ruled out` : ""}
          </button>

          {showAll ? (
            <div className="space-y-2 border-t border-brand-200 pt-2">
              {proposal.candidates.map((candidate) => (
                <div key={candidate.userId} className="flex items-start gap-2 text-sm">
                  <Avatar name={candidate.name} size={22} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-800">
                      {candidate.name}{" "}
                      <span className="text-xs font-normal text-ink-500">
                        score {candidate.score}
                      </span>
                    </p>
                    <p className="text-xs text-ink-500">{candidate.reasons.join(" · ")}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost shrink-0 px-2 py-0.5 text-xs"
                    disabled={busy}
                    onClick={() => assignTo(candidate.userId)}
                  >
                    Pick
                  </button>
                </div>
              ))}

              {proposal.rejected.map((rejected) => (
                <p key={rejected.name} className="text-xs text-ink-400">
                  ✕ {rejected.name} — {rejected.reason}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="label">Assign manually</label>
        <select
          className="input"
          defaultValue=""
          disabled={busy}
          onChange={(event) => assignTo(event.target.value)}
        >
          <option value="">Choose someone…</option>
          <option value="">— Unassign —</option>
          {users?.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role.toLowerCase()})
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
