import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { UniversalEventBus } from './UniversalEventBus.js';
import { PluginLifecycleEngine } from './PluginLifecycleEngine.js';
import { StrategyMarketplace, GenericForexAdapter } from './BrokerAdapterEngine.js';
import { CloudSignalPipelineEngine } from './CloudSignalPipelineEngine.js';

export class EnterpriseMasterOrchestrator {
  constructor() {
    this.kernel = new EnterpriseKernelMaster();
    this.eventBus = new UniversalEventBus();
    this.pluginOS = new PluginLifecycleEngine();
    this.marketplace = new StrategyMarketplace();
    this.brokerAdapter = new GenericForexAdapter();
    this.cloudPipeline = new CloudSignalPipelineEngine();
  }

  async bootEcosystem() {
    console.log('[MasterOrchestrator] Starting unified ecosystem deployment sequence...');
    await this.kernel.boot();
    await this.brokerAdapter.connect();
    console.log('[MasterOrchestrator] All sub-engines connected and bound to Event Bus.');
    return { status: 'ONLINE', timestamp: Date.now() };
  }

  async processIncomingWebhookSignal(payload) {
    const pipelineRes = await this.cloudPipeline.processCloudSignal(payload);
    if (pipelineRes.status !== 'ACCEPTED') return pipelineRes;

    const stratRes = this.marketplace.evaluate('Z_SCORE_ANOMALY', { zScore: pipelineRes.signal.zScore });
    
    if (stratRes.trigger) {
      const execRes = await this.brokerAdapter.executeOrder({
        asset: pipelineRes.signal.asset,
        amount: 100,
        action: pipelineRes.signal.action
      });

      await this.eventBus.publish('trade:executed', execRes);
      return { status: 'EXECUTED', execution: execRes };
    }

    return { status: 'HOLD', reason: 'Strategy trigger threshold not met' };
  }

  async shutdownEcosystem() {
    await this.kernel.shutdown();
    console.log('[MasterOrchestrator] Ecosystem cleanly shutdown.');
  }
}
