import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, kernelReady } from "../src/app.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";
import { VenueRegistry } from "../src/trading/VenueRegistry.js";

// Venue trust boundary: VERIFIED status must be proven by a live adapter
// handshake (Founder L3 verify flow), never self-attested via a metadata
// body. Unconfigured venues fail closed to PAPER_ONLY throughout.

function stubStore() {
  const sections = {};
  return {
    readSection: (k) => sections[k] ?? null,
    writeSection: (k, v) => { sections[k] = v; },
  };
}

test("VENUE-01 setConfigured cannot self-attest VERIFIED", () => {
  const vr = new VenueRegistry({ store: stubStore() });
  const v = vr.setConfigured("fbs", { configured: true, verified: true });
  assert.equal(v.status, "CONFIGURED");
  assert.equal(vr.liveEligibility("fbs").eligible, false);
  assert.equal(vr.liveEligibility("fbs").mode, "PAPER_ONLY");
});

test("VENUE-02 recordHandshake is the only path to VERIFIED", () => {
  const vr = new VenueRegistry({ store: stubStore() });
  assert.throws(() => vr.recordHandshake("nope", { method: "X" }), /VENUE_NOT_FOUND/);
  assert.throws(() => vr.recordHandshake("fbs", { method: "" }), /VENUE_HANDSHAKE_METHOD_REQUIRED/);
  const v = vr.recordHandshake("fbs", { method: "TEST_HANDSHAKE", verifiedBy: "test-founder" });
  assert.equal(v.status, "VERIFIED");
  assert.ok(v.verifiedAt);
  assert.equal(v.verifiedBy, "test-founder");
  assert.equal(vr.liveEligibility("fbs").eligible, true);
});

let server = null;
let baseUrl = null;
const l2Token = () =>
  IdentityOnboarding.getInstance().issueSession({ subject: "venue-op", tier: "COMMUNITY", level: 2, persona: "OPERATOR" }).token;
const l3Token = () =>
  IdentityOnboarding.getInstance().issueSession({ subject: "venue-founder", tier: "ENTERPRISE", level: 3, persona: "FOUNDER" }).token;

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

test("VENUE-03 configure/PATCH reject asserted verified:true", async () => {
  const H2 = { "Content-Type": "application/json", Authorization: `Bearer ${l2Token()}` };
  const legacy = await fetch(`${baseUrl}/api/v1/venue/fbs/configure`, { method: "POST", headers: H2, body: JSON.stringify({ configured: true, verified: true }) });
  assert.equal(legacy.status, 400);
  assert.equal((await legacy.json()).error, "VENUE_VERIFY_REQUIRES_HANDSHAKE");
  const patch = await fetch(`${baseUrl}/api/v1/trading/venues/fbs`, { method: "PATCH", headers: H2, body: JSON.stringify({ configured: true, verified: true }) });
  assert.equal(patch.status, 400);
  assert.equal((await patch.json()).error, "VENUE_VERIFY_REQUIRES_HANDSHAKE");
  // Honest configured-only update still works and stays unverified.
  const ok = await fetch(`${baseUrl}/api/v1/trading/venues/fbs`, { method: "PATCH", headers: H2, body: JSON.stringify({ configured: true }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).venue.status, "CONFIGURED");
});

test("VENUE-04 verify is Founder-gated and fail-closed without adapter or creds", async () => {
  const H2 = { "Content-Type": "application/json", Authorization: `Bearer ${l2Token()}` };
  const H3 = { "Content-Type": "application/json", Authorization: `Bearer ${l3Token()}` };
  assert.equal((await fetch(`${baseUrl}/api/v1/trading/venues/fbs/verify`, { method: "POST", headers: H2, body: "{}" })).status, 403);
  const missing = await fetch(`${baseUrl}/api/v1/trading/venues/no-such-venue/verify`, { method: "POST", headers: H3, body: "{}" });
  assert.equal(missing.status, 404);
  // Deriv has a venue record but no execution adapter: PROVIDER_REQUIRED, no crash.
  const deriv = await fetch(`${baseUrl}/api/v1/trading/venues/deriv/verify`, { method: "POST", headers: H3, body: "{}" });
  assert.equal(deriv.status, 422);
  assert.equal((await deriv.json()).error, "VENUE_ADAPTER_REQUIRED");
  // FBS adapter exists but no credentials are configured in this environment:
  // fail-closed, venue stays CONFIGURED (never auto-upgraded).
  const fbs = await fetch(`${baseUrl}/api/v1/trading/venues/fbs/verify`, { method: "POST", headers: H3, body: "{}" });
  assert.equal(fbs.status, 422);
  const fbsBody = await fbs.json();
  assert.equal(fbsBody.error, "VENUE_CREDENTIAL_REQUIRED");
  assert.equal(fbsBody.mode, "PAPER_ONLY");
  assert.ok(Array.isArray(fbsBody.requiredFields) && fbsBody.requiredFields.length > 0);
  const elig = await (await fetch(`${baseUrl}/api/v1/trading/venues/fbs/eligibility`, { headers: H3 })).json();
  assert.equal(elig.eligible, false);
});
