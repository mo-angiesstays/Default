"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import {
  ISSUE_STATUS_CLASS,
  ISSUE_STATUS_LABEL,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  TASK_STATUS_CLASS,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "@/lib/labels";
import { Avatar, Chip, ErrorNote, Field, LocalTime, Spinner, Toggle } from "@/components/ui";
import { NewTaskButton } from "@/components/NewTaskDialog";

type Detail = {
  property: {
    id: string;
    name: string;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    timezone: string;
    bedrooms: number;
    bathrooms: number;
    color: string;
    hostawayListingId: string | null;
    checkInTime: string;
    checkOutTime: string;
    turnoverMinutes: number;
    deepCleanMinutes: number;
    deepCleanDayOfMonth: number | null;
    deepCleanEnabled: boolean;
    accessNotes: string | null;
    parkingNotes: string | null;
    wifiName: string | null;
    wifiPassword: string | null;
    supplyNotes: string | null;
    assignments: {
      id: string;
      priority: number;
      excluded: boolean;
      user: { id: string; name: string; role: string; avatarColor: string };
    }[];
    checklistTemplates: { id: string; name: string; type: string; _count: { items: number } }[];
    issues: {
      id: string;
      title: string;
      severity: keyof typeof SEVERITY_LABEL;
      status: keyof typeof ISSUE_STATUS_LABEL;
      carryCount: number;
      reportedBy: { name: string } | null;
    }[];
    schedulingRules: { id: string; name: string; instruction: string; hard: boolean }[];
  };
  upcomingTasks: {
    id: string;
    title: string;
    type: keyof typeof TASK_TYPE_LABEL;
    status: keyof typeof TASK_STATUS_LABEL;
    scheduledStart: string | null;
    assignee: { id: string; name: string; avatarColor: string } | null;
  }[];
  nextReservations: {
    id: string;
    guestName: string | null;
    checkIn: string;
    checkOut: string;
    nights: number;
    channel: string | null;
    sameDayTurn: boolean;
  }[];
};

