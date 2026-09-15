"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { TASK_TYPE_LABEL } from "@/lib/labels";
import { ErrorNote, Field, Modal, Toggle } from "@/components/ui";

type Property = { id: string; name: string };
type User = { id: string; name: string; role: string };
type Template = { id: string; name: string; type: string; propertyId: string | null };

export function NewTaskButton({
  onCreated,
  defaultPropertyId,
}: {
  onCreated?: () => void;
  defaultPropertyId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New task
      </button>
      <NewTaskDialog
        open={open}
        onClose={() => setOpen(false)}
        defaultPropertyId={defaultPropertyId}
        onCreated={() => {
          setOpen(false);
          onCreated?.();
        }}
      />
    </>
  );
}

export function NewTaskDialog({
  open,
  onClose,
  onCreated,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultPropertyId?: string;
}) {
  const { data: properties } = useSWR<{ properties: Property[] }>(
    open ? "/api/properties" : null,
    fetcher,
  );
  const { data: users } = useSWR<{ users: User[] }>(open ? "/api/users" : null, fetcher);

  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [type, setType] = useState("TURNOVER");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(120);
  const [priority, setPriority] = useState("NORMAL");
  const [assigneeId, setAssigneeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [skipChecklist, setSkipChecklist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: templates } = useSWR<{ templates: Template[] }>(
    open && propertyId ? `/api/checklists?propertyId=${propertyId}` : null,
    fetcher,
  );

  const relevantTemplates = (templates?.templates ?? []).filter(
    (template) => template.type === type,
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/tasks", {
        method: "POST",
        json: {
          propertyId,
          type,
          title: title || undefined,
          description: description || null,
          scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
          estimatedMinutes,
          priority,
          assigneeId: assigneeId || null,
          checklistTemplateId: templateId || null,
          skipChecklist,
        },
      });
      onCreated?.();
      setTitle("");
      setDescription("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New task">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Property">
          <select
            className="input"
            required
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
          >
            <option value="">Choose a property…</option>
            {properties?.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select
              className="input"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setTemplateId("");
              }}
            >
              {Object.entries(TASK_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className="input"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </Field>
        </div>

        <Field label="Title" hint="Leave blank to name it after the property and type.">
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Auto-generated"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Scheduled start">
            <input
              type="datetime-local"
              className="input"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
            />
          </Field>
          <Field label="Estimated minutes">
            <input
              type="number"
              min={5}
              max={1440}
              className="input"
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
            />
          </Field>
        </div>

        <Field label="Assign to" hint="Leave empty to let the scheduler pick.">
          <select
            className="input"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">Unassigned — let the scheduler decide</option>
            {users?.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.role.toLowerCase()})
              </option>
            ))}
          </select>
        </Field>

        {relevantTemplates.length && !skipChecklist ? (
          <Field label="Checklist" hint="Defaults to the best match for this property and type.">
            <select
              className="input"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">Automatic</option>
              {relevantTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.propertyId ? " (property-specific)" : " (global)"}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Toggle checked={skipChecklist} onChange={setSkipChecklist} label="No checklist" />

        <Field label="Notes">
          <textarea
            className="input min-h-20"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Anything the person doing this should know"
          />
        </Field>

        <ErrorNote error={error} />

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !propertyId}>
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
