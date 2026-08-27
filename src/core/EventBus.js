/**
 * Compatibility facade for the canonical ADE Enterprise Event Bus.
 * No second event-bus implementation is permitted.
 */
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

export class KernelEventBus extends EnterpriseEventBus {
  static getInstance() {
    return EnterpriseEventBus.getInstance();
  }
}

export default KernelEventBus;
