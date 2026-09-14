/**
 * ADE MARKET DATA ADAPTERS — Index exports for all concrete adapters.
 */

export { FBSAdapter } from "./FBSAdapter.js";
export { PocketOptionAdapter } from "./PocketOptionAdapter.js";
export { IQOptionAdapter } from "./IQOptionAdapter.js";
export { ExpertOptionAdapter } from "./ExpertOptionAdapter.js";
export { BetPawaAdapter } from "./BetPawaAdapter.js";
export { BetKingAdapter } from "./BetKingAdapter.js";
export { Bet9jaAdapter } from "./Bet9jaAdapter.js";
export { SportyBetAdapter } from "./SportyBetAdapter.js";

// Adapter registry for dynamic loading
export const ADAPTER_CLASSES = {
  "fbs": FBSAdapter,
  "pocket-option": PocketOptionAdapter,
  "iq-option": IQOptionAdapter,
  "expert-option": ExpertOptionAdapter,
  "betpawa": BetPawaAdapter,
  "betking": BetKingAdapter,
  "bet9ja": Bet9jaAdapter,
  "sportybet": SportyBetAdapter
};

export function createAdapter(providerId, config = {}) {
  const AdapterClass = ADAPTER_CLASSES[providerId.toLowerCase()];
  if (!AdapterClass) {
    throw new Error(`UNKNOWN_ADAPTER: ${providerId}`);
  }
  return new AdapterClass(config);
}

export function listAvailableAdapters() {
  return Object.keys(ADAPTER_CLASSES);
}