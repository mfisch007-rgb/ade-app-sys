// APEX Knowledge Engine Ingest Pipeline
class IngestPipeline {
  processEvent(event) { return { id: event.id, topic: event.topic, indexedAt: new Date().toISOString(), tags: ["event-sourced"] }; }
}
module.exports = IngestPipeline;
