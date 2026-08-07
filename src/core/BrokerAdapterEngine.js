export class BaseBrokerAdapter {
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
    return { status: 'EXECUTED', broker: this.name, orderId: `fx_${Date.now()}`, asset: order.asset };
  }
}

export class StrategyMarketplace {
  constructor() {
    this.strategies = new Map();
    this.registerDefaultStrategies();
  }

  registerStrategy(id, strategyFn) {
    this.strategies.set(id, strategyFn);
    console.log(`[StrategyMarketplace] Registered strategy plugin: '${id}'`);
  }

  registerDefaultStrategies() {
    this.registerStrategy('Z_SCORE_ANOMALY', (data) => ({ trigger: data.zScore >= 2.5, type: 'STATISTICAL' }));
    this.registerStrategy('MEAN_REVERSION', (data) => ({ trigger: data.rsi < 30 || data.rsi > 70, type: 'MOMENTUM' }));
    this.registerStrategy('TREND_FOLLOWING', (data) => ({ trigger: data.emaFast > data.emaSlow, type: 'TREND' }));
  }

  evaluate(strategyId, marketData) {
    const strat = this.strategies.get(strategyId);
    if (!strat) throw new Error(`Strategy '${strategyId}' not found in Marketplace.`);
    return strat(marketData);
  }
}
