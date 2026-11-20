# NexRide - Offer Catalogue (types only)

> Types only. No amounts live here: every amount is set per campaign, capped by the
> monthly marketing budget and approved by the admin (gate_budget). The Marketing OS never
> pays; it requests credits/bonuses from NexRide. Machine-readable copy:
> `lib/marketing/nexride/offer-catalogue.ts`.

| Offer type | Audience | Triggered by signal | Money kind requested from NexRide |
|---|---|---|---|
| win_back_credit | rider | rider_at_risk | rider_credit |
| off_peak_offer | rider | demand_gap | rider_credit |
| driver_supply_bonus | driver | supply_gap | driver_bonus |
| event_push | rider and driver | spike_event | none (message only) |

Wording for each type: WORDING PENDING MIHAI (see rider-voice.md, driver-voice.md).
