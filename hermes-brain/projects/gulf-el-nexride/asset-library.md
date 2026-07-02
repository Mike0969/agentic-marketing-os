# Gulf-EL / NexRide — Asset Library (index + rules)

> STATUS: PLACEHOLDER — to be completed by the operator and Codex. Do NOT treat anything here as a confirmed brand fact until filled in.

The actual assets live in the DB table `project_assets` (project_slug = `gulf_el_nexride`) and are managed in the app at **Marketing → Assets**. This file documents how agents should USE them.

## Reuse rules
- Crina searches this library BEFORE generating anything.
- If a strong, approved asset fits the platform + theme, Crina selects it and the Visual Agent is skipped.
- The Visual Agent is only called when no suitable asset exists OR Crina forces new creation.
- The Visual Agent must NOT repeat the same asset on the same platform.
- Cross-platform reuse is allowed ONLY when the asset has `reuse_allowed = true`.
- `mandatory` assets must be considered first.
- Newly generated assets are saved back into `project_assets` with their `source_tool` + metadata.

## Style anchors
- Approved + mandatory assets define the taste the Visual Agent must match.

## Weak / rejected examples
- TODO (log assets that were rejected so agents avoid that direction).
