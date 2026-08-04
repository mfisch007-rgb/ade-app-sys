export default class StorageEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.virtualFS = new Map();
    }

    async write(filePath, content) {
        this.virtualFS.set(filePath, content);

        if (this.bus) {
            await this.await bus.publish("storage.written", { path: filePath, sizeBytes: Buffer.byteLength(content || ""), timestamp: Date.now() });
        }

        return true;
    }

  async boot() {
    this.status = 'booting';
    if (typeof this.init === 'function') await this.init();
    this.status = 'booted';
  }

  async ready() {
    this.status = 'ready';
  }

  async shutdown() {
    this.status = 'shutting_down';
  }

  async dispose() {
    this.status = 'disposed';
  }
}