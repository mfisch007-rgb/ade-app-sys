import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ade-gate5-"));
const previousCwd = process.cwd();
const previousCredentialStore = process.env.ADE_CREDENTIAL_STORE_FILE;
const previousPinHash = process.env.ADE_ADMIN_PIN_HASH;
process.chdir(sandbox);
process.env.ADE_CREDENTIAL_STORE_FILE = path.join(sandbox, "admin-credential.json");
delete process.env.ADE_ADMIN_PIN_HASH;

const { app, kernelReady, commercialEntitlement } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

await IdentityOnboarding.getInstance().credentialStore.ensureInitialized(bcrypt.hashSync("123456", 4));

const tenantScope = `gate5-payments-${Date.now()}`;
const accountId = `gate5-admin-${Date.now()}`;
const secret = "sk_test_gate5_runtime";

let server = null;
let baseUrl = null;

function tokenFor({ level = 2, pinVerified = true, persona = "ADMIN", tenantId = tenantScope } = {}) {
  return IdentityOnboarding.getInstance().issueSession({
    subject: accountId,
    tier: "COMMUNITY",
    level,
    persona,
    metadata: { tenantId, pinVerified }
  }).token;
}

async function call(method, url, body, token) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      server.keepAliveTimeout = 120000;
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  process.chdir(previousCwd);
  if (previousCredentialStore === undefined) delete process.env.ADE_CREDENTIAL_STORE_FILE;
  else process.env.ADE_CREDENTIAL_STORE_FILE = previousCredentialStore;
  if (previousPinHash === undefined) delete process.env.ADE_ADMIN_PIN_HASH;
  else process.env.ADE_ADMIN_PIN_HASH = previousPinHash;
  fs.rmSync(sandbox, { recursive: true, force: true });
});

test("GATE5 — payment control plane denies anonymous and non-administrator sessions", async () => {
  const anonymous = await call("GET", "/api/v1/admin/payments/status");
  assert.equal(anonymous.status, 401);

  const operator = await call("GET", "/api/v1/admin/payments/status", null, tokenFor({ level: 2, persona: "OPERATOR", pinVerified: true }));
  assert.equal(operator.status, 403);
  assert.equal(operator.body.error, "INSUFFICIENT_AUTHORIZATION");
});

test("GATE5 — payment admin scope comes from authenticated claims, not request tenant input", async () => {
  const token = tokenFor({ level: 3, pinVerified: true });
  const configured = await call("POST", `/api/v1/admin/payments/configure?tenant=forged-tenant`, {
    tenantScope: "forged-body-tenant",
    environment: "TEST",
    secretKey: secret,
    planMappings: { PLN_gate5: "PROFESSIONAL" },
    reason: "Gate 5 tenant-scope proof"
  }, token);
  assert.equal(configured.status, 200);
  assert.equal(configured.body.payment.tenantScope, tenantScope);
  assert.equal(configured.body.payment.configured, true);
  assert.equal(JSON.stringify(configured.body).includes(secret), false);

  const verified = await call("POST", "/api/v1/admin/payments/verify", { tenantScope: "forged-body-tenant" }, token);
  assert.equal(verified.status, 200);
  assert.equal(verified.body.payment.tenantScope, tenantScope);
  assert.equal(verified.body.payment.verified, true);

  const enabled = await call("POST", "/api/v1/admin/payments/state", {
    tenantScope: "forged-body-tenant",
    to: "TEST",
    reason: "Gate 5 test-mode proof"
  }, token);
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.payment.tenantScope, tenantScope);
  assert.equal(enabled.body.payment.state, "TEST");

  const customer = await call("POST", "/api/v1/admin/payments/customer-facing", {
    tenantScope: "forged-body-tenant",
    on: true,
    reason: "Gate 5 customer-facing proof"
  }, token);
  assert.equal(customer.status, 200);
  assert.equal(customer.body.payment.tenantScope, tenantScope);
  assert.equal(customer.body.payment.customerFacing, "ON");

  const status = await call("GET", "/api/v1/admin/payments/status?tenant=forged-tenant", null, token);
  assert.equal(status.status, 200);
  assert.equal(status.body.payment.tenantScope, tenantScope);
  assert.equal(status.body.payment.state, "TEST");
  assert.equal(status.body.payment.customerFacing, "ON");
  assert.equal(JSON.stringify(status.body).includes(secret), false);
});

test("GATE5 — a verified provider settlement raises the account runtime tier; public start cannot target it", async () => {
  const token = tokenFor({ level: 3, pinVerified: true });
  const paymentService = commercialEntitlement.paymentService;
  const intent = paymentService.startPayment({
    tenantScope,
    amountKobo: 250000,
    email: "buyer@example.com",
    planCode: "PLN_gate5",
    metadata: { adminInitiated: true }
  });
  const body = JSON.stringify({
    event: "charge.success",
    data: { reference: intent.reference, amount: 250000, plan: { plan_code: "PLN_gate5" } }
  });
  const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");
  const granted = paymentService.handleWebhook({ tenantScope, rawBody: body, signature });
  assert.equal(granted.outcome, "GRANT");
  assert.equal(granted.entitlement.plan, "PROFESSIONAL");

  const runtime = await call("GET", "/api/v1/account/runtime-entitlement", null, token);
  assert.equal(runtime.status, 200);
  assert.equal(runtime.body.products.PROCARTA.tier, "PAID");
  assert.equal(runtime.body.products.PROCARTA.source, "PAYSTACK:charge.success");
  assert.equal(runtime.body.products.AWBULI.tier, "PAID");
  assert.equal(runtime.body.products.AWBULI.source, "PAYSTACK:charge.success");

  const publicStart = await call("POST", "/api/v1/payments/start", {
    amountKobo: 250000,
    email: "buyer@example.com",
    tenant: "default"
  });
  assert.equal(publicStart.status, 400);
  assert.equal(publicStart.body.error, "PAYMENT_DISABLED");
});
