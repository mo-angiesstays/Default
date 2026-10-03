"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { SEVERITY_CLASS, SEVERITY_LABEL } from "@/lib/labels";
import { Chip, ErrorNote, Field, Spinner } from "@/components/ui";
import { IconCamera, IconSparkle } from "@/components/icons";

type Finding = {
  at_timestamp: string;
  what: string;
  suggested_severity: keyof typeof SEVERITY_LABEL;
  suggested_category: string;
};

type Result = {
  analysis: { id: string };
  result: { summary: string; findings: Finding[]; rooms_seen: string[]; confidence: string };
  video: { duration: string; framesSampled: number; intervalSeconds: number };
};

/**
 * Walk a property video and turn what it shows into issues.
 *
 * Findings are proposals: nothing is raised until someone ticks it. Auto-raising
 * every finding would bury the issues board in false positives within a week.
 */
export default function WalkthroughPage() {
  const { data: properties } = useSWR<{ properties: { id: string; name: string }[] }>(
    "/api/properties",
    fetcher,
  );

  const [propertyId, setPropertyId] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [raised, setRaised] = useState<string[] | null>(null);

  const analyse = async () => {
    if (!file || !propertyId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setRaised(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("propertyId", propertyId);
      if (note) form.append("note", note);

      const response = await api<Result>("/api/vision/walkthrough", { method: "POST", body: form });
      setResult(response);
      // Pre-tick the serious ones; the person unticks what they disagree with.
      setAccepted(
        new Set(
          response.result.findings
            .map((f, i) => (f.suggested_severity === "HIGH" || f.suggested_severity === "URGENT" ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not analyse that video");
    } finally {
      setBusy(false);
    }
  };

  const raiseIssues = async () => {
    if (!result || !accepted.size) return;
    setBusy(true);
    try {
      const response = await api<{ created: { id: string; title: string }[] }>(
        "/api/vision/walkthrough/accept",
        { method: "POST", json: { analysisId: result.analysis.id, acceptIndexes: [...accepted] } },
      );
      setRaised(response.created.map((c) => c.title));
      setResult(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not raise those issues");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl text-ink-800">Video walkthrough</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Film a property on your phone and have it read back as a list of problems, each with the
          point in the clip it&apos;s visible at. Nothing is raised until you tick it.
        </p>
      </div>

      <section className="card card-pad space-y-4">
        <Field label="Property">
          <select
            className="input"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">Choose a property…</option>
            {properties?.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Video" hint="Up to about two minutes works best. The file isn't kept — only the findings.">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-4 py-6 text-sm text-ink-600 hover:border-brand-400 hover:bg-brand-50/40">
            <IconCamera size={20} />
            <span>{file ? file.name : "Choose or film a video"}</span>
            <input
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>

        <Field label="Note" hint="Optional — anything you want it to pay attention to.">
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Post-guest check, they mentioned a smell in the bathroom"
          />
        </Field>

        <ErrorNote error={error} />

        <button
          type="button"
          className="btn-primary"
          disabled={busy || !file || !propertyId}
          onClick={analyse}
        >
          <IconSparkle size={15} />
          {busy ? "Watching the video…" : "Analyse walkthrough"}
        </button>
        {busy ? <Spinner label="Sampling frames and reading them…" /> : null}
      </section>

      {raised ? (
        <div className="rounded-xl border border-moss-200 bg-moss-50 p-4 text-sm text-moss-900">
          <p className="font-medium">Raised {raised.length} issue(s):</p>
          <ul className="mt-1 list-inside list-disc">
            {raised.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            They&apos;ll now appear on every job at that property until someone marks them done.
          </p>
        </div>
      ) : null}

      {result ? (
        <section className="card card-pad space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip className="bg-brand-100 text-brand-800 ring-brand-200">
                <IconSparkle size={11} /> AI reading
              </Chip>
              <Chip className="bg-ink-100 text-ink-600 ring-ink-200">
                {result.result.confidence} confidence
              </Chip>
              <Chip className="bg-ink-100 text-ink-600 ring-ink-200">
                {result.video.duration} · {result.video.framesSampled} frames, one every{" "}
                {result.video.intervalSeconds}s
              </Chip>
            </div>
            <p className="mt-2 text-sm text-ink-700">{result.result.summary}</p>
            {result.result.rooms_seen.length ? (
              <p className="mt-1 text-xs text-ink-500">
                Areas seen: {result.result.rooms_seen.join(", ")}
              </p>
            ) : null}
          </div>

          {result.result.findings.length ? (
            <>
              <h2 className="section-title">
                {result.result.findings.length} thing(s) worth raising — tick what you agree with
              </h2>
              <ul className="divide-y divide-ink-100">
                {result.result.findings.map((finding, index) => (
                  <li key={index} className="flex items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={accepted.has(index)}
                      onChange={(e) => {
                        const next = new Set(accepted);
                        if (e.target.checked) next.add(index);
                        else next.delete(index);
                        setAccepted(next);
                      }}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip className={SEVERITY_CLASS[finding.suggested_severity]}>
                          {SEVERITY_LABEL[finding.suggested_severity]}
                        </Chip>
                        <Chip className="bg-ink-100 text-ink-600 ring-ink-200">
                          at {finding.at_timestamp}
                        </Chip>
                        <Chip className="bg-ink-100 text-ink-600 ring-ink-200">
                          {finding.suggested_category.toLowerCase()}
                        </Chip>
                      </div>
                      <p className="mt-1.5 text-sm text-ink-800">{finding.what}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="btn-primary"
                disabled={busy || accepted.size === 0}
                onClick={raiseIssues}
              >
                {busy
                  ? "Raising…"
                  : `Raise ${accepted.size} issue${accepted.size === 1 ? "" : "s"}`}
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-500">
              Nothing stood out. The property looks fine on this footage.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
