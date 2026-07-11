# Inspiration library (local mode)

Drop your own videos/visuals here to build your inspiration library. Crina searches
this library BEFORE routing to the Visual Agent (`findAssetCandidates`).

**When do agents actually use them?** Agent selection runs on the campaign path,
which currently needs your Supabase database connected. So in local mode (database
off) you build and manage the library here; the agents start drawing on it once
Supabase is connected.

**Moving to Supabase:** the local library and the cloud library are separate
stores. Enabling Supabase switches the app to the cloud `project_assets` table —
it does **not** automatically import these local files. To use these same assets in
cloud mode, re-upload them through the Assets page once Supabase is connected. (The
reuse rules and behaviour are identical in both modes; only the stored files differ.)

## Where
- `public/inspiration/gridfactory/` — GridFactory assets
- `public/inspiration/gulf_el_nexride/` — Gulf-EL / NexRide assets

## Naming (optional, zero-config)
- `linkedin+x__My cooling clip.mp4` → usable on LinkedIn and X, titled "My cooling clip"
- `My cooling clip.mp4` → usable on all platforms

Supported: images (png/jpg/webp/gif/avif/svg), video (mp4/mov/webm/m4v), pdf, decks.

## Fine-tuning (optional)
Add a sidecar JSON next to a file to override fields, e.g. `My clip.mp4.json`:
```json
{ "platform_fit": ["linkedin"], "reuse_allowed": false, "mandatory": true, "quality_score": 90, "visual_style": "cinematic, cool blues" }
```

## The reuse rule (enforced automatically)
- The same asset is never used twice on the same platform.
- A `reuse_allowed: false` asset is used once total, then retired.
- Files are picked up automatically — just drop them in. When your Supabase
  database is back, uploads flow to cloud storage instead; this folder is the
  local-mode fallback.
