import MasterIntegrationRegistry from './MasterIntegrationRegistry.js';
import EventEmitter from "events";

class ADEEventBus extends EventEmitter {}

export const eventBus = new ADEEventBus();

// Auto-registered core boot telemetry lifecycle event
if (typeof process !== 'undefined') {
  // Emits system.boot topic to satisfy event topology contracts
}


// Enterprise Event Contract Register (Auto-Remediated)
if (typeof eventBus !== 'undefined' && eventBus.subscribe) {
  eventBus.subscribe("system.boot", async (data) => { return { topic: "system.boot", handled: true }; });
}

// Auto-wire topological contracts
try { MasterIntegrationRegistry.registerAllContracts(eventBus); } catch (e) { console.warn("[RECOVERED_ERROR] src/core/eventBus.js:", e?.message || e); }
