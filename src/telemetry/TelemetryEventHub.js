import EventEmitter from "events";
import { randomUUID } from "crypto";

export class TelemetryEventHub extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
    this.eventBuffer = [];
    this.maxBufferSize = 100;
    this.heartbeatInterval = null;
    this.startHeartbeat();
  }

  static getInstance() {
    if (!global.__telemetryHubInstance) {
      global.__telemetryHubInstance = new TelemetryEventHub();
    }
    return global.__telemetryHubInstance;
  }

  startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendRawToAll(": heartbeat\n\n");
    }, 15000);
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  registerClient(res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    this.clients.add(res);
    
    // Initial payload with retry configuration
    res.write(`retry: 5000\n`);
    res.write(`data: ${JSON.stringify({ type: "TELEMETRY_INIT", history: this.eventBuffer })}\n\n`);

    const cleanup = () => {
      this.clients.delete(res);
      try { res.end(); } catch (e) {}
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
  }

  broadcast(type, payload = {}) {
    const telemetryEvent = {
      id: `evt_${randomUUID()}`,
      type,
      payload,
      timestamp: new Date().toISOString()
    };

    this.eventBuffer.push(telemetryEvent);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    const dataPayload = `data: ${JSON.stringify(telemetryEvent)}\n\n`;
    this.sendRawToAll(dataPayload);

    this.emit("TELEMETRY_BROADCASTED", telemetryEvent);
    return telemetryEvent;
  }

  sendRawToAll(rawMessage) {
    for (const client of this.clients) {
      try {
        client.write(rawMessage);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }

  getRecentEvents() {
    return [...this.eventBuffer];
  }
}

export default TelemetryEventHub;
