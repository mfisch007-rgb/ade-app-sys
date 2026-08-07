import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

async function main() {
  console.log('================================================================================');
  console.log('   ADE-APEX E2E FULL ECOSYSTEM VALIDATION');
  console.log('================================================================================');
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();
  console.log('\n📊 Active Plugin Registry Status:');
  console.log(JSON.stringify(kernel.pluginRegistry.getHealth(), null, 2));
  await kernel.shutdown();
  console.log('================================================================================');
}
main().catch(err => { console.error('❌ E2E Failed:', err); process.exit(1); });
