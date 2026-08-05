export class RuntimeObservatory {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.moduleStates = new Map();
    this.eventMetrics = { published: 0, delivered: 0, failed: 0 };
    this.workflowMetrics = { started: 0, completed: 0, escalated: 0, failed: 0 };
    this.startTime = Date.now();
  }

  recordLifecycleTransition(moduleId, newState) {
    const previous = this.moduleStates.get(moduleId) || 'NONE';
    this.moduleStates.set(moduleId, { state: newState, timestamp: Date.now() });
    this.logger.info(`[Observatory] Module '${moduleId}': ${previous} -> ${newState}`);
  }

  recordEvent(status) {
    if (this.eventMetrics[status] !== undefined) {
      this.eventMetrics[status]++;
    }
  }

  recordWorkflowState(resultStatus) {
    if (resultStatus === 'SUCCESS') this.workflowMetrics.completed++;
    else if (resultStatus === 'ESCALATED') this.workflowMetrics.escalated++;
    else if (resultStatus === 'FAILED') this.workflowMetrics.failed++;
  }

  getLiveSnapshot() {
    const memory = process.memoryUsage();
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsage: {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        rssMB: Math.round(memory.rss / 1024 / 1024)
      },
      activeModules: Object.fromEntries(Array.from(this.moduleStates.entries()).map(([k, v]) => [k, v.state])),
      eventTelemetry: { ...this.eventMetrics },
      workflowTelemetry: { ...this.workflowMetrics }
    };
  }
}