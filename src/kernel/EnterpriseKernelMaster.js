import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EnterpriseKernelMaster extends EventEmitter {
  constructor() {
    super();
    this.plugins = new Map();
    this.isBooted = false;
  }

  static getInstance() {
    if (!global.__kernelInstance) {
      global.__kernelInstance = new EnterpriseKernelMaster();
    }
    return global.__kernelInstance;
  }

  async boot() {
    if (this.isBooted) return;
    console.log("[KERNEL KINEMATICS] Initializing Dynamic Self-Evolving Kernel...");
    
    await this.autoDiscoverPlugins();
    this.isBooted = true;
    this.emit("KERNEL_BOOT_COMPLETE", { timestamp: new Date().toISOString() });
  }

  async autoDiscoverPlugins() {
    const pluginsDir = path.resolve(__dirname, "../plugins");
    if (!fs.existsSync(pluginsDir)) return;

    const files = fs.readdirSync(pluginsDir);
    for (const file of files) {
      if (file.endsWith(".js") || file.endsWith(".plugin.js")) {
        try {
          const pluginPath = path.join(pluginsDir, file);
          const fileUrl = "file://" + pluginPath.replace(/\\/g, "/");
          const pluginModule = await import(fileUrl);
          const PluginClass = pluginModule.default || Object.values(pluginModule)[0];

          if (typeof PluginClass === "function") {
            const instance = new PluginClass();
            const id = instance.id || instance.name || file.replace(/\.js$/, "");
            this.plugins.set(id, instance);
            
            if (typeof instance.initialize === "function") {
              await instance.initialize(this);
            }
            console.log(`[AUTO-EVOLVE] Successfully registered and wired plugin: ${id}`);
          }
        } catch (e) {
          console.warn(`[AUTO-EVOLVE NOTICE] Dynamic registration bypassed for ${file}:`, e.message);
        }
      }
    }
  }

  dispatchIntent(action, payload) {
    const event = { action, payload, timestamp: new Date().toISOString() };
    this.emit("INTENT_DISPATCHED", event);
    this.emit(action, payload);
    return true;
  }
}

export default EnterpriseKernelMaster;
