export default class OfflineQueueEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.queue = [];
    }

    async enqueue(task) {
        const item = { taskId: `task_${Date.now()}`, task, timestamp: Date.now() };
        this.queue.push(item);

        if (this.bus) {
            await this.bus.publish("queue.enqueued", item).catch(err => console.error('[EventBus Async Error]', err));
        }

        return item;
    }

    async flush() {
        const count = this.queue.length;
        const flushedItems = [...this.queue];
        this.queue = [];

        if (this.bus) {
            await this.await bus.publish("queue.flushed", { count, timestamp: Date.now() });
        }

        return flushedItems;
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