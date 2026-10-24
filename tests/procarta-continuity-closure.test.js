import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CaseManager } from "../src/intelligence/CaseManager.js";
import { ProductNotificationEngine } from "../src/notification/ProductNotificationEngine.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Importing src/app.js initializes runtime state under the current working
// directory. Isolate this suite in a temp root so a test run can never rewrite
// tracked deployment data (data/runtime-config/admin.json, audit ledger).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-procarta-continuity-"));
process.chdir(tmpRoot);
const { procartaTopologyFor } = await import("../src/app.js");

function durableStore() {
  const data = {};
  return {
    readSection(section) { return data[section]; },
    writeSection(section, value) { data[section] = JSON.parse(JSON.stringify(value)); return data[section]; },
    async readSectionAsync(section) { return structuredClone(data[section] ?? null); }
  };
}

test("PROCARTA-CONTINUITY-1: a stale instance cannot erase cases created elsewhere", () => {
  const store = durableStore();
  const stale = new CaseManager({ store });
  const first = stale.createCase({ organization: "First" });
  const fresh = new CaseManager({ store });
  const second = fresh.createCase({ organization: "Second" });

  const third = stale.createCase({ organization: "Third" });
  const restored = new CaseManager({ store });
  const ids = restored.list().map((c) => c.id);

  assert.ok(ids.includes(first.id));
  assert.ok(ids.includes(second.id));
  assert.ok(ids.includes(third.id));
});

test("PROCARTA-CONTINUITY-2: notifications merge across instances without loss or duplicates", async () => {
  const store = durableStore();
  const bus = { publish() {} };
  const first = new ProductNotificationEngine({ eventBus: bus, store });
  const one = first.generateInternalEvent("notification.request_status", { caseId: "CASE-ONE" });

  const second = new ProductNotificationEngine({ eventBus: bus, store });
  const two = second.generateInternalEvent("notification.request_status", { caseId: "CASE-TWO" });
  const three = first.generateInternalEvent("notification.request_status", { caseId: "CASE-THREE" });

  const merged = await second.getRecentEventsAsync(50);
  const ids = merged.map((e) => e.eventId);
  for (const event of [one, two, three]) {
    assert.equal(ids.filter((id) => id === event.eventId).length, 1);
  }

  const restarted = new ProductNotificationEngine({ eventBus: bus, store });
  const persisted = await restarted.getRecentEventsAsync(50);
  for (const event of [one, two, three]) {
    assert.ok(persisted.some((e) => e.eventId === event.eventId));
  }
});

test("PROCARTA-CONTINUITY-3: canonical statuses map to the correct stage", () => {
  const discovery = procartaTopologyFor({ status: "DISCOVERY_REQUIRED" });
  assert.equal(discovery.currentStage, "ASSESS");
  assert.equal(discovery.nodes[0].state, "COMPLETE");
  assert.equal(discovery.nodes[1].state, "ACTIVE");

  const review = procartaTopologyFor({ status: "HUMAN_REVIEW" });
  assert.equal(review.currentStage, "DECIDE");

  const routed = procartaTopologyFor({ status: "ROUTED" });
  assert.equal(routed.currentStage, "EXECUTE");
  assert.equal(routed.nodes[2].state, "COMPLETE");
  assert.equal(routed.nodes[3].state, "ACTIVE");

  const closed = procartaTopologyFor({ status: "CLOSED" });
  assert.ok(closed.nodes.every((n) => n.state === "COMPLETE"));
  assert.equal(closed.terminal, true);
});

test("PROCARTA-CONTINUITY-4: Workspace renders case topology and explicit signal confidence", () => {
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  assert.ok(html.includes("caseTopo&&caseTopo.svg"));
  assert.ok(html.includes("/api/v1/procarta/topology?caseId="));
  assert.ok(html.includes("Signal confidence "));
  assert.ok(html.includes("not root-cause certainty"));
  assert.ok(html.includes("'Open case'"));
  assert.ok(html.includes("caseStatusLabel(c.status"));
});
