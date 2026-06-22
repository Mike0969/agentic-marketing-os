# Model Control Center — Spec (Phase 1.5)

A real, testable **Settings → Models** page + a provider abstraction layer. Every
provider connection is wired to its actual API and verifiable from the dashboard.
Docs/schema only here; Codex implements from this (see `CODEX_PLAN.md` P1–P6).

## Hard rules
- **Secrets are server-side only.** Keys live in env, never `NEXT_PUBLIC_*`, never
  returned to the browser, never logged. All provider routes are `requireAdmin`-gated and run server-side.
- **Hermes stays as-is.** `lib/agents/hermes-client.ts` remains the Hermes path. The
  new `lib/providers/*` layer powers the Settings page and direct calls when an agent
  is assigned a **non-Hermes** provider.
- **Governance unchanged.** Test calls are minimal prompts; no agent action side effects.
- Build / `tsc` / lint green after each task.

---

## 1. Providers

Canonical provider keys (used as the `[provider]` route param, `lib/providers`
registry key, and `agent_config.provider` value):
`hermes` · `anthropic` · `openai` · `deepseek` · `glm` · `ollama` · `telegram` · `slack`

Two provider **kinds**:
- **model** providers (have models + chat): hermes, anthropic, openai, deepseek, glm, ollama
- **channel** providers (health + send only, no models): telegram, slack

| Provider | key | kind | Env (server-side) | Base URL | Models source |
|---|---|---|---|---|---|
| Hermes | `hermes` | model | `HERMES_AGENT_ENDPOINT`, `HERMES_AGENT_TOKEN` | env endpoint | `GET {base}/v1/models` (live) |
| Anthropic | `anthropic` | model | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` | `GET /v1/models` (live) → fallback static `claude-opus-4, claude-sonnet-4, claude-haiku-4` |
| OpenAI | `openai` | model | `OPENAI_API_KEY` | `https://api.openai.com` | `GET /v1/models` (live) |
| DeepSeek | `deepseek` | model | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `GET /models` (live) → fallback `deepseek-chat, deepseek-reasoner` |
| GLM / Zhipu | `glm` | model | `ZHIPU_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` | static `glm-5.2, glm-4.7, glm-4.5-flash` (default glm-5.2; no public list endpoint) |
| Ollama | `ollama` | model | `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) | env | `GET /api/tags` (live, local) |
| Telegram | `telegram` | channel | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | `https://api.telegram.org` | — |
| Slack | `slack` | channel | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` | `https://slack.com/api` | — |

**Per-provider API details (exact):**
- **Anthropic** — header `x-api-key: <key>` + `anthropic-version: 2023-06-01`. health/listModels: `GET /v1/models`. testCall: `POST /v1/messages` `{model, max_tokens:16, messages:[{role:"user",content:prompt}]}`.
- **OpenAI** — header `Authorization: Bearer <key>`. listModels: `GET /v1/models`. testCall: `POST /v1/chat/completions` `{model, max_tokens:16, messages:[{role:"user",content:prompt}]}`.
- **DeepSeek** — OpenAI-compatible. `Authorization: Bearer`. `GET /models`; `POST /chat/completions`.
- **GLM/Zhipu** — `Authorization: Bearer <ZHIPU_API_KEY>` against `/chat/completions` (v4). No reliable public model-list → return static list. (If the key is the legacy `id.secret` form, JWT-sign; v4 keys use Bearer — confirm at implementation.)
- **Ollama** — no auth (local). health: `GET {base}/api/tags`. listModels: `GET /api/tags` → `models[].name`. testCall: `POST /api/chat` `{model, messages:[{role:"user",content:prompt}], stream:false}`.
- **Telegram** — health: `GET /bot<token>/getMe` (`ok:true`). send: `POST /bot<token>/sendMessage` `{chat_id, text}`.
- **Slack** — health: `POST /api/auth.test` (`Authorization: Bearer <bot token>`). send: `POST /api/chat.postMessage` `{channel, text}`.

---

## 2. API routes (`app/api/os/providers/[provider]/...`)

All `requireAdmin`, `runtime="nodejs"`, validate `[provider]` against the registry
whitelist (404 otherwise). Never echo secrets; report only booleans + safe detail.

**`GET /api/os/providers/[provider]/health`**
```json
{ "provider":"anthropic","kind":"model","configured":true,"connected":true,"detail":"OK","checkedAt":"ISO","latencyMs":210 }
```
- `configured` = required env present. `connected` = live probe succeeded (calls `healthCheck()`). On failure: `connected:false`, `detail` = short error (no secrets).

**`GET /api/os/providers/[provider]/models`**
```json
{ "provider":"anthropic","source":"live|static","models":[{ "id":"claude-sonnet-4","label":"claude-sonnet-4" }] }
```
- Channel providers (telegram/slack) → `{ models: [], kind:"channel" }`.
- If live list fails but env is set → return the static fallback with `source:"static"`.

