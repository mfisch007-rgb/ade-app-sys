// src/core/DIContainer.js

export class DIContainer {
  constructor() {
    this.factories = new Map();
    this.instances = new Map();
  }

  /**
   * Register a raw value / instantiated service directly into the container.
   */
  registerValue(key, value) {
    if (!key) throw new Error('[DIContainer] Dependency key is required.');
    this.instances.set(key, value);
    return this;
  }

  /**
   * Register a factory function that resolves dependencies dynamically.
   */
  registerFactory(key, factoryFn, scope = ['default']) {
    if (!key) throw new Error('[DIContainer] Dependency key is required.');
    if (typeof factoryFn !== 'function') {
      throw new Error(`[DIContainer] Factory for '${key}' must be a function.`);
    }
    this.factories.set(key, { factoryFn, scope });
    return this;
  }

  /**
   * Generic registration method (handles values or factory functions).
   */
  register(key, val) {
    if (typeof val === 'function') {
      return this.registerFactory(key, val);
    }
    return this.registerValue(key, val);
  }

  /**
   * Resolve a registered dependency by key.
   */
  resolve(key) {
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.factories.has(key)) {
      const { factoryFn } = this.factories.get(key);
      const instance = factoryFn(this);
      // Cache resolved instance
      this.instances.set(key, instance);
      return instance;
    }

    throw new Error(`[DIContainer] Unregistered dependency key: '${key}'`);
  }

  has(key) {
    return this.instances.has(key) || this.factories.has(key);
  }

  clear() {
    this.instances.clear();
    this.factories.clear();
  }
}