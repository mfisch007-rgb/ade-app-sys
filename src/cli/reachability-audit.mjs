import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

function safeRead(filePath) {
    try {
        if (!fs.existsSync(filePath)) return "";
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return "";
        return fs.readFileSync(filePath, "utf8") || "";
    } catch (e) {
        return "";
    }
}

console.log("[FIXED SCANNER] Successfully initialized null-safe reader.");
