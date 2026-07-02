# Gulf-EL / NexRide - Asset Library

The actual assets live in the DB table `project_assets` with `project_slug = gulf_el_nexride` and are managed in the app at Marketing -> Assets.

## Purpose

The asset library is the visual and strategic memory of Gulf-EL / NexRide. It should teach Crina and the Visual Agent what the company actually feels like:

- EV/hybrid fleets;
- zero-commission ride-hailing;
- NexRide app screens and mockups;
- GFEL token/staking/MLM platform;
- investor pitch material;
- country/region rollout proof;
- founder material;
- drivers, riders, charging hubs, fleet control;
- tokenised mobility and community wealth.

## Reuse Rules

- Crina searches this library before generating anything.
- If a strong approved asset fits the post, Crina selects it and skips Visual Agent.
- Visual Agent is only called when no suitable asset exists or Crina forces new creation.
- Never repeat the same asset on the same platform.
- Cross-platform reuse only when `reuse_allowed = true`.
- Mandatory assets must be considered first.
- Generated assets are saved back into `project_assets` as unapproved and single-use until the operator promotes them.

## What Counts As Gold Standard

Gold-standard Gulf-EL / NexRide assets show one of these clearly:

- real or credible EV/hybrid fleet in city context;
- Dubai/GCC luxury mobility scene;
- driver with car, confident and respected;
- rider/family entering clean car;
- NexRide app UI connected to a real ride use case;
- staking/MLM platform screenshots;
- investor deck explaining GFEL, profit share, tokenisation, or community flywheel;
- founder video explaining zero commission, GFEL, and community growth;
- charging hub / fleet depot / fleet control room.

## Weak Assets

Mark assets weak or leave them unapproved if they are:

- too crypto;
- cheap taxi app;
- meme token;
- fake Uber clone;
- unrealistic app UI;
- generic car stock;
- drivers looking weak/confused;
- no clear link to investment/community/fleet;
- fantasy robotaxi with no current business logic.

## Upload Tags To Use

- zero-commission
- ev-fleet
- hybrid-fleet
- nexride-app
- gfel-token
- staking
- mlm-community
- roi-incentive
- profit-share
- driver-first
- rider-loyalty
- ai-dispatch
- fleet-optimisation
- crypto-payment
- vr-inride
- dubai-mobility
- gcc-mobility
- romania
- germany
- thailand
- vietnam
- philippines
- india
- charging-hub
- founder-video
- investor-deck
- community-wealth

## Future Material Folder

When the operator creates/uploads the Gulf-EL / NexRide materials folder, ingest it as the main source for this project:

- website screenshots;
- app mockups;
- pitch deck;
- staking/MLM platform screenshots;
- token model;
- regional/country material;
- team material;
- car/fleet visuals;
- videos and founder explanations.

Crina should search these uploaded assets before generating visuals.
