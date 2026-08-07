import { UniversalWebhookRouter } from '../plugins/UniversalWebhookRouter.js';
import { ProcartaPlugin } from '../plugins/ProcartaPlugin.js';
import { UniversalAggregatorPlugin } from '../plugins/UniversalAggregatorPlugin.js';
import { LeadManagementPlugin } from '../plugins/LeadManagementPlugin.js';
import { PluginRegistry } from './PluginRegistry.js';
/**
 * ADE-APEX Enterprise Kernel Master Bootstrapper
 * Orchestrates multi-engine initialization, dependency injection, and health supervision.
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { EnterpriseEventBus } from './EnterpriseEventBus.js';
import { PersistentStorageEngine } from './PersistentStorageEngine.js';
import { 
  StructuredJSONLogger, 
  ContextMemoryEngine, 
  KnowledgeEngine, 
  DecisionEngine, 
  OracleIntelligenceEngine, 
  GuardianSecurityEngine, 
  NotificationEngine, 
  NexusLedgerEngine, 
  WorkflowEngine 
} from './SupportingEngines.js';

export class EnterpriseKernelMaster extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      env: process.env.NODE_ENV || 'production',
      persistencePath: './data/kernel_state.json',
      ...config
    };
    this.container = new Map();
    this.subsystems = new Map();
    this.pluginRegistry = new PluginRegistry(this);
    this.pluginRegistry.register(new ProcartaPlugin());
    this.pluginRegistry.register(new UniversalAggregatorPlugin());
    this.pluginRegistry.register(new LeadManagementPlugin());
    this.pluginRegistry.register(new UniversalWebhookRouter());
    this.isBooted = false;
    this.metrics = {
      bootTimeMs: 0,
      activeSubsystems: 0,
      errorsCount: 0
    };
  }

  register(name, instance) {
    this.container.set(name, instance);
    return this;
  }

  resolve(name) {
    if (!this.container.has(name)) {
      throw new Error(`[KernelMaster] Subsystem '${name}' not found in container.`);
    }
    return this.container.get(name);
  }

  async boot() {
    const start = Date.now();
    console.log('[KernelMaster] Initializing ADE-APEX Enterprise Ecosystem...');

    const bootSequence = [
      ['eventBus', () => new EnterpriseEventBus()],
      ['logger', () => new StructuredJSONLogger()],
      ['storage', () => new PersistentStorageEngine(this.config.persistencePath)],
      ['memory', () => new ContextMemoryEngine()],
      ['knowledge', () => new KnowledgeEngine()],
      ['decision', () => new DecisionEngine()],
      ['oracle', () => new OracleIntelligenceEngine()],
      ['guardian', () => new GuardianSecurityEngine()],
      ['notification', () => new NotificationEngine()],
      ['ledger', () => new NexusLedgerEngine()],
      ['workflowEngine', () => new WorkflowEngine()]
    ];

    for (const [name, factory] of bootSequence) {
      try {
        const instance = factory();
        if (typeof instance.initialize === 'function') {
          await instance.initialize(this);
        }
        this.register(name, instance);
        this.subsystems.set(name, 'READY');
        console.log(`[KernelMaster] Subsystem '${name}' booted successfully.`);
      } catch (error) {
        this.metrics.errorsCount++;
        console.error(`[KernelMaster] Failed to boot subsystem '${name}':`, error.message);
        throw error;
      }
    }

    this.isBooted = true;
    this.metrics.bootTimeMs = Date.now() - start;
    this.metrics.activeSubsystems = this.subsystems.size;
    console.log(`[KernelMaster] Ecosystem fully operational in ${this.metrics.bootTimeMs}ms.`);
  }

  async shutdown() {
    console.log('[KernelMaster] Initiating graceful ecosystem shutdown...');
    for (const [name, instance] of this.container.entries()) {
      try {
        if (typeof instance.dispose === 'function') {
          await instance.dispose();
        }
        this.subsystems.set(name, 'DISPOSED');
        console.log(`[KernelMaster] Subsystem '${name}' shut down cleanly.`);
      } catch (err) {
        console.error(`[KernelMaster] Error disposing subsystem '${name}':`, err.message);
      }
    }
    this.isBooted = false;
  }
}