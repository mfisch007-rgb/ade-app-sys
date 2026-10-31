import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicWriteFileSync } from "../../src/storage/atomicWrite.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ade-atomic-write-"));
}

test("atomicWriteFileSync replaces the target without leaving artifacts", () => {
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "old", "utf8");

  atomicWriteFileSync(file, "new", "utf8");

  assert.equal(fs.readFileSync(file, "utf8"), "new");
  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith(".tmp") || name.endsWith(".bak")),
    []
  );
});

test("atomicWriteFileSync keeps the last known-good target when the fallback also fails", () => {
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "original", "utf8");

  let calls = 0;
  const shim = {
    ...fs,
    renameSync(from, to) {
      calls += 1;
      if (calls === 1) throw new Error("EEXIST: target exists");
      if (calls === 2) throw new Error("EACCES: replacement failed");
      return fs.renameSync(from, to);
    }
  };

  assert.throws(() => atomicWriteFileSync(file, "replacement", "utf8", shim));

  assert.equal(fs.readFileSync(file, "utf8"), "original");
  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")),
    []
  );
});

test("atomicWriteFileSync restores the original when the replacement rename fails after backup", () => {
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "original", "utf8");

  let calls = 0;
  const shim = {
    ...fs,
    renameSync(from, to) {
      calls += 1;
      if (calls === 1) throw new Error("EEXIST: target exists");
      if (calls === 2) throw new Error("EACCES: replacement failed");
      return fs.renameSync(from, to);
    }
  };

  assert.throws(() => atomicWriteFileSync(file, "replacement", "utf8", shim));
  assert.equal(fs.readFileSync(file, "utf8"), "original");
});
