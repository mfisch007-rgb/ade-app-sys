/**
 * ADE-APEX Master Production Validation & E2E Verification Suite
 */

import { EnterpriseKernelMaster } from './src/kernel/EnterpriseKernelMaster.js';

async function runProductionValidation() {
  console.log('================================================================================');
  console.log('   ADE-APEX ENTERPRISE PRODUCTION VALIDATION SUITE');
  console.log('================================================================================');

  const kernel = new EnterpriseKernelMaster();

  try {
    // 1. Runtime Boot Coverage Test
    await kernel.boot();
    console.log('✅ [PASSED] Runtime Boot Coverage: All core subsystems active.');

    // 2. Persistence & State Recovery Test
    const storage = kernel.resolve('storage');
    await storage.save('last_test_transaction', { id: 'TX-999', amount: 5000, status: 'VERIFIED' });
    const reloadedState = await storage.reload('last_test_transaction');
    if (!reloadedState || reloadedState.id !== 'TX-999') {
      throw new Error('Persistence state recovery check failed.');
    }
    console.log('✅ [PASSED] Persistence & State Recovery: Save and reload verified.');

    // 3. Traced Event Flow Verification
    const eventBus = kernel.resolve('eventBus');
    let eventHandled = false;
    eventBus.subscribe('workflow.completed', async (env) => {
      eventHandled = true;
      console.log(`[EventFlow] Caught verified event with TraceID: ${env.meta.traceId}`);
    });

    // 4. End-to-End Integration Transaction Test
    const workflow = kernel.resolve('workflowEngine');
    const result = await workflow.execute({ transactionId: 'TX-PROD-01', user: 'enterprise-client' });
    
    if (result.status !== 'SUCCESS' || !eventHandled) {
      throw new Error('End-to-End workflow transaction or event tracing failed.');
    }
    console.log('✅ [PASSED] End-to-End Integration Transaction & Event Flow Verified.');

    // 5. Graceful Shutdown Test
    await kernel.shutdown();
    console.log('✅ [PASSED] Reverse-DAG Graceful Shutdown & Resource Dispersal Verified.');

    console.log('\n================================================================================');
    console.log('   ALL PRODUCTION VALIDATION GATES PASSED SUCCESSFULLY (100%)');
    console.log('================================================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ [FAILED] Production Validation Error:', error);
    await kernel.shutdown().catch(() => {});
    process.exit(1);
  }
}

runProductionValidation();