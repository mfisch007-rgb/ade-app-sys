import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import LocalStorageAdapter from "../../src/storage/LocalStorageAdapter.js";

function tempFile() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "ade-storage-test-")),
    "state.json"
  );
}

test("LocalStorageAdapter implements basic CRUD contract", async () => {
  const adapter = new LocalStorageAdapter(tempFile());

  assert.equal(await adapter.get("missing"), null);

  await adapter.set("alpha", { value: 1 });
  assert.deepEqual(await adapter.get("alpha"), { value: 1 });

  const updated = await adapter.set("alpha", { value: 2 });
  assert.deepEqual(updated, { value: 2 });
  assert.deepEqual(await adapter.get("alpha"), { value: 2 });

  assert.equal(await adapter.delete("alpha"), true);
  assert.equal(await adapter.get("alpha"), null);
  assert.equal(await adapter.delete("alpha"), false);
});

test("LocalStorageAdapter supports list and prefix filtering", async () => {
  const adapter = new LocalStorageAdapter(tempFile());

  await adapter.set("case:1", { id: "CASE-1" });
  await adapter.set("case:2", { id: "CASE-2" });
  await adapter.set("config", { mode: "COMMUNITY" });

  const all = await adapter.list();
  assert.equal(all.length, 3);

  const cases = await adapter.list("case:");
  assert.equal(cases.length, 2);
  assert.deepEqual(
    cases.map((entry) => entry.key).sort(),
    ["case:1", "case:2"]
  );
});

test("LocalStorageAdapter supports append", async () => {
  const adapter = new LocalStorageAdapter(tempFile());

  await adapter.append("events", { id: 1 });
  await adapter.append("events", { id: 2 });

  assert.deepEqual(
    await adapter.get("events"),
    [{ id: 1 }, { id: 2 }]
  );
});

test("LocalStorageAdapter supports transactional updates", async () => {
  const adapter = new LocalStorageAdapter(tempFile());

  await adapter.set("counter", 1);

  const result = await adapter.transaction(async (tx) => {
    const current = tx.get("counter", 0);
    tx.set("counter", current + 1);
    tx.set("transactionFlag", true);

    return "COMMITTED";
  });

  assert.equal(result, "COMMITTED");
  assert.equal(await adapter.get("counter"), 2);
  assert.equal(await adapter.get("transactionFlag"), true);
});

test("LocalStorageAdapter survives a fresh instance restart", async () => {
  const file = tempFile();

  const first = new LocalStorageAdapter(file);
  await first.set("restart:test", {
    status: "PERSISTED",
    timestamp: "TEST"
  });

  const second = new LocalStorageAdapter(file);

  assert.deepEqual(
    await second.get("restart:test"),
    {
      status: "PERSISTED",
      timestamp: "TEST"
    }
  );
});

test("LocalStorageAdapter leaves no orphan .tmp files after repeated writes", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-storage-tmp-test-")
  );
  const file = path.join(dir, "state.json");

  const adapter = new LocalStorageAdapter(file);

  for (let i = 0; i < 25; i += 1) {
    await adapter.set("iteration", { index: i });
  }

  const leftovers = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".tmp"));

  assert.deepEqual(leftovers, []);
  assert.deepEqual(await adapter.get("iteration"), { index: 24 });
});

test("LocalStorageAdapter throws STORAGE_WRITE_FAILED when final rename fails — no false success", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-storage-fail-")
  );
  const file = path.join(dir, "state.json");

  const adapter = new LocalStorageAdapter(file);
  await adapter.set("alpha", { value: 1 });
  assert.deepEqual(await adapter.get("alpha"), { value: 1 });

  const originalRename = fs.renameSync;
  try {
    fs.renameSync = () => {
      throw new Error("EACCES: permission denied, rename");
    };
    await assert.rejects(
      adapter.delete("alpha"),
      /STORAGE_WRITE_FAILED/
    );
  } finally {
    fs.renameSync = originalRename;
  }

  // The destructive fallback may have removed the target; re-seed, then force
  // a set failure against a present file.
  await adapter.set("alpha", { value: 2 });
  assert.deepEqual(await adapter.get("alpha"), { value: 2 });

  try {
    fs.renameSync = () => {
      throw new Error("EACCES: permission denied, rename");
    };
    await assert.rejects(
      adapter.set("alpha", { value: 3 }),
      /STORAGE_WRITE_FAILED/
    );
  } finally {
    fs.renameSync = originalRename;
  }

  const leftovers = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, [], "tmp artifact is cleaned up after failed finalization");

  await adapter.set("alpha", { value: 4 });
  assert.deepEqual(
    await adapter.get("alpha"),
    { value: 4 },
    "adapter recovers truthfully after the failure resolves"
  );
});

test("LocalStorageAdapter retries atomic rename after removing the target, then succeeds", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-storage-retry-")
  );
  const file = path.join(dir, "state.json");

  const adapter = new LocalStorageAdapter(file);
  await adapter.set("gamma", { n: 1 });

  let renameCalls = 0;
  const originalRename = fs.renameSync;
  try {
    fs.renameSync = (src, dst) => {
      renameCalls += 1;
      if (renameCalls === 1 && fs.existsSync(dst)) {
        throw new Error("EEXIST: target exists");
      }
      return originalRename(src, dst);
    };
    await adapter.set("gamma", { n: 2 });
  } finally {
    fs.renameSync = originalRename;
  }

  assert.ok(renameCalls >= 2, "the fallback remove-then-rename retry was used");
  assert.deepEqual(await adapter.get("gamma"), { n: 2 });
  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")),
    []
  );
});

test("LocalStorageAdapter transaction surfaces failed persistence truthfully", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-storage-tx-fail-")
  );
  const file = path.join(dir, "state.json");

  const adapter = new LocalStorageAdapter(file);
  await adapter.set("tx", { committed: false });

  const originalRename = fs.renameSync;
  try {
    fs.renameSync = () => {
      throw new Error("EACCES: permission denied, rename");
    };
    await assert.rejects(
      adapter.transaction(async (tx) => {
        tx.set("tx", { committed: true });
        return "SHOULD_NOT_RETURN";
      }),
      /STORAGE_WRITE_FAILED/
    );
  } finally {
    fs.renameSync = originalRename;
  }

  const persisted = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8")
    : "";
  assert.ok(
    !persisted.includes('"committed": true'),
    "failed transaction state is not persisted as success"
  );
  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")),
    []
  );
});
