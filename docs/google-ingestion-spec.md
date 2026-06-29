# Google Search ingestion spec — real top-of-funnel data into the conversion loop

**Status:** SPEC — awaiting approval. No code/schema until approved.
**Author:** Claude · **Reviewer:** Codex · **Bridge thread:** T8 (proposed)
**Depends on:** nothing in PR1/T7 (disjoint — read path + a new route + migration 0022).

## Why this exists
The conversion loop is proven, but every `conversion_outcomes` row is still zero or estimated — we
proved on 2026-06-28 that the agents (correctly) won't *learn* from unverified data. Google Search
Console is already wired read-only (`getSearchPerformanceForBrand`, per-brand service-account auth),
but nothing writes it into the loop. This spec ingests **real GSC signal** (impressions, clicks,
CTR, position, top queries) into `conversion_outcomes` so the loop finally learns from reality —
**zero money, zero API approval, low risk** (read-only to Google; never posts). Paid Google Ads is a
separate later phase gated on Ads API approval.

## The honest funnel mapping (what GSC can and cannot measure)
Funnel: **Reach → Lead → Investor → Capital($)**. GSC sees only the **top**:

| Funnel stage | GSC can measure? | Source |
|---|---|---|
| Reach (awareness) | ✅ yes | GSC **impressions** |
| Site visits | ✅ yes (real) | GSC **clicks** (+ CTR, avg position) |
| Lead (captured investor interest) | ❌ no | needs lead capture / manual (later) |
| Investor / Capital($) | ❌ no | needs the investing platform / manual (later) |

**Mapping decision (recommended):**
- `awareness` = GSC impressions (REAL reach, replaces the estimate).
- GSC **clicks / CTR / avg position / top queries** stored as structured `evidence` (proposed jsonb)
  + a human-readable `notes` line — a real *engagement* signal.
- `signups / activations / paid / revenue` stay **0** for `google_search` rows. **We do NOT map
  clicks→leads** — that would fake the exact lower-funnel data the loop must never invent (the
  agents already reject unverified signal). Lower funnel stays manual until lead capture exists.

So GSC ingestion makes **Reach real** and gives Crina a real read on *which queries/angles earn
search traction* — useful to the content loop immediately, without faking conversions.

## The ingestion loop (bounded, read-only)
- **Goal:** each brand has a current, real `google_search` outcome row for the latest GSC window.
- **Trigger:** scheduled (daily/weekly via the existing T2 cron) + manual button on `/sales`.
- **Action:** per brand, `getSearchPerformanceForBrand(brand.name)` (read-only) → map to one outcome row.
- **Verify:** `connected === true`, totals reconcile (row.awareness == GSC impressions), row written.
- **State:** `conversion_outcomes(source='google_search')`, **idempotent** per `(brand_id, period_end)`.
- **Stop / no-op:** one pull per brand per trigger (bounded). If a brand's GSC is not connected →
  **clean no-op** (skip, log reason) — never an error, never a fake row.
- **Closure:** real reach + top-query evidence → the Conversion agent (L3) anchors estimates on real
  reach; Crina's content/idea loops bias toward angles that actually earn search traction → repeat.

## Data model
- **Add a source value:** `conversion_outcomes.source` check is currently `('manual','agent_estimated')`.
  Migration **`0022_gsc_source.sql`**: extend the check to include `'google_search'`, and add an
  `evidence jsonb` column (top queries, clicks, ctr, position, site, range). RLS unchanged
  (inherits the table's `is_admin()` policies). Mirrors the `0020/0021` style.
- **Idempotency:** before insert, delete existing `source='google_search'` rows for that
  `(brand_id, period_start, period_end)`, then insert one fresh row. (Re-pulling the same window
  replaces, never duplicates.)
- **Row shape per brand pull:** `brand_id`, `campaign_id=null` (brand-level), `source='google_search'`,
  `awareness = impressions`, `signups/activations/paid/revenue = 0`, `period_start/period_end` =
  GSC range, `notes` = "GSC: N clicks / M impressions, CTR x%, avg pos y", `evidence` = `{ clicks,
  impressions, ctr, position, site, top_queries: [...] }`, `recorded_by = 'gsc-ingestion'`.

## Route + auth + scheduling
- New **`lib/analytics/gsc-ingestion.ts`** — `runGscIngestion({ brandId? })`: loops brands (or one),
  pulls GSC read-only, maps + idempotent-writes the outcome row(s), returns `{ ingested, skipped,
  reasons }`. Reuses `getSearchPerformanceForBrand`; never throws.
- New **`app/api/analytics/search-console/ingest/route.ts`** — `POST`, `requireAgentAccess` (token or
  admin), calls `runGscIngestion`. Add `api/analytics/search-console/ingest` to the `middleware.ts`
  matcher exclusion (so the cron can hit it).
- **Schedule:** add a GSC ingestion tick to the existing T2 cron (`/api/marketing/automation/cron`)
  or a light daily schedule. Manual trigger: a button on `/sales` (reuse the analyze-action pattern).
- The existing read-only **GET** `/api/analytics/search-console/pull` stays as-is (display/test).

## Safety + scope
- **Read-only to Google** — no write scopes, no posting, no ad spend (this is the read phase).
- **Brand separation strict** — GridFactory.io and Gulf-EL/NexRide use their own creds + site; rows
  scoped by `brand_id`; never cross-read.
- **Server-side creds only** — service-account JSON / tokens already server-only (never NEXT_PUBLIC).
- **No fake data** — unconnected brand = skip, not a zero/estimated row.

## Implementation plan (after approval)
1. Migration `0022_gsc_source.sql` (extend source check + add `evidence jsonb`) → apply → `check:supabase` green.
2. `lib/analytics/gsc-ingestion.ts` (`runGscIngestion`) — read-only pull + idempotent map/write.
3. `app/api/analytics/search-console/ingest/route.ts` (`requireAgentAccess`) + middleware exclusion.
4. Wire a GSC tick into the existing cron + a manual button on `/sales`.
5. Surface real Reach on `/sales` (the funnel's Reach metric reads `google_search` rows).
6. Keep tsc/lint/build/check:supabase green.

## Prerequisite (you, in parallel — light, no approval)
GSC needs each brand's **service account** created + the **Search Console property shared** with that
service account, and the env vars set (`GOOGLE_SERVICE_ACCOUNT_KEY[_GRIDFACTORY|_GULF_EL]` +
`GOOGLE_SEARCH_CONSOLE_SITE_*`). Unlike Google Ads, this needs **no app review** — it can be live
same-day. `gscConnectionSummary()` (Settings test) confirms the connection.

## What this does NOT do (explicit)
- Does **not** measure leads/investors/capital — those need lead capture / the investing platform.
- Does **not** touch Google Ads (paid) — separate phase, needs Ads API approval (the long pole you're
  starting in parallel).
- Does **not** post or write anything to Google.

## Open decisions for approval
1. **Mapping:** confirm impressions→awareness, clicks→evidence (NOT →signups). [recommended]
2. **Cadence:** daily vs weekly GSC tick (daily = fresher; GSC data lags ~2–3 days regardless).
3. **Bonus (optional):** also write top-converting queries into `conversion_memory` as "what earns
   search traction" so Crina's content loop biases toward them — include now or defer?
