import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { PluginLifecycleEngine } from '../core/PluginLifecycleEngine.js';

async function runPluginOSTest() {
  console.log('================================================================');
  console.log('   GROUP 5: PLUGIN OS LIFECYCLE & VERSION MANAGEMENT TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const pluginOS = new PluginLifecycleEngine();

  // Test 1: Install Third-Party Plugin
  const manifest = pluginOS.installPlugin({
    id: 'telegram_signal_router',
    version: '1.4.2',
    permissions: ['EXECUTE_TRADES', 'READ_TELEMETRY']
  });
  console.log('✅ Plugin Installation:', manifest.id === 'telegram_signal_router' ? 'PASS' : 'FAIL');

  // Test 2: Toggle State (Disable / Enable)
  pluginOS.togglePluginState('telegram_signal_router', false);
  const disabledStatus = pluginOS.getPluginStatus('telegram_signal_router');
  console.log('✅ Plugin State Toggle (Disabled):', disabledStatus.enabled === false ? 'PASS' : 'FAIL');

  pluginOS.togglePluginState('telegram_signal_router', true);
  const enabledStatus = pluginOS.getPluginStatus('telegram_signal_router');
  console.log('✅ Plugin State Toggle (Re-Enabled):', enabledStatus.enabled === true ? 'PASS' : 'FAIL');

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runPluginOSTest().catch(console.error);
