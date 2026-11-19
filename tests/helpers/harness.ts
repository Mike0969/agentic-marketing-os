// Shared test harness: swap the service-role Supabase client for a FakeSupabase and
// override env vars / global fetch per test. Nothing here touches the network.
import { mock } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FakeSupabase } from "./fake-supabase.ts";

const holder: { db: FakeSupabase | null } = { db: null };
let installed = false;

/** Call once per test file BEFORE importing app modules. */
export function mockServiceClient() {
  if (installed) return holder;
  installed = true;
  mock.module(pathToFileURL(path.resolve("lib/supabase/service.ts")).href, {
    namedExports: { createServiceClient: () => holder.db, isServiceConfigured: () => holder.db !== null }
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
  // Default: any unexpected network call fails the test loudly.
  globalThis.fetch = fetchImpl ?? ((async (u: unknown) => {
    throw new Error(`unexpected network call in test: ${String(u)}`);
  }) as typeof fetch);
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
