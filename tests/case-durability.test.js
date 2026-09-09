import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CaseManager } from "../src/intelligence/CaseManager.js";
import { RuntimeConfigStore } from "../src/admin/RuntimeConfigStore.js";
import { UnifiedIntakeEngine } from "../src/intelligence/UnifiedIntakeEngine.js";

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-case-durability-"));
  return new RuntimeConfigStore(path.join(dir, "admin.json"));
}

test("G19: cases persist and restore across a fresh instance", () => {
  const store = tempStore();

  const first = new CaseManager({ store });
  const created = first.createCase({ organization: "Acme", channel: "WEB" });

  assert.equal(first.get(created.id).status, "DISCOVERY_REQUIRED");

  const restarted = new CaseManager({ store });
  const loaded = restarted.get(created.id);

  assert.ok(loaded, "case must restore after restart");
  assert.equal(loaded.id, created.id);
  assert.equal(loaded.organization, "Acme");
  assert.equal(loaded.channel, "WEB");
});

test("G19: case status transitions persist across restart", () => {
  const store = tempStore();

  const first = new CaseManager({ store });
  const created = first.createCase({ organization: "Beta" });
  first.transition(created.id, "DISCOVERY_IN_PROGRESS", {
    reason: "TEST_STARTED"
  });

  const restarted = new CaseManager({ store });
  const loaded = restarted.get(created.id);

  assert.equal(loaded.status, "DISCOVERY_IN_PROGRESS");
  assert.equal(loaded.history.length, 2);
  assert.equal(loaded.history[1].from, "DISCOVERY_REQUIRED");
});

test("G19: intake case survives restart when wired to a durable store", () => {
  const store = tempStore();

  const caseManager = new CaseManager({ store });
  const intake = new UnifiedIntakeEngine({ caseManager });

  const result = intake.ingest(
    "EMAIL",
    {
      text: "We need to integrate our Odoo ERP with the marketplace",
      organization: "Gamma Inc"
    },
    { source: "EMAIL", authenticated: true }
  );

  assert.ok(result.case.id);

  const restarted = new CaseManager({ store });
  const loaded = restarted.get(result.case.id);

  assert.ok(loaded, "intake case must restore after restart");
  assert.equal(loaded.organization, "Gamma Inc");
});
