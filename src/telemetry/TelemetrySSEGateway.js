import KernelEventBus from "../core/EventBus.js";

export class TelemetrySSEGateway {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.clients = new Set();
    this.initBusBridge();
  }

  static getInstance() {
    if (!global.__telemetrySSEInstance) {
      global.__telemetrySSEInstance = new TelemetrySSEGateway();
    }
    return global.__telemetrySSEInstance;
  }

  initBusBridge() {
    // Bridge every event published on KernelEventBus directly to SSE subscribers
    this.eventBus.on("*", (eventRecord) => {
      this.broadcastToSSE(eventRecord);
    });
  }

  addClient(clientRes) {
    this.clients.add(clientRes);
  }

  removeClient(clientRes) {
    this.clients.delete(clientRes);
  }

  broadcastToSSE(eventData) {
    const formattedMessage = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(formattedMessage);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }
}

export default TelemetrySSEGateway;
