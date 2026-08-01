// APEX Knowledge Engine Main Entry Point
const IngestPipeline = require("./IngestPipeline");
const ExperienceStore = require("./ExperienceStore");
class KnowledgeEngine {
  constructor(eventBus) { this.pipeline = new IngestPipeline(); this.store = new ExperienceStore(); if (eventBus) eventBus.subscribe("*", (evt) => this.ingest(evt)); }
  ingest(event) { const entry = this.pipeline.processEvent(event); this.store.record(entry.id, entry); }
  retrieve(id) { return this.store.recall(id); }
}
module.exports = KnowledgeEngine;
