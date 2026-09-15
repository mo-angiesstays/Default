"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { api, fetcher } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/labels";
import { Avatar } from "@/components/ui";

type Me = {
  user: { id: string; name: string; email: string; role: Role; timezone: string } | null;
  unreadChat: number;
  unreadNotifications: number;
  openShift: { id: string; clockInAt: string } | null;
};

type NavItem = { href: string; label: string; icon: string; roles?: Role[]; badge?: number };

export function AppShell({
  user,
  children,
}: {
  user: { id: string; name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Poll so badges stay live without a socket layer.
  const { data: me } = useSWR<Me>("/api/auth/me", fetcher, { refreshInterval: 20_000 });

  const nav: NavItem[] = ([
    { href: "/", label: "Dashboard", icon: "◧" },
    { href: "/tasks", label: "Tasks", icon: "☑" },
    { href: "/calendar", label: "Calendar", icon: "▦" },
    { href: "/issues", label: "Issues", icon: "⚠" },
    { href: "/chat", label: "Chat", icon: "💬", badge: me?.unreadChat },
    { href: "/timeclock", label: "Time clock", icon: "⏱" },
    { href: "/properties", label: "Properties", icon: "⌂", roles: ["MANAGER"] },
    { href: "/team", label: "Team", icon: "👥", roles: ["MANAGER"] },
    { href: "/checklists", label: "Checklists", icon: "✓", roles: ["MANAGER"] },
    { href: "/rules", label: "Scheduling", icon: "⚙", roles: ["MANAGER"] },
    { href: "/settings", label: "Settings", icon: "⚡", roles: ["MANAGER"] },
  ] satisfies NavItem[]).filter((item) => !item.roles || (item.roles as Role[]).includes(user.role));

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const navLinks = (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive(item.href)
              ? "bg-brand-600 font-medium text-white"
              : "text-ink-300 hover:bg-ink-800 hover:text-white"
          }`}
        >
          <span aria-hidden className="w-4 text-center opacity-80">
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {item.badge ? (
            <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-ink-900 p-3 lg:flex">
        <div>
          <Link href="/" className="mb-5 flex items-center gap-2 px-2 py-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
              T
            </span>
            <span className="font-semibold text-white">TurnKeep</span>
          </Link>
          {navLinks}
        </div>
        <SidebarFooter user={user} openShift={me?.openShift ?? null} onSignOut={signOut} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col justify-between bg-ink-900 p-3">
            <div>
              <div className="mb-5 flex items-center gap-2 px-2 py-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
                  T
                </span>
                <span className="font-semibold text-white">TurnKeep</span>
              </div>
              {navLinks}
            </div>
            <SidebarFooter user={user} openShift={me?.openShift ?? null} onSignOut={signOut} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-2 lg:hidden">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-lg"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <Link href="/" className="font-semibold text-ink-900">
            TurnKeep
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {me?.openShift ? (
              <Link href="/timeclock" className="chip bg-emerald-100 text-emerald-800 ring-emerald-200">
                ⏱ On the clock
              </Link>
            ) : null}
            <Avatar name={user.name} size={28} />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarFooter({
  user,
  openShift,
  onSignOut,
}: {
  user: { name: string; email: string; role: Role };
  openShift: { clockInAt: string } | null;
  onSignOut: () => void;
}) {
  return (
    <div className="border-t border-ink-800 pt-3">
      {openShift ? (
        <Link
          href="/timeclock"
          className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-medium text-emerald-300"
        >
          ⏱ On the clock
        </Link>
      ) : null}
      <div className="flex items-center gap-2 px-1 py-2">
        <Avatar name={user.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-ink-400">{ROLE_LABEL[user.role]}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-400 hover:bg-ink-800 hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
