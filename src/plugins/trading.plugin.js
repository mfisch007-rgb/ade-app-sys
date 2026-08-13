import { PluginSandbox } from './PluginSandbox.js';

export function createTradingPlugin(kernelEventBus) {
  const sandbox = new PluginSandbox('TRADING_SIGNAL', kernelEventBus);

  return {
    name: 'TRADING_SIGNAL',
    category: 'Execution Engine',
    description: 'Signal processing, Z-Score verification, and automated order placement',
    executeSignal: async (payload) => {
      return sandbox.executeInSandbox((data) => {
        const { asset = 'EUR/USD', zScore = 2.1, direction = 'CALL' } = data;
        return {
          asset,
          zScore,
          direction,
          signalValid: zScore >= 2.0,
          orderStatus: zScore >= 2.0 ? 'PLACED' : 'REJECTED_LOW_CONFIDENCE',
          executionTimestamp: new Date().toISOString()
        };
      }, payload);
    }
  };
}
