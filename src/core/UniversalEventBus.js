import crypto from 'crypto';

export class UniversalEventBus {
  constructor() {
    this.name = 'UniversalEventBus';
    this.version = '1.0.0';
    this.listeners = new Map();
    this.eventLog = [];
  }

  subscribe(topic, handler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, []);
    }
    this.listeners.get(topic).push(handler);
    console.log(`[EventBus] Subscribed handler to topic: '${topic}'`);
  }

  async publish(topic, payload = {}) {
    const traceId = `trc_${crypto.randomBytes(4).toString('hex')}`;
    const eventEnvelope = {
      traceId,
      topic,
      payload,
      timestamp: new Date().toISOString()
    };

    this.eventLog.push(eventEnvelope);
    console.log(`[EventBus] Dispatched '${topic}' [${traceId}]`);

    const handlers = this.listeners.get(topic) || [];
    const executions = handlers.map(handler => Promise.resolve(handler(eventEnvelope)));
    
    await Promise.all(executions);
    return eventEnvelope;
  }

  getAuditLog() {
    return this.eventLog;
  }
}
