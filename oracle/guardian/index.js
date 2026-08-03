/**
 * ADE-APEX Oracle Guardian System
 */
import { ConfidenceEngine } from './ConfidenceEngine.js';
import { HealthSupervisor } from './HealthSupervisor.js';

export class OracleGuardian {
    constructor(eventBus) {
        this.bus = eventBus;
        this.confidenceEngine = new ConfidenceEngine();
        this.healthSupervisor = new HealthSupervisor();
    }

    init() {
        if (!this.bus || typeof this.bus.subscribe !== 'function') return;
        
        // Listens to explicit lifecycle boot event instead of wildcard system.*
        this.bus.subscribe('system.boot', async (data) => {
            await this.onSystemBoot(data);
        });
    }

    async onSystemBoot(data) {
        console.log('[ORACLE GUARDIAN] Boot sequence telemetry verified:', data?.timestamp);
        if (this.healthSupervisor && typeof this.healthSupervisor.checkSystem === 'function') {
            await this.healthSupervisor.checkSystem();
        }
    }
}

export default OracleGuardian;