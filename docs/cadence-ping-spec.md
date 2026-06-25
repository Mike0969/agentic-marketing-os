# Cadence + Telegram ping — spec (T2)

Goal: campaigns run **fully hands-off** to the human gate (no browser tab needed), and the
operator gets a **Telegram ping** the moment a package is "ready to review before posting,"
with a link straight to the Ready-to-Post card. Drafts only — no network posting, human gate
unchanged.

## Prerequisite (be honest)
"Automatic while my laptop is closed" requires the app to be **running somewhere persistent**
(deployed to Vercel / an always-on host). On local `npm run dev` it only ticks while the dev
server is running. Spec works in both; just set expectations.

## Part A — server-side cadence (no browser)
Today the Pipeline auto-tick is client-side (only advances while the tab is open). Add a
server-driven loop:
- New endpoint `POST /api/marketing/automation/cron` — token-gated (`requireAgentAccess`,
  `AGENT_TRIGGER_TOKEN`). It finds **active campaigns with eligible internal steps** and runs
  one `orchestrate` batch each (reuse the existing lease lock + progress-aware logic; skip
  human_approval/publishing). Idempotent; safe to call repeatedly.
- **Middleware:** exclude `api/marketing/automation/cron` (and `…/orchestrate`) from the login
  matcher so the token path works (today only seo-loop/fx-scan/daily-brief are excluded).
- **Scheduler** (pick per deploy target): Vercel Cron (`vercel.json` every ~1–2 min) if hosted
  on Vercel; else Supabase `pg_cron` + `pg_net` calling the endpoint; for local dev a simple
  repeatable trigger is fine. Keep batch small (existing maxSteps=3) so each run stays quick.

## Part B — "Crina" ping at the human gate (via the EXISTING Hermes/Crina Telegram bot)
**Do NOT create a new bot.** Reuse the **same Telegram bot Hermes/Crina already uses**, so the
ping arrives in the operator's existing Crina chat and reads as if from Crina.
- Config: put the **existing Hermes/Crina bot token** in `TELEGRAM_BOT_TOKEN` + the operator's
  chat in `TELEGRAM_CHAT_ID`. Send via `lib/providers/telegram.ts` `send(chatId, text)`.
- Message authored as Crina, e.g.:
  *"🟢 Crina: ready to review before posting — <brand> · <campaign> · <platform>: <title>. Open: <URL>/marketing/ready-to-post"*
- When an item reaches `workflow_stage = human_final_approval` (final-review / approval path),
  send once. **Dedupe:** add `content_items.notified_at timestamptz` (migration 0018) — only send
  if null, then set it.
- If several items hit the gate in one cron pass for the same campaign, send one grouped message.
- If `TELEGRAM_BOT_TOKEN` unset → skip silently (no crash); in-app badge still works.
- **Future (when Hermes is wired here):** prefer routing the message *through* Hermes
  (`HERMES_AGENT_ENDPOINT`) so Crina "owns" it, instead of the app calling the bot directly.

## Image tuning (fold in)
`gpt-image-1` at default quality took ~42s/image. Set `quality:"low"` (and keep `size` modest)
in `lib/providers/image-generation.ts` for ~10s, ~$0.01/image — keeps the hero-in-tick fast and
cron batches under timeout. Make it env-overridable (`OPENAI_IMAGE_QUALITY`).

## Constraints
No live posting; human gate required; reuse lease lock (no double-processing); FALLBACK/COMING
SOON labels intact; keep tsc/lint/build/check:supabase green; migration **0018**.

## Acceptance tests
1. With the dev server (or deployed) running and **no Pipeline tab open**, an approved campaign
   advances to the human gate on its own (cron ticks it).
2. When a package reaches the gate, exactly **one** Telegram message arrives with a working
   Ready-to-Post link; no duplicate pings on later cron passes (`notified_at`).
3. Two cron passes overlapping don't double-process (lease lock holds).
4. `TELEGRAM_*` unset → no crash, in-app badge still works.
5. Image gen at `quality:"low"` returns in ~10s; checks green.
