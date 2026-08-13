import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIT_FILE = path.resolve(__dirname, "../../data/audit_ledger.json");

export class AuditStore {
  constructor() {
    this.ensureStorage();
  }

  ensureStorage() {
    try {
      const dir = path.dirname(AUDIT_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(AUDIT_FILE)) {
        fs.writeFileSync(AUDIT_FILE, JSON.stringify([]), "utf8");
      }
    } catch (e) {
      console.warn("[AUDIT STORE NOTICE] Unable to initialize storage file:", e.message);
    }
  }

  append(event) {
    const record = {
      timestamp: new Date().toISOString(),
      ...event
    };
    try {
      let logs = [];
      if (fs.existsSync(AUDIT_FILE)) {
        const raw = fs.readFileSync(AUDIT_FILE, "utf8");
        logs = JSON.parse(raw || "[]");
      }
      logs.push(record);
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), "utf8");
    } catch (e) {
      console.log("[AUDIT LOG FALLBACK]", record);
    }
  }

  query(limit = 50) {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        const raw = fs.readFileSync(AUDIT_FILE, "utf8");
        const logs = JSON.parse(raw || "[]");
        return logs.slice(-limit);
      }
    } catch (e) {
      console.error("[AUDIT STORE READ ERROR]", e.message);
    }
    return [];
  }
}

export default AuditStore;
