// ADE Shared Event Bus
class EventBus {
  constructor() { this.listeners = new Map(); this.history = []; }
  subscribe(topic, handler) { if (!this.listeners.has(topic)) this.listeners.set(topic, []); this.listeners.get(topic).push(handler); }
  unsubscribe(topic, handler) { if (!this.listeners.has(topic)) return; this.listeners.set(topic, this.listeners.get(topic).filter(h => h !== handler)); }
  publish(topic, payload) { const event = { id: Date.now(), topic, payload, timestamp: new Date().toISOString() }; this.history.push(event); if (this.listeners.has(topic)) this.listeners.get(topic).forEach(h => h(event)); }
}
module.exports = EventBus;
