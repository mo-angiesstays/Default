"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { TASK_TYPE_LABEL } from "@/lib/labels";
import { EmptyState, ErrorNote, Field, Modal, Spinner, Toggle } from "@/components/ui";

type Rule = {
  id: string;
  name: string;
  instruction: string;
  kind: "ASSIGNMENT" | "TIMING" | "WORKLOAD" | "ESCALATION";
  propertyId: string | null;
  property: { id: string; name: string } | null;
  taskTypes: string[];
  hard: boolean;
  weight: number;
  active: boolean;
  config: Record<string, unknown> | null;
};

const KIND_LABEL = {
  ASSIGNMENT: "Who gets the work",
  TIMING: "When work happens",
  WORKLOAD: "Caps and balancing",
  ESCALATION: "When nothing fits",
} as const;

const EXAMPLES = [
  "Maria is first choice for the beach houses — only send someone else if she's already booked.",
  "Don't give anyone two properties more than 20 km apart on the same day.",
  "Same-day turns go to whoever has finished the most jobs at that property.",
  "Keep Sundays as light as possible — one job per person at most.",
  "Deep cleans need two people or someone tagged deep-clean.",
];

export default function RulesPage() {
  const { data, error, isLoading, mutate } = useSWR<{ rules: Rule[] }>(
    "/api/rules?includeInactive=true",
    fetcher,
  );
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const rules = data?.rules ?? [];
  const soft = rules.filter((rule) => !rule.hard);
  const hard = rules.filter((rule) => rule.hard);

  const runScheduler = async (dryRun: boolean) => {
    setRunning(true);
    setRunResult(null);
    try {
      const response = await api<{
        result: { considered: number; assigned: number; unassigned: { title: string; reason: string }[] };
      }>("/api/scheduler/run", { method: "POST", json: { daysAhead: 14, dryRun } });

      const { considered, assigned, unassigned } = response.result;
      setRunResult(
        `${dryRun ? "Preview: would assign" : "Assigned"} ${assigned} of ${considered} task${
          considered === 1 ? "" : "s"
        }.${
          unassigned.length
            ? ` ${unassigned.length} couldn't be filled: ${unassigned
                .slice(0, 3)
                .map((item) => `${item.title} (${item.reason})`)
                .join("; ")}`
            : ""
        }`,
      );
    } catch (caught) {
      setRunResult(caught instanceof Error ? caught.message : "The scheduler failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Scheduling rules</h1>
          <p className="text-sm text-ink-500">
            Write rules in plain English. The scheduler reads them when choosing who gets each job.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
          + New rule
        </button>
      </div>

      <div className="card card-pad space-y-2">
        <h2 className="section-title">Run the scheduler</h2>
        <p className="text-sm text-ink-500">
          Fills every unassigned task in the next 14 days. It runs automatically each night too.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={running}
            onClick={() => runScheduler(true)}
          >
            {running ? "Working…" : "Preview"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={running}
            onClick={() => runScheduler(false)}
          >
            Assign everything now
          </button>
        </div>
        {runResult ? (
          <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{runResult}</p>
        ) : null}
      </div>

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}

      {!isLoading && !rules.length ? (
        <div className="card card-pad space-y-3">
          <p className="font-medium text-ink-900">No rules yet</p>
          <p className="text-sm text-ink-500">
            Without rules, the scheduler falls back to its built-in scoring: property preference,
            past work at the property, workload for the day, and travel distance. Add a rule to
            steer it. Examples:
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-ink-600">
            {EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {[
        { title: "Hard rules — never broken", list: hard },
        { title: "Preferences — weighed against each other", list: soft },
      ]
        .filter((group) => group.list.length)
        .map((group) => (
          <section key={group.title} className="space-y-2">
            <h2 className="section-title">{group.title}</h2>
            <div className="space-y-2">
              {group.list.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setEditing(rule)}
                  className={`card card-pad w-full text-left transition-shadow hover:shadow-md ${
                    rule.active ? "" : "opacity-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="chip bg-ink-100 text-ink-600 ring-ink-200">
                      {KIND_LABEL[rule.kind]}
                    </span>
                    {rule.hard ? (
                      <span className="chip bg-red-50 text-red-700 ring-red-200">Hard rule</span>
                    ) : (
                      <span className="chip bg-brand-50 text-brand-700 ring-brand-200">
                        Weight {rule.weight}
                      </span>
                    )}
                    {rule.property ? (
                      <span className="chip bg-purple-50 text-purple-700 ring-purple-200">
                        {rule.property.name}
                      </span>
                    ) : null}
                    {rule.taskTypes.map((type) => (
                      <span key={type} className="chip bg-ink-100 text-ink-600 ring-ink-200">
                        {TASK_TYPE_LABEL[type as keyof typeof TASK_TYPE_LABEL] ?? type}
                      </span>
                    ))}
                    {!rule.active ? (
                      <span className="chip bg-ink-100 text-ink-500 ring-ink-200">Off</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 font-medium text-ink-900">{rule.name}</p>
                  <p className="text-sm text-ink-600">{rule.instruction}</p>
                </button>
              ))}
            </div>
          </section>
        ))}

      {editing ? (
        <RuleEditor
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            mutate();
          }}
        />
      ) : null}
    </div>
  );
}

function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: Rule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: properties } = useSWR<{ properties: { id: string; name: string }[] }>(
    "/api/properties",
    fetcher,
  );

  const [form, setForm] = useState({
    name: rule?.name ?? "",
    instruction: rule?.instruction ?? "",
    kind: rule?.kind ?? "ASSIGNMENT",
    propertyId: rule?.propertyId ?? "",
    taskTypes: rule?.taskTypes ?? [],
    hard: rule?.hard ?? false,
    weight: rule?.weight ?? 5,
    active: rule?.active ?? true,
    maxPerDay: (rule?.config as { maxPerDay?: number } | null)?.maxPerDay ?? "",
    requireSkill: (rule?.config as { requireSkill?: string } | null)?.requireSkill ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {};
      if (form.maxPerDay !== "") config.maxPerDay = Number(form.maxPerDay);
      if (form.requireSkill) config.requireSkill = form.requireSkill;

      const payload = {
        name: form.name,
        instruction: form.instruction,
        kind: form.kind,
        propertyId: form.propertyId || null,
        taskTypes: form.taskTypes,
        hard: form.hard,
        weight: form.weight,
        active: form.active,
        config: Object.keys(config).length ? config : null,
      };

      if (rule) await api(`/api/rules/${rule.id}`, { method: "PATCH", json: payload });
      else await api("/api/rules", { method: "POST", json: payload });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the rule");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!rule) return;
    setBusy(true);
    try {
      await api(`/api/rules/${rule.id}`, { method: "DELETE" });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={rule ? "Edit rule" : "New rule"}>
      <div className="space-y-3">
        <Field label="Short name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Maria owns the beach houses"
          />
        </Field>

        <Field
          label="The rule, in plain English"
          hint="This text is what the scheduler reads. Be specific about what should happen and when."
        >
          <textarea
            className="input min-h-24"
            value={form.instruction}
            onChange={(e) => set("instruction", e.target.value)}
            placeholder="Send Maria to the beach houses whenever she's free. If she isn't, prefer someone who has cleaned that property before."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              className="input"
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as Rule["kind"])}
            >
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Applies to">
            <select
              className="input"
              value={form.propertyId}
              onChange={(e) => set("propertyId", e.target.value)}
            >
              <option value="">Every property</option>
              {properties?.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Only for these task types" hint="Leave all unticked to apply to everything.">
          <div className="flex flex-wrap gap-3">
            {Object.entries(TASK_TYPE_LABEL).map(([value, label]) => (
              <Toggle
                key={value}
                checked={form.taskTypes.includes(value)}
                onChange={(checked) =>
                  set(
                    "taskTypes",
                    checked
                      ? [...form.taskTypes, value]
                      : form.taskTypes.filter((type) => type !== value),
                  )
                }
                label={label}
              />
            ))}
          </div>
        </Field>

        <div className="rounded-lg border border-ink-200 p-3">
          <Toggle
            checked={form.hard}
            onChange={(value) => set("hard", value)}
            label="Hard rule — enforced in code, never broken"
          />
          <p className="mt-1 text-xs text-ink-500">
            A hard rule filters people out before the scheduler ever sees them. Soft rules are
            weighed against each other and the built-in scoring.
          </p>

          {form.hard ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Max jobs per day" hint="Blank for no extra cap.">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={form.maxPerDay}
                  onChange={(e) => set("maxPerDay", e.target.value)}
                />
              </Field>
              <Field label="Require skill tag" hint="Must be on the person's skill list.">
                <input
                  className="input"
                  value={form.requireSkill}
                  onChange={(e) => set("requireSkill", e.target.value)}
                  placeholder="deep-clean"
                />
              </Field>
            </div>
          ) : (
            <div className="mt-3">
              <Field label={`Weight: ${form.weight}`} hint="Higher means the scheduler tries harder.">
                <input
                  type="range"
                  min={1}
                  max={10}
                  className="w-full"
                  value={form.weight}
                  onChange={(e) => set("weight", Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </div>

        <Toggle checked={form.active} onChange={(v) => set("active", v)} label="Rule is active" />

        <ErrorNote error={error} />
        <div className="flex justify-between gap-2 pt-1">
          {rule ? (
            <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !form.name || !form.instruction}
              onClick={save}
            >
              {busy ? "Saving…" : "Save rule"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
