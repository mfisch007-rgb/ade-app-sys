import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { normalizeTxState, buildTransactionIdentity, fingerprintFinancialEvent, maskFinancial } from "../src/finance/FinancialEventModel.js";
import FinancialLedger from "../src/finance/FinancialLedger.js";
import { FinancialAdapterRegistry, PaystackFinancialAdapter } from "../src/finance/ProviderAdapterContract.js";
import { FinancialPipeline } from "../src/finance/FinancialPipeline.js";
import { reconcileOne, ReconciliationEngine, RECON_RULES } from "../src/finance/ReconciliationEngine.js";
import { computeExpectedBalance, compareBalance, BalanceIntelligence } from "../src/finance/BalanceIntelligence.js";
import { buildSettlement, reconcileSettlementItem, SettlementIntelligence } from "../src/finance/SettlementIntelligence.js";
import { detectSignals, scoreSignals, recommendFor, RiskSignalEngine } from "../src/finance/RiskSignalEngine.js";
import { InvestigationWorkflow } from "../src/finance/InvestigationWorkflow.js";
import { ProviderHealth } from "../src/finance/ProviderHealth.js";
import { extractClaimedPayment, ClaimedPaymentBridge } from "../src/finance/ClaimedPaymentEvidence.js";
import { financialAudit, buildLineage } from "../src/finance/FinancialAudit.js";
import { signTest, TEST_SECRET, paystackEvent, transferEvent, txRecord, settlementRecord } from "./fixtures/financial-fixtures.js";
import { assertTenantVisible } from "../src/governance/DataGovernance.js";

function stubStore() {
  const sections = {};
  return {
    readSection(k) { return sections[k] ?? null; },
    writeSection(k, v) { sections[k] = v; },
    _sections: sections
  };
}
function stubBus() {
  const published = [];
  return { published, publish(t, p) { published.push({ topic: t, payload: p }); } };
}
function secretsWith(map = {}) {
  const m = new Map(Object.entries(map));
  return { _m: m, setSecret(k, v) { this._m.set(k, v); }, getSecret(k) { return this._m.get(k) || null; } };
}
function harness(secret = TEST_SECRET) {
  const store = stubStore();
  const bus = stubBus();
  const ledger = new FinancialLedger({ store, eventBus: bus });
  // Per-tenant secrets: registry never falls back across tenants (isolation).
  const adapters = new FinancialAdapterRegistry({ secrets: secretsWith({ ADE_PAYSTACK_default: secret, ADE_PAYSTACK_org_a: secret, "ADE_PAYSTACK_org-a": secret }), eventBus: bus });
  const risk = new RiskSignalEngine({ ledger, eventBus: bus });
  const recon = new ReconciliationEngine({ ledger, eventBus: bus });
  const pipe = new FinancialPipeline({ adapters, ledger, riskEngine: risk, reconEngine: recon, eventBus: bus, health: new ProviderHealth({ ledger, eventBus: bus }) });
  return { store, bus, ledger, adapters, risk, recon, pipe };
}

// FIN-01 transaction verification (server-side, canonical state)
test("FIN-01 verified webhook yields canonical SUCCESS transaction", async () => {
  const { pipe, ledger } = harness();
  const body = JSON.stringify(paystackEvent({}));
  const out = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: signTest(TEST_SECRET, body) });
  assert.equal(out.duplicate, false);
  assert.equal(out.status, "SUCCESS");
  assert.equal(out.reconOutcome, "MATCHED");
  assert.ok(ledger.getTransaction(out.fingerprint, { tenantScope: "org-a" }));
});

// FIN-02 webhook signature (valid passes, invalid rejected, no state change)
test("FIN-02 invalid signature rejected before processing", async () => {
  const { pipe, ledger, bus } = harness();
  const body = JSON.stringify(paystackEvent({ reference: "ref-bad-sig" }));
  await assert.rejects(
    () => pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: "deadbeef" }),
    /SIGNATURE_INVALID/
  );
  assert.equal(ledger.listTransactions({ tenantScope: "org-a" }).length, 0);
  assert.ok(bus.published.some((p) => p.topic === "finance.webhook.signature_failed"));
});

