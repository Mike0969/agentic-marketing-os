import { REGION_PRESETS, type RegionKey } from "@/lib/marketing/platform-specs";

// Autonomous scheduling: when the operator approves a package, Crina assigns a sensible time
// instead of the operator picking it. Times land inside the region's good-to-post windows and are
// spread one-per-window across upcoming days, so a batch of approvals doesn't stack on one slot.
// Region is account-wide for now (DEFAULT_POST_REGION); per-brand regions can be added later.

export function defaultRegion(): RegionKey {
  const raw = (process.env.DEFAULT_POST_REGION || "gulf").toLowerCase();
  return (["us", "europe", "gulf", "asia"] as RegionKey[]).includes(raw as RegionKey) ? (raw as RegionKey) : "gulf";
}

// Offset (ms) that a timezone is ahead of UTC at a given instant (DST-aware via Intl).
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value])) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - at.getTime();
}

// Interpret a wall-clock (YYYY-MM-DD, HH:MM) in a timezone and return the UTC instant.
function zonedWallTimeToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const naive = new Date(`${ymd}T${hhmm}:00Z`); // wall time treated as if UTC
  return new Date(naive.getTime() - tzOffsetMs(timeZone, naive));
}

// YYYY-MM-DD of (today + dayOffset) as seen in the timezone.
function ymdInTz(dayOffset: number, timeZone: string): string {
  const d = new Date(Date.now() + dayOffset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Pick the scheduled time for the Nth upcoming post in a region. slotIndex = how many future posts
 * are already scheduled for the brand, so posts fill window-by-window then roll to the next day.
 */
export function pickScheduledAt(region: RegionKey, slotIndex: number): string {
  const preset = REGION_PRESETS[region] ?? REGION_PRESETS.gulf;
  const windows = preset.windows.length ? preset.windows : ["09:00-11:00"];
  const perDay = windows.length;
  const dayOffset = 1 + Math.floor(slotIndex / perDay); // start tomorrow
  const windowStart = windows[slotIndex % perDay].split("-")[0]; // e.g. "09:00"
  const ymd = ymdInTz(dayOffset, preset.timezone);
  return zonedWallTimeToUtc(ymd, windowStart, preset.timezone).toISOString();
}
