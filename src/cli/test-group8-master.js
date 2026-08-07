import { EnterpriseMasterOrchestrator } from '../core/EnterpriseMasterOrchestrator.js';

async function runMasterTest() {
  console.log('================================================================');
  console.log('   GROUP 8: ENTERPRISE MASTER ORCHESTRATOR END-TO-END TEST');
  console.log('================================================================');

  const orchestrator = new EnterpriseMasterOrchestrator();
  await orchestrator.bootEcosystem();

  // Test End-to-End Flow: Cloud Webhook -> Strategy -> Execution -> Event Dispatch
  const result = await orchestrator.processIncomingWebhookSignal({
    asset: 'EUR/USD-OTC',
    action: 'BUY',
    zScore: 3.45,
    source: 'PRODUCTION_WEBHOOK'
  });

  console.log('✅ E2E Master Signal Execution:', result.status === 'EXECUTED' ? 'PASS' : 'FAIL');
  console.log('   Broker Order ID:', result.execution ? result.execution.orderId : 'N/A');

  await orchestrator.shutdownEcosystem();
  console.log('================================================================');
  process.exit(0);
}

runMasterTest().catch(console.error);
