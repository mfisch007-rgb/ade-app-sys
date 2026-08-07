import fs from 'fs';
import path from 'path';

// 1. Create Plugin OS Engine Core (`src/core/PluginLifecycleEngine.js`)
const pluginEnginePath = path.join(process.cwd(), 'src', 'core', 'PluginLifecycleEngine.js');
const pluginEngineCode = `export class PluginLifecycleEngine {
  constructor() {
    this.name = 'PluginLifecycleEngine';
    this.version = '1.0.0';
    this.installedPlugins = new Map();
  }

  installPlugin(pluginMeta) {
    if (!pluginMeta.id || !pluginMeta.version) {
      throw new Error('Plugin meta must contain an id and version.');
    }

    const manifest = {
      id: pluginMeta.id,
      version: pluginMeta.version,
      enabled: pluginMeta.enabled ?? true,
      permissions: pluginMeta.permissions || ['READ'],
      installedAt: Date.now()
    };

    this.installedPlugins.set(pluginMeta.id, manifest);
    console.log(\`[PluginOS] Installed plugin '\${manifest.id}' (v\${manifest.version})\`);
    return manifest;
  }

  togglePluginState(pluginId, enable) {
    const plugin = this.installedPlugins.get(pluginId);
    if (!plugin) throw new Error(\`Plugin '\${pluginId}' not found.\`);

    plugin.enabled = enable;
    this.installedPlugins.set(pluginId, plugin);
    console.log(\`[PluginOS] Plugin '\${pluginId}' state set to: \${enable ? 'ENABLED' : 'DISABLED'}\`);
    return plugin;
  }

  getPluginStatus(pluginId) {
    return this.installedPlugins.get(pluginId) || null;
  }
}
`;

fs.writeFileSync(pluginEnginePath, pluginEngineCode, 'utf8');
console.log('✅ Created src/core/PluginLifecycleEngine.js');

// 2. Create Group 5 Verification Test (`src/cli/test-group5-plugins.js`)
const testPath = path.join(process.cwd(), 'src', 'cli', 'test-group5-plugins.js');
const testCode = `import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
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
`;

fs.writeFileSync(testPath, testCode, 'utf8');
console.log('✅ Created src/cli/test-group5-plugins.js');