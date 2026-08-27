/**
 * ADE-APEX KernelLoader
 *
 * Boot-DAG compatibility/runtime loader.
 *
 * The loader manages modular lifecycle.
 * It does NOT become another EnterpriseKernelMaster.
 */

import { DIContainer } from "./DIContainer.js";

export class KernelLoader {

  constructor({
    logger = console,
    observatory = null,
    container = null
  } = {}) {

    this.logger = logger;
    this.observatory = observatory;

    this.container =
      container ||
      new DIContainer();

    this.modules = new Map();
    this.bootOrder = [];
    this.isBooted = false;
    this.activeProfile = null;
  }

  registerModule(
    id,
    ModuleClass,
    dependencies = [],
    profileScope = ["default"]
  ) {

    if (!id) {
      throw new Error("[KernelLoader] Module id is required.");
    }

    if (typeof ModuleClass !== "function") {
      throw new Error(
        `[KernelLoader] Module '${id}' must be constructible.`
      );
    }

    this.container.registerFactory(
      id,
      (c) => {

        const injectedDeps = {
          id
        };

        for (const depKey of dependencies) {
          injectedDeps[depKey] =
            c.resolve(depKey);
        }

        return new ModuleClass(injectedDeps);
      },
      profileScope
    );

    this.modules.set(
      id,
      {
        ModuleClass,
        dependencies: [...dependencies],
        profileScope: [...profileScope]
      }
    );

    return this;
  }

  resolve(id) {
    return this.container.resolve(id);
  }

  has(id) {
    return this.container.has(id);
  }

  async bootProfile(activeProfile = "default") {

    if (this.isBooted) {
      return {
        status: "ALREADY_RUNNING",
        profile: this.activeProfile,
        bootOrder: this.bootOrder
      };
    }

    this.activeProfile = activeProfile;

    this.logger.info(
      `[KernelLoader] Initializing runtime profile: [${activeProfile}]`
    );

    const activeModuleIds =
      Array.from(this.modules.entries())
        .filter(([_, meta]) =>
          meta.profileScope.includes("*") ||
          meta.profileScope.includes(activeProfile)
        )
        .map(([id]) => id);

    this.bootOrder =
      this._topologicalSort(activeModuleIds);

    this.logger.info(
      `[KernelLoader] Boot DAG: ${this.bootOrder.join(" -> ")}`
    );

    for (const moduleId of this.bootOrder) {

      const instance =
        this.container.resolve(moduleId);

      this.observatory?.recordLifecycleTransition?.(
        moduleId,
        "BOOTING"
      );

      if (typeof instance.boot === "function") {
        await instance.boot();
      } else if (typeof instance.initialize === "function") {
        await instance.initialize();
      }

      this.observatory?.recordLifecycleTransition?.(
        moduleId,
        "READY"
      );
    }

    for (const moduleId of this.bootOrder) {

      const instance =
        this.container.resolve(moduleId);

      if (typeof instance.ready === "function") {
        await instance.ready();
      }
    }

    this.isBooted = true;

    this.logger.info(
      "[KernelLoader] Runtime profile boot completed successfully."
    );

    return {
      status: "ONLINE",
      profile: activeProfile,
      bootOrder: [...this.bootOrder]
    };
  }

  async shutdown() {

    if (!this.isBooted) {
      return {
        status: "ALREADY_OFFLINE"
      };
    }

    this.logger.info(
      "[KernelLoader] Initiating reverse-DAG shutdown..."
    );

    const shutdownOrder =
      [...this.bootOrder].reverse();

    for (const moduleId of shutdownOrder) {

      try {

        const instance =
          this.container.resolve(moduleId);

        this.observatory?.recordLifecycleTransition?.(
          moduleId,
          "SHUTTING_DOWN"
        );

        if (typeof instance.shutdown === "function") {
          await instance.shutdown();
        } else if (typeof instance.dispose === "function") {
          await instance.dispose();
        }

        this.observatory?.recordLifecycleTransition?.(
          moduleId,
          "DISPOSED"
        );

      } catch (error) {

        this.logger.error(
          `[KernelLoader] Error shutting down module ${moduleId}:`,
          error
        );
      }
    }

    this.isBooted = false;

    this.logger.info(
      "[KernelLoader] All modular runtime services stopped."
    );

    return {
      status: "OFFLINE"
    };
  }

  _topologicalSort(activeIds) {

    const visited = new Set();
    const visiting = new Set();
    const sorted = [];

    const visit = (id) => {

      if (visiting.has(id)) {
        throw new Error(
          `[KernelLoader] Circular dependency detected at module: ${id}`
        );
      }

      if (visited.has(id)) {
        return;
      }

      visiting.add(id);

      const meta =
        this.modules.get(id);

      if (!meta) {
        throw new Error(
          `[KernelLoader] Module '${id}' is not registered.`
        );
      }

      for (const dep of meta.dependencies) {

        if (!activeIds.includes(dep)) {
          throw new Error(
            `[KernelLoader] Module '${id}' depends on inactive module '${dep}'.`
          );
        }

        visit(dep);
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of activeIds) {
      visit(id);
    }

    return sorted;
  }
}

export default KernelLoader;
