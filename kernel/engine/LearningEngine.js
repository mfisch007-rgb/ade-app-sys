export default class LearningEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.episodes = [];
    }

    async recordLearningEpisode(topic, inputs, output, rewardScore) {
        const record = { topic, inputs, output, rewardScore, timestamp: Date.now() };
        this.episodes.push(record);

        if (this.bus) {
            await this.bus.publish("learning.recorded", record).catch(err => console.error('[EventBus Async Error]', err));
        }

        return record;
    }

  async boot() {
    this.status = 'booting';
    if (typeof this.init === 'function') await this.init();
    this.status = 'booted';
  }

  async ready() {
    this.status = 'ready';
  }

  async shutdown() {
    this.status = 'shutting_down';
  }

  async dispose() {
    this.status = 'disposed';
  }
}