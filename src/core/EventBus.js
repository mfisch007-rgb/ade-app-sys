import { EventEmitter } from "events";

export class KernelEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance() {
    if (!global.__kernelEventBusInstance) {
      global.__kernelEventBusInstance = new KernelEventBus();
    }
    return global.__kernelEventBusInstance;
  }

  publish(eventName, payload) {
    const eventRecord = {
      eventId: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      eventName,
      payload
    };
    this.emit(eventName, eventRecord);
    this.emit("*", eventRecord); // Global stream listener
    return eventRecord;
  }
}

export default KernelEventBus;
