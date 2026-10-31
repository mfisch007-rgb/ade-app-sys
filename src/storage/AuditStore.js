import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWriteFileSync } from "./atomicWrite.js";

const DEFAULT_AUDIT_FILE = path.resolve("data/audit_ledger.json");
const MAX_LEDGER_ENTRIES = 5000;
const DEFAULT_PROVIDER_PREFIX = "ade:audit:";

export class AuditStore {
  constructor(options = {}) {
    this.file = path.resolve(options.file || DEFAULT_AUDIT_FILE);
    this.provider = options.provider || null;
    this.providerPrefix = options.providerPrefix || DEFAULT_PROVIDER_PREFIX;
    this._lastError = null;
    if (!this.provider) this.ensureStorage();
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

  lastError() {
    return this._lastError;
  }

  #read() {
    try {
      if (!fs.existsSync(this.file)) return [];
      const raw = fs.readFileSync(this.file, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) throw new Error("AUDIT_STORE_CORRUPT");
      this._lastError = null;
      return parsed;
    } catch (e) {
      this._lastError = e;
      console.error("[AUDIT STORE READ ERROR]", e.message);
      throw e;
    }
  }

  #record(event) {
    return {
      timestamp: new Date().toISOString(),
      ...event
    };
  }

  async #appendProvider(record) {
    try {
      const key = `${this.providerPrefix}${Date.now()}:${crypto.randomUUID()}`;
      await this.provider.set(key, record);
      this._lastError = null;
      return record;
    } catch (error) {
      this._lastError = error;
      console.error("[AUDIT STORE WRITE FAILED]", error?.message || String(error));
      throw error;
    }
  }

  append(event) {
    const record = this.#record(event);
    if (this.provider) return this.#appendProvider(record);
    try {
      let logs = this.#read();
      logs.push(record);

      if (logs.length > MAX_LEDGER_ENTRIES) {
        logs = logs.slice(-MAX_LEDGER_ENTRIES);
      }

      const dir = path.dirname(this.file);
      fs.mkdirSync(dir, { recursive: true });

      atomicWriteFileSync(this.file, JSON.stringify(logs, null, 2), "utf8");
      this._lastError = null;
      return record;
    } catch (e) {
      this._lastError = e;
      console.error("[AUDIT STORE WRITE FAILED]", e?.message || String(e));
      throw e;
    }
  }

  async #queryProvider(limit) {
    try {
      const rows = await this.provider.list(this.providerPrefix);
      const values = (Array.isArray(rows) ? rows : [])
        .map((row) => row?.value)
        .filter(Boolean)
        .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
      this._lastError = null;
      return values.slice(-Math.max(0, limit));
    } catch (error) {
      this._lastError = error;
      console.error("[AUDIT STORE READ FAILED]", error?.message || String(error));
      throw error;
    }
  }

  query(limit = 50) {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 50;
    if (this.provider) return this.#queryProvider(safeLimit);
    const logs = this.#read();
    return logs.slice(-safeLimit);
  }
}

export default AuditStore;
