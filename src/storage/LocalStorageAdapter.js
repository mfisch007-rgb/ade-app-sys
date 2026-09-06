import fs from "node:fs";
import path from "node:path";
import StorageProvider from "./StorageProvider.js";

export class LocalStorageAdapter extends StorageProvider {
  constructor(filePath = path.resolve(".ade_storage.json")) {
    super();
    this.filePath = filePath;
    this._memoryOnly = false;
    try {
      this.#ensureFile();
    } catch {
      this._memoryOnly = true;
    }
  }

  #ensureFile() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({}, null, 2),
        "utf8"
      );
    }
  }

  #readState() {
    try {
      if (this._memoryOnly) return {};
      return JSON.parse(
        fs.readFileSync(this.filePath, "utf8")
      );
    } catch {
      return {};
    }
  }

  #writeState(state) {
    if (this._memoryOnly) return;
    try {
      const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify(state, null, 2),
        "utf8"
      );
      try {
        fs.renameSync(tmp, this.filePath);
      } catch {
        try {
          if (fs.existsSync(this.filePath)) {
            fs.rmSync(this.filePath, { force: true });
          }
          fs.renameSync(tmp, this.filePath);
        } catch {
          if (fs.existsSync(tmp)) {
            try {
              fs.rmSync(tmp, { force: true });
            } catch {}
          }
          // Durability cannot be achieved — never report silent success.
          throw new Error("STORAGE_WRITE_FAILED");
        }
      }
    } catch {
      // tmp write failed OR finalization failed after cleanup.
      throw new Error("STORAGE_WRITE_FAILED");
    }
  }

  getSync(key, defaultValue = null) {
    const state = this.#readState();

    return Object.prototype.hasOwnProperty.call(state, key)
      ? state[key]
      : defaultValue;
  }

  setSync(key, value) {
    const state = this.#readState();
    state[key] = value;
    this.#writeState(state);
    return value;
  }

  deleteSync(key) {
    const state = this.#readState();
    const existed = Object.prototype.hasOwnProperty.call(state, key);

    if (existed) {
      delete state[key];
      this.#writeState(state);
    }

    return existed;
  }

  listSync(prefix = "") {
    const state = this.#readState();

    return Object.entries(state)
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([key, value]) => ({ key, value }));
  }

  async get(key, defaultValue = null) {
    return this.getSync(key, defaultValue);
  }

  async set(key, value) {
    return this.setSync(key, value);
  }

  async delete(key) {
    return this.deleteSync(key);
  }

  async list(prefix = "") {
    return this.listSync(prefix);
  }

  async append(key, value) {
    const current = this.getSync(key, []);
    const next = Array.isArray(current)
      ? [...current, value]
      : [value];

    this.setSync(key, next);
    return value;
  }

  async transaction(callback) {
    if (typeof callback !== "function") {
      throw new Error("Storage transaction callback is required.");
    }

    const state = this.#readState();

    const tx = {
      get: (key, defaultValue = null) =>
        Object.prototype.hasOwnProperty.call(state, key)
          ? state[key]
          : defaultValue,

      set: (key, value) => {
        state[key] = value;
        return value;
      },

      delete: (key) => {
        const existed = Object.prototype.hasOwnProperty.call(state, key);
        if (existed) delete state[key];
        return existed;
      },

      list: (prefix = "") =>
        Object.entries(state)
          .filter(([key]) => !prefix || key.startsWith(prefix))
          .map(([key, value]) => ({ key, value }))
    };

    const result = await callback(tx);
    this.#writeState(state);

    return result;
  }
}

export default LocalStorageAdapter;
