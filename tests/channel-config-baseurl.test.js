import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, kernelReady } from "../src/app.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";

/**
 * Channel configure contract — regression for the Admin "Configure channel"
 * modal dropping the Provider Endpoint field.
 *
 * The modal collects cfgEndpoint; the handler must forward it as `baseUrl`
 * (the backend's canonical field alongside webhookUrl). This test pins the
 * backend side of that contract: baseUrl accepted, persisted to the channel
 * record, secrets never echoed, auth + validation enforced.
 */

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const issueL2 = () =>
  IdentityOnboarding.getInstance().issueSession({
    subject: `chan-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR"
  }).token;

test("CHANNEL-CONFIG-1 — baseUrl (provider endpoint) is accepted and marks configured", async () => {
  const token = issueL2();
  const res = await fetch(`${baseUrl}/api/v1/connect/channels/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channelId: "TEST_ENDPOINT_PROBE", baseUrl: "https://provider.example/api" })
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.channel, "TEST_ENDPOINT_PROBE");
  assert.equal(body.configured, true);
});

test("CHANNEL-CONFIG-2 — secret values are never echoed back", async () => {
  const token = issueL2();
  const secret = `sk-test-${Date.now()}`;
  const res = await fetch(`${baseUrl}/api/v1/connect/channels/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channelId: "TEST_SECRET_PROBE", apiKey: secret, baseUrl: "https://provider.example/api" })
  });
  const raw = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!raw.includes(secret), "raw secret must never appear in the response");
});

test("CHANNEL-CONFIG-3 — unauthenticated configure is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/v1/connect/channels/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId: "X", baseUrl: "https://example.com" })
  });
  assert.equal(res.status, 401);
});

test("CHANNEL-CONFIG-4 — missing channel id is a 400, not a silent no-op", async () => {
  const token = issueL2();
  const res = await fetch(`${baseUrl}/api/v1/connect/channels/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ baseUrl: "https://example.com" })
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, "CHANNEL_REQUIRED");
});
