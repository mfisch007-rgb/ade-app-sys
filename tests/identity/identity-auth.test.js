import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { IdentityOnboarding } = await import(
  pathToFileURL(path.resolve("src/kernel/IdentityOnboarding.js")).href
);

function freshIdentity() {
  const credentialStore = {
    getCredentialVersion: () => 1,
    ensureInitialized: async () => {},
    verifyPin: async (pin) => pin === "123456"
  };
  const eventBus = { publish() {} };
  const identity = new IdentityOnboarding({ credentialStore, eventBus });
  return { identity, eventBus };
}

test("identity: workforce sessions carry role metadata and pin verification claim", async (t) => {
  const { identity } = freshIdentity();

  const base = identity.issueSession({
    subject: "operator",
    tier: "COMMUNITY",
    level: 2,
    persona: "WORKFORCE",
    edition: "COMMUNITY",
    metadata: { role: "OPERATOR", personId: "WRF-00001", pinVerified: false }
  });

  const claims = identity.verifySession(base.token);
  assert.equal(claims.persona, "WORKFORCE");
  assert.equal(claims.level, 2);
  assert.equal(claims.role, "OPERATOR");
  assert.equal(claims.personId, "WRF-00001");
  assert.equal(claims.pinVerified, false);

  const elevated = identity.issueSession({
    subject: "operator",
    tier: "COMMUNITY",
    level: 2,
    persona: "WORKFORCE",
    edition: "COMMUNITY",
    metadata: { role: "OPERATOR", personId: "WRF-00001", pinVerified: true }
  });
  const elevatedClaims = identity.verifySession(elevated.token);
  assert.equal(elevatedClaims.pinVerified, true);
});

test("identity: revoked sessions are rejected", async (t) => {
  const { identity } = freshIdentity();
  const session = identity.issueSession({
    subject: "analyst",
    persona: "WORKFORCE",
    level: 1,
    edition: "COMMUNITY"
  });
  assert.ok(identity.verifySession(session.token));
  identity.revokeSession(session.token);
  assert.throws(() => identity.verifySession(session.token), /revoked/);
});

test("identity: authorization gates exact role and persona boundaries", async (t) => {
  const { identity } = freshIdentity();
  const claims = {
    level: 2,
    persona: "WORKFORCE",
    role: "OPERATOR",
    pinVerified: true
  };
  assert.equal(identity.authorize(claims, { level: 2 }), true);
  assert.equal(identity.authorize(claims, { level: 3 }), false);
  assert.equal(identity.authorize(claims, { personas: ["ADMIN"] }), false);
  assert.equal(identity.authorize(claims, { roles: ["OPERATOR"] }), true);
});

test("identity: forged tokens fail cryptographic verification", (t) => {
  const { identity } = freshIdentity();
  const session = identity.issueSession({
    subject: "viewer",
    persona: "WORKFORCE",
    level: 1,
    edition: "COMMUNITY"
  });
  const [header, body] = session.token.split(".");
  const tampered = `${header}.${body}.${crypto.randomBytes(64).toString("base64url")}`;
  assert.throws(() => identity.verifySession(tampered), /verification failed/);
});