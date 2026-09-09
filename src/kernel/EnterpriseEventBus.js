/**
 * ADE-APEX Canonical Enterprise Event Bus
 *
 * One runtime event bus for the canonical kernel.
 * Guarantees ordered delivery, handler isolation, DLQ recording,
 * retries, and measurable runtime outcomes.
 */
import EventEmitter from "node:events";
import crypto from "node:crypto";
import { EventSchemaRegistry } from "../core/EventSchemaRegistry.js";

export class EnterpriseEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.modules = new Map();
    this.history = [];
    this.dlq = [];
    this.metrics = {
      published: 0,
      delivered: 0,
      failed: 0,
      retried: 0,
      subscriberFailures: 0,
      schemaViolations: 0
    };
    this.maxHistory = 1000;
    this.maxDlq = 500;
    this.schemaRegistry = new EventSchemaRegistry();
    this.schemaViolations = [];
    this.maxSchemaViolations = 500;
  }

  static getInstance() {
    if (!globalThis.__ADE_ENTERPRISE_EVENT_BUS__) {
      globalThis.__ADE_ENTERPRISE_EVENT_BUS__ = new EnterpriseEventBus();
    }
    return globalThis.__ADE_ENTERPRISE_EVENT_BUS__;
  }

  registerModule(name, meta = {}) {
    if (!name) throw new Error("[EnterpriseEventBus] Module name is required.");
    this.modules.set(name, {
      status: "ACTIVE",
      meta,
      registeredAt: new Date().toISOString()
    });
    return true;
  }

  isRegistered(name) {
    return this.modules.has(name);
  }

  subscribe(topic, handler) {
    if (!topic || typeof handler !== "function") {
      throw new Error("[EnterpriseEventBus] topic and handler are required.");
    }
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }

  async publish(topic, payload = {}, context = {}, retries = 0) {
    if (!topic) throw new Error("[EnterpriseEventBus] Event topic is required.");

    const envelope = {
      eventId: `evt_${crypto.randomUUID()}`,
      topic,
      payload,
      meta: {
        traceId: context.traceId || crypto.randomUUID(),
        spanId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };

    this.metrics.published++;
    this.history.push(envelope);
    if (this.history.length > this.maxHistory) this.history.shift();

    let schema = null;
    if (this.schemaRegistry && typeof this.schemaRegistry.validate === "function") {
      try {
        schema = this.schemaRegistry.validate(topic, payload) || null;
      } catch (_e) {
        schema = null;
      }
      if (schema?.schemaEnforced && !schema.valid) {
        this.metrics.schemaViolations++;
        this.schemaViolations.push({
          eventId: envelope.eventId,
          topic,
          error: schema.error || "SCHEMA_MISMATCH",
          timestamp: envelope.meta.timestamp
        });
        if (this.schemaViolations.length > this.maxSchemaViolations) {
          this.schemaViolations.shift();
        }
      }
    }

    const handlers = this.listeners(topic);
    let deliveredCount = 0;
    const results = [];

    const deliverToHandler = async (handler, payload, eventRecord) => {
      let attempt = 0;
      let delivered = false;

      while (attempt <= retries && !delivered) {
        try {
          await handler(payload, eventRecord);
          delivered = true;
          deliveredCount++;
          this.metrics.delivered++;
          results.push({ success: true });
        } catch (error) {
          attempt++;
          this.metrics.subscriberFailures++;

          if (attempt <= retries) {
            this.metrics.retried++;
            continue;
          }

          this.metrics.failed++;

          const dlqEntry = {
            event: eventRecord,
            error: error?.message || String(error),
            failedAt: new Date().toISOString(),
            attempts: attempt
          };
          this.dlq.push(dlqEntry);
          if (this.dlq.length > this.maxDlq) this.dlq.shift();

          results.push({ success: false, error: dlqEntry.error });
        }
      }
    };

    for (const handler of handlers) {
      await deliverToHandler(handler, envelope.payload, envelope);
    }

    // Wildcard meta-delivery: listeners subscribed to "*" receive the full
    // event record for every publication. Topic listeners are always
    // delivered first so per-topic ordering is preserved. This is what makes
    // the live telemetry SSE bridge reachable from the canonical bus.
    if (this.listenerCount("*") > 0) {
      for (const handler of this.listeners("*")) {
        await deliverToHandler(handler, envelope, envelope);
      }
    }

    return {
      success: this.metrics.failed === 0 || results.every(r => r.success),
      eventId: envelope.eventId,
      traceId: envelope.meta.traceId,
      deliveredCount,
      handlerCount: handlers.length,
      failedCount: results.filter(r => !r.success).length,
      schema: schema ? { enforced: schema.schemaEnforced, valid: schema.valid } : null,
      results
    };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getSchemaViolations(limit = 100) {
    return this.schemaViolations.slice(-Math.max(0, limit));
  }

  getHistory(limit = 100) {
    return this.history.slice(-Math.max(0, limit));
  }

  getHealth() {
    return {
      status: "HEALTHY",
      subscribers: this.eventNames().length,
      modules: this.modules.size,
      history: this.history.length,
      dlq: this.dlq.length,
      metrics: this.getMetrics()
    };
  }

  resetMetrics() {
    for (const key of Object.keys(this.metrics)) this.metrics[key] = 0;
  }
}

export default EnterpriseEventBus;
