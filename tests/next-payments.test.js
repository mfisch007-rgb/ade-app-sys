import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import PaymentService from "../src/payments/PaymentService.js";
import PaystackProvider, { verifyPaystackSignature } from "../src/payments/PaystackProvider.js";

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
function svcWithSecret(secret) {
  const secrets = { _m: new Map(), setSecret(k, v) { this._m.set(k, v); }, getSecret(k) { return this._m.get(k) || null; } };
  const svc = new PaymentService({ store: stubStore(), secrets, eventBus: stubBus() });
  return { svc, secrets };
}

// PAY-01 disabled by default: no UI, no start
test("PAY-01 payments DISABLED by default; start blocked; availability honest", () => {
  const { svc } = svcWithSecret(null);
  const st = svc.status({});
  assert.equal(st.state, "DISABLED");
  assert.equal(st.configured, false);
  assert.throws(() => svc.startPayment({ amountKobo: 1000, email: "a@b.co" }), /PAYMENT_DISABLED/);
  const av = svc.availability({});
  assert.equal(av.showPayment, false);
  assert.match(av.message, /unavailable/);
});

// PAY-02 test mode: configure -> verify -> TEST -> customer ON
test("PAY-02 test activation requires verification; customer-facing gated", () => {
  const { svc } = svcWithSecret(null);
  svc.configure({ environment: "TEST", secretKey: "sk_test_abc", actor: "admin", reason: "test setup" });
  assert.throws(() => svc.setState({ to: "TEST", actor: "admin", reason: "go" }), /REQUIRES_VERIFICATION/);
  const v = svc.verify({ actor: "admin" });
  assert.equal(v.verified, true);
  const on = svc.setState({ to: "TEST", actor: "admin", reason: "enable test" });
  assert.equal(on.state, "TEST");
  assert.throws(() => svc.setCustomerFacing({ on: true, actor: "", reason: "" }), /APPROVAL_IDENTITY/);
  const cf = svc.setCustomerFacing({ on: true, actor: "admin", reason: "show test checkout" });
  assert.equal(cf.customerFacing, "ON");
  const checkout = svc.startPayment({ amountKobo: 250000, email: "buyer@example.com" });
  assert.equal(checkout.environment, "TEST");
  assert.ok(checkout.reference);
});

// PAY-03 live requires verified LIVE config (prefix match)
test("PAY-03 LIVE blocked without live-key verification", () => {
  const { svc } = svcWithSecret(null);
  svc.configure({ environment: "TEST", secretKey: "sk_test_abc", actor: "admin", reason: "t" });
  svc.verify({ actor: "admin" });
  assert.throws(() => svc.setState({ to: "LIVE", actor: "admin", reason: "premature" }), /LIVE_REQUIRES_VERIFICATION/);
  svc.configure({ environment: "LIVE", secretKey: "sk_test_abc", actor: "admin", reason: "wrong key" });
  const v = svc.verify({ actor: "admin" });
  assert.equal(v.verified, false);
  assert.equal(v.lastError, "KEY_ENVIRONMENT_MISMATCH");
});

// PAY-04 client redirect alone grants nothing
test("PAY-04 no entitlement path except verified webhook", () => {
  const { svc } = svcWithSecret(null);
  assert.equal(svc.entitlementFor({}).plan, "COMMUNITY");
  assert.throws(() => svc.handleWebhook({ rawBody: "{}", signature: "deadbeef" }), /NOT_CONFIGURED|SIGNATURE_INVALID/);
  assert.equal(svc.entitlementFor({}).plan, "COMMUNITY");
});

