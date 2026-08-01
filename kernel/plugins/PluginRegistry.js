// ADE Plugin Registry
class PluginRegistry {
  constructor() { this.plugins = new Map(); }
  register(id, plugin) { this.plugins.set(id, { instance: plugin, state: "REGISTERED" }); }
  get(id) { return this.plugins.get(id); }
}
module.exports = PluginRegistry;
