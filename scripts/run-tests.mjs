import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.cwd());
const testsRoot = path.join(root, "tests");
const excluded = new Set(["release-verification.test.js"]);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (
      entry.isFile() &&
      (entry.name.endsWith(".test.js") ||
        entry.name.endsWith(".test.mjs") ||
        entry.name.endsWith(".test.ts"))
    ) {
      files.push(fullPath);
    }
  }
}

walk(testsRoot);

const selected = files
  .filter((file) => !excluded.has(path.basename(file)))
  .sort();

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ade-test-sandbox-"));
const junctions = [];
const protectedFiles = [
  ".ade_storage.json",
  ".ade_capability_store.json",
  ".ade_session_revocations.json",
  ".ade_feedback_queue.json",
  path.join("data", "audit_ledger.json"),
  path.join("data", "runtime-config", "admin.json"),
  path.join("data", "admin-credential.json")
];

const deniedDirectoryNames = new Set([
  ".git",
  ".vercel",
  ".keys",
  "data",
  "node_modules"
]);

const deniedFilePatterns = [
  /^\.env\.(?:local|vercel|vercel-prod|vercel-prod2)$/i,
  /^\.ade_/i,
  /^(?:admin|audit_ledger)\.json$/i,
  /\.(?:log|bak|zip|7z|tar|gz)$/i,
  /^node\.exe$/i
];

const before = {
  git: gitStatus(),
  hashes: snapshotHashes()
};

let childStatus = 1;
let failure = null;

try {
  prepareSandbox();

  const env = {
    ...process.env,
    NODE_ENV: "test",
    ADE_TEST_SANDBOX_ROOT: sandbox,
    ADE_TEST_REPO_ROOT: root,
    ADE_RUNTIME_MODE: "FULL",
    ADE_EDITION: "COMMUNITY",
    ADE_STORAGE_PROVIDER: "local",
    ADE_HTTP_TEST_PIN: "731904",
    ADE_CREDENTIAL_STORE_FILE: path.join(sandbox, "data", "admin-credential.json"),
    ADE_SESSION_REVOCATION_FILE: path.join(sandbox, "data", "session-revocations.json"),
    ADE_CAPABILITY_STORE: path.join(sandbox, ".ade_capability_store.json"),
    ADE_FEEDBACK_QUEUE: path.join(sandbox, ".ade_feedback_queue.json")
  };
  delete env.ADE_ADMIN_PIN_HASH;
  delete env.ADE_STORAGE_FILE;
  delete env.VERCEL;
  delete env.VERCEL_ENV;

  const isolationPreload = path.join(testsRoot, "support", "test-isolation.mjs");
  const jestGlobalsPreload = path.join(testsRoot, "support", "jest-globals.mjs");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(isolationPreload).href,
      "--import",
      pathToFileURL(jestGlobalsPreload).href,
      "--test",
      "--test-concurrency=1",
      ...selected
    ],
    {
      cwd: sandbox,
      env,
      stdio: "inherit"
    }
  );

  if (result.error) throw result.error;
  childStatus = result.status ?? 1;
} catch (error) {
  failure = error;
  try {
    console.error(String(error?.stack || error));
  } catch {}
} finally {
  cleanupSandbox();

  const after = {
    git: gitStatus(),
    hashes: snapshotHashes()
  };

  const hashChanges = [];
  for (const relative of protectedFiles) {
    if (before.hashes.get(relative) !== after.hashes.get(relative)) {
      hashChanges.push(relative);
    }
  }

  if (hashChanges.length > 0) {
    console.error(
      `TEST_ISOLATION_FAILURE: protected files changed: ${hashChanges.join(", ")}`
    );
    childStatus = 1;
  }

  if (before.git !== null && after.git !== null && before.git !== after.git) {
    console.error("TEST_ISOLATION_FAILURE: git working tree changed during tests");
    childStatus = 1;
  }
}

if (failure) throw failure;
process.exit(childStatus);

function prepareSandbox() {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const source = path.join(root, entry.name);
    const destination = path.join(sandbox, entry.name);

    if (entry.isDirectory()) {
      if (deniedDirectoryNames.has(entry.name)) continue;
      fs.symlinkSync(source, destination, "junction");
      junctions.push(destination);
      continue;
    }

    if (!entry.isFile()) continue;
    if (deniedFilePatterns.some((pattern) => pattern.test(entry.name))) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env" && entry.name !== ".env.example") continue;
    const stats = fs.statSync(source);
    if (stats.size > 5 * 1024 * 1024) continue;
    fs.copyFileSync(source, destination);
  }

  fs.mkdirSync(path.join(sandbox, "data", "runtime-config"), { recursive: true });
  fs.mkdirSync(path.join(sandbox, "data", "snapshots"), { recursive: true });
}

function cleanupSandbox() {
  for (const junction of junctions.reverse()) {
    try {
      fs.rmdirSync(junction);
    } catch {}
  }
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3 });
  } catch {}
}

function snapshotHashes() {
  const hashes = new Map();
  for (const relative of protectedFiles) {
    hashes.set(relative, hashFile(path.join(root, relative)));
  }
  return hashes;
}

function hashFile(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch (error) {
    return `MISSING:${error?.code || "ERROR"}`;
  }
}

function gitStatus() {
  try {
    const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=normal"], {
      cwd: root,
      encoding: "utf8"
    });
    if (result.error || result.status !== 0) return null;
    return result.stdout;
  } catch {
    return null;
  }
}
