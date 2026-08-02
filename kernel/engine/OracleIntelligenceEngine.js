export default class OracleIntelligenceEngine {
    constructor(bus = null) {
        this.bus = bus;
    }

    calculateZScore(currentValue, mean, stdDev) {
        if (!stdDev || stdDev === 0) return 0;
        return (currentValue - mean) / stdDev;
    }

    evaluateRisk(payload = {}) {
        const currentValue = payload.currentValue ?? payload.score ?? 0;
        const mean = payload.mean ?? 0;
        const stdDev = payload.stdDev ?? 1;

        const rawZ = this.calculateZScore(currentValue, mean, stdDev);
        const zScore = Number(Math.abs(rawZ).toFixed(4));
        const riskScore = Number(Math.min(1.0, zScore / 3.0).toFixed(4));
        const passed = riskScore < 0.5;

        const result = {
            tenantId: payload.tenantId || "system",
            zScore,
            score: riskScore,
            passed,
            timestamp: Date.now()
        };

        if (this.bus) {
            this.bus.publish("oracle.risk.evaluated", result);
        }

        return result;
    }
}
