import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import EnterpriseEventBus from "./EnterpriseEventBus.js";

const DEFAULT_QUEUE = path.resolve(process.env.ADE_FEEDBACK_QUEUE || ".ade_feedback_queue.json");
const PII = [
  /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,
  /\b\d{10,19}\b/g
];

export class FeedbackPipeline {
  constructor({ eventBus = EnterpriseEventBus.getInstance(), queuePath = DEFAULT_QUEUE, enrich = null } = {}) {
    this.eventBus = eventBus;
    this.queuePath = queuePath;
    this.enrich = enrich;
    this.queue = this.#load();
  }

  sanitize(value) {
    if (typeof value === "string") return PII.reduce((v, pattern) => v.replace(pattern, "[REDACTED]"), value).slice(0, 10000);
    if (Array.isArray(value)) return value.map(v => this.sanitize(v));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.sanitize(v)]));
    return value;
  }

  #load() {
    try { return fs.existsSync(this.queuePath) ? JSON.parse(fs.readFileSync(this.queuePath, "utf8")) : []; } catch { return []; }
  }
  #persist() {
    try {
      const tmp = `${this.queuePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.queue.slice(-1000), null, 2), "utf8");
      fs.renameSync(tmp, this.queuePath);
    } catch (_err) {
      // Filesystem persistence failed. In-memory state is preserved.
      // Durability is degraded but the API contract does not require durable-write success.
    }
  }

  async ingest(payload = {}) {
    const item = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), payload: this.sanitize(payload), status: "RECEIVED" };
    try {
      if (this.enrich) item.enrichment = await this.enrich(item.payload);
    } catch { item.enrichment = null; item.enrichmentStatus = "UNAVAILABLE"; }
    this.queue.push(item);
    this.#persist();
    try { await this.eventBus.publish("FEEDBACK_RECEIVED", item); } catch {}
    return item;
  }

  getQueue() { return this.queue.slice(-100); }
}
export default FeedbackPipeline;
