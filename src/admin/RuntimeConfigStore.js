import path from "node:path";
import LocalDocumentStorageAdapter
  from "../storage/LocalDocumentStorageAdapter.js";

const DEFAULT_CONFIG = {
  settings: {},
  ui: {},
  channels: {},
  policies: {}
};

export class RuntimeConfigStore {
  constructor(
    file = path.resolve("data/runtime-config/admin.json"),
    storage = null
  ) {
    this.file = file;

    this.storage =
      storage ||
      new LocalDocumentStorageAdapter(
        this.file,
        DEFAULT_CONFIG
      );
  }

  read() {
    return this.storage.readSync(DEFAULT_CONFIG);
  }

  write(section, key, value) {
    this.#assertReadable();
    const data = this.read();
    this.#assertReadable();

    data[section] = data[section] || {};
    data[section][key] = value;

    this.#assertWritable();
    this.storage.writeSync(data);

    return data;
  }

  async writeAsync(section, key, value) {
    const data = await this.#readDocumentStrict();

    data[section] = data[section] || {};
    data[section][key] = value;

    await this.#writeDocument(data);
    return data;
  }

  /**
   * Read an entire top-level section verbatim.
   *
   * Some consumers (e.g. CaseManager) persist a complete collection
   * (cases list) as a section value rather than a key/value pair.
   * This avoids the ambiguity of write(section, key, value) where the
   * collection would otherwise be misinterpreted as a key.
   */
  readSection(section) {
    const data = this.read();
    return data[section];
  }

  // Cross-instance-fresh section read. Refreshes the underlying provider
  // cache where supported (durable mode), then reads. Never throws —
  // callers fall back to the last-known snapshot instead of failing.
  async readSectionAsync(section) {
    try {
      return await this.readSectionStrictAsync(section);
    } catch (_) {
      try {
        return this.readSection(section);
      } catch (_) {
        return undefined;
      }
    }
  }

  async readSectionStrictAsync(section) {
    const storage = this.storage;
    if (storage && typeof storage.refreshStrict === "function") {
      await storage.refreshStrict();
    } else if (storage && typeof storage.refresh === "function") {
      await storage.refresh();
    } else if (storage && typeof storage.read === "function") {
      await storage.read();
    }
    this.#assertReadable();
    const sectionValue = this.readSection(section);
    this.#assertReadable();
    return sectionValue;
  }

  /**
   * Write an entire top-level section value verbatim while preserving
   * every other section. This is the durable collection-write primitive.
   */
  writeSection(section, value) {
    this.#assertReadable();
    const data = this.read();
    this.#assertReadable();
    data[section] = value;
    this.#assertWritable();
    this.storage.writeSync(data);
    return data;
  }

  async writeSectionAsync(section, value) {
    const data = await this.#readDocumentStrict();
    data[section] = value;
    await this.#writeDocument(data);
    return data;
  }

  async #readDocumentStrict() {
    const storage = this.storage;
    if (storage && typeof storage.refreshStrict === "function") {
      await storage.refreshStrict();
    } else if (storage && typeof storage.refresh === "function") {
      await storage.refresh();
    } else if (storage && typeof storage.read === "function") {
      await storage.read();
    }
    this.#assertReadable();
    const data = this.read();
    this.#assertReadable();
    return data;
  }

  async #writeDocument(data) {
    this.#assertWritable();
    if (this.storage && typeof this.storage.write === "function") {
      await this.storage.write(data);
      return;
    }
    this.storage.writeSync(data);
  }

  #assertReadable() {
    if (
      this.storage &&
      typeof this.storage.lastReadError === "function" &&
      this.storage.lastReadError()
    ) {
      throw this.storage.lastReadError();
    }
    if (
      this.storage &&
      typeof this.storage.lastError === "function" &&
      this.storage.lastError()
    ) {
      const error = this.storage.lastError();
      const message = String(error?.message || error || "");
      if (/READ|HYDRAT/i.test(message)) throw error;
    }
  }

  #assertWritable() {
    if (
      this.storage &&
      typeof this.storage.lastError === "function" &&
      this.storage.lastError()
    ) {
      throw this.storage.lastError();
    }
  }

  provider() {
    return this.storage;
  }
}

export default RuntimeConfigStore;
