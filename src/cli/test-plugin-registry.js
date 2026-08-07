import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { PluginRegistry } from '../kernel/PluginRegistry.js';
import { ProcartaPlugin } from '../plugins/ProcartaPlugin.js';

console.log('================================================================================');
console.log('   ADE-APEX PLUGIN REGISTRY LIFECYCLE TEST');
console.log('================================================================================');

async function run() {
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const registry = new PluginRegistry(kernel);
  const procarta = new ProcartaPlugin();

  registry.register(procarta);
  await registry.bootAll();

  console.log('✅ Registry Health Report:', registry.getHealth());

  await registry.shutdownAll();
  await kernel.shutdown();
  console.log('================================================================================');
}

run().catch(err => {
  console.error('❌ Registry test failed:', err);
  process.exit(1);
});
