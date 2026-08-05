import { KernelLoader } from './src/core/KernelLoader.js';
import { VerifiedEventBus, EventSchemaRegistry } from './src/events/EventSchemaRegistry.js';
import { WorkflowEngine } from './src/workflows/WorkflowEngine.js';
import { FaultInjector } from './src/testing/FaultInjector.js';
import { RuntimeObservatory } from './src/observatory/RuntimeObservatory.js';

async function main() {
  console.log("================================================================================");
  console.log("   ADE-APEX ENTERPRISE RUNTIME PLATFORM VERIFICATION");
  console.log("================================================================================");

  // 1. Core Services Setup
  const observatory = new RuntimeObservatory();
  const schemaRegistry = new EventSchemaRegistry();

  // Register Event Schemas
  schemaRegistry.registerSchema('workflow.completed', {
    version: '1.0.0',
    requiredFields: ['workflowId', 'status']
  });
  schemaRegistry.registerSchema('human.escalation.triggered', {
    version: '1.0.0',
    requiredFields: ['workflowId', 'reason', 'confidence']
  });

  const eventBus = new VerifiedEventBus({ schemaRegistry });

  // 2. Kernel Setup
  const kernel = new KernelLoader({ observatory });

  // Value registrations using fallback compatibility
  if (typeof kernel.container.registerValue === 'function') {
    kernel.container.registerValue('eventBus', eventBus);
    kernel.container.registerValue('logger', console);
    kernel.container.registerValue('config', { confidenceThreshold: 0.75 });
  } else {
    kernel.container.register('eventBus', eventBus);
    kernel.container.register('logger', console);
    kernel.container.register('config', { confidenceThreshold: 0.75 });
  }

  kernel.registerModule('workflowEngine', WorkflowEngine, ['eventBus', 'logger', 'config'], ['default']);

  // 3. Boot Core Kernel
  await kernel.bootProfile('default');

  // 4. Test Autonomous Workflow Execution (High Confidence)
  console.log("\n--- Executing Autonomous Workflow 001 (High Confidence) ---");
  const engine = kernel.container.resolve('workflowEngine');

  engine.decisionEngine = {
    process: async () => ({ confidence: 0.95, selectedAction: 'EXECUTE_ORDER' })
  };

  const res1 = await engine.executeAutonomousWorkflow('wf_001', { source: 'market_stream' });
  observatory.recordWorkflowState(res1.status);

  // 5. Test Low Confidence Escalation Path
  console.log("\n--- Executing Autonomous Workflow 002 (Low Confidence Escalation) ---");
  engine.decisionEngine = {
    process: async () => ({ confidence: 0.40, selectedAction: 'HIGH_RISK_TRADE' })
  };

  const res2 = await engine.executeAutonomousWorkflow('wf_002', { source: 'market_stream' });
  observatory.recordWorkflowState(res2.status);

  // 6. Test Fault Injection
  console.log("\n--- Testing Resilience / Fault Injection ---");
  const faultInjector = new FaultInjector({ eventBus });
  faultInjector.injectFault('workflowEngine', 'LATENCY_SPIKE', 1000);

  // 7. Print Observatory Snapshot
  console.log("\n================================================================================");
  console.log("   ADE RUNTIME OBSERVATORY SNAPSHOT");
  console.log("================================================================================");
  console.dir(observatory.getLiveSnapshot(), { depth: null });

  // 8. Graceful Shutdown
  console.log("\n--- Shutting Down Core Kernel ---");
  await kernel.shutdown();
  console.log("Runtime Verification Complete.");
}

main().catch(console.error);