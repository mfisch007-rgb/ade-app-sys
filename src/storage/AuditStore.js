import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_AUDIT_FILE = path.resolve("data/audit_ledger.json");
const MAX_LEDGER_ENTRIES = 5000;

export class AuditStore {
  constructor(options = {}) {
    this.file = path.resolve(options.file || DEFAULT_AUDIT_FILE);
    this.ensureStorage();
  }

  ensureStorage() {
    try {
      const dir = path.dirname(this.file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.file)) {
        fs.writeFileSync(this.file, JSON.stringify([]), "utf8");
      }
    } catch (e) {
      console.warn("[AUDIT STORE NOTICE] Unable to initialize storage file:", e.message);
    }
  }

  #read() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error("[AUDIT STORE READ ERROR]", e.message);
    }
    return [];
  }

  append(event) {
    const record = {
      timestamp: new Date().toISOString(),
      ...event
    };
    try {
      const logs = this.#read();
      logs.push(record);

      if (logs.length > MAX_LEDGER_ENTRIES) {
        logs = logs.slice(-MAX_LEDGER_ENTRIES);
      }

      const dir = path.dirname(this.file);
      fs.mkdirSync(dir, { recursive: true });

      const temporaryPath = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(logs, null, 2), "utf8");

      try {
        fs.renameSync(temporaryPath, this.file);
      } catch {
        try {
          if (fs.existsSync(this.file)) {
            fs.rmSync(this.file, { force: true });
          }
          fs.renameSync(temporaryPath, this.file);
        } catch {
          try {
            fs.rmSync(temporaryPath, { force: true });
          } catch {}
          throw new Error("AUDIT_STORE_WRITE_FAILED");
        }
      }
    } catch (e) {
      console.log("[AUDIT LOG FALLBACK]", record);
    }
  }

  query(limit = 50) {
    const logs = this.#read();
    return logs.slice(-Math.max(0, limit));
  }
}

export default AuditStore;