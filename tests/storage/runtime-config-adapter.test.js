import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import LocalDocumentStorageAdapter
  from "../../src/storage/LocalDocumentStorageAdapter.js";

function tempFile() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-runtime-config-")
  );
  return path.join(dir, "admin.json");
}

test("document adapter preserves the RuntimeConfigStore document contract", () => {
  const file = tempFile();

  const original = {
    settings: {},
    ui: {},
    channels: {
      WEB: {
        enabled: true,
        inbound: true,
        outbound: false,
        configured: false,
        label: "ADE Portal"
      }
    },
    policies: {},
    community: {
      runtimeProbe: "G11-COMMUNITY-PROBE"
    }
  };

  const adapter = new LocalDocumentStorageAdapter(file, {});

  adapter.writeSync(original);

  const loaded = adapter.readSync();

  assert.deepEqual(loaded, original);

  const updated = {
    ...loaded,
    settings: {
      ...loaded.settings,
      testMode: true
    }
  };

  adapter.writeSync(updated);

  const freshAdapter =
    new LocalDocumentStorageAdapter(file, {});

  assert.deepEqual(
    freshAdapter.readSync(),
    updated
  );
});

test("document adapter supports injected document persistence", () => {
  const file = tempFile();

  const adapter =
    new LocalDocumentStorageAdapter(file, {
      settings: {},
      ui: {},
      channels: {},
      policies: {}
    });

  const initial = adapter.readSync();

  assert.deepEqual(
    initial,
    {
      settings: {},
      ui: {},
      channels: {},
      policies: {}
    }
  );

  adapter.writeSync({
    settings: {
      injected: "YES"
    },
    ui: {},
    channels: {},
    policies: {}
  });

  assert.equal(
    adapter.readSync().settings.injected,
    "YES"
  );
});

test("document adapter leaves no orphan .tmp files after repeated writes", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-runtime-config-tmp-")
  );
  const file = path.join(dir, "admin.json");

  const adapter = new LocalDocumentStorageAdapter(file, {});

  for (let i = 0; i < 25; i += 1) {
    adapter.writeSync({ counter: i });
  }

  const leftovers = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".tmp"));

  assert.deepEqual(leftovers, []);
  assert.deepEqual(adapter.readSync(), { counter: 24 });
});

test("document adapter throws DOCUMENT_STORAGE_WRITE_FAILED when final rename fails — no false success", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-runtime-config-fail-")
  );
  const file = path.join(dir, "admin.json");

  const adapter = new LocalDocumentStorageAdapter(file, {});
  adapter.writeSync({ version: 1 });
  assert.deepEqual(adapter.readSync(), { version: 1 });

  const originalRename = fs.renameSync;
  try {
    fs.renameSync = () => {
      throw new Error("EACCES: permission denied, rename");
    };
    assert.throws(
      () => adapter.writeSync({ version: 2 }),
      /DOCUMENT_STORAGE_WRITE_FAILED/
    );
  } finally {
    fs.renameSync = originalRename;
  }

  const leftovers = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(
    leftovers,
    [],
    "tmp artifact is cleaned up after failed finalization"
  );
  assert.ok(
    !fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes('"version": 2'),
    "failed write did not persist its new value"
  );

  adapter.writeSync({ version: 3 });
  assert.deepEqual(
    adapter.readSync(),
    { version: 3 },
    "adapter recovers truthfully after the failure resolves"
  );
});

test("document adapter retries atomic rename after removing the target, then succeeds", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ade-runtime-config-retry-")
  );
  const file = path.join(dir, "admin.json");

  const adapter = new LocalDocumentStorageAdapter(file, {});
  adapter.writeSync({ version: 1 });

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
    adapter.writeSync({ version: 9 });
  } finally {
    fs.renameSync = originalRename;
  }

  assert.ok(renameCalls >= 2, "the fallback remove-then-rename retry was used");
  assert.deepEqual(adapter.readSync(), { version: 9 });
  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")),
    []
  );
});
