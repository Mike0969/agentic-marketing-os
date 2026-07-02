# GridFactory — Asset Library

The actual assets live in the DB table `project_assets` with `project_slug = gridfactory` and are managed in the app at Marketing -> Assets.

## Purpose

The asset library is the visual memory of GridFactory. It teaches Crina and the Visual Agent what the company should feel like:

- real modular data centers;
- green-energy parks;
- GPU racks;
- industrial wealth;
- investor deck quality;
- monthly income and ownership;
- physical infrastructure instead of abstract AI hype.

## Reuse Rules

- Crina searches this library before generating anything.
- If a strong approved asset fits the post, Crina selects it and skips Visual Agent.
- Visual Agent is only called when no suitable asset exists or Crina forces new creation.
- Never repeat the same asset on the same platform.
- Cross-platform reuse only when `reuse_allowed = true`.
- Mandatory assets must be considered first.
- Generated assets are saved back into `project_assets` as unapproved and single-use until the operator promotes them.

## What Counts As Gold Standard

Gold-standard GridFactory assets show one of these clearly:

- data-center container in green-energy setting;
- server racks/GPU cluster with serious industrial realism;
- energy park plus compute infrastructure;
- investor deck diagram explaining CUG ownership;
- founder/video material explaining monthly ROI and early infrastructure ownership;
- wealth creation from physical AI assets.

## Weak Assets

Mark assets weak or leave them unapproved if they are:

- generic 2D;
- visually empty;
- unclear;
- not tied to AI compute or ownership;
- too sci-fi;
- too cartoon;
- too corporate-stock;
- not emotionally connected to money/income/ownership.

## Upload Tags To Use

- first-container
- green-energy
- gpu-racks
- server-room
- modular-data-center
- cug
- monthly-roi
- passive-income
- lease-to-own
- investor-deck
- founder-video
- energy-park
- ai-infrastructure
- europe-data-center
- gulf-data-center
