import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { ProcartaPlugin } from '../plugins/ProcartaPlugin.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

console.log('================================================================================');
console.log('   ADE-APEX PROCARTA PLUGIN INTEGRATION TEST');
console.log('================================================================================');

async function run() {
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const procarta = new ProcartaPlugin();
  await procarta.boot(kernel);

  console.log('✅ Plugin Health:', procarta.getHealth());

  const event = new KernelEvent({
    source: 'api-gateway',
    action: 'PROCARTA_TRIGGER_WORKFLOW',
    payload: { workflowId: 'WF-DOC-PARSE-001' }
  });

  const eventBus = kernel.getBus ? kernel.getBus() : kernel.subsystems.get('eventBus');
  const publishFn = eventBus.publish ? eventBus.publish.bind(eventBus) : eventBus.emit ? eventBus.emit.bind(eventBus) : null;
  
  if (publishFn) {
    await publishFn('PROCARTA_TRIGGER_WORKFLOW', event);
  }

  await procarta.shutdown();
  await kernel.shutdown();
  console.log('================================================================================');
}

run().catch(err => {
  console.error('❌ Procarta integration test failed:', err);
  process.exit(1);
});
