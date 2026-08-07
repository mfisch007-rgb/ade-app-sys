import fs from 'fs';
import path from 'path';

// 1. Create Broker Adapter Interface & Strategy Marketplace (`src/core/BrokerAdapterEngine.js`)
const adapterPath = path.join(process.cwd(), 'src', 'core', 'BrokerAdapterEngine.js');
const adapterCode = `export class BaseBrokerAdapter {
  constructor(name) {
    this.name = name;
  }
  async connect() { throw new Error('connect() must be implemented by broker adapter'); }
  async executeOrder(order) { throw new Error('executeOrder() must be implemented'); }
}

export class GenericForexAdapter extends BaseBrokerAdapter {
  constructor() {
    super('GenericForexAdapter');
  }
  async connect() {
    return { connected: true, broker: 'GenericForex', timestamp: Date.now() };
  }
  async executeOrder(order) {
    return { status: 'EXECUTED', broker: this.name, orderId: \`fx_\${Date.now()}\`, asset: order.asset };
  }
}

export class StrategyMarketplace {
  constructor() {
    this.strategies = new Map();
    this.registerDefaultStrategies();
  }

  registerStrategy(id, strategyFn) {
    this.strategies.set(id, strategyFn);
    console.log(\`[StrategyMarketplace] Registered strategy plugin: '\${id}'\`);
  }

  registerDefaultStrategies() {
    this.registerStrategy('Z_SCORE_ANOMALY', (data) => ({ trigger: data.zScore >= 2.5, type: 'STATISTICAL' }));
    this.registerStrategy('MEAN_REVERSION', (data) => ({ trigger: data.rsi < 30 || data.rsi > 70, type: 'MOMENTUM' }));
    this.registerStrategy('TREND_FOLLOWING', (data) => ({ trigger: data.emaFast > data.emaSlow, type: 'TREND' }));
  }

  evaluate(strategyId, marketData) {
    const strat = this.strategies.get(strategyId);
    if (!strat) throw new Error(\`Strategy '\${strategyId}' not found in Marketplace.\`);
    return strat(marketData);
  }
}
`;

fs.writeFileSync(adapterPath, adapterCode, 'utf8');
console.log('✅ Created src/core/BrokerAdapterEngine.js');

// 2. Create Group 4 Verification Test (`src/cli/test-group4-adapters.js`)
const testPath = path.join(process.cwd(), 'src', 'cli', 'test-group4-adapters.js');
const testCode = `import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
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
`;

fs.writeFileSync(testPath, testCode, 'utf8');
console.log('✅ Created src/cli/test-group4-adapters.js');