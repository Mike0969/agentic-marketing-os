// Diagnostic: tests Google Search Console read-only auth for both brands using
// .env.local. Read-only. Run: node scripts/test-gsc.mjs
import { readFile } from "fs/promises";
import { createSign } from "crypto";
import path from "path";

function loadEnv(file) {
  const env = {};
  try {
    const raw = require_text(file);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {
    /* ignore */
  }
  return env;
}

function require_text(file) {
  return textCache[file];
}

const textCache = {};
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC = "https://searchconsole.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function saToken(json) {
  const sa = JSON.parse(json);
  const iat = Math.floor(Date.now() / 1000);
  const input = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  const assertion = `${input}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!r.ok) throw new Error(`SA token HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

async function oauthToken(id, secret, refresh) {
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }) });
  if (!r.ok) throw new Error(`OAuth refresh HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

async function listSites(token) {
  const r = await fetch(`${GSC}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`sites HTTP ${r.status}`);
  return ((await r.json()).siteEntry ?? []).map((s) => `${s.siteUrl} (${s.permissionLevel})`);
}

async function query(token, site) {
  const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const r = await fetch(`${GSC}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 5 })
  });
  if (!r.ok) throw new Error(`query HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows ?? [];
}

async function resolveToken(env, key) {
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY || env[`GOOGLE_SERVICE_ACCOUNT_KEY_${key}`]) return { token: await saToken(env[`GOOGLE_SERVICE_ACCOUNT_KEY_${key}`] || env.GOOGLE_SERVICE_ACCOUNT_KEY), via: "service account (inline)" };
  const saPath = env[`GOOGLE_APPLICATION_CREDENTIALS_${key}`] || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath) return { token: await saToken(await readFile(saPath, "utf8")), via: "service account (file)" };
  const id = env[`GOOGLE_CLIENT_ID_${key}`] || env.GOOGLE_CLIENT_ID;
  const secret = env[`GOOGLE_CLIENT_SECRET_${key}`] || env.GOOGLE_CLIENT_SECRET;
  const refresh = env[`GOOGLE_REFRESH_TOKEN_${key}`] || env.GOOGLE_REFRESH_TOKEN;
  if (id && secret && refresh) return { token: await oauthToken(id, secret, refresh), via: "oauth refresh token" };
  if (id && secret && !refresh) return { token: null, via: null, missing: "OAuth client id+secret present but GOOGLE_REFRESH_TOKEN_" + key + " is MISSING" };
  const stat = env[`GOOGLE_SEARCH_CONSOLE_TOKEN_${key}`] || env.GOOGLE_SEARCH_CONSOLE_TOKEN;
  if (stat) return { token: stat, via: "static token" };
  return { token: null, via: null, missing: "no service account, refresh token, or static token" };
}

const envPath = path.join(process.cwd(), ".env.local");
textCache[envPath] = await readFile(envPath, "utf8").catch(() => "");
const env = loadEnv(envPath);

for (const key of ["GRIDFACTORY", "GULF_EL"]) {
  const site = env[`GOOGLE_SEARCH_CONSOLE_SITE_${key}`] || env.GOOGLE_SEARCH_CONSOLE_SITE || "(none)";
  console.log(`\n=== ${key} — site: ${site} ===`);
  try {
    const { token, via, missing } = await resolveToken(env, key);
    if (!token) {
      console.log(`  AUTH: NOT USABLE — ${missing}`);
      continue;
    }
    console.log(`  AUTH: ok via ${via}`);
    const sites = await listSites(token);
    console.log(`  Properties this credential can read: ${sites.length ? sites.join(", ") : "NONE (credential not added to any property)"}`);
    const rows = await query(token, site);
    const clicks = rows.reduce((a, r) => a + (r.clicks || 0), 0);
    const impr = rows.reduce((a, r) => a + (r.impressions || 0), 0);
    console.log(`  Query OK: ${rows.length} rows, ${clicks} clicks / ${impr} impressions (last 28d). Top: ${rows.map((r) => r.keys?.[0]).filter(Boolean).slice(0, 3).join(", ") || "—"}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}
console.log("\nDone.");