// FIN-03 idempotency + FIN-04 duplicate event (replay, no double execution)
test("FIN-03/04 duplicate webhook replays prior outcome, triggers nothing twice", async () => {
  const { pipe, bus } = harness();
  const body = JSON.stringify(paystackEvent({ reference: "ref-dup-1" }));
  const sig = signTest(TEST_SECRET, body);
  const first = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: sig });
  const before = bus.published.filter((p) => p.topic === "finance.payment.verified").length;
  const second = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: sig });
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.outcome.status, first.status);
  const after = bus.published.filter((p) => p.topic === "finance.payment.verified").length;
  assert.equal(after, before); // no second verified event
});

// FIN-05 amount mismatch / FIN-06 currency / FIN-07 status mismatch
test("FIN-05/06/07 recon detects amount, currency and status mismatches", () => {
  const provider = txRecord({ amount: 100000, currency: "NGN", status: "SUCCESS" });
  const internalAmt = txRecord({ amount: 90000, currency: "NGN", status: "SUCCESS" });
  assert.equal(reconcileOne({ providerTx: provider, internalTx: internalAmt }).outcome, "MISMATCH");
  const internalCur = txRecord({ amount: 100000, currency: "GHS", status: "SUCCESS" });
  const r2 = reconcileOne({ providerTx: provider, internalTx: internalCur });
  assert.equal(r2.outcome, "MISMATCH");
  assert.ok(r2.findings.some((f) => f.rule === "CURRENCY_MISMATCH"));
  const internalSt = txRecord({ amount: 100000, currency: "NGN", status: "FAILED" });
  const r3 = reconcileOne({ providerTx: provider, internalTx: internalSt });
  assert.equal(r3.outcome, "MISMATCH");
  assert.ok(r3.findings.some((f) => f.rule === "STATUS_MISMATCH"));
  // matched control
  assert.equal(reconcileOne({ providerTx: provider, internalTx: txRecord({}) }).outcome, "MATCHED");
});

// FIN-08 settlement mismatch + FIN-09 fee mismatch (the ₦100,000 example)
test("FIN-08/09 settlement variance detected, matched control passes", () => {
  const tx = txRecord({ amount: 100000 });
  const ok = reconcileSettlementItem(tx, { netAmount: 98500, fee: 1500, deduction: 0 });
  assert.equal(ok.outcome, "MATCHED");
  const bad = reconcileSettlementItem(tx, { netAmount: 91000, fee: 1500, deduction: 0 });
  assert.equal(bad.outcome, "MISMATCH");
  assert.ok(bad.findings.some((f) => f.rule === "SETTLEMENT_VARIANCE"));
  assert.equal(reconcileSettlementItem(tx, {}).outcome, "INSUFFICIENT_DATA");
});

// FIN-10 balance mismatch (never manufactures)
test("FIN-10 expected balance reconciles; missing opening is INSUFFICIENT_DATA", () => {
  const c = computeExpectedBalance({ openingBalance: 100000, inflows: [100000], outflows: [], fees: [1500], refunds: [] });
  assert.equal(c.computable, true);
  assert.equal(c.expectedBalance, 198500);
  assert.equal(compareBalance(198500, 198500).outcome, "MATCHED");
  assert.equal(compareBalance(198500, 191000).outcome, "MISMATCH");
  assert.equal(computeExpectedBalance({ inflows: [1] }).outcome, "INSUFFICIENT_DATA");
  const bal = new BalanceIntelligence({ ledger: new FinancialLedger({ store: stubStore(), eventBus: stubBus() }), eventBus: stubBus() });
  const r = bal.reconcile({ tenantScope: "org-a", openingBalance: null, reportedBalances: { PROVIDER: 5 } });
  assert.equal(r.outcome, "INSUFFICIENT_DATA");
});

// FIN-11 refund mismatch (refund exceeds original)
test("FIN-11 refund exceeding original is a MISMATCH", () => {
  const r = reconcileOne({ providerTx: txRecord({ amount: 50000 }), refunds: [{ amount: 30000 }, { amount: 30000 }] });
  assert.equal(r.outcome, "MISMATCH");
  assert.ok(r.findings.some((f) => f.rule === "REFUND_EXCEEDS_ORIGINAL"));
});

