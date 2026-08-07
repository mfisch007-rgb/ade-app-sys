import { BasePlugin } from '../kernel/contracts/BasePlugin.js';

export class UniversalAggregatorPlugin extends BasePlugin {
  constructor() {
    super('UniversalAggregatorPlugin', '1.0.0');
    this.aggregatedEvents = [];
  }

  async boot(kernel) {
    await super.boot(kernel);
    const eventBus = this.kernel.getBus ? this.kernel.getBus() : this.kernel.subsystems?.get('eventBus');
    if (eventBus) {
      const subscribeFn = eventBus.subscribe ? eventBus.subscribe.bind(eventBus) : eventBus.on ? eventBus.on.bind(eventBus) : null;
      if (subscribeFn) {
        subscribeFn('AGGREGATOR_SIGNAL_RECEIVED', (event) => this.handleAggregatorSignal(event));
        console.log('[UniversalAggregatorPlugin] Listening for external aggregator signals.');
      }
    }
  }

  handleAggregatorSignal(event) {
    this.aggregatedEvents.push({
      source: event.source || 'EXTERNAL_AGGREGATOR',
      payload: event.payload,
      timestamp: event.timestamp || new Date().toISOString()
    });
    console.log(`[UniversalAggregatorPlugin] Aggregated signal from ${event.source || 'EXTERNAL'}`);
  }

  async shutdown() {
    this.aggregatedEvents = [];
    await super.shutdown();
    console.log('[UniversalAggregatorPlugin] Aggregator buffer cleared and shut down.');
  }
}
