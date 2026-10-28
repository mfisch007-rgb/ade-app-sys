import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const originalCwd = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-awbuli-public-"));
process.chdir(tmpRoot);

const { app, kernelReady } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const adminToken = () =>
  IdentityOnboarding.getInstance().issueSession({
    subject: "awbuli-public-admin",
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR",
    metadata: { pinVerified: true }
  }).token;

const call = async (method, url, body, token) => {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

test("awbuli public entry: unconfigured is truthful and has no number", async () => {
  const publicEntry = await call("GET", "/api/v1/awbuli/entry");
  assert.equal(publicEntry.status, 200);
  assert.equal(publicEntry.body.entry.configured, false);
  assert.equal(publicEntry.body.entry.number, null);
  assert.equal(publicEntry.body.entry.live, false);
  assert.equal(publicEntry.body.entry.source, null);
  assert.equal(publicEntry.body.entry.approvalState, "NOT_PUBLISHED");
});

test("awbuli public entry: explicit Admin approval publishes a usable public line without claiming live", async () => {
  const token = adminToken();
  const invalid = await call("POST", "/api/v1/admin/awbuli/public-entry", { number: "12" }, token);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "AWBULI_PUBLIC_NUMBER_INVALID");

  const published = await call("POST", "/api/v1/admin/awbuli/public-entry", {
    number: "+234 703 827 2792",
    clickToChatDestination: "+234 705 876 9114",
    phoneNumberId: "123456789012345",
    webhookUrl: "https://ade.example/api/v1/awbuli/webhook"
  }, token);
  assert.equal(published.status, 200);
  assert.equal(published.body.entry.number, "+2347038272792");
  assert.equal(published.body.entry.publicBusinessNumber, "+2347038272792");
  assert.equal(published.body.entry.clickToChatDestination, "+2347058769114");
  assert.equal(published.body.entry.clickToChatUrl, "https://wa.me/2347058769114?text=START");
  assert.equal(published.body.entry.cta.label, "Chat on WhatsApp");
  assert.equal(published.body.entry.cta.href, "https://wa.me/2347058769114?text=START");
  assert.equal(published.body.entry.phoneNumberId, "123456789012345");
  assert.equal(published.body.entry.phoneNumberIdConfigured, true);
  assert.equal(published.body.entry.providerTokenConfigured, false);
  assert.equal(published.body.entry.source, "ADMIN_SETTINGS");
  assert.equal(published.body.entry.approvalState, "ADMIN_APPROVED");
  assert.equal(published.body.entry.live, false);

  const publicEntry = await call("GET", "/api/v1/awbuli/entry");
  assert.equal(publicEntry.status, 200);
  assert.equal(publicEntry.body.entry.number, "+2347038272792");
  assert.equal(publicEntry.body.entry.display, "+2347038272792");
  assert.equal(publicEntry.body.entry.configured, true);
  assert.equal(publicEntry.body.entry.clickToChatDestination, "+2347058769114");
  assert.equal(publicEntry.body.entry.clickToChatUrl, "https://wa.me/2347058769114?text=START");
  assert.equal(publicEntry.body.entry.phoneNumberIdConfigured, true);
  assert.equal(publicEntry.body.entry.webhook.configured, false);
  assert.equal(publicEntry.body.entry.webhook.verified, false);
  assert.equal(publicEntry.body.entry.webhook.url, null);
  assert.equal(publicEntry.body.entry.phoneNumberId, undefined);
  assert.equal(publicEntry.body.entry.providerToken, undefined);
  assert.equal(publicEntry.body.entry.source, "ADMIN_SETTINGS");
  assert.equal(publicEntry.body.entry.live, false);

  const adminEntry = await call("GET", "/api/v1/admin/awbuli/public-entry", null, token);
  assert.equal(adminEntry.status, 200);
  assert.equal(adminEntry.body.entry.approvedBy, "awbuli-public-admin");
  assert.ok(adminEntry.body.entry.approvedAt);
  assert.equal(adminEntry.body.entry.webhook.url, "https://ade.example/api/v1/awbuli/webhook");
  assert.equal(adminEntry.body.entry.webhook.state, "NOT_CONFIGURED");

  const invalidWebhook = await call("POST", "/api/v1/admin/awbuli/public-entry", {
    number: "+2347038272792",
    webhookUrl: "http://insecure.example/hook"
  }, token);
  assert.equal(invalidWebhook.status, 400);
  assert.equal(invalidWebhook.body.error, "AWBULI_WEBHOOK_URL_INVALID");
});

