import { randomUUID } from 'node:crypto';

export class KernelEvent {
  constructor({ source, action, payload = {}, traceId = null }) {
    if (!source || !action) {
      throw new Error('[EventContract] Every KernelEvent requires source and action.');
    }
    this.traceId = traceId || randomUUID();
    this.source = source;
    this.action = action;
    this.payload = payload;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      traceId: this.traceId,
      source: this.source,
      action: this.action,
      payload: this.payload,
      timestamp: this.timestamp
    };
  }
}
