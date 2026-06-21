import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Dark, minimal OS primitives (Vercel/Linear aesthetic). Server-safe. */

export function OSPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={clsx("rounded-lg border border-neutral-800 bg-neutral-900/60 p-5", className)}>{children}</section>;
}

type Tone = "ok" | "warn" | "off" | "danger" | "demo" | "info";

const toneClasses: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  off: "bg-neutral-700/30 text-neutral-300 border border-neutral-700",
  danger: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
  demo: "bg-violet-500/10 text-violet-300 border border-violet-500/30",
  info: "bg-sky-500/10 text-sky-300 border border-sky-500/30"
};

export function OSBadge({ children, tone = "off" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={clsx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", toneClasses[tone])}>{children}</span>;
}

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{eyebrow}</div> : null}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-50">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function OSMetric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <OSPanel>
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-50">{value}</div>
      {hint ? <div className="mt-1 text-sm text-neutral-400">{hint}</div> : null}
    </OSPanel>
  );
}

export function OSButton({
  children,
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary: "border-neutral-100 bg-neutral-100 text-neutral-950 hover:bg-white",
    secondary: "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800",
    danger: "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
  };

  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function OSField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? <span className="mt-1 block text-xs leading-5 text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function OSInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function OSTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "min-h-28 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

/** Standard "designed but not wired" skeleton body for domain sub-pages. */
export function NoBackendNotice({ children }: { children?: React.ReactNode }) {
  return (
    <OSPanel className="border-dashed">
      <div className="flex items-start gap-3">
        <OSBadge tone="demo">No backend yet</OSBadge>
        <p className="text-sm leading-6 text-neutral-400">
          {children ?? "This screen is a designed placeholder. It will be wired to Hermes per CODEX_PLAN.md. No live actions run here."}
        </p>
      </div>
    </OSPanel>
  );
}

/** A module card for a domain command center (links to a sub-page). */
export function ModuleCard({ href, title, description, badge }: { href: string; title: string; description: string; badge?: string }) {
  return (
    <Link href={href} className="group block">
      <OSPanel className="h-full transition group-hover:border-neutral-700">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-neutral-100">{title}</h3>
          {badge ? <OSBadge tone="demo">{badge}</OSBadge> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-neutral-400">{description}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 group-hover:text-neutral-50">
          Open <ArrowRight className="h-4 w-4" />
        </div>
      </OSPanel>
    </Link>
  );
}

/** Compact skeleton for a domain sub-page (designed layout, clearly not wired). */
export function SkeletonPage({ eyebrow, title, subtitle, panels }: { eyebrow: string; title: string; subtitle?: string; panels?: string[] }) {
  return (
    <>
      <PageHeading eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <NoBackendNotice />
      {panels?.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {panels.map((p) => (
            <OSPanel key={p}>
              <div className="text-sm font-medium text-neutral-200">{p}</div>
              <div className="mt-3 h-28 rounded-md border border-dashed border-neutral-800" />
            </OSPanel>
          ))}
        </div>
      ) : null}
    </>
  );
}
