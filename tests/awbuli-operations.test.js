import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAwbuliCommand, describeAwbuliCommands, AWBULI_COMMAND_VERSION } from "../src/products/awbuli/AwbuliCommandGrammar.js";
import { AwbuliBusinessLedger, AWBULI_OPS_VERSION } from "../src/products/awbuli/AwbuliBusinessLedger.js";
import FinancialLedger from "../src/finance/FinancialLedger.js";
import { WhatsAppNumberRegistry } from "../src/ingestion/WhatsAppNumberRegistry.js";
import OrgUnitRegistry from "../src/operations/OrgUnitRegistry.js";

test("awbuli-grammar-1 — recovers legacy noisy commands without executing them", () => {
  const sale = parseAwbuliCommand("I sold 5 bags of rice for 5k");
  assert.equal(sale.intent, "SALE");
  assert.equal(sale.fields.amount, 5000);
  assert.equal(sale.fields.quantity, 5);
  assert.equal(sale.fields.unit, "bags");
  assert.equal(sale.fields.item, "rice");
  assert.equal(sale.execution, "NOT_EXECUTED");
  assert.equal(sale.simulated, true);

  const expense = parseAwbuliCommand("spent 2k on fuel");
  assert.equal(expense.intent, "EXPENSE");
  assert.equal(expense.fields.amount, 2000);
  assert.equal(expense.fields.item, "fuel");

  const debt = parseAwbuliCommand("john owes me 3k");
  assert.equal(debt.intent, "DEBT");
  assert.equal(debt.fields.amount, 3000);
  assert.equal(debt.fields.party, "john");

  const payment = parseAwbuliCommand("payment from john 2000");
  assert.equal(payment.intent, "PAYMENT");
  assert.equal(payment.fields.party, "john");
  assert.equal(payment.fields.amount, 2000);
});

test("awbuli-grammar-2 — close/balance/report aliases and strict stock forms", () => {
  assert.equal(parseAwbuliCommand("CLOSE-DAY").intent, "CLOSE_DAY");
  assert.equal(parseAwbuliCommand("close business").intent, "CLOSE_DAY");
  assert.equal(parseAwbuliCommand("BALANCE").intent, "BALANCE");
  assert.equal(parseAwbuliCommand("TOTAL FOR TODAY").intent, "REPORT");
  assert.equal(parseAwbuliCommand("HELP").intent, "HELP");

  const stock = parseAwbuliCommand("STOCK rice 10 500");
  assert.equal(stock.intent, "STOCK");
  assert.equal(stock.fields.quantity, 10);
  assert.equal(stock.fields.amount, 500);
  assert.equal(stock.fields.item, "rice");

  const stockSale = parseAwbuliCommand("drugsale panadol 2 500");
  assert.equal(stockSale.intent, "STOCK_SALE");
  assert.equal(stockSale.fields.quantity, 2);
  assert.equal(stockSale.fields.amount, 500);
  assert.equal(stockSale.fields.item, "panadol");

  const meta = describeAwbuliCommands();
  assert.ok(meta.some((c) => c.intent === "SALE" && c.mutatesLedger === true));
  assert.ok(meta.some((c) => c.intent === "BALANCE" && c.mutatesLedger === false));
});

test("awbuli-grammar-3 — unknown and incomplete input fail closed for review", () => {
  const unknown = parseAwbuliCommand("invoice africa logistics 12 march");
  assert.equal(unknown.intent, "UNKNOWN");
  assert.equal(unknown.humanReviewRequired, true);
  assert.equal(unknown.execution, "NOT_EXECUTED");

  const noAmount = parseAwbuliCommand("sold rice");
  assert.equal(noAmount.intent, "SALE");
  assert.deepEqual(noAmount.missingFields, ["amount"]);
  assert.equal(noAmount.humanReviewRequired, true);
  assert.throws(() => parseAwbuliCommand(""), /AWBULI_COMMAND_REQUIRED/);
});

test("awbuli-registry-1 — org/branch assignment is validated and sanitized", () => {
  const orgs = new OrgUnitRegistry();
  const org = orgs.create({ type: "ORGANIZATION", name: "Ade Stores", tenantScope: "t1", actor: "owner" });
  const branch = orgs.create({ type: "BRANCH", name: "Ikeja", parentId: org.unitId, tenantScope: "t1", actor: "owner" });
  const reg = new WhatsAppNumberRegistry({ orgUnits: orgs });
  const rec = reg.addNumber({ number: "+2348030000001", tenantScope: "t1", unitId: branch.unitId, actor: "owner" });
  assert.equal(rec.unitId, branch.unitId);
  assert.equal(rec.unitType, "BRANCH");
  assert.equal(rec.organization, "Ade Stores");
  assert.ok(rec.unitPath.includes("BRANCH:Ikeja"));
  assert.ok(!("fingerprint" in rec));
  assert.ok(!("globalFingerprint" in rec));
  assert.ok(!JSON.stringify(rec).includes("8030000001"), "full number never leaves the registry");
  assert.equal(reg.summary({ tenantScope: "t1" }).total, 1);
  assert.equal(reg.summary({ tenantScope: "t1" }).live, false);

  assert.throws(() => reg.addNumber({ number: "+2348030000002", tenantScope: "t1", unitId: "unit-nope", actor: "owner" }), /ORG_UNIT_NOT_FOUND/);
  const other = orgs.create({ type: "ORGANIZATION", name: "Other", tenantScope: "t2", actor: "owner2" });
  assert.ok(other.unitId);
});

