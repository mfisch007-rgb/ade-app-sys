import { DIContainer } from './DIContainer.js';

export class KernelLoader {
  constructor({ logger = console, observatory = null } = {}) {
    this.logger = logger;
    this.observatory = observatory;
    this.container = new DIContainer();
    this.modules = new Map();
    this.bootOrder = [];
    this.isBooted = false;
  }

  registerModule(id, ModuleClass, dependencies = [], profileScope = ['default']) {
    this.container.registerFactory(id, (c) => {
      const injectedDeps = { id };
      for (const depKey of dependencies) {
        injectedDeps[depKey] = c.resolve(depKey);
      }
      return new ModuleClass(injectedDeps);
    }, profileScope);

    this.modules.set(id, { ModuleClass, dependencies, profileScope });
  }

  async bootProfile(activeProfile = 'default') {
    this.logger.info(`[KernelLoader] Initializing runtime kernel profile: [${activeProfile}]`);

    // 1. Resolve active DAG nodes for the profile
    const activeModuleIds = Array.from(this.modules.entries())
      .filter(([_, meta]) => meta.profileScope.includes('*') || meta.profileScope.includes(activeProfile))
      .map(([id]) => id);

    // 2. Resolve Topological Sort (Boot DAG)
    this.bootOrder = this._topologicalSort(activeModuleIds);
    this.logger.info(`[KernelLoader] Resolved Boot DAG Order: ${this.bootOrder.join(' -> ')}`);

    // 3. Sequential Deterministic Boot
    for (const moduleId of this.bootOrder) {
      const instance = this.container.resolve(moduleId);
      
      if (this.observatory) {
        this.observatory.recordLifecycleTransition(moduleId, 'BOOTING');
      }

      await instance.boot();
      
      if (this.observatory) {
        this.observatory.recordLifecycleTransition(moduleId, 'READY');
      }
    }

    // 4. Mark all as ready
    for (const moduleId of this.bootOrder) {
      const instance = this.container.resolve(moduleId);
      await instance.ready();
    }

    this.isBooted = true;
    this.logger.info(`[KernelLoader] Core Kernel boot sequence completed successfully.`);
  }

  async shutdown() {
    this.logger.info(`[KernelLoader] Initiating reverse-DAG graceful kernel shutdown...`);
    
    // Shutdown in reverse order of boot dependencies
    const shutdownOrder = [...this.bootOrder].reverse();

    for (const moduleId of shutdownOrder) {
      try {
        const instance = this.container.resolve(moduleId);
        if (this.observatory) {
          this.observatory.recordLifecycleTransition(moduleId, 'SHUTTING_DOWN');
        }
        await instance.shutdown();
        if (this.observatory) {
          this.observatory.recordLifecycleTransition(moduleId, 'DISPOSED');
        }
      } catch (err) {
        this.logger.error(`[KernelLoader] Error shutting down module ${moduleId}:`, err);
      }
    }

    this.isBooted = false;
    this.logger.info(`[KernelLoader] All platform runtime services gracefully stopped.`);
  }

  _topologicalSort(activeIds) {
    const visited = new Set();
    const visiting = new Set();
    const sorted = [];

    const visit = (id) => {
      if (visiting.has(id)) {
        throw new Error(`[KernelLoader] Circular dependency detected in Boot DAG at module: ${id}`);
      }
      if (!visited.has(id)) {
        visiting.add(id);
        const meta = this.modules.get(id);
        if (meta) {
          for (const dep of meta.dependencies) {
            if (activeIds.includes(dep)) {
              visit(dep);
            }
          }
        }
        visiting.delete(id);
        visited.add(id);
        sorted.push(id);
      }
    };

    for (const id of activeIds) {
      visit(id);
    }

    return sorted;
  }
}