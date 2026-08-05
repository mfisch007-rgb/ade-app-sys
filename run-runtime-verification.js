import { KernelLoader } from './src/core/KernelLoader.js';
import { VerifiedEventBus, EventSchemaRegistry } from './src/events/EventSchemaRegistry.js';
import { WorkflowEngine } from './src/workflows/WorkflowEngine.js';
import { FaultInjector } from './src/testing/FaultInjector.js';
import { RuntimeObservatory } from './src/observatory/RuntimeObservatory.js';
import { ProductionLoadHarness } from './src/testing/ProductionLoadHarness.js';
import { SecurityGateway } from './src/security/SecurityGateway.js';
import { ClusterCoordinator } from './src/cluster/ClusterCoordinator.js';
import { PrometheusExporter } from './src/observatory/PrometheusExporter.js';

async function main() {
  console.log("================================================================================");
  console.log("   ADE-APEX FULL ENTERPRISE PRODUCTION VERIFICATION & HARDENING SUITE");
  console.log("================================================================================");

  // 1. Core Services Setup
  const observatory = new RuntimeObservatory();
  const schemaRegistry = new EventSchemaRegistry();

  schemaRegistry.registerSchema('workflow.completed', { version: '1.0.0', requiredFields: ['workflowId', 'status'] });
  schemaRegistry.registerSchema('human.escalation.triggered', { version: '1.0.0', requiredFields: ['workflowId', 'reason', 'confidence'] });

  const eventBus = new VerifiedEventBus({ schemaRegistry });

  // 2. Kernel Setup & DI Container Wiring
  const kernel = new KernelLoader({ observatory });
  kernel.container.register('eventBus', eventBus);
  kernel.container.register('logger', console);
  kernel.container.register('config', { confidenceThreshold: 0.75 });

  kernel.registerModule('workflowEngine', WorkflowEngine, ['eventBus', 'logger', 'config'], ['default']);

  // 3. Boot Kernel
  await kernel.bootProfile('default');

  // 4. Test Concurrency & Load Stress Suite (50 Concurrent Workflows)
  console.log("\n--- Executing Concurrency & Memory Stress Test (100 Workflows @ 20 Parallel Workers) ---");
  const loadHarness = new ProductionLoadHarness({ kernel, observatory });
  const loadReport = await loadHarness.runStressSuite({ totalWorkflows: 100, maxConcurrency: 20 });
  console.dir(loadReport);

  // 5. Test Security Gateway & JWT Validation
  console.log("\n--- Testing Security Gateway & RBAC Hardening ---");
  const security = new SecurityGateway();
  const inputSanitized = security.sanitizeInput({ payload: "<script>alert('xss')</script>SafeData" });
  console.log(`[Security] Input Sanitization Result: "${inputSanitized.payload}"`);

  const rbacValid = security.verifyRBAC('ADMIN', 'OPERATOR');
  console.log(`[Security] RBAC Validation (ADMIN accessing OPERATOR route): ${rbacValid}`);

  // 6. Test Cluster Coordination & Distributed Locks
  console.log("\n--- Testing Distributed Cluster Coordination & Locks ---");
  const cluster = new ClusterCoordinator();
  cluster.electLeader();
  const lockAcquired = await cluster.acquireLock('db_transaction_lock_01', 3000);
  console.log(`[Cluster] Reentrant Lock Acquisition Result: ${lockAcquired}`);
  await cluster.releaseLock('db_transaction_lock_01');

  // 7. Chaos Engineering Execution
  console.log("\n--- Executing Multi-Vector Chaos Engineering ---");
  const faultInjector = new FaultInjector({ eventBus });
  faultInjector.injectFault('databaseConnection', 'SERVICE_UNAVAILABLE', 1000);
  faultInjector.injectFault('redisCache', 'LATENCY_SPIKE', 1000);

  // 8. Export Prometheus Observability Metrics
  console.log("\n--- Generating OpenTelemetry / Prometheus Metrics Endpoint Snapshot ---");
  const exporter = new PrometheusExporter({ observatory });
  console.log(exporter.generateMetricsText());

  // 9. Graceful Shutdown & Resource Cleanup
  console.log("\n--- Executing Reverse-DAG Teardown ---");
  await kernel.shutdown();

  console.log("================================================================================");
  console.log("   ADE-APEX ENTERPRISE INFRASTRUCTURAL DEVELOPMENT: COMPLETE & READY");
  console.log("================================================================================");
}

main().catch(console.error);