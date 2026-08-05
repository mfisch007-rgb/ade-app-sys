export class PrometheusExporter {
  constructor({ observatory }) {
    this.observatory = observatory;
  }

  generateMetricsText() {
    const snapshot = this.observatory.getLiveSnapshot();
    const lines = [
      '# HELP process_uptime_seconds Total runtime process uptime in seconds',
      '# TYPE process_uptime_seconds counter',
      `process_uptime_seconds ${snapshot.uptimeSeconds}`,
      '',
      '# HELP process_heap_bytes Memory heap utilization in bytes',
      '# TYPE process_heap_bytes gauge',
      `process_heap_bytes ${snapshot.memoryUsage.heapUsedMB * 1024 * 1024}`,
      '',
      '# HELP workflow_completed_total Total workflows completed successfully',
      '# TYPE workflow_completed_total counter',
      `workflow_completed_total ${snapshot.workflowTelemetry.completed}`,
      '',
      '# HELP workflow_escalated_total Total workflows escalated to human intervention',
      '# TYPE workflow_escalated_total counter',
      `workflow_escalated_total ${snapshot.workflowTelemetry.escalated}`,
      '',
      '# HELP workflow_failed_total Total workflow executions that resulted in unrecoverable failure',
      '# TYPE workflow_failed_total counter',
      `workflow_failed_total ${snapshot.workflowTelemetry.failed}`
    ];

    return lines.join('\n');
  }
}