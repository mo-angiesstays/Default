"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { EmptyState, ErrorNote, Field, Modal, Spinner, Toggle } from "@/components/ui";

type Property = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  bedrooms: number;
  bathrooms: number;
  color: string;
  timezone: string;
  hostawayListingId: string | null;
  turnoverMinutes: number;
  deepCleanEnabled: boolean;
  deepCleanDayOfMonth: number | null;
  _count: { tasks: number; issues: number };
};

export default function PropertiesPage() {
  const { data, error, isLoading, mutate } = useSWR<{ properties: Property[] }>(
    "/api/properties",
    fetcher,
  );
  const [newOpen, setNewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const importListings = async () => {
    setImporting(true);
    setNote(null);
    try {
      const response = await api<{ result: { created: number; linked: number } }>(
        "/api/integrations/hostaway/import-listings",
        { method: "POST" },
      );
      setNote(
        `Imported ${response.result.created} new propert${
          response.result.created === 1 ? "y" : "ies"
        }, refreshed ${response.result.linked}.`,
      );
      mutate();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Properties</h1>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={importing} onClick={importListings}>
            {importing ? "Importing…" : "Import from Hostaway"}
          </button>
          <button type="button" className="btn-primary" onClick={() => setNewOpen(true)}>
            + Add property
          </button>
        </div>
      </div>

      {note ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          {note}
        </div>
      ) : null}

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}

      {!isLoading && !data?.properties.length ? (
        <EmptyState
          title="No properties yet"
          body="Import your Hostaway listings, or add one by hand."
        />
      ) : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {data?.properties.map((property) => (
          <Link
            key={property.id}
            href={`/properties/${property.id}`}
            className="card card-pad transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-1 h-10 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: property.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{property.name}</p>
                <p className="truncate text-sm text-ink-500">
                  {[property.city, property.state].filter(Boolean).join(", ") || "No address"}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {property.bedrooms} bed · {property.bathrooms} bath · {property.turnoverMinutes}m
                  turnover
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {property.hostawayListingId ? (
                    <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">
                      Hostaway linked
                    </span>
                  ) : (
                    <span className="chip bg-amber-50 text-amber-700 ring-amber-200">
                      Not linked
                    </span>
                  )}
                  {property.deepCleanEnabled ? (
                    <span className="chip bg-purple-50 text-purple-700 ring-purple-200">
                      Deep clean day {property.deepCleanDayOfMonth ?? 1}
                    </span>
                  ) : null}
                  {property._count.issues ? (
                    <span className="chip bg-red-50 text-red-700 ring-red-200">
                      {property._count.issues} open issue
                      {property._count.issues === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {property._count.tasks ? (
                    <span className="chip bg-ink-100 text-ink-600 ring-ink-200">
                      {property._count.tasks} open task
                      {property._count.tasks === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <NewPropertyModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          mutate();
        }}
      />
    </div>
  );
}

function NewPropertyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    addressLine1: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    bedrooms: 1,
    bathrooms: 1,
    hostawayListingId: "",
    turnoverMinutes: 180,
    deepCleanMinutes: 300,
    deepCleanEnabled: true,
    deepCleanDayOfMonth: 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/properties", {
        method: "POST",
        json: { ...form, hostawayListingId: form.hostawayListingId || null },
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the property");
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title="Add a property">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            className="input"
            required
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field label="Address">
          <input
            className="input"
            value={form.addressLine1}
            onChange={(event) => set("addressLine1", event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input
              className="input"
              value={form.city}
              onChange={(event) => set("city", event.target.value)}
            />
          </Field>
          <Field label="State">
            <input
              className="input"
              value={form.state}
              onChange={(event) => set("state", event.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bedrooms">
            <input
              type="number"
              min={0}
              className="input"
              value={form.bedrooms}
              onChange={(event) => set("bedrooms", Number(event.target.value))}
            />
          </Field>
          <Field label="Bathrooms">
            <input
              type="number"
              min={0}
              step={0.5}
              className="input"
              value={form.bathrooms}
              onChange={(event) => set("bathrooms", Number(event.target.value))}
            />
          </Field>
          <Field label="Turnover (min)">
            <input
              type="number"
              min={15}
              className="input"
              value={form.turnoverMinutes}
              onChange={(event) => set("turnoverMinutes", Number(event.target.value))}
            />
          </Field>
        </div>
        <Field label="Hostaway listing ID" hint="Links check-outs to this property.">
          <input
            className="input"
            value={form.hostawayListingId}
            onChange={(event) => set("hostawayListingId", event.target.value)}
            placeholder="e.g. 123456"
          />
        </Field>
        <Field label="Timezone">
          <input
            className="input"
            value={form.timezone}
            onChange={(event) => set("timezone", event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deep clean day of month">
            <input
              type="number"
              min={1}
              max={28}
              className="input"
              value={form.deepCleanDayOfMonth}
              onChange={(event) => set("deepCleanDayOfMonth", Number(event.target.value))}
            />
          </Field>
          <Field label="Deep clean (min)">
            <input
              type="number"
              min={15}
              className="input"
              value={form.deepCleanMinutes}
              onChange={(event) => set("deepCleanMinutes", Number(event.target.value))}
            />
          </Field>
        </div>
        <Toggle
          checked={form.deepCleanEnabled}
          onChange={(value) => set("deepCleanEnabled", value)}
          label="Generate a monthly deep clean"
        />

        <ErrorNote error={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !form.name}>
            {busy ? "Saving…" : "Add property"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
