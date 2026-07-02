# GridFactory — Asset Library

The actual assets live in the DB table `project_assets` with `project_slug = gridfactory` and are managed in the app at Marketing -> Assets.

Desktop source folder to ingest/promote into the library:

`/Users/dubai/Desktop/ACRaaS`

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
- ACRaaS-style dark investor-deck visuals with blue/cyan accents, real containers, GPU racks, wind/solar/energy infrastructure, token-flow diagrams, and revenue-growth visuals.

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
- power-access-game
- token-flow
- caas-revenue
- sovereign-ai
- ai-labs
- agentic-ai
- robotics
- 400g-cluster
- super-gpu

## ACRaaS Folder Assets To Prioritize

When importing from Desktop, prioritize these as approved/reference candidates:

- `Cinematic_photorealistic_container_datacenter,_rows_202605041239.jpeg`
- `Datacenter_rows_glowing_blue_cyan_202605041301.jpeg`
- `GPU_datacenter_with_wind_turbines_202605041306.jpeg`
- `Shipping_container_full_of_GPUs_202605101800.jpeg`
- `Data_center_vs_GPU_container_202605101752.jpeg`
- `Simple_dark-theme_flow_diagram_with_202605101755.jpeg`
- `Revenue_growing_$0_to_$50M_202605101806.jpeg`
- `GRID_Factory_Pitch_Deck 14Mayf .PDF.pdf`

Mark the deck as reference/deck material. Mark the strongest real-looking visuals as approved and reusable across platforms when the operator approves them in the Asset Library UI.
