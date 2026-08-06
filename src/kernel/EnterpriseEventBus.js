/**
 * ADE-APEX Traced Enterprise Event Bus
 */
import crypto from 'node:crypto';

export class EnterpriseEventBus {
  constructor() {
    this.listeners = new Map();
    this.history = [];
  }

  subscribe(topic, handler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, []);
    }
    this.listeners.get(topic).push(handler);
  }

  async publish(topic, payload = {}, context = {}) {
    const traceId = context.traceId || crypto.randomUUID();
    const spanId = crypto.randomUUID();
    const envelope = {
      topic,
      payload,
      meta: {
        traceId,
        spanId,
        timestamp: Date.now()
      }
    };

    this.history.push(envelope);
    const handlers = this.listeners.get(topic) || [];
    const results = [];

    for (const handler of handlers) {
      try {
        const res = await handler(envelope);
        results.push({ success: true, result: res });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return { traceId, deliveredCount: handlers.length, results };
  }
}