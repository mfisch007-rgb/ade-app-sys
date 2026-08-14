import KernelEventBus from "../core/EventBus.js";

export class TelemetryGateway {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.metrics = {
      signalsGenerated: 0,
      tradesExecuted: 0,
      securityViolations: 0,
      ticksProcessed: 0
    };
    this.logs = [];
    this._attachListeners();
  }

  static getInstance() {
    if (!global.__telemetryGatewayInstance) {
      global.__telemetryGatewayInstance = new TelemetryGateway();
    }
    return global.__telemetryGatewayInstance;
  }

  _attachListeners() {
    this.eventBus.on("GHOSTBRAIN_SIGNAL_GENERATED", (evt) => {
      this.metrics.signalsGenerated++;
      this.logs.push({ type: "SIGNAL", data: evt.payload || evt, timestamp: Date.now() });
    });

    this.eventBus.on("BROKER_TRADE_EXECUTED", (evt) => {
      this.metrics.tradesExecuted++;
      this.logs.push({ type: "TRADE", data: evt.payload || evt, timestamp: Date.now() });
    });

    this.eventBus.on("AFFILIATE_LOCK_VIOLATION", (evt) => {
      this.metrics.securityViolations++;
      this.logs.push({ type: "SECURITY", data: evt.payload || evt, timestamp: Date.now() });
    });
  }

  recordTick() {
    this.metrics.ticksProcessed++;
  }

  getSnapshot() {
    return {
      metrics: { ...this.metrics },
      recentLogs: this.logs.slice(-10)
    };
  }
}

export default TelemetryGateway;
