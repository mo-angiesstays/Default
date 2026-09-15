"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { EmptyState, ErrorNote, Field, Modal, Spinner, Toggle } from "@/components/ui";

type Item = {
  id?: string;
  section: string;
  title: string;
  description: string | null;
  position: number;
  required: boolean;
  photoRequired: boolean;
};

type Template = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  propertyId: string | null;
  active: boolean;
  property: { id: string; name: string } | null;
  items: Item[];
};

const TYPE_LABEL: Record<string, string> = {
  TURNOVER: "Turnover",
  DEEP_CLEAN: "Monthly deep clean",
  MAINTENANCE: "Maintenance",
  INSPECTION: "Inspection",
  CUSTOM: "Custom",
};

export default function ChecklistsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ templates: Template[] }>(
    "/api/checklists?includeInactive=false",
    fetcher,
  );
  const [editing, setEditing] = useState<Template | "new" | null>(null);

  const templates = data?.templates ?? [];
  const globals = templates.filter((template) => !template.propertyId);
  const perProperty = templates.filter((template) => template.propertyId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Checklists</h1>
          <p className="text-sm text-ink-500">
            A property-specific checklist overrides the global one of the same type.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
          + New checklist
        </button>
      </div>

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}
      {!isLoading && !templates.length ? (
        <EmptyState
          title="No checklists yet"
          body="Create a global turnover checklist and a monthly deep-clean checklist to start."
        />
      ) : null}

      {[
        { title: "Global defaults", list: globals },
        { title: "Property-specific", list: perProperty },
      ]
        .filter((group) => group.list.length)
        .map((group) => (
          <section key={group.title} className="space-y-2">
            <h2 className="section-title">{group.title}</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.list.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setEditing(template)}
                  className="card card-pad text-left transition-shadow hover:shadow-md"
                >
                  <p className="chip mb-1.5 bg-ink-100 text-ink-600 ring-ink-200">
                    {TYPE_LABEL[template.type] ?? template.type}
                  </p>
                  <p className="font-medium text-ink-900">{template.name}</p>
                  {template.property ? (
                    <p className="text-sm text-ink-500">{template.property.name}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-400">
                    {template.items.length} item{template.items.length === 1 ? "" : "s"} ·{" "}
                    {new Set(template.items.map((item) => item.section)).size} section
                    {new Set(template.items.map((item) => item.section)).size === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ))}

      {editing ? (
        <ChecklistEditor
          template={editing === "new" ? null : editing}
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

function ChecklistEditor({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: properties } = useSWR<{ properties: { id: string; name: string }[] }>(
    "/api/properties",
    fetcher,
  );

  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState(template?.type ?? "TURNOVER");
  const [propertyId, setPropertyId] = useState(template?.propertyId ?? "");
  const [items, setItems] = useState<Item[]>(template?.items ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = (section: string) =>
    setItems((current) => [
      ...current,
      {
        section,
        title: "",
        description: null,
        position: current.length,
        required: true,
        photoRequired: false,
      },
    ]);

  const updateItem = (index: number, patch: Partial<Item>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next.map((item, i) => ({ ...item, position: i })));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name,
        type,
        propertyId: propertyId || null,
        items: items
          .filter((item) => item.title.trim())
          .map((item, index) => ({ ...item, position: index })),
      };
      if (template) {
        await api(`/api/checklists/${template.id}`, { method: "PATCH", json: payload });
      } else {
        await api("/api/checklists", { method: "POST", json: payload });
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the checklist");
    } finally {
      setBusy(false);
    }
  };

  const sections = [...new Set(items.map((item) => item.section))];

  return (
    <Modal open onClose={onClose} title={template ? "Edit checklist" : "New checklist"} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Applies to">
            <select
              className="input"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">Every property (global default)</option>
              {properties?.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
          Tasks keep their own copy of these items, so editing a checklist never changes work
          that&apos;s already out with a cleaner.
        </p>

        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section} className="space-y-2">
              <input
                className="input font-semibold"
                value={section}
                onChange={(event) => {
                  const next = event.target.value;
                  setItems((current) =>
                    current.map((item) =>
                      item.section === section ? { ...item, section: next } : item,
                    ),
                  );
                }}
              />
              {items.map((item, index) =>
                item.section !== section ? null : (
                  <div key={index} className="flex items-start gap-2 rounded-lg border border-ink-100 p-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        className="btn-ghost px-1 py-0 text-xs"
                        onClick={() => move(index, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-1 py-0 text-xs"
                        onClick={() => move(index, 1)}
                      >
                        ▼
                      </button>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input
                        className="input"
                        placeholder="What to do"
                        value={item.title}
                        onChange={(e) => updateItem(index, { title: e.target.value })}
                      />
                      <input
                        className="input text-sm"
                        placeholder="Extra detail (optional)"
                        value={item.description ?? ""}
                        onChange={(e) => updateItem(index, { description: e.target.value || null })}
                      />
                      <div className="flex flex-wrap gap-4">
                        <Toggle
                          checked={item.required}
                          onChange={(value) => updateItem(index, { required: value })}
                          label="Required to finish"
                        />
                        <Toggle
                          checked={item.photoRequired}
                          onChange={(value) => updateItem(index, { photoRequired: value })}
                          label="Photo expected"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => setItems(items.filter((_, i) => i !== index))}
                    >
                      ✕
                    </button>
                  </div>
                ),
              )}
              <button type="button" className="btn-secondary" onClick={() => addItem(section)}>
                + Add item to {section}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => addItem(`Section ${sections.length + 1}`)}
        >
          + Add a section
        </button>

        <ErrorNote error={error} />
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy || !name} onClick={save}>
            {busy ? "Saving…" : "Save checklist"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
