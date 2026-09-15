"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`chip ${className}`}>{children}</span>;
}

export function Avatar({
  name,
  color = "#61708d",
  size = 32,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card card-pad flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium text-ink-800">{title}</p>
      {body ? <p className="max-w-md text-sm text-ink-500">{body}</p> : null}
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const toneClass = {
    default: "text-ink-900",
    warn: "text-amber-600",
    danger: "text-red-600",
    good: "text-emerald-600",
  }[tone];

  const inner = (
    <div className="card card-pad h-full">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4">
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-5 py-3">
          <h2 className="font-semibold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

/** Renders a timestamp in the browser to avoid a server/client locale mismatch. */
export function LocalTime({
  value,
  format = "datetime",
  fallback = "—",
}: {
  value: string | Date | null | undefined;
  format?: "datetime" | "date" | "time" | "relative";
  fallback?: string;
}) {
  const [text, setText] = useState(fallback);

  useEffect(() => {
    if (!value) {
      setText(fallback);
      return;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      setText(fallback);
      return;
    }

    if (format === "relative") {
      setText(relativeTime(date));
      const timer = setInterval(() => setText(relativeTime(date)), 60_000);
      return () => clearInterval(timer);
    }

    setText(
      format === "date"
        ? date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
        : format === "time"
          ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
          : date.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
    );
  }, [value, format, fallback]);

  return <span>{text}</span>;
}

function relativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (minutes < 60) return formatter.format(Math.sign(diffMs) * minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(Math.sign(diffMs) * hours, "hour");
  const days = Math.round(hours / 24);
  return formatter.format(Math.sign(diffMs) * days, "day");
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? "bg-emerald-500" : "bg-brand-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-ink-500">
        {done}/{total}
      </span>
    </div>
  );
}
