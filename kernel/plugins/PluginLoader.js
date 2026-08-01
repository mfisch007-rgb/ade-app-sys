// ADE Plugin Loader Engine
const PluginRegistry = require("./PluginRegistry");
class PluginLoader {
  constructor() { this.registry = new PluginRegistry(); }
  load(pluginModule) {
    if (!pluginModule.name || !pluginModule.version) throw new Error("[ADE KERNEL] Invalid Plugin Contract");
    this.registry.register(pluginModule.name, pluginModule);
    return true;
  }
}
module.exports = PluginLoader;
