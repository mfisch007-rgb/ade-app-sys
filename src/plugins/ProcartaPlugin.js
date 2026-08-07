import { BasePlugin } from '../kernel/contracts/BasePlugin.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

export class ProcartaPlugin extends BasePlugin {
  constructor() {
    super('ProcartaWorkflowEngine', '1.0.0');
    this.activeWorkflows = new Map();
  }

  async boot(kernel) {
    await super.boot(kernel);
    const eventBus = this.kernel.getBus ? this.kernel.getBus() : this.kernel.subsystems?.get('eventBus');
    if (eventBus) {
      const subscribeFn = eventBus.subscribe ? eventBus.subscribe.bind(eventBus) : eventBus.on ? eventBus.on.bind(eventBus) : null;
      if (subscribeFn) {
        subscribeFn('PROCARTA_TRIGGER_WORKFLOW', (event) => {
          this.handleWorkflowTrigger(event);
        });
        console.log('[ProcartaPlugin] Registered workflow listeners on Kernel EventBus.');
      }
    } else {
      console.warn('[ProcartaPlugin] EventBus subsystem not found on kernel.');
    }
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
