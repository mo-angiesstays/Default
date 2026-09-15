"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client";
import { Avatar, ErrorNote, LocalTime, Modal, Spinner } from "@/components/ui";

type Channel = {
  id: string;
  type: string;
  name: string;
  color: string | null;
  lastMessage: { body: string; createdAt: string } | null;
  lastMessageAt: string | null;
  members: { id: string; name: string; avatarColor: string; role: string }[];
  unread: number;
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  system: boolean;
  user: { id: string; name: string; avatarColor: string; role: string } | null;
};

export function ChatView({ viewer }: { viewer: { id: string; name: string } }) {
  return (
    <Suspense fallback={<Spinner />}>
      <ChatInner viewer={viewer} />
    </Suspense>
  );
}

function ChatInner({ viewer }: { viewer: { id: string; name: string } }) {
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("channel"));
  const [newOpen, setNewOpen] = useState(false);

  const { data: channelData, mutate: mutateChannels } = useSWR<{ channels: Channel[] }>(
    "/api/chat/channels",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const channels = useMemo(() => channelData?.channels ?? [], [channelData]);
  const active = channels.find((channel) => channel.id === activeId) ?? null;

  // Fall back to the busiest conversation when nothing is picked.
  useEffect(() => {
    if (!activeId && channels.length) setActiveId(channels[0].id);
  }, [activeId, channels]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4 lg:h-[calc(100vh-4rem)] lg:flex-row">
      <aside
        className={`card flex w-full shrink-0 flex-col overflow-hidden lg:w-72 ${
          active ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h1 className="font-semibold text-ink-900">Chat</h1>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => setNewOpen(true)}>
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {channels.length ? (
            channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => setActiveId(channel.id)}
                className={`flex w-full items-center gap-3 border-b border-ink-50 px-4 py-3 text-left hover:bg-ink-50 ${
                  channel.id === activeId ? "bg-brand-50" : ""
                }`}
              >
                <Avatar name={channel.name} color={channel.color ?? "#61708d"} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{channel.name}</p>
                  <p className="truncate text-xs text-ink-500">
                    {channel.lastMessage?.body ?? "No messages yet"}
                  </p>
                </div>
                {channel.unread ? (
                  <span className="rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                    {channel.unread}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-ink-400">
              No conversations yet. Start one with the + New button.
            </p>
          )}
        </div>
      </aside>

      {active ? (
        <ChannelPane
          channel={active}
          viewer={viewer}
          onBack={() => setActiveId(null)}
          onActivity={() => mutateChannels()}
        />
      ) : (
        <div className="card hidden flex-1 items-center justify-center text-sm text-ink-400 lg:flex">
          Pick a conversation
        </div>
      )}

      <NewChannelModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        viewerId={viewer.id}
        onCreated={(channelId) => {
          setNewOpen(false);
          setActiveId(channelId);
          mutateChannels();
        }}
      />
    </div>
  );
}

function ChannelPane({
  channel,
  viewer,
  onBack,
  onActivity,
}: {
  channel: Channel;
  viewer: { id: string; name: string };
  onBack: () => void;
  onActivity: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR<{ messages: Message[] }>(
    `/api/chat/channels/${channel.id}/messages`,
    fetcher,
    { refreshInterval: 5_000 },
  );

  const messages = data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Opening a channel clears its unread badge.
  useEffect(() => {
    void api(`/api/chat/channels/${channel.id}/read`, { method: "POST" }).then(onActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, messages.length]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    setBusy(true);
    setError(null);
    setBody("");
    try {
      await api(`/api/chat/channels/${channel.id}/messages`, {
        method: "POST",
        json: { body: text },
      });
      await mutate();
      onActivity();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Message didn't send");
      setBody(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
        <button type="button" className="btn-ghost px-2 py-1 lg:hidden" onClick={onBack}>
          ←
        </button>
        <Avatar name={channel.name} color={channel.color ?? "#61708d"} size={32} />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{channel.name}</p>
          <p className="truncate text-xs text-ink-500">
            {channel.members.map((member) => member.name).join(", ")}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => {
          if (message.system) {
            return (
              <p key={message.id} className="text-center text-xs text-ink-400">
                {message.body}
              </p>
            );
          }
          const mine = message.user?.id === viewer.id;
          return (
            <div key={message.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && message.user ? (
                <Avatar name={message.user.name} color={message.user.avatarColor} size={28} />
              ) : null}
              <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                {!mine ? (
                  <p className="text-xs text-ink-500">{message.user?.name ?? "Unknown"}</p>
                ) : null}
                <div
                  className={`inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-900"
                  }`}
                >
                  {message.body}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  <LocalTime value={message.createdAt} format="time" />
                </p>
              </div>
            </div>
          );
        })}
        {!messages.length ? (
          <p className="py-8 text-center text-sm text-ink-400">No messages yet — say hello.</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-ink-100 p-3">
        <input
          className="input"
          placeholder="Write a message…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={busy || !body.trim()}>
          Send
        </button>
      </form>
      {error ? (
        <div className="px-3 pb-3">
          <ErrorNote error={error} />
        </div>
      ) : null}
    </section>
  );
}

function NewChannelModal({
  open,
  onClose,
  onCreated,
  viewerId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (channelId: string) => void;
  viewerId: string;
}) {
  const { data: users } = useSWR<{ users: { id: string; name: string; role: string }[] }>(
    open ? "/api/users" : null,
    fetcher,
  );
  const { data: properties } = useSWR<{ properties: { id: string; name: string }[] }>(
    open ? "/api/properties" : null,
    fetcher,
  );

  const [mode, setMode] = useState<"DIRECT" | "GROUP" | "PROPERTY">("DIRECT");
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ channel: { id: string } }>("/api/chat/channels", {
        method: "POST",
        json: {
          type: mode,
          name: mode === "GROUP" ? name || "New group" : null,
          propertyId: mode === "PROPERTY" ? propertyId : null,
          memberIds: selected,
        },
      });
      onCreated(response.channel.id);
      setSelected([]);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the conversation");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (userId: string) =>
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : mode === "DIRECT"
          ? [userId]
          : [...current, userId],
    );

  return (
    <Modal open={open} onClose={onClose} title="New conversation">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {(["DIRECT", "GROUP", "PROPERTY"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setSelected([]);
              }}
              className={`flex-1 rounded-md px-3 py-1 text-sm ${
                mode === value ? "bg-white font-medium shadow-sm" : "text-ink-600"
              }`}
            >
              {value === "DIRECT" ? "Direct" : value === "GROUP" ? "Group" : "Property"}
            </button>
          ))}
        </div>

        {mode === "GROUP" ? (
          <input
            className="input"
            placeholder="Group name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}

        {mode === "PROPERTY" ? (
          <select
            className="input"
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
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {users?.users
              .filter((user) => user.id !== viewerId)
              .map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                    selected.includes(user.id) ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-ink-50"
                  }`}
                >
                  <Avatar name={user.name} size={28} />
                  <span className="flex-1">{user.name}</span>
                  <span className="text-xs text-ink-400">{user.role.toLowerCase()}</span>
                </button>
              ))}
          </div>
        )}

        <ErrorNote error={error} />

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={
              busy || (mode === "PROPERTY" ? !propertyId : selected.length === 0)
            }
            onClick={create}
          >
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
