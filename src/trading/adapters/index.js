/**
 * ADE MARKET DATA ADAPTERS — Index exports for all concrete adapters.
 */

import { FBSAdapter } from "./FBSAdapter.js";
import { PocketOptionAdapter } from "./PocketOptionAdapter.js";
import { IQOptionAdapter } from "./IQOptionAdapter.js";
import { ExpertOptionAdapter } from "./ExpertOptionAdapter.js";
import { BetPawaAdapter } from "./BetPawaAdapter.js";
import { BetKingAdapter } from "./BetKingAdapter.js";
import { Bet9jaAdapter } from "./Bet9jaAdapter.js";
import { SportyBetAdapter } from "./SportyBetAdapter.js";

export { FBSAdapter, PocketOptionAdapter, IQOptionAdapter, ExpertOptionAdapter, BetPawaAdapter, BetKingAdapter, Bet9jaAdapter, SportyBetAdapter };

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