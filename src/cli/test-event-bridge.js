import http from 'http';
import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';

async function main() {
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();
  console.log('✅ Kernel dry boot verified for EventBus SSE Bridge.');
  await kernel.shutdown();
}
main().catch(console.error);
