// src/core/BaseLifecycleModule.js

import { EventEmitter } from 'events';

export class BaseLifecycleModule extends EventEmitter {
  constructor({ id, eventBus, logger, config } = {}) {
    super();
    if (!id) throw new Error('[BaseLifecycleModule] Module ID is required');
    this.id = id;
    this.eventBus = eventBus;
    this.logger = logger || console;
    this.config = config || {};
    this.state = 'UNINITIALIZED';

    this._activeTimers = new Set();
    this._activeListeners = new Set();
  }

  async boot() {
    this._assertState('UNINITIALIZED');
    this.state = 'BOOTING';
    this.logger.info(`[${this.id}] Booting module...`);
    await this.onBoot();
  }

  async ready() {
    this._assertState('BOOTING');
    this.state = 'READY';
    this.logger.info(`[${this.id}] Module ready for execution.`);
    await this.onReady();
  }

  async shutdown() {
    if (this.state === 'SHUTTING_DOWN' || this.state === 'DISPOSED') return;
    this.state = 'SHUTTING_DOWN';
    this.logger.info(`[${this.id}] Shutting down module...`);
    
    await this.onShutdown();
    this.dispose();
  }

  dispose() {
    if (this.state === 'DISPOSED') return;
    this.state = 'DISPOSED';
    
    for (const timer of this._activeTimers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this._activeTimers.clear();

    for (const listenerCleanup of this._activeListeners) {
      if (typeof listenerCleanup === 'function') {
        listenerCleanup();
      }
    }
    this._activeListeners.clear();

    if (this.eventBus && typeof this.eventBus.unsubscribeModule === 'function') {
      this.eventBus.unsubscribeModule(this.id);
    }

    this.removeAllListeners();
    this.logger.info(`[${this.id}] Resources fully disposed.`);
  }

  registerInterval(fn, ms) {
    const timer = setInterval(fn, ms);
    this._activeTimers.add(timer);
    return timer;
  }

  clearIntervalTracked(timer) {
    clearInterval(timer);
    this._activeTimers.delete(timer);
  }

  async onBoot() {}
  async onReady() {}
  async onShutdown() {}

  _assertState(expected) {
    if (this.state !== expected) {
      throw new Error(`[${this.id}] Invalid lifecycle transition. Expected ${expected}, got ${this.state}`);
    }
  }
}