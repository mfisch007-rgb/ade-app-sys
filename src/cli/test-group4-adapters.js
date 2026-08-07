import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { GenericForexAdapter, StrategyMarketplace } from '../core/BrokerAdapterEngine.js';

async function runAdapterTest() {
  console.log('================================================================');
  console.log('   GROUP 4: BROKER ADAPTER INTERFACE & STRATEGY MARKETPLACE TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  // Test Strategy Marketplace
  const marketplace = new StrategyMarketplace();
  const evalResult = marketplace.evaluate('Z_SCORE_ANOMALY', { zScore: 2.85 });
  console.log('✅ Strategy Marketplace Evaluation:', evalResult.trigger ? 'PASS' : 'FAIL');

  // Test Decoupled Broker Adapter
  const adapter = new GenericForexAdapter();
  const conn = await adapter.connect();
  const exec = await adapter.executeOrder({ asset: 'EUR/USD', amount: 100 });
  console.log('✅ Broker Adapter Connection & Order Execution:', conn.connected && exec.status === 'EXECUTED' ? 'PASS' : 'FAIL');

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runAdapterTest().catch(console.error);
