import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import SupabaseStorageAdapter, {
  createStorageProvider
} from "../../src/storage/SupabaseStorageAdapter.js";

function cleanEnv() {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_KEY",
    "SUPABASE_STORAGE_TABLE",
    "ADE_STORAGE_PROVIDER"
  ];
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  return previous;
}

function restoreEnv(previous) {
  for (const key of Object.keys(previous)) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

test("G17: durable adapter fails safely when not configured", async () => {
  const prev = cleanEnv();
  try {
    const adapter = new SupabaseStorageAdapter();
    assert.equal(adapter.isConfigured(), false);
    assert.match(adapter.configurationError().message, /STORAGE_NOT_CONFIGURED/);

    await assert.rejects(
      () => adapter.get("case:1"),
      /STORAGE_NOT_CONFIGURED/
    );
    await assert.rejects(
      () => adapter.set("case:1", { id: "CASE-1" }),
      /STORAGE_NOT_CONFIGURED/
    );
    await assert.rejects(
      () => adapter.list(),
      /STORAGE_NOT_CONFIGURED/
    );
  } finally {
    restoreEnv(prev);
  }
});

test("G17: durable adapter reports which vars are missing", () => {
  const prev = cleanEnv();
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const adapter = new SupabaseStorageAdapter();
    const err = adapter.configurationError();
    assert.match(err.message, /SUPABASE_STORAGE_KEY/);
    assert.match(err.message, /SUPABASE_STORAGE_TABLE/);
    assert.doesNotMatch(err.message, /SUPABASE_URL/);
  } finally {
    restoreEnv(prev);
  }
});

test("G17: durable adapter reads configuration from constructor", () => {
  const prev = cleanEnv();
  try {
    const adapter = new SupabaseStorageAdapter({
      url: "https://cfg.supabase.co",
      key: "cfg-key",
      table: "cfg_table"
    });
    assert.equal(adapter.isConfigured(), true);
    assert.equal(adapter.configurationError(), null);
  } finally {
    restoreEnv(prev);
  }
});

test("G17: factory defaults to local adapter without configuration", () => {
  const prev = cleanEnv();
  try {
    const store = createStorageProvider();
    assert.ok(store);
    assert.equal(
      typeof store.get,
      "function",
      "local adapter must implement the StorageProvider contract"
    );
    assert.equal(typeof store.set, "function");
  } finally {
    restoreEnv(prev);
  }
});

test("G17: factory routes to durable adapter when provider is supabase", () => {
  const prev = cleanEnv();
  try {
    const store = createStorageProvider({ provider: "supabase" });
    assert.ok(store instanceof SupabaseStorageAdapter);
    assert.equal(store.isConfigured(), false, "no fabricated credentials");
  } finally {
    restoreEnv(prev);
  }
});

test("G17: factory rejects unknown provider", () => {
  const prev = cleanEnv();
  try {
    assert.throws(
      () => createStorageProvider({ provider: "mongo" }),
      /UNKNOWN_STORAGE_PROVIDER/
    );
  } finally {
    restoreEnv(prev);
  }
});

test("G17: local adapter is durable across restart via factory", async () => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "ade-factory-")),
    "state.json"
  );
  const prev = cleanEnv();
  try {
    const store = createStorageProvider({ filePath: file });
    await store.set("case:7", { id: "CASE-7" });

    const restarted = createStorageProvider({ filePath: file });
    assert.deepEqual(await restarted.get("case:7"), { id: "CASE-7" });
  } finally {
    restoreEnv(prev);
  }
});