**`POST /api/os/providers/[provider]/test`** — body `{ prompt?: string, model?: string }`
```json
{ "provider":"openai","ok":true,"model":"gpt-4o-mini","response":"pong","latencyMs":480,"error":null }
```
- Default `prompt` = `"Reply with the single word: pong"`. Default `model` = first from `/models`.
- Channel providers: `test` sends a real message (`"Agentic OS test ✓"`) to the configured chat/channel and returns `{ ok, response:"message sent", error }`.
- Never throws to the client; failures return `{ ok:false, error }`.

---

## 3. `lib/providers/` architecture

```
lib/providers/
  types.ts        # shared types (see below)
  registry.ts     # provider key → module + kind + env presence; getProvider(key)
  anthropic.ts
  openai.ts
  deepseek.ts
  glm.ts
  ollama.ts
  telegram.ts
  slack.ts
  hermes.ts       # thin adapter delegating to lib/agents/hermes-client.ts (do not duplicate)
```

**Each model provider module exports:**
```ts
healthCheck(): Promise<{ configured: boolean; connected: boolean; detail: string; latencyMs?: number }>
listModels(): Promise<{ source: "live" | "static"; models: { id: string; label: string }[] }>
testCall(prompt: string, model?: string): Promise<{ ok: boolean; model: string; response: string; latencyMs: number; error: string | null }>
chat(opts: { model: string; system?: string; user: string; jsonSchema?: object; temperature?: number }): Promise<{ ok: boolean; json: unknown | null; text: string | null; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }; status: number | null; error: string | null }>
```
- `chat()` is the **production** call used by agent runners when an agent is assigned a non-Hermes provider (testCall is just the smoke test).
- **Channel** modules (telegram, slack) export `healthCheck()` + `send(text)` only; `listModels()` returns empty; `testCall()` sends a test message.

**`registry.ts`:**
```ts
type ProviderKind = "model" | "channel";
type ProviderMeta = { key: string; label: string; kind: ProviderKind; envKeys: string[] };
export const PROVIDERS: ProviderMeta[]   // the 8 above
export function isConfigured(key): boolean        // all envKeys present
export function getProvider(key): ProviderModule  // throws/null for unknown
```

**Unified dispatch for agent runs** (the bridge between agents and providers):
```ts
// lib/providers/call-model.ts (or inside the runner)
async function callModel({ provider, model, system, user, jsonSchema }) {
  if (provider === "hermes") return runHermesAgent({...});   // existing path, unchanged
  return getProvider(provider).chat({ model, system, user, jsonSchema });
}
```
Agent runners resolve `{provider, model}` from `agent_config` (see §4) and call
`callModel`; every run still logs to `agent_runs` (set `provider`, `model`).

**Marketing execution routes now using the provider-aware bridge:**
- `POST /api/marketing/content-items/[id]/dispatch`
- `POST /api/marketing/agents/[agentId]/run`
- `POST /api/marketing/brands/[id]/analyze`

Each route records `provider`, `model`, token usage, latency, provider status, and
`routeOrigin`/`fallback_used` in `agent_runs.input`/`agent_runs.output`. Hermes is
one supported provider, not a hardcoded assumption. Deterministic fallback remains
available and is labelled `FALLBACK` in stored content/run output.

---

## 4. Supabase: `agent_config` (the "switch model" target)

```sql
agent_config(
  id uuid pk default gen_random_uuid(),
  agent_id text not null unique,   -- e.g. agent-crina, agent-fx-scanner
  provider text not null,          -- hermes | anthropic | openai | deepseek | glm | ollama
  model text not null,             -- e.g. claude-sonnet-4
  updated_at timestamptz default now(),
  updated_by text                  -- admin email
)
```
RLS admin-gated (read/write), same pattern as `agent_settings`. Migration:
`supabase/migrations/0011_agent_config.sql` (also reflected in `schema.sql`/`setup.sql`).

**Resolution order at call time** (runner reads this; service-role client so token-
triggered runs aren't RLS-blocked):
1. `agent_config[agent_id]` → `{provider, model}` (the dashboard switch writes here).
2. else legacy `agent_settings[agent_id].model` with `provider="hermes"`.
3. else env default → `provider="hermes"`, `model=HERMES_AGENT_MODEL`.

`agent_config` **supersedes** `agent_settings` for provider+model. Keep
`agent_settings` for now (back-compat); a later migration can fold it in.

---

## 5. Settings → Models page (`app/(shell)/settings/models` or a tab on Settings)

- One **provider card** per provider (`components/os/*` dark primitives only):
  - Name + kind badge; **live status dot** (green connected / amber configured-not-connected / grey offline) from `/health`.
  - **Models list** from `/models` (collapsed list; channel providers show "notification channel").
  - **Test** button → calls `/test`, shows response + latency inline, or the error.
  - "Configured via env" note (never an input for the secret value).
- A top summary: N providers configured, N connected.
- Hermes card reuses the existing health (`lib/agents/hermes-health.ts`).
- Polling/refresh: health on load + a manual "Recheck" button (avoid hammering provider APIs).
