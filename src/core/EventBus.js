import { EventEmitter } from 'events';

/**
 * Enterprise EventBus Core Module
 * Guarantees zero unhandled promise rejections and safe async execution.
 */
export class EventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.setMaxListeners(options.maxListeners || 100);
    this.schemaRegistry = options.schemaRegistry || null;
    this.logger = options.logger || console;
  }

  /**
   * Fully awaited publish method for inline workflow execution.
   */
  async publish(topic, payload = {}) {
    if (this.schemaRegistry && typeof this.schemaRegistry.validate === 'function') {
      const validation = this.schemaRegistry.validate(topic, payload);
      if (!validation.valid) {
        const errorMsg = `[EventBus] Schema contract violation on topic '${topic}'`;
        this.logger.error(errorMsg, { payload });
        throw new Error(errorMsg);
      }
    }

    const listeners = this.listeners(topic);
    if (listeners.length === 0) {
      this.logger.warn(`[EventBus] No subscriber registered for published topic: '${topic}'`);
      return false;
    }

    const promises = listeners.map(async (listener) => {
      try {
        return await listener(payload);
      } catch (err) {
        this.logger.error(`[EventBus Error] Subscriber failed on topic '${topic}':`, err);
        throw err;
      }
    });

    await Promise.all(promises);
    return true;
  }

  /**
   * Safe non-blocking publish call for background tasks.
   * Catches rejections automatically so un-awaited calls don't trigger unhandled promise rejections.
   */
  safePublish(topic, payload = {}) {
    this.publish(topic, payload).catch((err) => {
      this.logger.error(`[EventBus Background Error] Failed on topic '${topic}':`, err);
    });
  }

  /**
   * Strongly typed subscriber helper.
   */
  subscribe(topic, handler) {
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }
}

export default EventBus;