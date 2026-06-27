# Agentic OS — connection map (models ↔ agents) + 4C audit

The durable layer beneath the tools. Framework: **Context · Connections · Capabilities ·
Cadence** (the 4 C's). Tools change; this map is how models, agents, and data plug together so
we can swap any piece without a rewrite. Keep current — it's the "what's wired" source of truth.

## Model ↔ agent bridge (how an agent picks its brain)
Resolution order (`lib/agents/agent-config-store.ts → resolveAgentRuntimeConfig`):
`agent_config` (per-agent provider+model, set in the Model Control / Kanban UI) →
`agent_settings` (Hermes model override) → **env default**. Provider dispatch:
`lib/providers/call-model.ts` → `lib/providers/<provider>.chat()`.

| Provider | Key (env) | Status | Used by |
|---|---|---|---|
| GLM (z.ai) | `ZAI_API_KEY` | ✅ set | SEO/Crina/content (default text), with OpenRouter fallback |
| OpenRouter | `OPENROUTER_API_KEY` | ✅ set | text fallback host |
| DeepSeek | `DEEPSEEK_API_KEY` | ✅ set | optional text model |
| Anthropic | `ANTHROPIC_API_KEY` | ⬜ empty | optional (Claude models) |
| OpenAI (text) | `OPENAI_API_KEY` | ⬜ empty | optional text + **image** |
| GPT Image | `OPENAI_API_KEY` | ⬜ empty | Visual & Video Agent (primary image) |
| Flux / Stability | `HUGGINGFACE_API_KEY` / `REPLICATE_API_TOKEN` | ⬜ missing | image fallback chain |
| Hermes | `HERMES_BASE_URL/_API_KEY/_MODEL` | ⬜ off | in-app agent runtime + (future) status reporter |

Image fallback chain (`lib/providers/image-generation.ts`): GPT Image → HF Flux → Replicate Flux
→ HF Stability → placeholder (`DRAFT ASSET`). Each attempt logs to `agent_runs`.

## Agents (capabilities layer)
- **Crina** — Marketing CEO: plan, sequence, review, assemble package, escalate to human. Never
  publishes/auto-approves.
- **SEO / Content Creator / Visual & Video / Competitor Intelligence / Publishing** — specialists
  invoked inside campaign orchestration (drafts/packages only).
- **Claude** — spec/review/QA (and implements when assigned). **Codex** — implementation.
  **Hermes** — model runtime + (deferred) human status reporter. Coordination via
  `docs/agent-bridge.md` (file bridge, human-relayed; not a model-in-the-middle).

## 4C audit (✅ wired / ⬜ to add)
- **Context** ✅ — `CLAUDE.md`, brand briefs, `brands`/`campaigns` tables, `feedback_memory`
  (brand+platform+type scoped), Hermes brain files. ⬜ brand briefs should be split per-brand
  (cross-brand residual in some review steps).
- **Connections** ⬜ mostly pending — Supabase ✅; text models ✅; **image keys ⬜**; GSC ⬜;
  Slack/Telegram ⬜; Hermes ⬜. (No live social posting by design.)
- **Capabilities** ✅ — campaign automation chain, SEO loop, Ready-to-Post packaging; image gen
  ready once a key is added; video = `COMING SOON`.
- **Cadence** ✅ — Pipeline auto-tick (progress-aware, lease-locked). ⬜ background/scheduled
  runs while laptop closed (would need a server cron / worker; not built).

## Next connections to add (priority)
1. **Image key** — `OPENAI_API_KEY` (primary) + `HUGGINGFACE_API_KEY` (free backup). Replicate
   after T1b.
2. **GSC** — real analytics connector (Context/Connections for the Analytics agent).
3. **Hermes** — configure `HERMES_*`, then a small status-reporter worker (deferred).
4. **Per-brand brain split** — remove the cross-brand residual.

## Open code threads (see docs/agent-bridge.md)
- **T1a** — defer carousel slide generation (timeout). **T1b** — Replicate `/v1/predictions`
  needs a version hash (set `REPLICATE_FLUX_VERSION` or switch to the model-slug endpoint).
