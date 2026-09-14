import test from "node:test";
import assert from "node:assert/strict";

import EnterpriseEventBus from "../src/kernel/EnterpriseEventBus.js";
import { CapabilityRegistry } from "../src/core/CapabilityRegistry.js";
import { BinaryBrokerConnector as ExtBroker } from "../src/extensions/BinaryBrokerConnector.js";
import { BinaryBrokerConnector as TwinBroker } from "../src/trading/connectors/BinaryBrokerConnector.js";
import AffiliateLockGuard from "../src/security/AffiliateLockGuard.js";
import { FounderSignalEngine } from "../src/trading/FounderSignalEngine.js";

const FORBIDDEN = /"(expiryStatus|status|outcome)"\s*:\s*"(WIN|LOSS|EXECUTED|ORDER_PLACED|BROKER ACCEPTED|CONNECTED)"|"payout"\s*:/;

function collectEvents(bus, topics) {
  const seen = [];
  const handlers = new Map();
  for (const t of topics) {
    const h = (payload) => seen.push({ topic: t, payload });
    bus.on(t, h);
    handlers.set(t, h);
  }
  return {
    seen,
    release() {
      for (const [t, h] of handlers) {
        if (typeof bus.off === "function") bus.off(t, h);
        else if (typeof bus.removeListener === "function") bus.removeListener(t, h);
      }
    }
  };
}

test("extensions broker: connect claims sandbox only and never stores raw credentials", () => {
  const b = new ExtBroker();
  const rec = b.connectBroker("TEST_BROKER_TRUTH", { wsToken: "secret-token", cookieHeader: "sess=abc" });
  assert.equal(rec.status, "SANDBOX_SESSION");
  assert.notEqual(rec.status, "CONNECTED");
  const blob = JSON.stringify(rec);
  assert.doesNotMatch(blob, /secret-token|sess=abc/);
  assert.equal(rec.hasCredential, true);
  assert.match(blob, /SANDBOX/);
});

test("extensions broker: paper trade never fabricates WIN/LOSS/payout/EXECUTED", async () => {
  const bus = EnterpriseEventBus.getInstance();
  CapabilityRegistry.getInstance().registerCapability(
    "BROKER_EXT_TEST_BROKER_TRUTH2",
    "RECORD_PAPER_TRADE",
    (p) => p,
    1,
    { persist: false }
  );
  const collector = collectEvents(bus, [
    "BINARY_TRADE_SANDBOX_RECORDED",
    "BINARY_TRADE_EXECUTED",
    "BINARY_TRADE_EXPIRATION",
    "BROKER_SANDBOX_SESSION",
    "BROKER_CONNECTED"
  ]);
  try {
    const b = new ExtBroker();
    b.connectBroker("TEST_BROKER_TRUTH2", {});
    const out = b.executeBinaryTrade("TEST_BROKER_TRUTH2", {
      asset: "EURUSD_OTC",
      direction: "CALL",
      amount: 50
    });
    assert.equal(out.status, "PAPER_RECORDED");
    assert.equal(out.outcome, "PENDING_NO_BROKER_CONFIRMATION");
    assert.doesNotMatch(JSON.stringify(out), FORBIDDEN);
    // Bounded wait proves no delayed timer fabricates an expiration WIN.
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(collector.seen.some((e) => e.topic === "BINARY_TRADE_SANDBOX_RECORDED"));
    assert.ok(!collector.seen.some((e) => e.topic === "BINARY_TRADE_EXECUTED" || e.topic === "BINARY_TRADE_EXPIRATION"));
    for (const e of collector.seen) {
      assert.doesNotMatch(JSON.stringify(e), FORBIDDEN, `fabricated outcome in ${e.topic}`);
    }
  } finally {
    collector.release();
  }
});

test("trading twin broker: session and orders are paper-only, never EXECUTED/CONNECTED", () => {
  const guard = AffiliateLockGuard.getInstance();
  guard.registerValidAffiliate("AFFILIATE_TRUTH_TEST");
  const bus = EnterpriseEventBus.getInstance();
  const collector = collectEvents(bus, ["BROKER_TRADE_PAPER_RECORDED", "BROKER_TRADE_EXECUTED"]);
  try {
    const b = new TwinBroker();
    assert.throws(() => b.connectSession("rogue", "NOPE"), /EXECUTION_BLOCKED/);
    const session = b.connectSession("truth_user", "AFFILIATE_TRUTH_TEST");
    assert.equal(session.status, "PAPER_SESSION");
    const rec = b.executeTradeOrder({ symbol: "EURUSD_OTC", direction: "CALL", price: 1.1, zScore: 2.5 });
    assert.equal(rec.status, "PAPER_RECORDED");
    assert.equal(rec.outcome, "PENDING_NO_VENUE_CONFIRMATION");
    assert.doesNotMatch(JSON.stringify(rec), FORBIDDEN);
    for (const e of collector.seen) {
      assert.doesNotMatch(JSON.stringify(e), FORBIDDEN, `fabricated outcome in ${e.topic}`);
    }
  } finally {
    collector.release();
  }
});

test("FounderSignalEngine is preserved and still importable", () => {
  assert.ok(FounderSignalEngine, "Founder-authored engine must remain intact");
  assert.equal(typeof FounderSignalEngine, "function");
});
