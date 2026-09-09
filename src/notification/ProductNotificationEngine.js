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
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.preferences = new Map();
    this.internalEvents = [];
    this.maxEvents = 1000;
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
    return this.internalEvents.slice(-Math.min(limit, 100));
  }

  _trimEvents() {
    if (this.internalEvents.length > this.maxEvents) {
      this.internalEvents = this.internalEvents.slice(-this.maxEvents);
    }
  }
}

export default ProductNotificationEngine;
