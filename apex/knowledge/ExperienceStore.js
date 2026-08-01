// APEX Experience Store & Memory Engine
class ExperienceStore {
  constructor() { this.store = new Map(); }
  record(key, value) { this.store.set(key, { value, timestamp: Date.now() }); }
  recall(key) { return this.store.get(key); }
}
module.exports = ExperienceStore;
