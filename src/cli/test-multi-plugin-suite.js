import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { PluginRegistry } from '../kernel/PluginRegistry.js';
import { ProcartaPlugin } from '../plugins/ProcartaPlugin.js';
import { UniversalAggregatorPlugin } from '../plugins/UniversalAggregatorPlugin.js';
import { LeadManagementPlugin } from '../plugins/LeadManagementPlugin.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

console.log('================================================================================');
console.log('   ADE-APEX MULTI-PLUGIN SUITE INTEGRATION TEST');
console.log('================================================================================');

async function run() {
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const registry = new PluginRegistry(kernel);

  const procarta = new ProcartaPlugin();
  const aggregator = new UniversalAggregatorPlugin();
  const leads = new LeadManagementPlugin();

  registry.register(procarta);
  registry.register(aggregator);
  registry.register(leads);

  await registry.bootAll();

  console.log('\n📊 Multi-Plugin Registry Health:');
  console.log(JSON.stringify(registry.getHealth(), null, 2));

  const eventBus = kernel.getBus ? kernel.getBus() : kernel.subsystems.get('eventBus');
  const publishFn = eventBus.publish ? eventBus.publish.bind(eventBus) : eventBus.emit ? eventBus.emit.bind(eventBus) : null;

  if (publishFn) {
    await publishFn('PROCARTA_TRIGGER_WORKFLOW', new KernelEvent({ source: 'procarta-app', action: 'RUN', payload: { workflowId: 'WF-001' } }));
    await publishFn('AGGREGATOR_SIGNAL_RECEIVED', new KernelEvent({ source: 'external-webhook', action: 'INGEST', payload: { market: 'BTC/USD', price: 95000 } }));
    await publishFn('LEAD_INGESTED', new KernelEvent({ source: 'affiliate-funnel', action: 'CONVERT', payload: { leadId: 'LEAD-8892' } }));
  }

  await registry.shutdownAll();
  await kernel.shutdown();
  console.log('================================================================================');
}

run().catch(err => {
  console.error('❌ Multi-plugin test failed:', err);
  process.exit(1);
});
