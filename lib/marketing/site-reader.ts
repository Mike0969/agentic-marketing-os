import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Reads a brand's own public website for Brands → Analyze (admin 2026-11-20: "read gulf-el.com, the
 * investor portal, all data"). The sites are JavaScript apps, so each page is rendered by headless
 * Chromium (--dump-dom). Same site only (the brand domain and its subdomains), robots.txt respected
 * for our generic user agent, one page at a time, at most `max` pages. Never throws.
 */

const UA = "AgenticMarketingOS-BrandReader/1.0";
const CHROME = process.env.CHROME_PATH || "/home/ubuntu/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome";
const SKIP = /\.(css|js|ico|png|jpe?g|gif|svg|webp|avif|mp4|webm|zip|woff2?|ttf|pdf)(\?|$)/i;

export type SitePage = { url: string; title: string; text: string };

/** Pure: the registrable site of a URL ("www.gulf-el.com" -> "gulf-el.com"). */
export function siteOf(url: string) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

/** Pure: title, readable text and same-site page links from a rendered DOM. */
export function extractPage(dom: string, pageUrl: string, site: string) {
  const title = (dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const text = decode(
    dom
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
  const links = new Set<string>();
  for (const m of dom.matchAll(/href="([^"#]+)"/gi)) {
    try {
      const u = new URL(m[1], pageUrl);
      if (!/^https?:$/.test(u.protocol) || SKIP.test(u.pathname)) continue;
      const host = u.hostname.toLowerCase();
      if (host !== site && !host.endsWith(`.${site}`)) continue;
      u.hash = "";
      links.add(u.toString());
    } catch {
      // ignore bad links
    }
  }
  return { title, text, links: [...links] };
}

/** Pure: one key per page (www. and a trailing slash don't make a new page). */
export function pageKey(url: string) {
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
}

function decode(s: string) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Pure: Disallow rules for "*" (Allow ignored except "Allow: /" which allows all). */
export function robotsDisallows(robots: string): string[] {
  const out: string[] = [];
  let mine = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const key = k?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") mine = value === "*";
    else if (mine && key === "disallow" && value) out.push(value);
  }
  return out;
}

async function robotsFor(origin: string, cache: Map<string, string[]>) {
  if (cache.has(origin)) return cache.get(origin)!;
  let rules: string[] = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
    if (res.ok) rules = robotsDisallows(await res.text());
  } catch {
    rules = [];
  }
  cache.set(origin, rules);
  return rules;
}

function render(url: string, profileDir: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      CHROME,
      ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profileDir}`, "--virtual-time-budget=8000", `--user-agent=${UA}`, "--dump-dom", url],
      { timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => resolve(error && !stdout ? "" : String(stdout))
    );
  });
}

export async function readSite(startUrls: string[], opts: { max?: number; onProgress?: (done: number, max: number, url: string) => void } = {}): Promise<{ pages: SitePage[]; skipped: string[] }> {
  const max = opts.max ?? 30;
  const site = siteOf(startUrls[0]);
  const queue = [...startUrls];
  const seen = new Set<string>();
  const pages: SitePage[] = [];
  const skipped: string[] = [];
  const robots = new Map<string, string[]>();
  const profileDir = await mkdtemp(path.join(tmpdir(), "brand-reader-"));
  try {
    while (queue.length && pages.length < max) {
      const url = queue.shift()!;
      const key = pageKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      const u = new URL(url);
      const rules = await robotsFor(u.origin, robots);
      if (rules.some((r) => r !== "/" ? u.pathname.startsWith(r) : true)) {
        skipped.push(`${url} (robots.txt)`);
        continue;
      }
      opts.onProgress?.(pages.length + 1, max, url);
      const dom = await render(url, profileDir);
      if (!dom) {
        skipped.push(`${url} (did not load)`);
        continue;
      }
      const page = extractPage(dom, url, site);
      if (page.text.length > 40) pages.push({ url, title: page.title, text: page.text.slice(0, 12000) });
      for (const link of page.links) if (!seen.has(pageKey(link))) queue.push(link);
    }
  } finally {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
  return { pages, skipped };
}
