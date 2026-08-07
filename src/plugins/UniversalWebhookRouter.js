import { BasePlugin } from '../kernel/contracts/BasePlugin.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

export class UniversalWebhookRouter extends BasePlugin {
  constructor() {
    super('UniversalWebhookRouter', '1.0.0');
  }

  async boot(kernel) {
    await super.boot(kernel);
    console.log('[UniversalWebhookRouter] Webhook ingest endpoints active.');
  }

  ingest(source, type, data) {
    const event = new KernelEvent({
      source: source || 'WEBHOOK_GATEWAY',
      action: type || 'EVENT',
      payload: data
    });
    if (this.kernel && this.kernel.subsystems.get('eventBus')) {
      this.kernel.subsystems.get('eventBus').publish('AGGREGATOR_SIGNAL_RECEIVED', event);
    }
    return event;
  }
}
