export class BasePlugin {
  constructor(name, version = '1.0.0') {
    this.name = name;
    this.version = version;
    this.status = 'INITIALIZED';
  }

  async boot(kernel) {
    this.kernel = kernel;
    this.status = 'ACTIVE';
  }

  async shutdown() {
    this.status = 'STOPPED';
  }

  getHealth() {
    return {
      name: this.name,
      version: this.version,
      status: this.status
    };
  }
}