// PAY-05 verified charge.success grants; PAY-06 failure grants nothing
test("PAY-05/06 verified success grants, failure does not", () => {
  const { svc } = svcWithSecret(null);
  const secret = "sk_test_webhook";
  svc.configure({ environment: "TEST", secretKey: secret, actor: "admin", reason: "t", planMappings: { PLN_gold: "PROFESSIONAL" } });
  svc.verify({ actor: "admin" });
  svc.setState({ to: "TEST", actor: "admin", reason: "t" });
  const goodBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-1", plan: { plan_code: "PLN_gold" } } });
  const sig = crypto.createHmac("sha512", secret).update(goodBody).digest("hex");
  const granted = svc.handleWebhook({ rawBody: goodBody, signature: sig });
  assert.equal(granted.outcome, "GRANT");
  assert.equal(granted.entitlement.plan, "PROFESSIONAL");
  const badBody = JSON.stringify({ event: "charge.failed", data: { reference: "ref-2" } });
  const badSig = crypto.createHmac("sha512", secret).update(badBody).digest("hex");
  const failed = svc.handleWebhook({ rawBody: badBody, signature: badSig });
  assert.equal(failed.outcome, "NO_GRANT");
  assert.equal(svc.entitlementFor({}).plan, "PROFESSIONAL");
  // Revocation path (subscription.disable) returns to COMMUNITY
  const revBody = JSON.stringify({ event: "subscription.disable", data: { reference: "ref-1" } });
  const revSig = crypto.createHmac("sha512", secret).update(revBody).digest("hex");
  const revoked = svc.handleWebhook({ rawBody: revBody, signature: revSig });
  assert.equal(revoked.outcome, "REVOKE");
  assert.equal(svc.entitlementFor({}).plan, "COMMUNITY");
});

// PAY-07 disable removes customer-facing option
test("PAY-07 disable forces customer-facing OFF + hides UI", () => {
  const { svc } = svcWithSecret(null);
  svc.configure({ environment: "TEST", secretKey: "sk_test_abc", actor: "admin", reason: "t" });
  svc.verify({ actor: "admin" });
  svc.setState({ to: "TEST", actor: "admin", reason: "t" });
  svc.setCustomerFacing({ on: true, actor: "admin", reason: "t" });
  svc.setState({ to: "DISABLED", actor: "admin", reason: "halt" });
  const st = svc.status({});
  assert.equal(st.customerFacing, "OFF");
  assert.equal(svc.availability({ customerTier: "PAID", upgradeRequired: true }).showPayment, false);
});

// PAY-11 secrets never reach client (status is masked, no secret field)
test("PAY-11 status snapshot carries no secret material", () => {
  const { svc } = svcWithSecret(null);
  svc.configure({ environment: "TEST", secretKey: "sk_test_abc123", actor: "admin", reason: "t" });
  const st = JSON.stringify(svc.status({}));
  assert.ok(!st.includes("sk_test_abc123"));
});

// PAY-12 audit records transitions; PAY-08/09/10 actor attribution + founder-independence
test("PAY-08/09/10/12 transitions audited with actor; no founder dependency", () => {
  const bus = stubBus();
  const secrets = { _m: new Map(), setSecret(k, v) { this._m.set(k, v); }, getSecret(k) { return this._m.get(k) || null; } };
  const svc = new PaymentService({ store: stubStore(), secrets, eventBus: bus });
  svc.configure({ environment: "TEST", secretKey: "sk_test_abc", actor: "some-admin", reason: "setup" });
  svc.verify({ actor: "some-admin" });
  svc.setState({ to: "TEST", actor: "some-admin", reason: "enable" });
  const actions = bus.published.map((p) => p.payload?.action);
  for (const a of ["PAYMENT_CONFIGURED", "PAYMENT_VERIFIED", "PAYMENT_ENABLED"]) {
    assert.ok(actions.includes(a), `missing audit ${a}`);
  }
  const actors = bus.published.map((p) => p.payload?.actor);
  assert.ok(actors.includes("some-admin"));
});

// Signature primitive: wrong secret fails, timing-safe path used
test("paystack HMAC verify primitive is strict", () => {
  const body = JSON.stringify({ event: "charge.success", data: {} });
  const good = crypto.createHmac("sha512", "s3cret").update(body).digest("hex");
  assert.equal(verifyPaystackSignature(body, good, "s3cret"), true);
  assert.equal(verifyPaystackSignature(body, good, "wrong"), false);
  assert.equal(verifyPaystackSignature(body, "", "s3cret"), false);
  const provider = new PaystackProvider({ environment: "TEST", secretKey: "sk_test_x" });
  assert.equal(provider.maskedConfig().secret.present, true);
  assert.ok(!JSON.stringify(provider.maskedConfig()).includes("sk_test_x"));
});
