import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { RuntimeConfigStore } from "../src/admin/RuntimeConfigStore.js";
import { ProviderDocumentStorageAdapter } from "../src/storage/ProviderDocumentStorageAdapter.js";
import { CaseManager } from "../src/intelligence/CaseManager.js";
import { TradingEntitlements } from "../src/trading/TradingEntitlements.js";
import { AuditStore } from "../src/storage/AuditStore.js";

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-durable-"));
  return { dir, file: path.join(dir, name) };
}

test("durable closure: trading grants are visible from a second store instance", async () => {
  const { dir, file } = tempFile("runtime-config.json");
  try {
    const first = new TradingEntitlements({ store: new RuntimeConfigStore(file) });
    await first.grantAsync("operator-1", { trading: true, gaming: false, grantedBy: "founder" });

    const second = new TradingEntitlements({ store: new RuntimeConfigStore(file) });
    await second.refresh();
    assert.equal(second.can("operator-1", "TRADING"), true);
    assert.equal(second.can("operator-1", "GAMING"), false);

    await second.revokeAsync("operator-1");
    const third = new TradingEntitlements({ store: new RuntimeConfigStore(file) });
    await third.refresh();
    assert.equal(third.can("operator-1", "TRADING"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("durable closure: async case creation is visible from a second case manager", async () => {
  const { dir, file } = tempFile("runtime-config.json");
  try {
    const first = new CaseManager({ store: new RuntimeConfigStore(file) });
    const created = await first.createCaseAsync({ source: "TEST", channel: "TEST", organization: "Durable Co" });

    const second = new CaseManager({ store: new RuntimeConfigStore(file) });
    await second.refresh();
    const loaded = second.get(created.id);
    assert.ok(loaded, "case created async must survive a second instance");
    assert.equal(loaded.organization, "Durable Co");

    const attached = await second.attachCaseToAccountAsync(created.id, "account-1");
    assert.equal(attached.accountId, "account-1");

    const third = new CaseManager({ store: new RuntimeConfigStore(file) });
    await third.refresh();
    assert.equal(third.get(created.id)?.accountId, "account-1");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("durable closure: provider-backed audit survives a second store instance", async () => {
  const rows = new Map();
  const provider = {
    async set(key, value) { rows.set(key, value); return value; },
    async list(prefix = "") {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value }));
    }
  };
  const first = new AuditStore({ provider });
  await first.append({ topic: "SECURITY_EVENT", payload: { type: "DURABLE_PROBE" } });

  const second = new AuditStore({ provider });
  const entries = await second.query(10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].topic, "SECURITY_EVENT");
  assert.equal(entries[0].payload.type, "DURABLE_PROBE");
});

test("durable closure: hydration failure is surfaced, never served as an empty document", async () => {
  const adapter = new ProviderDocumentStorageAdapter({
    provider: {
      async get() { throw new Error("HYDRATION_UNAVAILABLE"); },
      async set() {}
    },
    key: "test:document",
    defaultValue: { sentinel: true }
  });
  await assert.rejects(adapter.whenHydrated(), /HYDRATION_UNAVAILABLE/);
  assert.equal(adapter.isHealthy(), false);
  assert.throws(() => adapter.readSync(), /HYDRATION_UNAVAILABLE/);
});

test("durable closure: failed provider write rejects instead of reporting success", async () => {
  const adapter = new ProviderDocumentStorageAdapter({
    provider: {
      async get() { return { sentinel: true }; },
      async set() { throw new Error("WRITE_UNAVAILABLE"); }
    },
    key: "test:document",
    defaultValue: { sentinel: true }
  });
  await adapter.whenHydrated();
  await assert.rejects(adapter.write({ sentinel: false }), /WRITE_UNAVAILABLE/);
  assert.equal(adapter.isHealthy(), false);
});
