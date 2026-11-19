// Shared test harness: swap the service-role Supabase client for a FakeSupabase and
// override env vars / global fetch per test. Nothing here touches the network.
import { mock } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FakeSupabase } from "./fake-supabase.ts";

/** db backs both clients; noService simulates a deployment without SUPABASE_SERVICE_ROLE_KEY. */
const holder: { db: FakeSupabase | null; noService: boolean } = { db: null, noService: false };

/** Any network call a test did not explicitly fake fails loudly. Installed on import. */
export const blockedFetch = (async (u: unknown) => {
  throw new Error(`unexpected network call in test: ${String(u instanceof Request ? u.url : u)}`);
}) as typeof fetch;
globalThis.fetch = blockedFetch;
let installed = false;

/**
 * Call once per test file BEFORE importing app modules. Both the service-role client and the
 * cookie-based server client resolve to holder.db; "configured" still follows the env vars.
 */
export function mockServiceClient() {
  if (installed) return holder;
  installed = true;
  mock.module(pathToFileURL(path.resolve("lib/supabase/service.ts")).href, {
    namedExports: { createServiceClient: () => (holder.noService ? null : holder.db), isServiceConfigured: () => !holder.noService && holder.db !== null }
  });
  const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  mock.module(pathToFileURL(path.resolve("lib/supabase/server.ts")).href, {
    namedExports: { createClient: async () => (configured() ? holder.db : null), isSupabaseConfigured: configured }
  });
  // Cache revalidation needs a Next request store; outside Next it is a no-op here.
  const noop = () => {};
  mock.module(pathToFileURL(path.resolve("node_modules/next/cache.js")).href, {
    namedExports: { revalidatePath: noop, revalidateTag: noop, unstable_noStore: noop, unstable_cache: <T>(fn: T) => fn }
  });
  return holder;
}

/** Runs fn with env vars set (undefined deletes) and fetch replaced; restores both afterwards. */
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>, fetchImpl?: typeof fetch): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  const savedFetch = globalThis.fetch;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = fetchImpl ?? blockedFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = savedFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Env that makes the app think Supabase is configured (never contacted: the service client is fake). */
export const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  TELEGRAM_BOT_TOKEN: undefined,
  TELEGRAM_CHAT_ID: undefined,
  SLACK_BOT_TOKEN: undefined
};
