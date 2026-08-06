import { KernelEvent } from '../kernel/contracts/EventContract.js';
import { BasePlugin } from '../kernel/contracts/BasePlugin.js';

console.log('================================================================================');
console.log('   ADE-APEX CONTRACT & PLUGIN LIFECYCLE TEST');
console.log('================================================================================');

try {
  const event = new KernelEvent({ source: 'test-plugin', action: 'EXECUTE_ACTION', payload: { status: 'ok' } });
  console.log('✅ [PASS] KernelEvent Instantiation:', event.toJSON());

  const plugin = new BasePlugin('MockProcartaPlugin', '1.0.0');
  console.log('✅ [PASS] BasePlugin Initialized:', plugin.getHealth());

  await plugin.boot({ name: 'MockKernel' });
  console.log('✅ [PASS] BasePlugin Booted:', plugin.getHealth());

  await plugin.shutdown();
  console.log('✅ [PASS] BasePlugin Shutdown cleanly:', plugin.getHealth());
  console.log('================================================================================');
} catch (err) {
  console.error('❌ [FAIL] Contract test failed:', err.message);
  process.exit(1);
}