"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Bell, BookOpen, Bot, Gauge, LogOut, Megaphone, Settings } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/", label: "Home", icon: Gauge },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/marketing/learning", label: "Learning library", icon: BookOpen },
  // Sales and Trading are hidden from the menu (admin 2026-11-20); their pages still exist.
  { href: "/agents", label: "Agents", icon: Bot },
  // Brain is hidden from the menu (admin 2026-11-20); the /brain page still exists.
  { href: "/settings", label: "Settings", icon: Settings }
];

/** The menu item whose path is the longest prefix of the current page is the active one. */
function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (!(pathname === href || pathname.startsWith(`${href}/`))) return false;
  return !nav.some((other) => other.href !== href && other.href.startsWith(href) && (pathname === other.href || pathname.startsWith(`${other.href}/`)));
}

/** Where Back goes when there is no in-app history (opened from a link or a new tab). */
export function parentPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";
}

type ShellAuth = { supabaseConfigured: boolean; email: string | null };
type HermesStatus = { configured: boolean; connected: boolean };

type ShellAlert = { campaignId: string; title: string; state: string; summary: string; at: string | null };

export function OsShell({ children, auth, hermes, brands = [], selectedBrandId = null, alerts = [] }: { children: React.ReactNode; auth: ShellAuth; hermes: HermesStatus; brands?: Array<{ id: string; name: string }>; selectedBrandId?: string | null; alerts?: ShellAlert[] }) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [brandId, setBrandId] = useState(selectedBrandId ?? "");
  const [switching, setSwitching] = useState(false);

  // One brand for every page: remembered server-side (cookie), then the page re-renders with it first.
  async function switchBrand(id: string) {
    setBrandId(id);
    setSwitching(true);
    try {
      await fetch("/api/os/brand-selection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: id }) });
      // Client components keep their own state; a full reload makes every picker start on the new brand.
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }
  const pathname = usePathname();
  const router = useRouter();

  function goBack() {
    // Same-origin history -> real back; otherwise go one level up.
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push(parentPath(pathname));
  }

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
            const active = isActive(item.href, pathname);
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
            <div className="flex items-center gap-3 text-sm text-neutral-400">
              {pathname !== "/" ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-800 px-3 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : null}
              <span className={clsx("h-2 w-2 rounded-full", hermesTone)} aria-hidden />
              <span>{hermesLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Campaign results the admin has not opened yet (ready / blocked / needs you / error). */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAlertsOpen(!alertsOpen)}
                  aria-label={alerts.length ? `${alerts.length} campaign update(s)` : "No campaign updates"}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-800 text-neutral-300 hover:bg-neutral-900"
                >
                  <Bell className="h-4 w-4" />
                  {alerts.length ? (
                    <span data-testid="alerts-count" className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-neutral-950">{alerts.length}</span>
                  ) : null}
                </button>
                {alertsOpen ? (
                  <div className="absolute right-0 z-30 mt-2 w-96 rounded-md border border-neutral-800 bg-neutral-950 p-2 shadow-xl">
                    {alerts.length ? (
                      alerts.map((a) => (
                        <Link key={a.campaignId} href={`/marketing/review/${a.campaignId}`} onClick={() => setAlertsOpen(false)} className="block rounded-md px-2 py-2 text-sm hover:bg-neutral-900">
                          <span className="font-medium text-neutral-100">{a.state === "ready" ? "✅" : a.state === "blocked" ? "⛔" : a.state === "needs_you" ? "👋" : "⚠️"} {a.title}</span>
                          <span className="mt-0.5 block text-xs text-neutral-400">{a.summary}</span>
                        </Link>
                      ))
                    ) : (
                      <p className="px-2 py-2 text-sm text-neutral-500">No new campaign updates.</p>
                    )}
                  </div>
                ) : null}
              </div>
              {brands.length ? (
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  Brand
                  <select
                    value={brandId}
                    disabled={switching}
                    onChange={(e) => void switchBrand(e.target.value)}
                    aria-label="Brand for every page"
                    className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm font-medium text-neutral-100"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
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
              const active = isActive(item.href, pathname);
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
