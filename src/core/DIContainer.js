/**
 * Enterprise Dependency Injection Container (Tier 1)
 * Manages service lifetime graphs, singletons, and dynamic scope injection.
 */
export class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  registerService(name, definition, dependencies = []) {
    this.services.set(name, { definition, dependencies, singleton: false });
  }

  registerSingleton(name, instance) {
    this.singletons.set(name, instance);
  }

  resolve(name) {
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    const service = this.services.get(name);
    if (!service) {
      throw new Error(`[DIContainer] Service '${name}' not registered in dependency graph.`);
    }

    const resolvedDeps = service.dependencies.map(dep => this.resolve(dep));
    const instance = new service.definition(...resolvedDeps);

    if (service.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }
}

export default DIContainer;