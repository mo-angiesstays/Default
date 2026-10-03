"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { ErrorNote, Field, LocalTime, Modal, Spinner, Toggle } from "@/components/ui";

type Token = {
  id: string;
  name: string;
  hint: string;
  readOnly: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string };
};

/**
 * Access tokens for connecting an assistant (Claude, ChatGPT, Hermes) to
 * TurnKeep. One per person, because the token is what decides whose work the
 * assistant can see.
 */
export function McpTokens({ appUrl }: { appUrl: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ tokens: Token[] }>(
    "/api/mcp-tokens",
    fetcher,
  );
  const { data: users } = useSWR<{ users: { id: string; name: string; role: string }[] }>(
    "/api/users",
    fetcher,
  );

  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<{ plaintext: string; name: string } | null>(null);
  const [form, setForm] = useState({ name: "", userId: "", readOnly: false });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const endpoint = `${appUrl.replace(/\/$/, "")}/api/mcp`;

  const create = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const result = await api<{ plaintext: string; token: Token }>("/api/mcp-tokens", {
        method: "POST",
        json: { name: form.name, userId: form.userId || undefined, readOnly: form.readOnly },
      });
      setIssued({ plaintext: result.plaintext, name: form.name });
      setOpen(false);
      setForm({ name: "", userId: "", readOnly: false });
      mutate();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not create the token");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: Token) => {
    await api(`/api/mcp-tokens/${token.id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <section className="card card-pad space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-ink-800">Assistant access</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Connect TurnKeep to Claude, ChatGPT or your own bot so you can ask it questions from
            your phone. Each token belongs to one person — a cleaner&apos;s assistant only ever
            sees that cleaner&apos;s work.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          New token
        </button>
      </div>

      <div className="rounded-xl bg-ink-100/70 p-4">
        <p className="label mb-1">Server URL</p>
        <code className="block break-all font-mono text-sm text-ink-800">{endpoint}</code>
        <p className="mt-2 text-xs text-ink-500">
          Add this as a custom connector, with the token as a bearer credential. It must be
          reachable over public HTTPS — assistants can&apos;t connect to localhost.
        </p>
      </div>

      <ErrorNote error={error} />
      {isLoading ? <Spinner /> : null}

      {data?.tokens.length ? (
        <ul className="divide-y divide-ink-100">
          {data.tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-800">
                  {token.name}
                  {token.readOnly ? (
                    <span className="chip ml-2 bg-ink-100 text-ink-600 ring-ink-200">read-only</span>
                  ) : null}
                </p>
                <p className="font-mono text-xs text-ink-400">{token.hint}</p>
                <p className="text-xs text-ink-500">
                  {token.user.name} ({token.user.role.toLowerCase()}) ·{" "}
                  {token.lastUsedAt ? (
                    <>
                      last used <LocalTime value={token.lastUsedAt} format="relative" />
                    </>
                  ) : (
                    "never used"
                  )}
                </p>
              </div>
              <button type="button" className="btn-ghost text-rust-700" onClick={() => revoke(token)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !isLoading && <p className="text-sm text-ink-400">No tokens yet.</p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New access token">
        <div className="space-y-3">
          <Field label="Label" hint="So you can tell it apart later.">
            <input
              className="input"
              autoFocus
              placeholder="Maria's phone — Claude"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Belongs to" hint="Decides whose work the assistant can see and change.">
            <select
              className="input"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">Me</option>
              {users?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <Toggle
            checked={form.readOnly}
            onChange={(v) => setForm({ ...form, readOnly: v })}
            label="Read-only — can answer questions but not change anything"
          />
          <ErrorNote error={formError} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy || !form.name} onClick={create}>
              {busy ? "Creating…" : "Create token"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(issued)} onClose={() => setIssued(null)} title="Token created">
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Copy it now — it isn&apos;t stored and can&apos;t be shown again. If you lose it,
            revoke it and make another.
          </p>
          <code className="block break-all rounded-xl bg-ink-900 p-3 font-mono text-xs text-ink-100">
            {issued?.plaintext}
          </code>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigator.clipboard?.writeText(issued?.plaintext ?? "")}
          >
            Copy to clipboard
          </button>
          <div className="rounded-xl bg-ink-100/70 p-3 text-xs text-ink-600">
            <p className="font-medium text-ink-700">To connect it</p>
            <p className="mt-1">
              Add <span className="font-mono">{endpoint}</span> as a custom MCP connector and paste
              this as the bearer token. In ChatGPT that needs Developer Mode, which is limited to
              Business and Enterprise plans.
            </p>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setIssued(null)}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
