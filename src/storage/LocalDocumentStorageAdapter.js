import fs from "node:fs";
import path from "node:path";
import DocumentStorageProvider from "./DocumentStorageProvider.js";
import { atomicWriteFileSync } from "./atomicWrite.js";

export class LocalDocumentStorageAdapter extends DocumentStorageProvider {
  constructor(
    filePath,
    defaultValue = {}
  ) {
    super();

    if (!filePath) {
      throw new Error("LocalDocumentStorageAdapter file path is required.");
    }

    this.filePath = path.resolve(filePath);
    this.defaultValue = defaultValue;
    this._memoryOnly = false;
    this._lastReadError = null;
    this._lastWriteError = null;

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
        JSON.stringify(this.defaultValue, null, 2),
        "utf8"
      );
    }
  }

  #cloneDefault() {
    return JSON.parse(JSON.stringify(this.defaultValue));
  }

  readSync(defaultValue = this.defaultValue) {
    try {
      if (this._memoryOnly) return this.#cloneDefault();
      const parsed = JSON.parse(
        fs.readFileSync(this.filePath, "utf8")
      );
      this._lastReadError = null;
      return parsed;
    } catch (error) {
      this._lastReadError = error;
      return JSON.parse(JSON.stringify(defaultValue));
    }
  }

  lastReadError() {
    return this._lastReadError || null;
  }

  lastError() {
    return this._lastReadError || this._lastWriteError || null;
  }

  isHealthy() {
    return !this._lastReadError && !this._lastWriteError;
  }

  writeSync(value) {
    if (this._memoryOnly) return value;
    try {
      atomicWriteFileSync(
        this.filePath,
        JSON.stringify(value, null, 2),
        "utf8"
      );
    } catch (error) {
      // tmp write failed OR finalization failed after cleanup.
      const failure = error?.message === "DOCUMENT_STORAGE_WRITE_FAILED"
        ? error
        : new Error("DOCUMENT_STORAGE_WRITE_FAILED");
      this._lastWriteError = failure;
      throw failure;
    }

    this._lastWriteError = null;
    return value;
  }

  async read(defaultValue = this.defaultValue) {
    return this.readSync(defaultValue);
  }

  async write(value) {
    return this.writeSync(value);
  }
}

export default LocalDocumentStorageAdapter;