export function PropertyDetailView({ propertyId }: { propertyId: string }) {
  const { data, error, isLoading, mutate } = useSWR<Detail>(
    `/api/properties/${propertyId}`,
    fetcher,
  );
  const { data: users } = useSWR<{ users: { id: string; name: string; role: string }[] }>(
    "/api/users",
    fetcher,
  );
  const [editing, setEditing] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Spinner />;

  const property = data.property;

  return (
    <div className="space-y-4">
      <Link href="/properties" className="text-sm text-brand-600 hover:underline">
        ← All properties
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1 h-12 w-1.5 rounded-full"
            style={{ backgroundColor: property.color }}
          />
          <div>
            <h1 className="text-xl font-semibold text-ink-900">{property.name}</h1>
            <p className="text-sm text-ink-500">
              {[property.addressLine1, property.city, property.state].filter(Boolean).join(", ") ||
                "No address on file"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {property.bedrooms} bed · {property.bathrooms} bath · check-out{" "}
              {property.checkOutTime} · check-in {property.checkInTime} · {property.timezone}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <NewTaskButton defaultPropertyId={property.id} onCreated={() => mutate()} />
          <button type="button" className="btn-secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit settings"}
          </button>
        </div>
      </div>

      {editing ? (
        <PropertySettings
          property={property}
          onSaved={() => {
            setEditing(false);
            mutate();
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad space-y-2">
          <h2 className="section-title">Upcoming work</h2>
          {data.upcomingTasks.length ? (
            <ul className="divide-y divide-ink-100">
              {data.upcomingTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="-mx-2 flex items-center gap-2 rounded px-2 py-2 hover:bg-ink-50"
                  >
                    <Chip className={TASK_STATUS_CLASS[task.status]}>
                      {TASK_STATUS_LABEL[task.status]}
                    </Chip>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-900">
                        {TASK_TYPE_LABEL[task.type]}
                      </p>
                      <p className="text-xs text-ink-500">
                        <LocalTime value={task.scheduledStart} />
                      </p>
                    </div>
                    {task.assignee ? (
                      <Avatar
                        name={task.assignee.name}
                        color={task.assignee.avatarColor}
                        size={24}
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">Nothing scheduled.</p>
          )}
        </section>

        <section className="card card-pad space-y-2">
          <h2 className="section-title">Upcoming reservations</h2>
          {data.nextReservations.length ? (
            <ul className="divide-y divide-ink-100 text-sm">
              {data.nextReservations.map((reservation) => (
                <li key={reservation.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="truncate text-ink-900">
                      {reservation.guestName ?? "Guest"}
                      {reservation.sameDayTurn ? (
                        <span className="ml-1 text-xs text-red-600">same-day turn</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-500">
                      {reservation.channel ?? "direct"} · {reservation.nights}n
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-ink-500">
                    <LocalTime value={reservation.checkIn} format="date" /> →{" "}
                    <LocalTime value={reservation.checkOut} format="date" />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">
              {property.hostawayListingId
                ? "No upcoming bookings synced."
                : "Link a Hostaway listing ID to pull reservations."}
            </p>
          )}
        </section>

        <section className="card card-pad space-y-2">
          <h2 className="section-title">Open issues</h2>
          {property.issues.length ? (
            <ul className="space-y-2">
              {property.issues.map((issue) => (
                <li key={issue.id} className="rounded-lg border border-ink-100 p-2">
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
                  </div>
                  <p className="mt-1 text-sm text-ink-900">{issue.title}</p>
                  <p className="text-xs text-ink-400">
                    Reported by {issue.reportedBy?.name ?? "someone"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">Nothing outstanding here.</p>
          )}
        </section>

        <PreferredStaff
          propertyId={property.id}
          assignments={property.assignments}
          users={users?.users ?? []}
          onSaved={() => mutate()}
        />
      </div>

      <section className="card card-pad space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Checklists for this property</h2>
          <Link href="/checklists" className="text-sm text-brand-600 hover:underline">
            Manage →
          </Link>
        </div>
        {property.checklistTemplates.length ? (
          <ul className="flex flex-wrap gap-2">
            {property.checklistTemplates.map((template) => (
              <li key={template.id} className="chip bg-ink-100 text-ink-700 ring-ink-200">
                {template.name} · {template._count.items} items
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">
            Using the global checklists. Add a property-specific one to override them.
          </p>
        )}
      </section>
    </div>
  );
}

function PreferredStaff({
  propertyId,
  assignments,
  users,
  onSaved,
}: {
  propertyId: string;
  assignments: Detail["property"]["assignments"];
  users: { id: string; name: string; role: string }[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(
    assignments.map((a) => ({ userId: a.user.id, priority: a.priority, excluded: a.excluded })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/properties/${propertyId}/assignments`, {
        method: "PUT",
        json: { assignments: rows },
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const available = users.filter((user) => !rows.some((row) => row.userId === user.id));

  return (
    <section className="card card-pad space-y-2">
      <h2 className="section-title">Preferred staff</h2>
      <p className="text-xs text-ink-400">
        The scheduler favours lower priority numbers. Blocked people are never scheduled here.
      </p>

      <ul className="space-y-2">
        {rows.map((row, index) => {
          const user = users.find((u) => u.id === row.userId);
          return (
            <li key={row.userId} className="flex items-center gap-2">
              <Avatar name={user?.name ?? "?"} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                {user?.name ?? "Unknown"}
              </span>
              <input
                type="number"
                min={1}
                max={10}
                className="input w-16"
                value={row.priority}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, priority: Number(event.target.value) };
                  setRows(next);
                }}
              />
              <Toggle
                checked={row.excluded}
                onChange={(value) => {
                  const next = [...rows];
                  next[index] = { ...row, excluded: value };
                  setRows(next);
                }}
                label="Block"
              />
              <button
                type="button"
                className="btn-ghost px-2 py-1"
                onClick={() => setRows(rows.filter((r) => r.userId !== row.userId))}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {available.length ? (
        <select
          className="input"
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            setRows([
              ...rows,
              { userId: event.target.value, priority: rows.length + 1, excluded: false },
            ]);
          }}
        >
          <option value="">Add someone…</option>
          {available.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role.toLowerCase()})
            </option>
          ))}
        </select>
      ) : null}

      <ErrorNote error={error} />
      <button type="button" className="btn-primary" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save preferences"}
      </button>
    </section>
  );
}

function PropertySettings({
  property,
  onSaved,
}: {
  property: Detail["property"];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: property.name,
    addressLine1: property.addressLine1 ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    timezone: property.timezone,
    hostawayListingId: property.hostawayListingId ?? "",
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
    turnoverMinutes: property.turnoverMinutes,
    deepCleanMinutes: property.deepCleanMinutes,
    deepCleanDayOfMonth: property.deepCleanDayOfMonth ?? 1,
    deepCleanEnabled: property.deepCleanEnabled,
    accessNotes: property.accessNotes ?? "",
    parkingNotes: property.parkingNotes ?? "",
    wifiName: property.wifiName ?? "",
    wifiPassword: property.wifiPassword ?? "",
    supplyNotes: property.supplyNotes ?? "",
    color: property.color,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/properties/${property.id}`, {
        method: "PATCH",
        json: { ...form, hostawayListingId: form.hostawayListingId || null },
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="card card-pad grid gap-3 md:grid-cols-2">
      <Field label="Name">
        <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Hostaway listing ID">
        <input
          className="input"
          value={form.hostawayListingId}
          onChange={(e) => set("hostawayListingId", e.target.value)}
        />
      </Field>
      <Field label="Address">
        <input
          className="input"
          value={form.addressLine1}
          onChange={(e) => set("addressLine1", e.target.value)}
        />
      </Field>
      <Field label="City / State">
        <div className="flex gap-2">
          <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          <input
            className="input w-20"
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
          />
        </div>
      </Field>
      <Field label="Check-out time" hint="Turnovers are scheduled from here.">
        <input
          className="input"
          value={form.checkOutTime}
          onChange={(e) => set("checkOutTime", e.target.value)}
          placeholder="10:00"
        />
      </Field>
      <Field label="Check-in time" hint="The deadline for the turnover.">
        <input
          className="input"
          value={form.checkInTime}
          onChange={(e) => set("checkInTime", e.target.value)}
          placeholder="16:00"
        />
      </Field>
      <Field label="Turnover minutes">
        <input
          type="number"
          className="input"
          value={form.turnoverMinutes}
          onChange={(e) => set("turnoverMinutes", Number(e.target.value))}
        />
      </Field>
      <Field label="Deep clean minutes">
        <input
          type="number"
          className="input"
          value={form.deepCleanMinutes}
          onChange={(e) => set("deepCleanMinutes", Number(e.target.value))}
        />
      </Field>
      <Field label="Deep clean day of month" hint="Moves to the next free day if a guest is in.">
        <input
          type="number"
          min={1}
          max={28}
          className="input"
          value={form.deepCleanDayOfMonth}
          onChange={(e) => set("deepCleanDayOfMonth", Number(e.target.value))}
        />
      </Field>
      <div className="flex items-end">
        <Toggle
          checked={form.deepCleanEnabled}
          onChange={(value) => set("deepCleanEnabled", value)}
          label="Generate monthly deep cleans"
        />
      </div>
      <Field label="Access notes">
        <textarea
          className="input min-h-16"
          value={form.accessNotes}
          onChange={(e) => set("accessNotes", e.target.value)}
          placeholder="Lockbox code, key location…"
        />
      </Field>
      <Field label="Parking notes">
        <textarea
          className="input min-h-16"
          value={form.parkingNotes}
          onChange={(e) => set("parkingNotes", e.target.value)}
        />
      </Field>
      <Field label="Wi-Fi network">
        <input
          className="input"
          value={form.wifiName}
          onChange={(e) => set("wifiName", e.target.value)}
        />
      </Field>
      <Field label="Wi-Fi password">
        <input
          className="input"
          value={form.wifiPassword}
          onChange={(e) => set("wifiPassword", e.target.value)}
        />
      </Field>
      <Field label="Supply notes">
        <textarea
          className="input min-h-16"
          value={form.supplyNotes}
          onChange={(e) => set("supplyNotes", e.target.value)}
        />
      </Field>
      <Field label="Colour">
        <input
          type="color"
          className="input h-10"
          value={form.color}
          onChange={(e) => set("color", e.target.value)}
        />
      </Field>

      <div className="md:col-span-2">
        <ErrorNote error={error} />
        <button type="submit" className="btn-primary mt-2" disabled={busy}>
          {busy ? "Saving…" : "Save property"}
        </button>
      </div>
    </form>
  );
}
