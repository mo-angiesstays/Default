"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote } from "@/components/ui";
import { IconSparkle } from "@/components/icons";

type Triage = {
  summary: string;
  suggested_severity: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  severity_reason: string;
  suggested_category: string;
  likely_cause: string;
  trade: string;
  guest_impacting: boolean;
  follow_up_questions: string[];
  confidence: "high" | "medium" | "low";
};

const TRADE_LABEL: Record<string, string> = {
  plumber: "a plumber",
  electrician: "an electrician",
  hvac: "an HVAC engineer",
  appliance_repair: "an appliance engineer",
  handyman: "a handyman",
  cleaner: "a cleaner",
  pest_control: "pest control",
  unclear: "someone to take a look",
};

/**
 * AI triage of an issue's photos — a suggestion panel, never an action.
 * Changing the severity is a separate, explicit click by the person.
 */
export function IssueTriage({
  issueId,
  hasPhotos,
  currentSeverity,
  onApplySeverity,
}: {
  issueId: string;
  hasPhotos: boolean;
  currentSeverity: string;
  onApplySeverity: (severity: string) => void;
}) {
  const [result, setResult] = useState<Triage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasPhotos) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ result: Triage }>("/api/vision/issue", {
        method: "POST",
        json: { issueId },
      });
      setResult(response.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  if (!result) {
    return (
      <div className="space-y-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={run}>
          <IconSparkle size={15} />
          {busy ? "Looking at the photos…" : "Read the photos"}
        </button>
        <ErrorNote error={error} />
      </div>
    );
  }

  const disagrees = result.suggested_severity !== currentSeverity;

  return (
    <div className="space-y-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip bg-brand-100 text-brand-800 ring-brand-200">
          <IconSparkle size={11} /> AI reading
        </span>
        <span className="chip bg-ink-100 text-ink-600 ring-ink-200">
          {result.confidence} confidence
        </span>
        {result.guest_impacting ? (
          <span className="chip bg-ochre-100 text-ochre-800 ring-ochre-200">
            A guest would notice
          </span>
        ) : null}
      </div>

      <p className="text-sm text-ink-800">{result.summary}</p>

      <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-400">Likely cause</dt>
          <dd className="text-ink-700">{result.likely_cause}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-400">Send</dt>
          <dd className="text-ink-700">{TRADE_LABEL[result.trade] ?? result.trade}</dd>
        </div>
      </dl>

      <div className="rounded-lg bg-white/70 p-2.5">
        <p className="text-xs uppercase tracking-wide text-ink-400">
          Suggested severity: {result.suggested_severity}
        </p>
        <p className="mt-0.5 text-sm text-ink-700">{result.severity_reason}</p>
        {disagrees ? (
          <button
            type="button"
            className="btn-secondary mt-2 py-1.5 text-xs"
            onClick={() => onApplySeverity(result.suggested_severity)}
          >
            Change severity to {result.suggested_severity}
          </button>
        ) : (
          <p className="mt-1 text-xs text-ink-400">Matches the severity already set.</p>
        )}
      </div>

      {result.follow_up_questions.length ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">
            A photo can&apos;t settle these
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-600">
            {result.follow_up_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-ink-400">
        A suggestion from the photos only. Nothing has been changed.
      </p>
    </div>
  );
}
