"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  CheckSquare,
  Gauge,
  Layers3,
  LogOut,
  Megaphone,
  Moon,
  Settings,
  Share2,
  Sun,
  Wand2
} from "lucide-react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

const navItems = [
  { href: "/", label: "Home", icon: Gauge },
  { href: "/brands", label: "Brands", icon: BriefcaseBusiness },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/agent-brain", label: "Agent Brain", icon: BrainCircuit },
  { href: "/system-map", label: "System Map", icon: Share2 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/workflows/weekly-content-plan", label: "Workflows", icon: Wand2 },
  { href: "/content-pipeline", label: "Pipeline", icon: Layers3 },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings }
];

const publicAuthPaths = ["/login", "/forgot-password", "/reset-password", "/auth/callback"];

type ShellAuth = {
  supabaseConfigured: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  email: string | null;
};

export function AppShell({ children, auth }: { children: React.ReactNode; auth: ShellAuth }) {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  if (publicAuthPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">{children}</div>;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white/95 px-4 py-5 shadow-panel dark:border-slate-800 dark:bg-slate-950/95 lg:block">
        <div className="mb-8 px-2">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-command">Control Tower</div>
          <div className="mt-2 text-xl font-semibold tracking-tight">Agentic Marketing OS</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">GridFactory + Gulf-EL / NexRide</div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  active
                    ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Agency Operations
              </div>
              <div className="truncate text-lg font-semibold">AI agent workflows ready for integration</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 md:block">
                <span className="font-semibold">{auth.supabaseConfigured ? "Supabase" : "Local fallback"}</span>
                {auth.email ? <span className="ml-2 text-slate-400">{auth.email}</span> : null}
              </div>
              <button
                type="button"
                onClick={() => setDark((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-panel hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              {auth.supabaseConfigured ? (
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-panel hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium",
                    active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
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
