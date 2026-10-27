import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const testsRoot = join(root, "tests");
const excluded = new Set(["release-verification.test.js"]);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
}

walk(testsRoot);

const selected = files
  .filter((file) => !excluded.has(basename(file)))
  .sort();

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...selected],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
