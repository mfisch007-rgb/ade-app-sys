/**
 * ADE-APEX Persistent Storage Engine with State Recovery
 */
import fs from 'node:fs';
import path from 'node:path';

export class PersistentStorageEngine {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = new Map();
  }

  async initialize() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.state = new Map(Object.entries(data));
        console.log(`[StorageEngine] Restored ${this.state.size} state keys from disk.`);
      } catch (e) {
        console.warn('[StorageEngine] Failed to parse existing state file, starting fresh.');
      }
    }
  }

  async save(key, value) {
    this.state.set(key, value);
    const obj = Object.fromEntries(this.state);
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf8');
  }

  async reload(key) {
    if (fs.existsSync(this.filePath)) {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.state = new Map(Object.entries(data));
    }
    return this.state.get(key);
  }

  async dispose() {
    // Flush current state
    const obj = Object.fromEntries(this.state);
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf8');
  }
}