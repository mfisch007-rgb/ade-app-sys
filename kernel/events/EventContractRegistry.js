import { eventBus } from "../../src/core/eventBus.js";

export class EventContractRegistry {
  static async publishContract(topic, payload) {
    if (eventBus && typeof eventBus.publish === "function") {
      await eventBus.publish(topic, payload);
    }
  }

  static registerSubscriptions() {
    if (eventBus && typeof eventBus.subscribe === "function") {
      eventBus.subscribe("system.boot", async (data) => {
        // System boot lifecycle subscription
      });
    }
  }
}

EventContractRegistry.registerSubscriptions();
export default EventContractRegistry;