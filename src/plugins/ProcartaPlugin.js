import { BasePlugin } from '../kernel/contracts/BasePlugin.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

export class ProcartaPlugin extends BasePlugin {
  constructor() {
    super('ProcartaWorkflowEngine', '1.0.0');
    this.activeWorkflows = new Map();
  }

  async boot(kernel) {
    await super.boot(kernel);
    if (this.kernel && this.kernel.eventBus) {
      this.kernel.eventBus.subscribe('PROCARTA_TRIGGER_WORKFLOW', (event) => {
        this.handleWorkflowTrigger(event);
      });
    }
    console.log('[ProcartaPlugin] Registered workflow listeners on Kernel EventBus.');
  }

  handleWorkflowTrigger(event) {
    const workflowId = event.payload?.workflowId || 'WF-DEFAULT';
    this.activeWorkflows.set(workflowId, {
      status: 'RUNNING',
      startTime: Date.now(),
      traceId: event.traceId
    });
    console.log(`[ProcartaPlugin] Execution started for ${workflowId} [TraceID: ${event.traceId}]`);
  }

  async shutdown() {
    this.activeWorkflows.clear();
    await super.shutdown();
    console.log('[ProcartaPlugin] Workflow state cleared and shut down cleanly.');
  }
}
