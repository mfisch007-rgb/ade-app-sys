export class PluginRegistry {
  constructor(kernel) {
    this.kernel = kernel;
    this.plugins = new Map();
  }

  register(plugin) {
    if (!plugin || !plugin.name) {
      throw new Error('[PluginRegistry] Plugin must have a valid name.');
    }
    this.plugins.set(plugin.name, plugin);
    console.log(`[PluginRegistry] Plugin '${plugin.name}' registered.`);
  }

  async bootAll() {
    for (const [name, plugin] of this.plugins.entries()) {
      if (typeof plugin.boot === 'function') {
        await plugin.boot(this.kernel);
        console.log(`[PluginRegistry] Plugin '${name}' booted successfully.`);
      }
    }
  }

  async shutdownAll() {
    for (const [name, plugin] of this.plugins.entries()) {
      if (typeof plugin.shutdown === 'function') {
        await plugin.shutdown();
        console.log(`[PluginRegistry] Plugin '${name}' shut down cleanly.`);
      }
    }
  }

  getHealth() {
    const health = {};
    for (const [name, plugin] of this.plugins.entries()) {
      health[name] = typeof plugin.getHealth === 'function' ? plugin.getHealth() : { status: 'UNKNOWN' };
    }
    return health;
  }
}
