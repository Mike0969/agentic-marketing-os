import type { GscResult, GscRow } from "@/lib/types";

/**
 * Google Search Console — READ-ONLY analytics connector, PER BRAND.
 *
 * Two brands / two sites: GridFactory.io and Gulf-EL.com / NexRide. Each brand
 * has its own server-only OAuth access token + site URL. Tokens live in env
 * (matching the Hermes-token model); never NEXT_PUBLIC, never rendered, no write
 * scopes, no posting. Service-account JWT auth is a documented follow-up.
 *
 * Env (per brand, with a generic fallback):
 *   GOOGLE_SEARCH_CONSOLE_TOKEN_GRIDFACTORY / _SITE_GRIDFACTORY
 *   GOOGLE_SEARCH_CONSOLE_TOKEN_GULF_EL     / _SITE_GULF_EL
 *   GOOGLE_SEARCH_CONSOLE_TOKEN             / _SITE            (fallback)
 */

const GSC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const TIMEOUT_MS = 10000;

export type BrandGscKey = "GRIDFACTORY" | "GULF_EL";
export type GscCredentials = { token: string; site: string };

/** Canonical brand → env key. Matches by brand name substring. */
export const GSC_BRANDS: { name: string; key: BrandGscKey }[] = [
  { name: "GridFactory.io", key: "GRIDFACTORY" },
  { name: "Gulf-EL.com / NexRide", key: "GULF_EL" }
];

export function brandGscKey(brandName: string): BrandGscKey | null {
  const name = brandName.toLowerCase();
  if (name.includes("gridfactory")) return "GRIDFACTORY";
  if (name.includes("gulf") || name.includes("nexride")) return "GULF_EL";
  return null;
}

/** Resolve a brand's GSC token + site from env (per-brand first, then generic). */
export function resolveBrandGsc(brandName: string): GscCredentials {
  const key = brandGscKey(brandName);
  const token = (key ? process.env[`GOOGLE_SEARCH_CONSOLE_TOKEN_${key}`] : "") || process.env.GOOGLE_SEARCH_CONSOLE_TOKEN || "";
  const site = (key ? process.env[`GOOGLE_SEARCH_CONSOLE_SITE_${key}`] : "") || process.env.GOOGLE_SEARCH_CONSOLE_SITE || "";
  return { token, site };
}

export function isBrandGscConfigured(brandName: string) {
  const { token, site } = resolveBrandGsc(brandName);
  return Boolean(token && site);
}

async function gscFetch(path: string, token: string, init?: RequestInit) {
  if (!token) throw new Error("Search Console token is not set.");
  return fetch(`${GSC_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}

/** Verify a token by listing accessible sites (read-only). */
export async function gscListSites(token: string): Promise<string[]> {
  const response = await gscFetch("/sites", token, { method: "GET" });
  if (!response.ok) throw new Error(`GSC sites returned HTTP ${response.status}.`);
  const data = (await response.json()) as { siteEntry?: { siteUrl: string }[] };
  return (data.siteEntry ?? []).map((entry) => entry.siteUrl);
}

async function gscQuery(token: string, site: string, startDate: string, endDate: string, dimensions: string[], rowLimit: number): Promise<GscRow[]> {
  const response = await gscFetch(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, token, {
    method: "POST",
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit })
  });
  if (!response.ok) throw new Error(`GSC query returned HTTP ${response.status}.`);
  const data = (await response.json()) as { rows?: GscRow[] };
  return data.rows ?? [];
}

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Core read: last ~28 days of top queries for a credential set. Never throws. */
export async function getSearchPerformance(creds: GscCredentials): Promise<GscResult> {
  if (!creds.token || !creds.site) {
    return {
      connected: false,
      site: creds.site || null,
      rows: [],
      reason: !creds.token ? "Search Console token is not set." : "No Search Console site configured."
    };
  }

  try {
    const start = isoDaysAgo(30);
    const end = isoDaysAgo(2); // GSC data lags ~2–3 days
    const rows = await gscQuery(creds.token, creds.site, start, end, ["query"], 10);
    const sum = rows.reduce((acc, row) => ({ clicks: acc.clicks + row.clicks, impressions: acc.impressions + row.impressions }), { clicks: 0, impressions: 0 });
    const totals = {
      clicks: sum.clicks,
      impressions: sum.impressions,
      ctr: sum.impressions ? sum.clicks / sum.impressions : 0,
      position: rows.length ? rows.reduce((acc, row) => acc + row.position, 0) / rows.length : 0
    };
    return { connected: true, site: creds.site, range: { start, end }, rows, totals };
  } catch (error) {
    return { connected: false, site: creds.site, rows: [], reason: error instanceof Error ? error.message : "GSC fetch failed." };
  }
}

export type BrandGscResult = GscResult & { brand: string };

/** Read performance for one brand using its own token + site. */
export async function getSearchPerformanceForBrand(brandName: string): Promise<BrandGscResult> {
  const result = await getSearchPerformance(resolveBrandGsc(brandName));
  return { ...result, brand: brandName };
}

/** A short connection summary across the configured brands (for the Settings test). */
export async function gscConnectionSummary(): Promise<{ anyConnected: boolean; lines: string[] }> {
  const lines: string[] = [];
  let anyConnected = false;

  for (const { name } of GSC_BRANDS) {
    const { token, site } = resolveBrandGsc(name);
    if (!token) {
      lines.push(`${name}: token not set.`);
      continue;
    }
    try {
      const sites = await gscListSites(token);
      if (!site) lines.push(`${name}: token valid, site not set (${sites.length} available).`);
      else if (sites.includes(site)) {
        lines.push(`${name}: connected to ${site}.`);
        anyConnected = true;
      } else lines.push(`${name}: token lacks access to ${site}.`);
    } catch (error) {
      lines.push(`${name}: ${error instanceof Error ? error.message : "test failed"}.`);
    }
  }

  return { anyConnected, lines };
}
