import { EventEmitter } from 'events';

export class ClusterCoordinator extends EventEmitter {
  constructor({ nodeId = `node_${Math.random().toString(36).substring(2, 7)}`, logger = console } = {}) {
    super();
    this.nodeId = nodeId;
    this.logger = logger;
    this.isLeader = false;
    this.locks = new Map(); // lockKey -> { owner, expiresAt }
    this.nodes = new Set([this.nodeId]);
  }

  async acquireLock(lockKey, ttlMs = 5000) {
    const now = Date.now();
    const existing = this.locks.get(lockKey);

    if (existing && existing.expiresAt > now) {
      if (existing.owner === this.nodeId) return true; // Reentrant
      return false; // Lock held by another node
    }

    this.locks.set(lockKey, {
      owner: this.nodeId,
      expiresAt: now + ttlMs
    });
    
    this.logger.info(`[ClusterCoordinator] Node [${this.nodeId}] acquired lock: '${lockKey}'`);
    return true;
  }

  async releaseLock(lockKey) {
    const existing = this.locks.get(lockKey);
    if (existing && existing.owner === this.nodeId) {
      this.locks.delete(lockKey);
      this.logger.info(`[ClusterCoordinator] Node [${this.nodeId}] released lock: '${lockKey}'`);
      return true;
    }
    return false;
  }

  electLeader() {
    const sortedNodes = Array.from(this.nodes).sort();
    this.isLeader = sortedNodes[0] === this.nodeId;
    this.logger.info(`[ClusterCoordinator] Node [${this.nodeId}] Leader status: ${this.isLeader}`);
    return this.isLeader;
  }
}