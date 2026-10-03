"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import type { Role } from "@prisma/client";
import { api, fetcher } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/labels";
import { Avatar } from "@/components/ui";
import {
  IconCalendar,
  IconChat,
  IconChecklist,
  IconClock,
  IconDashboard,
  IconIssue,
  IconMenu,
  IconProperty,
  IconScheduling,
  IconSettings,
  IconTasks,
  IconTeam,
} from "@/components/icons";

type Me = {
  user: { id: string; name: string; email: string; role: Role; timezone: string } | null;
  unreadChat: number;
  unreadNotifications: number;
  openShift: { id: string; clockInAt: string } | null;
};

type IconComponent = (props: { className?: string; size?: number }) => React.ReactElement;
type NavItem = {
  href: string;
  label: string;
  Icon: IconComponent;
  roles?: Role[];
  badge?: number;
};

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
    { href: "/", label: "Dashboard", Icon: IconDashboard },
    { href: "/tasks", label: "Tasks", Icon: IconTasks },
    { href: "/calendar", label: "Calendar", Icon: IconCalendar },
    { href: "/issues", label: "Issues", Icon: IconIssue },
    { href: "/chat", label: "Chat", Icon: IconChat, badge: me?.unreadChat },
    { href: "/timeclock", label: "Time clock", Icon: IconClock },
    { href: "/properties", label: "Properties", Icon: IconProperty, roles: ["MANAGER"] },
    { href: "/team", label: "Team", Icon: IconTeam, roles: ["MANAGER"] },
    { href: "/checklists", label: "Checklists", Icon: IconChecklist, roles: ["MANAGER"] },
    { href: "/rules", label: "Scheduling", Icon: IconScheduling, roles: ["MANAGER"] },
    { href: "/settings", label: "Settings", Icon: IconSettings, roles: ["MANAGER"] },
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
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
            isActive(item.href)
              ? "bg-brand-600/90 font-medium text-white shadow-sm"
              : "text-ink-300/80 hover:bg-white/5 hover:text-ink-100"
          }`}
        >
          <item.Icon className={isActive(item.href) ? "opacity-95" : "opacity-70"} />
          <span className="flex-1">{item.label}</span>
          {item.badge ? (
            <span className="rounded-full bg-rust-500 px-1.5 text-xs font-semibold text-white">
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
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-ink-900 p-4 lg:flex">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-1 py-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-display text-lg text-white">
              T
            </span>
            <span className="font-display text-lg text-ink-50">TurnKeep</span>
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
          <aside className="relative flex h-full w-72 flex-col justify-between bg-ink-900 p-4">
            <div>
              <div className="mb-6 flex items-center gap-2.5 px-1 py-1">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-display text-lg text-white">
                  T
                </span>
                <span className="font-display text-lg text-ink-50">TurnKeep</span>
              </div>
              {navLinks}
            </div>
            <SidebarFooter user={user} openShift={me?.openShift ?? null} onSignOut={signOut} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200/70 bg-ink-50/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            className="btn-ghost px-2 py-1.5"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <IconMenu size={20} />
          </button>
          <Link href="/" className="font-display text-lg text-ink-800">
            TurnKeep
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {me?.openShift ? (
              <Link href="/timeclock" className="chip bg-moss-100 text-moss-800 ring-moss-200">
                <IconClock size={12} /> On the clock
              </Link>
            ) : null}
            <Avatar name={user.name} size={28} />
          </div>
        </header>

        <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
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
    <div className="border-t border-white/10 pt-3">
      {openShift ? (
        <Link
          href="/timeclock"
          className="mb-2 flex items-center gap-2 rounded-xl bg-moss-500/20 px-3 py-2 text-xs font-medium text-moss-200"
        >
          <IconClock size={14} /> On the clock
        </Link>
      ) : null}
      <div className="flex items-center gap-2 px-1 py-2">
        <Avatar name={user.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-50">{user.name}</p>
          <p className="truncate text-xs text-ink-400">{ROLE_LABEL[user.role]}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink-400 hover:bg-white/5 hover:text-ink-100"
      >
        Sign out
      </button>
    </div>
  );
}
