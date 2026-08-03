export default class LearningEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.episodes = [];
    }

    async recordLearningEpisode(topic, inputs, output, rewardScore) {
        const record = { topic, inputs, output, rewardScore, timestamp: Date.now() };
        this.episodes.push(record);

        if (this.bus) {
            await this.bus.publish("learning.recorded", record);
        }

        return record;
    }
}