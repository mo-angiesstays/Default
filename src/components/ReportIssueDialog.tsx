"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field, Modal, Toggle } from "@/components/ui";

const CATEGORIES = [
  ["MAINTENANCE", "Something needs repairing"],
  ["DAMAGE", "Damage or breakage"],
  ["SUPPLIES", "Out of supplies"],
  ["APPLIANCE", "Appliance not working"],
  ["CLEANLINESS", "Cleanliness problem"],
  ["SAFETY", "Safety concern"],
  ["OTHER", "Something else"],
] as const;

export function ReportIssueButton({
  propertyId,
  taskId,
  onCreated,
}: {
  propertyId: string;
  taskId?: string;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        ⚠ Report an issue
      </button>
      <ReportIssueDialog
        open={open}
        onClose={() => setOpen(false)}
        propertyId={propertyId}
        taskId={taskId}
        onCreated={() => {
          setOpen(false);
          onCreated?.();
        }}
      />
    </>
  );
}

export function ReportIssueDialog({
  open,
  onClose,
  propertyId,
  taskId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  taskId?: string;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("MAINTENANCE");
  const [severity, setSeverity] = useState("MEDIUM");
  const [photoUrl, setPhotoUrl] = useState("");
  const [createTask, setCreateTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/issues", {
        method: "POST",
        json: {
          propertyId,
          originTaskId: taskId ?? null,
          title,
          description: description || null,
          category,
          severity,
          photoUrls: photoUrl ? [photoUrl] : [],
          createMaintenanceTask: createTask,
        },
      });
      setTitle("");
      setDescription("");
      setPhotoUrl("");
      onCreated?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not report the issue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Report an issue">
      <form onSubmit={submit} className="space-y-3">
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
          This stays attached to the property and shows up on every turnover until somebody
          marks the job completed.
        </p>

        <Field label="What's wrong?">
          <input
            className="input"
            required
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Bathroom sink is dripping"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              className="input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How bad?">
            <select
              className="input"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="LOW">Low — can wait</option>
              <option value="MEDIUM">Medium — should be fixed soon</option>
              <option value="HIGH">High — affects the guest</option>
              <option value="URGENT">Urgent — needs someone now</option>
            </select>
          </Field>
        </div>

        <Field label="Details">
          <textarea
            className="input min-h-20"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Where is it, what did you see, anything you tried"
          />
        </Field>

        <Field label="Photo link" hint="Paste a link to a photo if you have one.">
          <input
            className="input"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Toggle
          checked={createTask}
          onChange={setCreateTask}
          label="Also open a maintenance job for this"
        />
        <p className="text-xs text-ink-400">
          High and urgent issues always get a maintenance job automatically.
        </p>

        <ErrorNote error={error} />

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
            {busy ? "Reporting…" : "Report issue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
