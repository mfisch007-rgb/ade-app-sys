export default class AnomalyEngine {
    constructor(bus = null, config = {}) {
        this.bus = bus;
        this.config = config;
        this.anomalyLog = [];
        this.status = "STOPPED";
    }

    register() { return true; }
    initialize() { this.status = "INITIALIZED"; return true; }
    start() { this.status = "RUNNING"; return true; }
    pause() { this.status = "PAUSED"; return true; }
    resume() { this.status = "RUNNING"; return true; }
    shutdown() { this.anomalyLog = []; this.status = "STOPPED"; return true; }

    health() { return { status: this.status, totalAnomaliesDetected: this.anomalyLog.length }; }
    metrics() { return { totalAnomaliesDetected: this.anomalyLog.length }; }
    events() { return ["anomaly.detected"]; }
    config(newConfig = {}) { this.config = { ...this.config, ...newConfig }; }

    async detectOutlier(metricName, currentValue, history = [], thresholdZ = 3.0) {
        if (this.status !== "RUNNING") throw new Error("ANOMALY_ENGINE_NOT_RUNNING");
        if (!history || history.length < 3) return { isAnomaly: false, zScore: 0 };
        
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;
        const stdDev = Math.sqrt(variance) || 0.0001;
        const zScore = Math.abs((currentValue - mean) / stdDev);
        const isAnomaly = zScore >= thresholdZ;

        if (isAnomaly) {
            const record = { metricName, currentValue, zScore, timestamp: Date.now() };
            this.anomalyLog.push(record);
            if (this.bus) {
                await this.bus.publish("anomaly.detected", record);
            }
            return { isAnomaly: true, zScore, record };
        }
        return { isAnomaly: false, zScore };
    }
}