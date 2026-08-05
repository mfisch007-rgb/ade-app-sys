export class EventSchemaRegistry {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.schemas = new Map();
  }

  registerSchema(topic, { version = '1.0.0', requiredFields = [], validator = null }) {
    this.schemas.set(topic, { version, requiredFields, validator });
  }

  validatePayload(topic, payload) {
    const schema = this.schemas.get(topic);
    if (!schema) {
      throw new Error(`[EventSchemaRegistry] Strict Violation: Unregistered event topic '${topic}' has no registered schema.`);
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error(`[EventSchemaRegistry] Invalid payload for topic '${topic}': Expected non-null object.`);
    }

    for (const field of schema.requiredFields) {
      if (payload[field] === undefined) {
        throw new Error(`[EventSchemaRegistry] Payload validation failed for '${topic}': Missing required field '${field}'`);
      }
    }

    if (schema.validator && !schema.validator(payload)) {
      throw new Error(`[EventSchemaRegistry] Custom schema validation failed for topic '${topic}'`);
    }

    return true;
  }
}

export class VerifiedEventBus {
  constructor({ schemaRegistry, logger = console } = {}) {
    this.schemaRegistry = schemaRegistry;
    this.logger = logger;
    this.subscriptions = new Map(); // topic -> Map(moduleId, handler)
  }

  subscribe(topic, moduleId, handler) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }
    this.subscriptions.get(topic).set(moduleId, handler);
  }

  unsubscribeModule(moduleId) {
    for (const [topic, handlers] of this.subscriptions.entries()) {
      handlers.delete(moduleId);
    }
  }

  async publish(topic, payload, meta = {}) {
    // Strict schema check
    if (this.schemaRegistry) {
      this.schemaRegistry.validatePayload(topic, payload);
    }

    const handlers = this.subscriptions.get(topic);
    if (!handlers || handlers.size === 0) {
      return { topic, delivered: 0, status: 'NO_SUBSCRIBERS' };
    }

    const enrichedPayload = {
      ...payload,
      _meta: {
        timestamp: Date.now(),
        topic,
        correlationId: meta.correlationId || `corr_${Math.random().toString(36).substring(2, 11)}`
      }
    };

    const executions = [];
    for (const [moduleId, handler] of handlers.entries()) {
      executions.push(
        Promise.resolve().then(() => handler(enrichedPayload)).catch(err => {
          this.logger.error(`[EventBus] Subscriber '${moduleId}' failed handling '${topic}':`, err);
          throw err;
        })
      );
    }

    await Promise.all(executions);
    return { topic, delivered: handlers.size, status: 'DELIVERED' };
  }
}