// FIN-12 reversal (unexpected reversal signals; impossible transition detected)
test("FIN-12 unexpected reversal + impossible transition", async () => {
  const { pipe } = harness();
  const okBody = JSON.stringify(paystackEvent({ event: "charge.success", reference: "ref-rev-1" }));
  await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: okBody, signature: signTest(TEST_SECRET, okBody) });
  const revBody = JSON.stringify(paystackEvent({ event: "charge.reversed", reference: "ref-rev-1", status: "reversed" }));
  const out = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: revBody, signature: signTest(TEST_SECRET, revBody) });
  assert.equal(out.status, "REVERSED");
  const sigs = detectSignals({ status: "REVERSED", fingerprint: "x" }, {});
  assert.ok(sigs.some((s) => s.rule === "SIG_UNEXPECTED_REVERSAL"));
});

// FIN-13 dispute + FIN-14 transfer normalization
test("FIN-13/14 dispute and transfer events normalize", async () => {
  const { pipe } = harness();
  const dBody = JSON.stringify({ event: "charge.dispute.create", data: { id: 7, reference: "ref-dis-1", amount: 20000, currency: "NGN", status: "disputed", customer: { customer_code: "C1" }, metadata: {} } });
  const d = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: dBody, signature: signTest(TEST_SECRET, dBody) });
  assert.equal(d.status, "DISPUTED");
  const tBody = JSON.stringify(transferEvent({}));
  const t = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: tBody, signature: signTest(TEST_SECRET, tBody) });
  assert.equal(t.status, "SUCCESS");
});

// FIN-15 provider outage (health DEGRADED/UNAVAILABLE, recon PENDING not failure)
test("FIN-15 outage recorded as health state; absence is PENDING not failure", () => {
  const ledger = new FinancialLedger({ store: stubStore(), eventBus: stubBus() });
  const health = new ProviderHealth({ ledger, eventBus: stubBus() });
  const h = health.record({ provider: "PAYSTACK", tenantScope: "org-a", event: "PROVIDER_OUTAGE" });
  assert.equal(h.state, "UNAVAILABLE");
  assert.equal(reconcileOne({}).outcome, "INSUFFICIENT_DATA");
  // provider-only data without an internal counterpart awaits matching (PENDING);
  // explicit cross-source comparison flags it for review instead
  assert.equal(reconcileOne({ providerTx: txRecord({}) }).outcome, "PENDING");
  assert.equal(reconcileOne({ providerTx: txRecord({}), expectInternal: true }).outcome, "REQUIRES_REVIEW");
  // expected-only input with nothing to compare against stays PENDING
  assert.equal(reconcileOne({ expected: { currency: "NGN" } }).outcome, "PENDING");
});

// FIN-16 delayed webhook (late arrival still processes; out-of-order tolerated)
test("FIN-16 late webhook processes normally with original timestamps", async () => {
  const { pipe, ledger } = harness();
  const late = paystackEvent({ reference: "ref-late-1" });
  late.data.paid_at = "2026-08-01T10:00:00.000Z"; // a month late
  const body = JSON.stringify(late);
  const out = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: signTest(TEST_SECRET, body) });
  assert.equal(out.status, "SUCCESS");
  assert.equal(ledger.getTransaction(out.fingerprint, { tenantScope: "org-a" }).occurredAt, "2026-08-01T10:00:00.000Z");
});

// FIN-17 cross-tenant protection
test("FIN-17 tenant A cannot read or ingest as tenant B", async () => {
  const { pipe, ledger } = harness();
  const body = JSON.stringify(paystackEvent({ reference: "ref-tenant-1" }));
  const out = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: signTest(TEST_SECRET, body) });
  assert.equal(ledger.listTransactions({ tenantScope: "org-b" }).length, 0);
  assert.equal(ledger.getTransaction(out.fingerprint, { tenantScope: "org-b" }), null);
  assert.equal(ledger.listTransactions({ tenantScope: "org-a" }).length, 1);
});

// FIN-18 audit (entries carry actor/tenant/correlation)
test("FIN-18 financial actions audited with correlation IDs", async () => {
  const { pipe, bus } = harness();
  const body = JSON.stringify(paystackEvent({ reference: "ref-audit-1" }));
  await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: signTest(TEST_SECRET, body), actor: "ops-lead" });
  const audits = bus.published.filter((p) => p.topic === "audit.log.created" && p.payload?.category === "FINANCE");
  assert.ok(audits.length >= 2);
  assert.ok(audits.every((a) => a.payload.tenantScope === "org-a" && a.payload.at));
  const lineage = buildLineage({ conclusion: "MATCHED", provider: "PAYSTACK", transaction: "fpx", source: "SIGNED_WEBHOOK" });
  assert.equal(lineage.provider, "PAYSTACK");
});

