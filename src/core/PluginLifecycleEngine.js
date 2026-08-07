export class PluginLifecycleEngine {
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
    console.log(`[PluginOS] Installed plugin '${manifest.id}' (v${manifest.version})`);
    return manifest;
  }

  togglePluginState(pluginId, enable) {
    const plugin = this.installedPlugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found.`);

    plugin.enabled = enable;
    this.installedPlugins.set(pluginId, plugin);
    console.log(`[PluginOS] Plugin '${pluginId}' state set to: ${enable ? 'ENABLED' : 'DISABLED'}`);
    return plugin;
  }

  getPluginStatus(pluginId) {
    return this.installedPlugins.get(pluginId) || null;
  }
}
