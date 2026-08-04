import fs from 'fs';
import path from 'path';

export class KernelLoader {
  constructor(container, logger = console) {
    this.container = container;
    this.logger = logger;
    this.registeredModules = new Map();
  }

  /**
   * Recursively discovers and loads all subsystem modules into the DI container
   */
  async walkAndRegister(baseDir = process.cwd()) {
    const targetDirs = ['src/modules', 'kernel/engine', 'kernel/channel'];
    
    for (const dirRelative of targetDirs) {
      const fullDirPath = path.join(baseDir, dirRelative);
      if (!fs.existsSync(fullDirPath)) continue;

      const files = fs.readdirSync(fullDirPath);
      for (const file of files) {
        if (/\.(js|mjs)$/i.test(file)) {
          const modPath = path.join(fullDirPath, file);
          try {
            const moduleExports = await import(`file://${modPath}`);
            const ClassRef = moduleExports.default || Object.values(moduleExports)[0];
            
            if (typeof ClassRef === 'function') {
              const instanceName = path.basename(file, path.extname(file));
              this.container.register(instanceName, ClassRef);
              this.registeredModules.set(instanceName, modPath);
            }
          } catch (err) {
            this.logger.warn(`[KernelLoader] Could not dynamically load module at ${file}: ${err.message}`);
          }
        }
      }
    }
    return this.registeredModules;
  }

  async bootAll() {
    for (const [name, instance] of this.container.instances) {
      if (typeof instance.boot === 'function') await instance.boot();
      if (typeof instance.ready === 'function') await instance.ready();
    }
  }

  async shutdownAll() {
    for (const [name, instance] of this.container.instances) {
      if (typeof instance.shutdown === 'function') await instance.shutdown();
      if (typeof instance.dispose === 'function') await instance.dispose();
    }
  }
}