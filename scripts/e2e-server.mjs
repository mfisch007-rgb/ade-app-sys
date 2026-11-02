import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".e2e-runtime");

fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(path.join(runtime, "browser-profiles"), { recursive: true });
process.chdir(runtime);

process.env.NODE_ENV = "test";
process.env.ADE_RUNTIME_MODE = "COMMUNITY";
process.env.ADE_STORAGE_PROVIDER = "local";
process.env.ADE_BOOTSTRAP_SECRET = "e2e-bootstrap-secret";
process.env.ADE_JWT_SECRET = "e2e-jwt-secret-not-for-production";
process.env.ADE_RATE_LIMIT_MAX = "200";
process.env.ADE_BROWSER_HEADLESS = "true";
process.env.ADE_BROWSER_PROFILE_DIR = path.join(runtime, "browser-profiles");
process.env.PORT = process.env.ADE_E2E_PORT || "4173";
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.AWBULI_PUBLIC_NUMBER;
delete process.env.AWBULI_API_KEY;
delete process.env.AWBULI_PROVIDER_TOKEN;
delete process.env.WHATSAPP_ACCESS_TOKEN;

await import("../src/server.js");
