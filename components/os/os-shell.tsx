"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, Gauge, LineChart, LogOut, Megaphone, Settings } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/", label: "Home", icon: Gauge },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/trading", label: "Trading", icon: LineChart },
  { href: "/founder", label: "Founder Ops", icon: BriefcaseBusiness },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings }
];

type ShellAuth = { supabaseConfigured: boolean; email: string | null };
type HermesStatus = { configured: boolean; connected: boolean };

export function OsShell({ children, auth, hermes }: { children: React.ReactNode; auth: ShellAuth; hermes: HermesStatus }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const hermesTone = hermes.connected ? "bg-emerald-500" : hermes.configured ? "bg-amber-500" : "bg-neutral-600";
  const hermesLabel = hermes.connected ? "Hermes connected" : hermes.configured ? "Hermes configured" : "Hermes offline";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-neutral-800 bg-neutral-950 px-3 py-5 lg:block">
        <div className="px-2">
          <div className="text-sm font-semibold tracking-tight text-neutral-50">Agentic OS</div>
          <div className="mt-1 text-xs text-neutral-500">Personal Command Center</div>
        </div>
        <nav className="mt-8 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  active ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span className={clsx("h-2 w-2 rounded-full", hermesTone)} aria-hidden />
              <span>{hermesLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              {auth.email ? <span className="hidden text-xs text-neutral-500 sm:inline">{auth.email}</span> : null}
              {auth.supabaseConfigured ? (
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
            {nav.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                    active ? "bg-neutral-100 text-neutral-950" : "bg-neutral-900 text-neutral-300"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
