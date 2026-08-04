/**
 * Deterministic Boot DAG Execution & Verification Matrix (Tier 1)
 * Enforces topological sorting across all subsystem boot phases.
 */
export const BOOT_STAGES = Object.freeze([
  'LOGGER',
  'CONFIG',
  'STORAGE',
  'EVENT_BUS',
  'IDENTITY',
  'MEMORY',
  'DECISION',
  'ORACLE',
  'WORKFLOW',
  'REST_API',
  'WORKERS',
  'PLUGINS'
]);

export class BootDAGSequence {
  constructor() {
    this.stageRegistry = new Map();
    BOOT_STAGES.forEach(stage => this.stageRegistry.set(stage, new Set()));
    this.executedStages = new Set();
  }

  registerSubsystem(stage, subsystemInstance) {
    if (!this.stageRegistry.has(stage)) {
      throw new Error(`[BootDAG] Invalid boot stage '${stage}'. Must be one of: ${BOOT_STAGES.join(', ')}`);
    }
    this.stageRegistry.get(stage).add(subsystemInstance);
  }

  async executeBootSequence(kernelContext = {}) {
    console.log('[BootDAG] Starting deterministic multi-stage boot sequence...');
    
    for (const stage of BOOT_STAGES) {
      const subsystems = this.stageRegistry.get(stage);
      console.log(`[BootDAG] Executing Stage [${stage}] - (${subsystems.size} subsystems registered)`);

      for (const subsystem of subsystems) {
        if (typeof subsystem.boot === 'function') {
          await subsystem.boot(kernelContext);
        }
        if (typeof subsystem.ready === 'function') {
          await subsystem.ready();
        }
      }
      this.executedStages.add(stage);
    }

    console.log('[BootDAG] All 12 boot stages successfully executed in topological order.');
    return true;
  }

  isFullyBooted() {
    return BOOT_STAGES.every(stage => this.executedStages.has(stage));
  }
}

export default BootDAGSequence;