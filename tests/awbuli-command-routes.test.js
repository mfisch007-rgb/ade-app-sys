import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-awbuli-routes-"));
process.chdir(tmpRoot);

const { app } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

let server = null;
let base = null;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const call = async (token, method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const FOUNDER = { fullName: "Awbuli Routes Founder", username: "awbuliroutes", password: "AwbuliPass!5", pin: "112233" };

async function elevatedFounder() {
  if (!globalThis.__awbuliRouteFounder) {
    const boot = await call(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
    assert.equal(boot.status, 201);
    const login = await call(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
    assert.equal(login.status, 200);
    const elev = await call(login.body.token, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
    assert.equal(elev.status, 200);
    globalThis.__awbuliRouteFounder = elev.body.token;
  }
  return globalThis.__awbuliRouteFounder;
}

test("awbuli-routes-1 — public surfaces stay truthful and read-only", async () => {
  const caps = await call(null, "GET", "/api/v1/awbuli/capabilities");
  assert.equal(caps.status, 200);
  assert.equal(caps.body.live, false);
  assert.equal(caps.body.transport.live, false);
  assert.equal(caps.body.transport.inboundWebhook, false);
  assert.equal(caps.body.operations.storage, "FINANCIAL_LEDGER");
  assert.equal(caps.body.operations.provenance.zMaths, "MISSING_EVIDENCE");
  assert.ok(caps.body.commandGrammar.commands.some((c) => c.intent === "SALE"));

  const interpreted = await call(null, "POST", "/api/v1/awbuli/interpret", { text: "sold 5 bags of rice for 5k" });
  assert.equal(interpreted.status, 200);
  assert.equal(interpreted.body.interpretation.intent, "SALE");
  assert.equal(interpreted.body.interpretation.execution, "NOT_EXECUTED");
  assert.equal(interpreted.body.interpretation.fields.amount, 5000);

  assert.equal((await call(null, "POST", "/api/v1/awbuli/commands", { text: "sold rice 1000" })).status, 401);
});

test("awbuli-routes-2 — recording needs L2 plus PIN, then writes to the canonical ledger", async () => {
  const bare = IdentityOnboarding.getInstance().issueSession({
    subject: "awbuli-bare", tier: "COMMUNITY", level: 2, persona: "OPERATOR"
  }).token;
  const denied = await call(bare, "POST", "/api/v1/awbuli/commands", { text: "sold rice 1000" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "ELEVATED_PIN_REQUIRED");

  const token = await elevatedFounder();
  const stock = await call(token, "POST", "/api/v1/awbuli/commands", { text: "STOCK rice 10 500", idempotencyKey: "route-stock" });
  assert.equal(stock.status, 201);
  assert.equal(stock.body.result.transaction.businessType, "STOCK");

  const sale = await call(token, "POST", "/api/v1/awbuli/commands", { text: "sold 5 bags of rice for 5k", idempotencyKey: "route-sale" });
  assert.equal(sale.status, 201);
  const replay = await call(token, "POST", "/api/v1/awbuli/commands", { text: "sold 5 bags of rice for 5k", idempotencyKey: "route-sale" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);

  const expense = await call(token, "POST", "/api/v1/awbuli/commands", { text: "spent 2k on fuel", idempotencyKey: "route-expense" });
  assert.equal(expense.status, 201);

  const summary = await call(token, "GET", "/api/v1/awbuli/summary");
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.live, false);
  assert.equal(summary.body.summary.totals.sales, 5000);
  assert.equal(summary.body.summary.totals.expenses, 2000);
  assert.equal(summary.body.summary.netProfit, 3000);

  const inventory = await call(token, "GET", "/api/v1/awbuli/inventory");
  assert.equal(inventory.status, 200);
  assert.equal(inventory.body.inventory.items[0].item, "rice");
  assert.equal(inventory.body.inventory.items[0].quantity, 5);

  const alerts = await call(token, "GET", "/api/v1/awbuli/alerts");
  assert.equal(alerts.status, 200);
  assert.equal(alerts.body.alerts.ownerOnly, true);
  assert.equal(alerts.body.alerts.live, false);

  const status = await call(null, "GET", "/api/v1/integrations/awbuli/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.operations.live, false);
  assert.equal(status.body.inboundWebhook, false);
});

test("awbuli-routes-4 — founder AWBULI tab reads server truth and keeps review warnings", () => {
  const html = fs.readFileSync(new URL("../public/founder.html", import.meta.url), "utf8");
  for (const marker of [
    "data-testid':'awbuli-founder-tab",
    "/api/v1/integrations/awbuli/status",
    "/api/v1/awbuli/summary",
    "/api/v1/awbuli/inventory",
    "/api/v1/awbuli/alerts",
    "/api/v1/awbuli/interpret",
    "Execution: ",
    "Missing: ",
    "not fraud confirmations"
  ]) {
    assert.ok(html.includes(marker), `founder tab contains ${marker}`);
  }
  assert.ok(!html.includes("Registry Active"), "no unsupported registry-liveness claim");
  assert.ok(!html.includes("Channel Bridge Operational"), "no unsupported channel-liveness claim");
});

test("awbuli-routes-3 — read commands execute no writes; invalid intent still gates", async () => {
  const token = await elevatedFounder();
  const before = await call(token, "GET", "/api/v1/awbuli/summary");
  const balance = await call(token, "POST", "/api/v1/awbuli/commands", { text: "BALANCE" });
  assert.equal(balance.status, 200);
  assert.equal(balance.body.accepted, false);
  assert.equal(balance.body.executed, false);
  assert.equal(balance.body.read.type, "BALANCE");
  assert.ok(Number.isFinite(balance.body.read.cashPosition));
  const after = await call(token, "GET", "/api/v1/awbuli/summary");
  assert.equal(after.body.summary.transactionCount, before.body.summary.transactionCount, "read command never writes");

  const incomplete = await call(token, "POST", "/api/v1/awbuli/commands", { text: "sold rice" });
  assert.equal(incomplete.status, 409);
  assert.equal(incomplete.body.error, "AWBULI_COMMAND_REVIEW_REQUIRED");

  const badUnit = await call(token, "POST", "/api/v1/awbuli/commands", { text: "sold rice 1000", unitId: "unit-does-not-exist" });
  assert.equal(badUnit.status, 400);
  assert.equal(badUnit.body.error, "ORG_UNIT_NOT_FOUND");
});

test("awbuli-routes-5 — ACTIVE is blocked truthfully when no authorized transport exists", async () => {
  const token = await elevatedFounder();
  const added = await call(token, "POST", "/api/v1/admin/whatsapp-numbers", {
    number: "+2348098765432",
    tenantScope: "default",
    label: "Routing test line",
    purpose: "GENERAL"
  });
  assert.equal(added.status, 201);
  const id = added.body.number.id;
  assert.equal(added.body.number.activation, null);

  const verified = await call(token, "POST", `/api/v1/admin/whatsapp-numbers/${id}/verify`, {
    method: "HUMAN_ATTESTATION",
    evidenceRef: "operator-attestation-1"
  });
  assert.equal(verified.status, 200);

  const blocked = await call(token, "POST", `/api/v1/admin/whatsapp-numbers/${id}/state`, {
    to: "ACTIVE",
    reason: "activate after provisioning"
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.success, false);
  assert.equal(blocked.body.error, "TRANSPORT_UNAVAILABLE");
  assert.equal(blocked.body.number.state, "VERIFIED");
  assert.equal(blocked.body.number.activation.state, "BLOCKED");
  assert.equal(blocked.body.number.activation.reason, "TRANSPORT_UNAVAILABLE");
  assert.equal(blocked.body.deliveryClaimed, undefined);
  assert.equal(blocked.body.number.activation.transportId, null);
  assert.equal(blocked.body.number.history.filter((h) => h.to === "ENABLED").length, 0, "blocked activation must not mark the number ENABLED");
  assert.equal(blocked.body.number.history.filter((h) => h.to === "VERIFIED").length, 1, "blocked activation must not duplicate state transitions");

  assert.equal((await call(null, "GET", "/api/v1/admin/awbuli/transports")).status, 401);

  const listed = await call(token, "GET", "/api/v1/admin/whatsapp-numbers");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.numbers.find((n) => n.id === id).activation.state, "BLOCKED");

  const transports = await call(token, "GET", "/api/v1/admin/awbuli/transports");
  assert.equal(transports.status, 200);
  assert.equal(transports.body.transport.live, false);
  assert.equal(transports.body.transport.state, "TRANSPORT_UNAVAILABLE");
  assert.deepEqual(transports.body.transports, []);
});