test("awbuli public entry: provider and webhook configuration is reported without exposing secrets or claiming verification", async () => {
  const saved = {
    AWBULI_API_URL: process.env.AWBULI_API_URL,
    AWBULI_API_KEY: process.env.AWBULI_API_KEY,
    AWBULI_PHONE_NUMBER_ID: process.env.AWBULI_PHONE_NUMBER_ID,
    AWBULI_WEBHOOK_URL: process.env.AWBULI_WEBHOOK_URL,
    AWBULI_WEBHOOK_VERIFY_TOKEN: process.env.AWBULI_WEBHOOK_VERIFY_TOKEN
  };
  process.env.AWBULI_API_URL = "https://provider.example";
  process.env.AWBULI_API_KEY = "provider-secret-value";
  process.env.AWBULI_PHONE_NUMBER_ID = "987654321098765";
  process.env.AWBULI_WEBHOOK_URL = "https://ade.example/api/v1/awbuli/webhook";
  process.env.AWBULI_WEBHOOK_VERIFY_TOKEN = "webhook-secret-value";
  try {
    const token = adminToken();
    const adminEntry = await call("GET", "/api/v1/admin/awbuli/public-entry", null, token);
    assert.equal(adminEntry.status, 200);
    assert.equal(adminEntry.body.entry.phoneNumberId, "987654321098765");
    assert.equal(adminEntry.body.entry.phoneNumberIdConfigured, true);
    assert.equal(adminEntry.body.entry.providerTokenConfigured, true);
    assert.equal(adminEntry.body.entry.providerToken, "CONFIGURED");
    assert.equal(adminEntry.body.entry.providerState, "CONFIGURED_UNVERIFIED");
    assert.equal(adminEntry.body.entry.webhook.configured, true);
    assert.equal(adminEntry.body.entry.webhook.verified, false);
    assert.equal(adminEntry.body.entry.webhook.state, "CONFIGURED_UNVERIFIED");
    assert.equal(adminEntry.body.entry.live, false);
    assert.equal(JSON.stringify(adminEntry.body).includes("provider-secret-value"), false);
    assert.equal(JSON.stringify(adminEntry.body).includes("webhook-secret-value"), false);

    const publicEntry = await call("GET", "/api/v1/awbuli/entry");
    assert.equal(publicEntry.status, 200);
    assert.equal(publicEntry.body.entry.phoneNumberIdConfigured, true);
    assert.equal(publicEntry.body.entry.providerTokenConfigured, true);
    assert.equal(publicEntry.body.entry.webhook.configured, true);
    assert.equal(publicEntry.body.entry.webhook.url, null);
    assert.equal(publicEntry.body.entry.phoneNumberId, undefined);
    assert.equal(publicEntry.body.entry.providerToken, undefined);
    assert.equal(publicEntry.body.entry.live, false);
    assert.equal(JSON.stringify(publicEntry.body).includes("provider-secret-value"), false);
    assert.equal(JSON.stringify(publicEntry.body).includes("webhook-secret-value"), false);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("awbuli public entry: unpublish removes the public link and preserves the registry masks", async () => {
  const token = adminToken();
  const removed = await call("DELETE", "/api/v1/admin/awbuli/public-entry", null, token);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.entry.configured, false);
  assert.equal(removed.body.entry.number, null);
  assert.equal(removed.body.entry.clickToChatDestination, null);
  assert.equal(removed.body.entry.clickToChatUrl, null);
  assert.equal(removed.body.entry.cta, null);
  assert.equal(removed.body.entry.approvalState, "NOT_PUBLISHED");

  const publicEntry = await call("GET", "/api/v1/awbuli/entry");
  assert.equal(publicEntry.body.entry.number, null);
  assert.equal(publicEntry.body.entry.clickToChatUrl, null);
  assert.equal(publicEntry.body.entry.live, false);
});
