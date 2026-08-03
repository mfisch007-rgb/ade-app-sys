export default class ObservationEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.observations = [];
    }

    async observe(source, metric, value) {
        const obs = { obsId: `obs_${Date.now()}`, source, metric, value, timestamp: Date.now() };
        this.observations.push(obs);

        if (this.bus) {
            await this.bus.publish("observation.recorded", obs);
        }

        return obs;
    }
}