import type { GscResult, GscRow } from "@/lib/types";
import { getServiceAccountToken, hasServiceAccountEnv } from "@/lib/analytics/google-auth";

/**
 * Google Search Console — READ-ONLY analytics connector, PER BRAND.
 *
 * Two brands / two sites: GridFactory.io and Gulf-EL.com / NexRide. Auth resolves
 * in this order (server-only, never NEXT_PUBLIC, no write scopes, no posting):
 *   1. Service account (DURABLE, recommended) — self-mints tokens, no refresh.
 *   2. Static OAuth access token in env (quick test; expires ~1h).
 *
 * Env:
 *   Service account (shared or per-brand):
 *     GOOGLE_APPLICATION_CREDENTIALS[_GRIDFACTORY|_GULF_EL]  (path to SA JSON)
 *     GOOGLE_SERVICE_ACCOUNT_KEY[_GRIDFACTORY|_GULF_EL]      (inline SA JSON)
 *   Site per brand (+ generic fallback):
 *     GOOGLE_SEARCH_CONSOLE_SITE_GRIDFACTORY / _GULF_EL / GOOGLE_SEARCH_CONSOLE_SITE
 *   Static token fallback (optional):
 *     GOOGLE_SEARCH_CONSOLE_TOKEN_GRIDFACTORY / _GULF_EL / GOOGLE_SEARCH_CONSOLE_TOKEN
 */

const GSC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const TIMEOUT_MS = 10000;

export type BrandGscKey = "GRIDFACTORY" | "GULF_EL";
export type AuthSource = "service_account" | "token" | "none";
export type BrandCredentials = { token: string; site: string; source: AuthSource };

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

function resolveBrandSite(brandName: string): string {
  const key = brandGscKey(brandName);
  return (key ? process.env[`GOOGLE_SEARCH_CONSOLE_SITE_${key}`] : "") || process.env.GOOGLE_SEARCH_CONSOLE_SITE || "";
}

function resolveStaticToken(brandName: string): string {
  const key = brandGscKey(brandName);
  return (key ? process.env[`GOOGLE_SEARCH_CONSOLE_TOKEN_${key}`] : "") || process.env.GOOGLE_SEARCH_CONSOLE_TOKEN || "";
}

/** Resolve a brand's access token (service account first) + site. */
export async function getBrandCredentials(brandName: string): Promise<BrandCredentials> {
  const key = brandGscKey(brandName);
  const site = resolveBrandSite(brandName);

  if (hasServiceAccountEnv(key)) {
    const token = await getServiceAccountToken(key);
    if (token) return { token, site, source: "service_account" };
  }

  const staticToken = resolveStaticToken(brandName);
  if (staticToken) return { token: staticToken, site, source: "token" };

  return { token: "", site, source: "none" };
}

async function gscFetch(path: string, token: string, init?: RequestInit) {
  if (!token) throw new Error("Search Console token is not available.");
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

export type BrandGscResult = GscResult & { brand: string; source: AuthSource };

/** Read last ~28 days of top queries for one brand using its own credentials. Never throws. */
export async function getSearchPerformanceForBrand(brandName: string): Promise<BrandGscResult> {
  let creds: BrandCredentials;
  try {
    creds = await getBrandCredentials(brandName);
  } catch (error) {
    return { brand: brandName, source: "none", connected: false, site: null, rows: [], reason: error instanceof Error ? error.message : "Auth failed." };
  }

  if (!creds.token || !creds.site) {
    return {
      brand: brandName,
      source: creds.source,
      connected: false,
      site: creds.site || null,
      rows: [],
      reason: !creds.token ? "No service account or token configured for this brand." : "No Search Console site configured for this brand."
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
    return { brand: brandName, source: creds.source, connected: true, site: creds.site, range: { start, end }, rows, totals };
  } catch (error) {
    return { brand: brandName, source: creds.source, connected: false, site: creds.site, rows: [], reason: error instanceof Error ? error.message : "GSC fetch failed." };
  }
}

/** Short connection summary across both brands (for the Settings test). */
export async function gscConnectionSummary(): Promise<{ anyConnected: boolean; lines: string[] }> {
  const lines: string[] = [];
  let anyConnected = false;

  for (const { name } of GSC_BRANDS) {
    let creds: BrandCredentials;
    try {
      creds = await getBrandCredentials(name);
    } catch (error) {
      lines.push(`${name}: ${error instanceof Error ? error.message : "auth failed"}.`);
      continue;
    }

    if (!creds.token) {
      lines.push(`${name}: no service account or token set.`);
      continue;
    }
    try {
      const sites = await gscListSites(creds.token);
      const via = creds.source === "service_account" ? "service account" : "token";
      if (!creds.site) lines.push(`${name}: ${via} valid, site not set (${sites.length} available).`);
      else if (sites.includes(creds.site)) {
        lines.push(`${name}: connected to ${creds.site} via ${via}.`);
        anyConnected = true;
      } else lines.push(`${name}: ${via} lacks access to ${creds.site} (share the property with the service account).`);
    } catch (error) {
      lines.push(`${name}: ${error instanceof Error ? error.message : "test failed"}.`);
    }
  }

  return { anyConnected, lines };
}
