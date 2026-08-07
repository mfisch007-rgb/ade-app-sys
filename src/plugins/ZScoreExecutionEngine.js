import { BasePlugin } from '../kernel/contracts/BasePlugin.js';

export class ZScoreExecutionEngine extends BasePlugin {
  constructor() {
    super('ZScoreExecutionEngine', '1.0.0');
  }

  async boot(kernel) {
    await super.boot(kernel);
    console.log('[ZScoreExecutionEngine] Z-Score statistical calculation engine online.');
  }

  calculateZScore(price, mean, stdDev) {
    if (!stdDev || stdDev === 0) return 0;
    const z = (price - mean) / stdDev;
    return Number(z.toFixed(4));
  }

  evaluateTradeSignal(price, mean, stdDev, threshold = 2.0) {
    const z = this.calculateZScore(price, mean, stdDev);
    if (z >= threshold) return { action: 'SELL_SIGNAL', zScore: z };
    if (z <= -threshold) return { action: 'BUY_SIGNAL', zScore: z };
    return { action: 'NEUTRAL', zScore: z };
  }
}
