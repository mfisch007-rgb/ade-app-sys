import fs from "node:fs";
import path from "node:path";
import DocumentStorageProvider from "./DocumentStorageProvider.js";

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
      return JSON.parse(
        fs.readFileSync(this.filePath, "utf8")
      );
    } catch {
      return JSON.parse(JSON.stringify(defaultValue));
    }
  }

  writeSync(value) {
    if (this._memoryOnly) return value;
    try {
      const tmp =
        `${this.filePath}.${process.pid}.${Date.now()}.tmp`;

      fs.writeFileSync(
        tmp,
        JSON.stringify(value, null, 2),
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
          throw new Error("DOCUMENT_STORAGE_WRITE_FAILED");
        }
      }
    } catch {
      // tmp write failed OR finalization failed after cleanup.
      throw new Error("DOCUMENT_STORAGE_WRITE_FAILED");
    }

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
