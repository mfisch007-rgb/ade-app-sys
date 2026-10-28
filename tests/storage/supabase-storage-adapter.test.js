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

test("durable adapter claims via PostgREST ignore-duplicates without overwriting the winner", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  let stored = null;
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    calls.push({ url: String(url), method, headers: options.headers, body: options.body });
    if (method === "POST") {
      const payload = JSON.parse(options.body);
      if (stored === null) {
        stored = payload;
        return new Response(JSON.stringify([payload]), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("[]", {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify(stored ? [{ k: stored.k, v: stored.v }] : []), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const adapter = new SupabaseStorageAdapter({
      url: "https://example.supabase.co",
      key: "service-key",
      table: "ade_store"
    });
    adapter._restMode = true;
    const first = await adapter.insertIfAbsent("claim", { owner: "a" });
    assert.equal(first.claimed, true);
    assert.deepEqual(first.value, { owner: "a" });
    assert.match(calls[0].url, /on_conflict=k/);
    assert.match(calls[0].headers.Prefer, /ignore-duplicates/);

    const second = await adapter.insertIfAbsent("claim", { owner: "b" });
    assert.equal(second.claimed, false);
    assert.deepEqual(second.value, { owner: "a" });
    assert.equal(calls.length, 3, "duplicate claim reads the existing winner");
  } finally {
    global.fetch = originalFetch;
  }
});