test("awbuli-registry-2 — duplicates cannot be active across tenants; tenant moves are refused", () => {
  const reg = new WhatsAppNumberRegistry();
  const a = reg.addNumber({ number: "+15551234567", tenantScope: "tenant-a", actor: "a" });
  assert.throws(() => reg.addNumber({ number: "+15551234567", tenantScope: "tenant-b", actor: "b" }), /NUMBER_ALREADY_REGISTERED/);
  assert.throws(() => reg.editNumber(a.id, { tenantScope: "tenant-b", actor: "a" }), /NUMBER_TENANT_IMMUTABLE/);
  reg.setState(a.id, "DISABLED", { actor: "a", reason: "teardown", level: 2 });
  const b = reg.addNumber({ number: "+15551234567", tenantScope: "tenant-b", actor: "b" });
  assert.equal(b.tenantScope, "tenant-b");
});

test("awbuli-ledger-1 — writes to the canonical FinancialLedger and stays idempotent", () => {
  const ledger = new FinancialLedger();
  const ops = new AwbuliBusinessLedger({ ledger });
  assert.equal(ops.status().storage, "FINANCIAL_LEDGER");
  assert.equal(ops.status().live, false);

  const stock = ops.record(parseAwbuliCommand("STOCK rice 10 500"), { tenantScope: "t1", idempotencyKey: "stock-1" });
  assert.equal(stock.accepted, true);
  assert.equal(stock.duplicate, false);
  const replay = ops.record(parseAwbuliCommand("STOCK rice 10 500"), { tenantScope: "t1", idempotencyKey: "stock-1" });
  assert.equal(replay.duplicate, true, "same idempotency key replays, never double-writes");

  ops.record(parseAwbuliCommand("sold 5 bags of rice for 5k"), { tenantScope: "t1", idempotencyKey: "sale-1" });
  ops.record(parseAwbuliCommand("spent 2k on fuel"), { tenantScope: "t1", idempotencyKey: "expense-1" });
  const summary = ops.summary({ tenantScope: "t1" });
  assert.equal(summary.totals.sales, 5000);
  assert.equal(summary.totals.expenses, 2000);
  assert.equal(summary.netProfit, 3000);
  assert.equal(summary.provenance.zMaths, "MISSING_EVIDENCE");
  assert.equal(summary.provenance.profitFormula, "sales - expenses");
  assert.equal(summary.live, false);

  const inventory = ops.inventory({ tenantScope: "t1" });
  assert.equal(inventory.items[0].item, "rice");
  assert.equal(inventory.items[0].quantity, 5, "sale of tracked stock reduces inventory");
  assert.equal(inventory.items[0].value, 250);
});

test("awbuli-ledger-2 — tenant isolation, closed daily close, and owner-only anomalies", () => {
  const ledger = new FinancialLedger();
  const ops = new AwbuliBusinessLedger({ ledger });
  ops.record(parseAwbuliCommand("sold rice 1000"), { tenantScope: "t1", idempotencyKey: "a" });
  ops.record(parseAwbuliCommand("sold rice 1000"), { tenantScope: "t2", idempotencyKey: "b" });
  assert.equal(ops.summary({ tenantScope: "t1" }).totals.sales, 1000);
  assert.equal(ops.summary({ tenantScope: "t2" }).totals.sales, 1000);
  assert.equal(ops.summary({ tenantScope: "t3" }).totals.sales, 0);

  const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
  ops.record(parseAwbuliCommand("john owes me 3k"), { tenantScope: "t1", idempotencyKey: "debt-1", occurredAt: old });
  const alerts = ops.alerts({ tenantScope: "t1" });
  assert.equal(alerts.ownerOnly, true);
  assert.ok(alerts.items.some((a) => a.type === "STALE_CREDIT"));
  assert.ok(alerts.items.every((a) => a.notFraudConfirmation === true && a.requiresReview === true));

  const close = ops.closeDay({ tenantScope: "t1" });
  assert.equal(close.status, "RECORDED");
  assert.equal(close.live, false);
  assert.match(close.businessDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("awbuli-ledger-3 — incomplete or non-writable commands never write", () => {
  const ledger = new FinancialLedger();
  const ops = new AwbuliBusinessLedger({ ledger });
  assert.throws(() => ops.record(parseAwbuliCommand("sold rice"), { tenantScope: "t1" }), /AWBULI_COMMAND_INCOMPLETE/);
  assert.throws(() => ops.record(parseAwbuliCommand("BALANCE"), { tenantScope: "t1" }), /AWBULI_INTENT_NOT_WRITABLE/);
  assert.equal(ledger.listTransactions({ tenantScope: "t1" }).length, 0);
  assert.equal(ops.status().version, AWBULI_OPS_VERSION);
});

test("awbuli-grammar-version is stable", () => {
  assert.equal(AWBULI_COMMAND_VERSION, "AWBULI-COMMAND-v1");
});
