/**
 * Market/timezone-aware *suggested* post times. This NEVER posts — it only
 * computes when a draft would ideally go out for a given target market, so the
 * human can approve. Replaces the idea of a fixed daily clock: you post for the
 * audience's timezone (India vs US vs GCC), not yours.
 */

export type MarketKey = "gcc" | "india" | "us-east" | "us-west" | "uk" | "global";

type MarketDef = { label: string; tz: string };

export const markets: Record<MarketKey, MarketDef> = {
  gcc: { label: "GCC (UAE/KSA)", tz: "Asia/Dubai" },
  india: { label: "India", tz: "Asia/Kolkata" },
  "us-east": { label: "US East", tz: "America/New_York" },
  "us-west": { label: "US West", tz: "America/Los_Angeles" },
  uk: { label: "UK", tz: "Europe/London" },
  global: { label: "Global (defaults to GCC)", tz: "Asia/Dubai" }
};

// Preferred local hour (24h) per platform — common engagement windows.
const platformHour: Record<string, number> = {
  LinkedIn: 9,
  X: 12,
  Instagram: 11,
  Facebook: 13,
  Blog: 10
};

export type PostTimeSuggestion = {
  platform: string;
  market: MarketKey;
  timezone: string;
  localLabel: string;
  isoUtc: string;
  rationale: string;
};

function getOffsetMs(tz: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - date.getTime();
}

/** Convert a wall-clock time in a timezone to a UTC Date (one-step DST-correct). */
function zonedToUtc(year: number, month: number, day: number, hour: number, tz: string) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const offset = getOffsetMs(tz, new Date(utcGuess));
  return new Date(utcGuess - offset);
}

export function suggestPostTimes(market: MarketKey, platforms: string[], baseDate?: string): PostTimeSuggestion[] {
  const def = markets[market] ?? markets.global;
  const base = baseDate ? new Date(`${baseDate}T00:00:00Z`) : new Date();
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  const d = base.getUTCDate();

  return platforms.map((platform) => {
    const hour = platformHour[platform] ?? 9;
    const utc = zonedToUtc(y, m, d, hour, def.tz);
    const localLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: def.tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(utc);

    return {
      platform,
      market,
      timezone: def.tz,
      localLabel: `${localLabel} ${def.tz}`,
      isoUtc: utc.toISOString(),
      rationale: `Best ${platform} window for ${def.label} audiences (~${hour}:00 local).`
    };
  });
}
