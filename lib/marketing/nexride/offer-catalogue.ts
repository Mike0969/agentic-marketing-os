// NexRide offer catalogue: offer TYPES only. Amounts never live here; each campaign
// sets its own amount, capped by the marketing budget and approved at gate_budget.

export const NEXRIDE_AUDIENCES = ["rider", "driver"] as const;
export type NexrideAudience = (typeof NEXRIDE_AUDIENCES)[number];

export const SIGNAL_TYPES = ["demand_gap", "supply_gap", "rider_at_risk", "spike_event"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const OFFER_TYPES = ["win_back_credit", "off_peak_offer", "driver_supply_bonus", "event_push"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

/** What NexRide is asked to grant. "none" = message only, no money. */
export type MoneyKind = "rider_credit" | "driver_bonus" | "none";

export type OfferDefinition = {
  type: OfferType;
  audiences: readonly NexrideAudience[];
  triggeredBy: SignalType;
  moneyKind: MoneyKind;
  /** Brain file holding the (pending) wording for each audience. */
  voiceFiles: readonly string[];
};

const VOICE = {
  rider: "hermes-brain/projects/gulf-el-nexride/rider-voice.md",
  driver: "hermes-brain/projects/gulf-el-nexride/driver-voice.md"
} as const;

export const OFFER_CATALOGUE: Readonly<Record<OfferType, OfferDefinition>> = {
  win_back_credit: { type: "win_back_credit", audiences: ["rider"], triggeredBy: "rider_at_risk", moneyKind: "rider_credit", voiceFiles: [VOICE.rider] },
  off_peak_offer: { type: "off_peak_offer", audiences: ["rider"], triggeredBy: "demand_gap", moneyKind: "rider_credit", voiceFiles: [VOICE.rider] },
  driver_supply_bonus: { type: "driver_supply_bonus", audiences: ["driver"], triggeredBy: "supply_gap", moneyKind: "driver_bonus", voiceFiles: [VOICE.driver] },
  event_push: { type: "event_push", audiences: ["rider", "driver"], triggeredBy: "spike_event", moneyKind: "none", voiceFiles: [VOICE.rider, VOICE.driver] }
};

export function offerForSignal(signal: SignalType): OfferDefinition {
  const found = OFFER_TYPES.map((t) => OFFER_CATALOGUE[t]).find((o) => o.triggeredBy === signal);
  if (!found) throw new Error(`No offer mapped for signal type ${signal}`);
  return found;
}

/** Marker every voice placeholder carries until the admin approves the wording. */
export const WORDING_PENDING_MARKER = "WORDING PENDING MIHAI";
