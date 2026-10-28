import { test } from "node:test";
import assert from "node:assert/strict";
import AccessAdministration from "../src/commerce/AccessAdministration.js";

function storeStub() {
  const sections = {};
  return {
    _sections: sections,
    readSection(key) {
      return sections[key] ?? null;
    },
    async readSectionStrictAsync(key) {
      return sections[key] ?? null;
    },
    writeSection(key, value) {
      sections[key] = structuredClone(value);
    },
    async writeSectionAsync(key, value) {
      sections[key] = structuredClone(value);
    }
  };
}

function busStub() {
  const published = [];
  return { published, publish(topic, payload) { published.push({ topic, payload }); } };
}

const FOUNDER = { id: "WRF-1", username: "founder", role: "FOUNDER" };
const ADMIN = { id: "WRF-2", username: "admin.one", role: "ADMIN" };
const OPERATOR = { id: "WRF-3", username: "operator.one", role: "OPERATOR" };
const TARGET = { id: "WRF-4", username: "pilot.owner", role: "OPERATOR" };

test("ACCESS-1 grant records an administrative trial, never a payment", async () => {
  const store = storeStub();
  const bus = busStub();
  const access = new AccessAdministration({ store, eventBus: bus });
  const grant = await access.grant({
    tenantScope: "default",
    account: TARGET,
    product: "AWBULI",
    tier: "TRIAL",
    days: 7,
    actor: FOUNDER,
    reason: "pilot evaluation"
  });
  assert.equal(grant.tier, "TRIAL");
  assert.equal(grant.source, "ADMIN_TRIAL");
  assert.equal(grant.via, "ADMIN_ENTITLEMENT");
  assert.equal(grant.paymentReference, null);
  assert.equal(grant.paymentStatus, "NOT_APPLICABLE");
  assert.equal(grant.status, "ACTIVE");
  assert.ok(grant.expiresAt);
  assert.ok(bus.published.some((p) => p.payload?.action === "ACCESS_GRANTED"));
  const serialized = JSON.stringify(await access.list({ tenantScope: "default" }));
  assert.ok(!/password|secret|token/i.test(serialized));
});

test("ACCESS-2 effective access is account+product scoped and tenant isolated", async () => {
  const access = new AccessAdministration({ store: storeStub() });
  await access.grant({
    tenantScope: "tenant-a",
    account: TARGET,
    product: "PROCARTA",
    tier: "PAID",
    days: 30,
    actor: ADMIN,
    reason: "approved administrative entitlement"
  });
  const effective = await access.effectiveAccess({
    tenantScope: "tenant-a",
    accountId: TARGET.id,
    product: "PROCARTA"
  });
  assert.equal(effective.tier, "PAID");
  assert.equal(effective.via, "ADMIN_ENTITLEMENT");
  const isolated = await access.effectiveAccess({
    tenantScope: "tenant-b",
    accountId: TARGET.id,
    product: "PROCARTA"
  });
  assert.equal(isolated.tier, "COMMUNITY");
  assert.equal(isolated.source, "EDITION_POLICY");
  const otherProduct = await access.effectiveAccess({
    tenantScope: "tenant-a",
    accountId: TARGET.id,
    product: "AWBULI"
  });
  assert.equal(otherProduct.tier, "COMMUNITY");
});

test("ACCESS-3 role policy blocks Operator PAID grants and self-grants", async () => {
  const access = new AccessAdministration({ store: storeStub() });
  await assert.rejects(
    access.grant({
      account: TARGET,
      product: "AWBULI",
      tier: "PAID",
      days: 7,
      actor: OPERATOR,
      reason: "operator escalation attempt"
    }),
    /ACCESS_TIER_NOT_PERMITTED/
  );
  await assert.rejects(
    access.grant({
      account: OPERATOR,
      product: "AWBULI",
      tier: "TRIAL",
      days: 7,
      actor: OPERATOR,
      reason: "self grant attempt"
    }),
    /SELF_GRANT_FORBIDDEN/
  );
  await assert.rejects(
    access.grant({
      account: { id: "WRF-F", username: "founder", role: "FOUNDER" },
      product: "AWBULI",
      tier: "TRIAL",
      days: 7,
      actor: ADMIN,
      reason: "founder already has inherent access"
    }),
    /FOUNDER_ACCESS_INHERENT/
  );
});

test("ACCESS-4 trial extension is bounded; expired trials restart inside policy window", async () => {
  const store = storeStub();
  const access = new AccessAdministration({ store });
  const first = await access.grant({
    account: TARGET,
    product: "AWBULI",
    tier: "TRIAL",
    days: 7,
    actor: ADMIN,
    reason: "initial trial"
  });
  const extended = await access.extend({
    grantId: first.id,
    days: 7,
    actor: ADMIN,
    reason: "mid-trial extension"
  });
  assert.equal(extended.status, "ACTIVE");
  await assert.rejects(
    access.extend({
      grantId: first.id,
      days: 2,
      actor: ADMIN,
      reason: "over the 15-day admin limit"
    }),
    /TRIAL_WINDOW_EXCEEDED/
  );
  store._sections.accessAdministration.grants[0].expiresAt = new Date(Date.now() - 1000).toISOString();
  const expired = await access.list({ tenantScope: "default", accountId: TARGET.id });
  assert.equal(expired[0].status, "EXPIRED");
  const revived = await access.extend({
    grantId: first.id,
    days: 14,
    actor: ADMIN,
    reason: "renew expired trial inside window"
  });
  assert.equal(revived.status, "ACTIVE");
});

test("ACCESS-5 superseding and revocation preserve an audit trail", async () => {
  const store = storeStub();
  const access = new AccessAdministration({ store });
  const first = await access.grant({
    account: TARGET,
    product: "AWBULI",
    tier: "TRIAL",
    days: 7,
    actor: FOUNDER,
    reason: "first trial"
  });
  const second = await access.grant({
    account: TARGET,
    product: "AWBULI",
    tier: "PAID",
    days: 30,
    actor: FOUNDER,
    reason: "converted to administrative paid access"
  });
  const all = await access.list({ tenantScope: "default", accountId: TARGET.id });
  assert.equal(all.find((g) => g.id === first.id).status, "SUPERSEDED");
  assert.equal(all.find((g) => g.id === second.id).status, "ACTIVE");
  const revoked = await access.revoke({
    grantId: second.id,
    actor: FOUNDER,
    reason: "pilot completed"
  });
  assert.equal(revoked.status, "REVOKED");
  const events = store._sections.accessAdministration.history.map((h) => h.action);
  assert.ok(events.includes("GRANTED"));
  assert.ok(events.includes("SUPERSEDED"));
  assert.ok(events.includes("REVOKED"));
});

test("ACCESS-6 Operator cannot manage grants created by another role", async () => {
  const access = new AccessAdministration({ store: storeStub() });
  const grant = await access.grant({
    account: TARGET,
    product: "AWBULI",
    tier: "TRIAL",
    days: 7,
    actor: FOUNDER,
    reason: "founder-issued trial"
  });
  await assert.rejects(
    access.revoke({
      grantId: grant.id,
      actor: OPERATOR,
      reason: "operator attempts cross-role revoke"
    }),
    /INSUFFICIENT_AUTHORIZATION/
  );
});
