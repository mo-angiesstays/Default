"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/labels";
import { Avatar, EmptyState, ErrorNote, Field, LocalTime, Modal, Spinner, Toggle } from "@/components/ui";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: keyof typeof ROLE_LABEL;
  active: boolean;
  skills: string[];
  maxDailyTasks: number;
  avatarColor: string;
  lastLoginAt: string | null;
  _count: { assignedTasks: number };
};

export default function TeamPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<{ users: TeamMember[] }>(
    `/api/users?includeInactive=${includeInactive}`,
    fetcher,
  );
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const grouped = (["MANAGER", "CLEANER", "MAINTENANCE"] as const).map((role) => ({
    role,
    members: (data?.users ?? []).filter((user) => user.role === role),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Team</h1>
        <div className="flex items-center gap-3">
          <Toggle checked={includeInactive} onChange={setIncludeInactive} label="Show inactive" />
          <button type="button" className="btn-primary" onClick={() => setNewOpen(true)}>
            + Add person
          </button>
        </div>
      </div>

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}
      {!isLoading && !data?.users.length ? <EmptyState title="Nobody on the team yet" /> : null}

      {grouped
        .filter((group) => group.members.length)
        .map((group) => (
          <section key={group.role} className="space-y-2">
            <h2 className="section-title">
              {ROLE_LABEL[group.role]}s ({group.members.length})
            </h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setEditing(member)}
                  className={`card card-pad text-left transition-shadow hover:shadow-md ${
                    member.active ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={member.name} color={member.avatarColor} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">{member.name}</p>
                      <p className="truncate text-sm text-ink-500">{member.email}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        Max {member.maxDailyTasks}/day · {member._count.assignedTasks} assigned
                        {member.lastLoginAt ? (
                          <>
                            {" · last in "}
                            <LocalTime value={member.lastLoginAt} format="relative" />
                          </>
                        ) : (
                          " · never signed in"
                        )}
                      </p>
                      {member.skills.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {member.skills.map((skill) => (
                            <span
                              key={skill}
                              className="chip bg-ink-100 text-ink-600 ring-ink-200"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {!member.active ? (
                        <span className="chip mt-1.5 bg-red-50 text-red-700 ring-red-200">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}

      <PersonModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={() => {
          setNewOpen(false);
          mutate();
        }}
      />
      <PersonModal
        open={Boolean(editing)}
        member={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mutate();
        }}
      />
    </div>
  );
}

function PersonModal({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member?: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingExisting = Boolean(member);
  const [form, setForm] = useState({
    name: member?.name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: member?.role ?? "CLEANER",
    password: "",
    skills: member?.skills.join(", ") ?? "",
    maxDailyTasks: member?.maxDailyTasks ?? 4,
    avatarColor: member?.avatarColor ?? "#3388fb",
    active: member?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form when a different person is opened.
  const [seed, setSeed] = useState(member?.id);
  if (seed !== member?.id) {
    setSeed(member?.id);
    setForm({
      name: member?.name ?? "",
      email: member?.email ?? "",
      phone: member?.phone ?? "",
      role: member?.role ?? "CLEANER",
      password: "",
      skills: member?.skills.join(", ") ?? "",
      maxDailyTasks: member?.maxDailyTasks ?? 4,
      avatarColor: member?.avatarColor ?? "#3388fb",
      active: member?.active ?? true,
    });
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        skills: form.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
        maxDailyTasks: form.maxDailyTasks,
        avatarColor: form.avatarColor,
        ...(form.password ? { password: form.password } : {}),
        ...(editingExisting ? { active: form.active } : {}),
      };

      if (editingExisting) {
        await api(`/api/users/${member!.id}`, { method: "PATCH", json: payload });
      } else {
        await api("/api/users", { method: "POST", json: payload });
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editingExisting ? "Edit person" : "Add a person"}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Email" hint="Used to sign in and to send calendar invites.">
          <input
            type="email"
            className="input"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Role">
            <select
              className="input"
              value={form.role}
              onChange={(e) => set("role", e.target.value as TeamMember["role"])}
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label={editingExisting ? "New password" : "Password"}
          hint={editingExisting ? "Leave blank to keep the current one." : "At least 8 characters."}
        >
          <input
            type="password"
            className="input"
            required={!editingExisting}
            minLength={form.password ? 8 : undefined}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max jobs per day" hint="A hard cap the scheduler respects.">
            <input
              type="number"
              min={1}
              max={20}
              className="input"
              value={form.maxDailyTasks}
              onChange={(e) => set("maxDailyTasks", Number(e.target.value))}
            />
          </Field>
          <Field label="Colour">
            <input
              type="color"
              className="input h-10"
              value={form.avatarColor}
              onChange={(e) => set("avatarColor", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Skills" hint="Comma separated, e.g. deep-clean, laundry, hvac, plumbing.">
          <input
            className="input"
            value={form.skills}
            onChange={(e) => set("skills", e.target.value)}
          />
        </Field>
        {editingExisting ? (
          <Toggle checked={form.active} onChange={(v) => set("active", v)} label="Active" />
        ) : null}

        <ErrorNote error={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : editingExisting ? "Save changes" : "Add person"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
