/**
 * ADE NOTIFICATION / RELEASE EVOLUTION FOUNDATION
 *
 * Uses existing EventBus, notification, audit and observability architecture.
 * Not a spam engine. Establishes a foundation for event-driven
 * product notifications/preferences.
 *
 * Internal events are generated here. External notification delivery
 * (email, WhatsApp, Telegram) requires actual configured connectors
 * and is NEVER claimed without proof.
 */

import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

export const NOTIFICATION_EVENTS = Object.freeze({
  NEW_CAPABILITY: "notification.new_capability",
  RELEASE_UPDATE: "notification.release_update",
  PILOT_UPDATE: "notification.pilot_update",
  REQUEST_STATUS: "notification.request_status",
  CAPABILITY_AVAILABLE: "notification.capability_available",
  IMPROVEMENT_DEPLOYED: "notification.improvement_deployed",
  DEMO_COMPLETED: "notification.demo_completed"
});

export class ProductNotificationEngine {
  constructor({ eventBus = EnterpriseEventBus.getInstance(), store = null, durableSection = "notifications", durableLimit = 200 } = {}) {
    this.eventBus = eventBus;
    // Optional durable backing (RuntimeConfigStore). Without it the feed is
    // process-local memory and vanishes across serverless instances/restarts
    // — with it, every instance serves the same canonical notification truth.
    this.store = store;
    this.durableSection = durableSection;
    this.durableLimit = durableLimit;
    this.preferences = new Map();
    this.internalEvents = [];
    this.maxEvents = 1000;
    this._restoreDurable();
  }

  _restoreDurable() {
    try {
      const rows = this.store?.readSection?.(this.durableSection);
      if (Array.isArray(rows)) {
        for (const e of rows.slice(-this.maxEvents)) {
          if (e?.eventId && !this.internalEvents.some((x) => x.eventId === e.eventId)) {
            this.internalEvents.push(e);
          }
        }
      }
    } catch {}
  }

  _persistDurable() {
    try {
      this.store?.writeSection?.(this.durableSection, this.internalEvents.slice(-this.durableLimit));
    } catch {}
  }

  generateInternalEvent(type, payload = {}) {
    const event = {
      eventId: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      payload,
      generatedAt: new Date().toISOString(),
      deliveredExternally: false,
      externalChannel: null,
      truthClassification: "INTERNAL_EVENT_ONLY"
    };
    this.internalEvents.push(event);
    this._trimEvents();
    this._persistDurable();
    this.eventBus.publish(type, { eventId: event.eventId, ...payload });
    return event;
  }

  setPreference(userId, eventType, enabled = true) {
    if (!this.preferences.has(userId)) this.preferences.set(userId, {});
    this.preferences.get(userId)[eventType] = enabled;
  }

  getPreference(userId, eventType) {
    const userPrefs = this.preferences.get(userId);
    if (!userPrefs) return true;
    return userPrefs[eventType] !== false;
  }

  getRecentEvents(limit = 50) {
    return this._merged().slice(-Math.min(limit, 100));
  }

  // Cross-instance-fresh feed. Re-pulls the durable section where supported
  // so serverless instances converge on the same notification truth.
  async getRecentEventsAsync(limit = 50) {
    try {
      if (this.store && typeof this.store.readSectionAsync === "function") {
        const rows = await this.store.readSectionAsync(this.durableSection);
        if (Array.isArray(rows)) {
          for (const e of rows) {
            if (e?.eventId && !this.internalEvents.some((x) => x.eventId === e.eventId)) {
              this.internalEvents.push(e);
            }
          }
          this._trimEvents();
        }
      }
    } catch {}
    return this.getRecentEvents(limit);
  }

  _merged() {
    // Memory is authoritative for recency; durable rows fill gaps left by
    // instance boundaries. Dedupe by eventId, preserve insertion order.
    const seen = new Set();
    const out = [];
    for (const e of this.internalEvents) {
      if (e?.eventId && !seen.has(e.eventId)) {
        seen.add(e.eventId);
        out.push(e);
      }
    }
    return out;
  }

  _trimEvents() {
    if (this.internalEvents.length > this.maxEvents) {
      this.internalEvents = this.internalEvents.slice(-this.maxEvents);
    }
  }
}

export default ProductNotificationEngine;
