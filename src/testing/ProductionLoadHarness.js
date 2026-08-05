import { EventEmitter } from 'events';

export class ProductionLoadHarness extends EventEmitter {
  constructor({ kernel, observatory, logger = console }) {
    super();
    this.kernel = kernel;
    this.observatory = observatory;
    this.logger = logger;
    this.activeWorkers = new Set();
    this.metrics = {
      totalExecuted: 0,
      concurrencySpikes: 0,
      memorySnapshots: [],
      errors: 0
    };
  }

  async runStressSuite({ totalWorkflows = 500, maxConcurrency = 50 }) {
    this.logger.info(`[ProductionLoadHarness] Starting Load Test: ${totalWorkflows} workflows @ max concurrency ${maxConcurrency}`);
    const engine = this.kernel.container.resolve('workflowEngine');
    const queue = Array.from({ length: totalWorkflows }, (_, i) => `wf_stress_${i + 1}`);
    
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    const workerPool = async () => {
      while (queue.length > 0) {
        const wfId = queue.shift();
        if (!wfId) break;

        this.activeWorkers.add(wfId);
        if (this.activeWorkers.size > this.metrics.concurrencySpikes) {
          this.metrics.concurrencySpikes = this.activeWorkers.size;
        }

        try {
          // Simulate dynamic load steps
          await engine.executeAutonomousWorkflow(wfId, {
            payload: `payload_data_${wfId}`,
            timestamp: Date.now()
          });
          this.metrics.totalExecuted++;
        } catch (err) {
          this.metrics.errors++;
          this.logger.error(`[LoadHarness] Concurrency error on ${wfId}:`, err.message);
        } finally {
          this.activeWorkers.delete(wfId);
        }
      }
    };

    // Execute concurrent workers up to maxConcurrency limit
    const workers = Array.from({ length: Math.min(maxConcurrency, totalWorkflows) }, () => workerPool());
    await Promise.all(workers);

    const endMemory = process.memoryUsage().heapUsed;
    const durationMs = Date.now() - startTime;
    const memoryGrowthMB = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);

    const report = {
      durationMs,
      throughputPerSec: Math.round((this.metrics.totalExecuted / durationMs) * 1000),
      totalExecuted: this.metrics.totalExecuted,
      peakConcurrency: this.metrics.concurrencySpikes,
      errorCount: this.metrics.errors,
      memoryGrowthMB: `${memoryGrowthMB} MB`
    };

    this.logger.info(`[ProductionLoadHarness] Load Test Completed Successfully.`);
    return report;
  }
}