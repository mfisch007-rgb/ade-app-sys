import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { TradingCoreEngine } from '../core/TradingCoreEngine.js';

async function runTradingCoreTest() {
  console.log('================================================================');
  console.log('   GROUP 3: MODULAR TRADING CORE & SIMULATION LAYER TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const tradingEngine = new TradingCoreEngine({ initialBalance: 10000.00 });

  // Test 1: Historical Replay Mode
  tradingEngine.setSimulationTier('HISTORICAL_REPLAY');
  const replayRes = await tradingEngine.processSignal({ asset: 'EUR/USD-OTC', direction: 'CALL', zScore: 2.8, riskPercent: 2.0 });
  console.log('✅ Replay Trade Executed:', replayRes.result.simulatedOutcome === 'WIN' ? 'PASS' : 'FAIL');

  // Test 2: Paper Trading Simulation Mode
  tradingEngine.setSimulationTier('PAPER_TRADING');
  const paperRes = await tradingEngine.processSignal({ asset: 'GBP/USD-OTC', direction: 'PUT', zScore: 2.4, riskPercent: 1.5 });
  console.log('✅ Paper Trade Balance Update:', parseFloat(paperRes.result.newBalance) !== 10000.00 ? 'PASS' : 'FAIL');
  console.log('   Paper Account Balance:', `$${paperRes.result.newBalance}`);

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runTradingCoreTest().catch(console.error);
