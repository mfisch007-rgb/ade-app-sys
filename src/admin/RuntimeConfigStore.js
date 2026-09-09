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
    const data = this.read();

    data[section] = data[section] || {};
    data[section][key] = value;

    this.storage.writeSync(data);

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

  /**
   * Write an entire top-level section value verbatim while preserving
   * every other section. This is the durable collection-write primitive.
   */
  writeSection(section, value) {
    const data = this.read();
    data[section] = value;
    this.storage.writeSync(data);
    return data;
  }

  provider() {
    return this.storage;
  }
}

export default RuntimeConfigStore;
