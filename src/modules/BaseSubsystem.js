// Example module standard: src/modules/BaseSubsystem.js
export class BaseSubsystem {
  constructor(name) {
    this.name = name;
    this.isReady = false;
  }

  async boot(kernelContext) {
    // Initialization logic
  }

  async ready() {
    this.isReady = true;
  }

  async shutdown() {
    this.isReady = false;
  }

  async dispose() {
    // Cleanup event listeners and connections
  }
}