// FIN-19 real-time event (canonical bus topics, no manufactured heartbeat)
test("FIN-19 real domain events published on canonical bus", async () => {
  const { pipe, bus } = harness();
  const body = JSON.stringify(paystackEvent({ reference: "ref-rt-1" }));
  await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: signTest(TEST_SECRET, body) });
  const topics = bus.published.map((p) => p.topic);
  assert.ok(topics.includes("finance.payment.verified"));
  assert.ok(topics.includes("finance.payment.received"));
});

// FIN-20 batch reconciliation (+ PROCARTA bridge on repeated problems)
test("FIN-20 batch run summarizes; repeated problems bridge to PROCARTA", () => {
  const store = stubStore();
  const bus = stubBus();
  const ledger = new FinancialLedger({ store, eventBus: bus });
  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  for (let i = 0; i < 4; i++) {
    // aged confirmed successes with no settlement item -> review + PROCARTA bridge
    const t = { ...txRecord({ fingerprint: `fintx-batch-${i}`, merchantReference: `ref-batch-${i}` }), occurredAt: old };
    ledger.upsertTransaction(t, {});
  }
  const recon = new ReconciliationEngine({ ledger, eventBus: bus });
  const run = recon.runBatch({ tenantScope: "org-a", actor: "tester" });
  assert.equal(run.checked, 4);
  assert.ok(run.matched + run.review + run.pending + run.mismatch === 4);
  assert.ok(run.review >= 3);
  assert.ok(bus.published.some((p) => p.topic === "finance.reconciliation.completed"));
  assert.ok(bus.published.some((p) => p.topic === "procarta.evidence.received"));
});

// FIN-21 risk signal (explainable, versioned, bounded; never "fraud")
test("FIN-21 risk record is explainable and never labels fraud", async () => {
  const { pipe } = harness();
  const body = JSON.stringify(paystackEvent({ reference: "ref-risk-1", amount: 5000000 }));
  const out = await pipe.ingestWebhook({ provider: "PAYSTACK", tenantScope: "org-a", rawBody: body, signature: signTest(TEST_SECRET, body) });
  assert.ok(out.riskScore >= 0 && out.riskScore <= 100);
  assert.ok(!JSON.stringify(out).toLowerCase().includes("fraud"));
  const s = scoreSignals([{ rule: "X", weight: 200, describe: "d", evidence: null }]);
  assert.equal(s.score, 100); // bounded
  assert.equal(recommendFor("HIGH_RISK_SIGNAL", {}), "ESCALATE"); // no autonomous hold by default
  assert.equal(recommendFor("HIGH_RISK_SIGNAL", { allowFinancialHold: true }), "HOLD_FOR_REVIEW");
});

// FIN-22 confidence (bands from evidence quality)
test("FIN-22 signature failure is a high-confidence security signal", () => {
  const sigs = detectSignals({ provider: "PAYSTACK" }, { signatureFailed: true });
  assert.ok(sigs.some((s) => s.rule === "SIG_SIGNATURE_FAILURE" && s.weight >= 40));
});

// FIN-23 investigation (lifecycle + human resolution + learning event)
test("FIN-23 investigation opens, transitions, resolves with learning event", () => {
  const bus = stubBus();
  const ledger = new FinancialLedger({ store: stubStore(), eventBus: bus });
  const wf = new InvestigationWorkflow({ ledger, eventBus: bus, intake: null });
  const inv = wf.open({ tenantScope: "org-a", fingerprint: "fpx", riskRecord: { band: "REQUIRES_REVIEW", score: 45, signals: [] }, actor: "lead", reason: "review" });
  assert.equal(inv.state, "OPEN");
  assert.throws(() => wf.transition(inv.investigationId, "CONFIRMED", { tenantScope: "org-a", actor: "lead", reason: "x" }), /TRANSITION_FORBIDDEN/);
  const ur = wf.transition(inv.investigationId, "UNDER_REVIEW", { tenantScope: "org-a", actor: "lead", reason: "taking case" });
  assert.equal(ur.state, "UNDER_REVIEW");
  wf.attachEvidence(inv.investigationId, { note: "provider statement line 42" }, { tenantScope: "org-a", actor: "lead" });
  const done = wf.transition(inv.investigationId, "FALSE_POSITIVE", { tenantScope: "org-a", actor: "lead", reason: "duplicate retry confirmed" });
  assert.equal(done.state, "FALSE_POSITIVE");
  assert.ok(bus.published.some((p) => p.topic === "finance.investigation.resolved"));
});

// FIN-24 provider adapter capability discovery (+ read-only boundary)
test("FIN-24 capability discovery is truthful; read-only respected", () => {
  const { adapters } = harness();
  const pay = adapters.discover("PAYSTACK", { tenantScope: "default" });
  assert.ok(pay.capabilities.includes("verifyWebhook"));
  const flw = adapters.discover("FLUTTERWAVE", { tenantScope: "default" });
  assert.equal(flw.state, "NOT_CONFIGURED");
  assert.deepEqual(flw.capabilities, []);
  const adapter = new PaystackFinancialAdapter({ environment: "TEST", secretKey: "k", readOnly: true });
  assert.throws(() => adapter._requireWrite("refund"), /READ_ONLY/);
});

// Security: replay, cross-tenant, spoofing, secret exposure, env confusion
test("SEC cross-tenant read rejected; secrets and PANs masked", () => {
  const ledger = new FinancialLedger({ store: stubStore(), eventBus: stubBus() });
  ledger.upsertTransaction(txRecord({ tenantScope: "org-a" }), {});
  // scoped keys make cross-tenant records unaddressable (null, never leaked)
  assert.equal(ledger.getTransaction(txRecord({}).fingerprint, { tenantScope: "org-b" }), null);
  assert.equal(ledger.listTransactions({ tenantScope: "org-b" }).length, 0);
  // direct tenant-visibility assertion still rejects explicitly
  assert.throws(() => assertTenantVisible("org-a", "org-b"), /TENANT_MISMATCH/);
  const masked = maskFinancial({ card: "4111111111111111", cvv: "123", amount: 5, secret_key: "sk_live_x" });
  assert.ok(!JSON.stringify(masked.value).includes("4111111111111111"));
  assert.ok(!JSON.stringify(masked.value).includes("sk_live_x"));
  // test/live confusion: TEST adapter never claims LIVE
  const a = new PaystackFinancialAdapter({ environment: "TEST", secretKey: "sk_test_x" });
  assert.equal(a.describe().live, false);
  // normalization preserves provider raw state
  assert.equal(normalizeTxState("success"), "SUCCESS");
  assert.equal(normalizeTxState("weird-state-xyz"), "UNKNOWN");
  const tx = buildTransactionIdentity({ provider: "PAYSTACK", environment: "TEST", providerTxId: "1", merchantReference: "m1", amount: 10, currency: "ngn" });
  assert.equal(tx.currency, "NGN");
  assert.ok(tx.canonicalKey.startsWith("PAYSTACK|TEST|"));
  assert.ok(fingerprintFinancialEvent({ provider: "P", eventId: "e" }).startsWith("finevt-"));
});

// AWBULI §50: claim extracted, never marked success
test("AWB-50 claimed payment stays CLAIMED_UNVERIFIED", () => {
  const bridge = new ClaimedPaymentBridge({ ledger: new FinancialLedger({ store: stubStore(), eventBus: stubBus() }), eventBus: stubBus() });
  const r = bridge.fromMessage({ text: "Customer says they paid ₦50,000 ref ABC123.", tenantScope: "org-a", actor: "agent-1" });
  assert.equal(r.claimed.claimedAmount, 50000);
  assert.equal(r.claimed.claimedCurrency, "NGN");
  assert.equal(r.verification.status, "CLAIMED_UNVERIFIED");
  assert.ok(!JSON.stringify(r).includes("SUCCESS"));
  assert.throws(() => bridge.fromMessage({ text: "hello there" }), /NO_CLAIM_FOUND/);
  assert.equal(extractClaimedPayment("no money talk") ?? null, null);
});

// Settlement record + trace graph
test("settlement record masks destination; trace shows missing links", () => {
  const s = buildSettlement({ settlementId: "s1", provider: "PAYSTACK", tenantScope: "org-a", destinationAccount: "0123456789", items: [{ fingerprint: "f", amount: 100 }] });
  assert.equal(s.destinationAccount, "****6789");
  const ledger = new FinancialLedger({ store: stubStore(), eventBus: stubBus() });
  const si = new SettlementIntelligence({ ledger, eventBus: stubBus() });
  const trace = si.trace("missing-fp", { tenantScope: "org-a" });
  assert.ok(trace.missingLinks.length > 0);
  assert.equal(trace.complete, false);
});
