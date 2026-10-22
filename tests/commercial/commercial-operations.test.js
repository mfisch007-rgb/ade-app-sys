import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-commercial-test-"));
process.env.ADE_SESSION_REVOCATION_FILE = path.join(tempDir, "revocations.json");

after(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

const { CommercialOperations } = await import(
  pathToFileURL(path.resolve("src/commercial/CommercialOperations.js")).href
);
const { registerCommercialRoutes } = await import(
  pathToFileURL(path.resolve("src/routes/commercialRoutes.js")).href
);
const { IdentityOnboarding } = await import(
  pathToFileURL(path.resolve("src/kernel/IdentityOnboarding.js")).href
);
const { HttpSecurityBoundary } = await import(
  pathToFileURL(path.resolve("src/security/HttpSecurityBoundary.js")).href
);

function memoryStore() {
  const sections = new Map();
  return {
    sections,
    readSection(section) {
      return sections.get(section) || [];
    },
    writeSection(section, value) {
      sections.set(section, JSON.parse(JSON.stringify(value)));
    }
  };
}

function recorder() {
  const events = [];
  return {
    events,
    publish(topic, payload) {
      events.push({ topic, payload });
    }
  };
}

async function boot(t) {
  const { default: expressMod } = await import("express");
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));

  const store = memoryStore();
  const eventBus = recorder();
  const commercial = new CommercialOperations({ store, eventBus });

  const credentialStore = {
    getCredentialVersion: () => 1,
    ensureInitialized: async () => {},
    verifyPin: async () => false
  };
  const identity = new IdentityOnboarding({
    credentialStore,
    eventBus: { publish() {} }
  });
  const security = new HttpSecurityBoundary({ identity, credentialStore });

  registerCommercialRoutes({ app, security, commercial });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const token = (opts) => identity.issueSession(opts).token;
  const request = (bearer, method, url, body) =>
    fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

  const viewer = token({ subject: "viewer", level: 1, persona: "WORKFORCE", metadata: { role: "VIEWER", personId: "p-view", pinVerified: false } });
  const analyst = token({ subject: "analyst", level: 1, persona: "WORKFORCE", metadata: { role: "ANALYST", personId: "p-ana", pinVerified: false } });
  const operator = token({ subject: "operator", level: 2, persona: "WORKFORCE", metadata: { role: "OPERATOR", personId: "p-op", pinVerified: true } });
  const admin = token({ subject: "admin", level: 2, persona: "WORKFORCE", metadata: { role: "ADMIN", personId: "p-admin", pinVerified: false } });
  const adminPin = token({ subject: "admin", level: 2, persona: "WORKFORCE", metadata: { role: "ADMIN", personId: "p-admin", pinVerified: true } });
  const founder = token({ subject: "founder", level: 3, persona: "WORKFORCE", metadata: { role: "FOUNDER", personId: "p-founder", pinVerified: true } });

  return { request, token, viewer, analyst, operator, admin, adminPin, founder, commercial, store, eventBus };
}

test("commercial: unauthenticated reads are rejected and viewers cannot mutate", async (t) => {
  const { request, viewer } = await boot(t);

  const anon = await request(null, "GET", "/api/v1/commercial/overview");
  assert.equal(anon.status, 401);

  const read = await request(viewer, "GET", "/api/v1/commercial/overview");
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.success, true);
  assert.equal(body.overview.partnerAccess.enabled, false);

  const write = await request(viewer, "POST", "/api/v1/commercial/organizations", { name: "Nope Ltd" });
  assert.equal(write.status, 403);
});

test("commercial: pipeline lifecycle, transition guard and required terminal reason", async (t) => {
  const { request, operator, adminPin, store, eventBus } = await boot(t);

  const orgRes = await request(operator, "POST", "/api/v1/commercial/organizations", {
    name: "Acme Holdings",
    type: "PROSPECT",
    country: "NG"
  });
  assert.equal(orgRes.status, 201);
  const org = (await orgRes.json()).organization;
  assert.match(org.id, /^org_/);

  const oppRes = await request(operator, "POST", "/api/v1/commercial/opportunities", {
    organizationId: org.id,
    title: "ADE pilot",
    currency: "USD",
    proposedMinor: 250000
  });
  assert.equal(oppRes.status, 201);
  const opp = (await oppRes.json()).opportunity;
  assert.equal(opp.stage, "DISCOVERED");

  const qualify = await request(operator, "POST", `/api/v1/commercial/opportunities/${opp.id}/transition`, {
    to: "QUALIFIED",
    reason: "Discovery call completed"
  });
  assert.equal(qualify.status, 200);
  assert.equal((await qualify.json()).opportunity.stage, "QUALIFIED");

  const illegal = await request(operator, "POST", `/api/v1/commercial/opportunities/${opp.id}/transition`, {
    to: "ONBOARDING"
  });
  assert.equal(illegal.status, 400);
  assert.equal((await illegal.json()).error, "OPPORTUNITY_TRANSITION_FORBIDDEN");

  const listed = await request(adminPin, "GET", "/api/v1/commercial/opportunities?stage=QUALIFIED");
  assert.equal(listed.status, 200);
  const listBody = await listed.json();
  assert.equal(listBody.count, 1);
  assert.equal(listBody.opportunities[0].stageHistory.length, 2);

  const terminalNoReason = await request(operator, "POST", `/api/v1/commercial/opportunities/${opp.id}/transition`, {
    to: "DISQUALIFIED"
  });
  assert.equal(terminalNoReason.status, 400);
  assert.equal((await terminalNoReason.json()).error, "OPPORTUNITY_TERMINAL_REASON_REQUIRED");

  assert.ok(store.sections.has("commercial_organizations"));
  assert.ok(store.sections.has("commercial_opportunities"));
  assert.ok(eventBus.events.some((e) => e.topic === "audit.log.created"));
  assert.ok(eventBus.events.some((e) => e.topic === "commercial.organization.created"));
});

test("commercial: finance evidence, PIN step-up and collected-only commission", async (t) => {
  const { request, operator, admin, adminPin, founder } = await boot(t);

  const org = (await (await request(operator, "POST", "/api/v1/commercial/organizations", {
    name: "Finance Co",
    type: "CUSTOMER"
  })).json()).organization;

  const opp = (await (await request(operator, "POST", "/api/v1/commercial/opportunities", {
    organizationId: org.id,
    title: "Finance pilot",
    currency: "USD"
  })).json()).opportunity;

  const noPin = await request(admin, "POST", "/api/v1/commercial/revenue", {
    opportunityId: opp.id,
    kind: "PROPOSED",
    amountMinor: 100000,
    currency: "USD"
  });
  assert.equal(noPin.status, 403);
  assert.equal((await noPin.json()).error, "ELEVATED_PIN_REQUIRED");

  const collectedNoEvidence = await request(adminPin, "POST", "/api/v1/commercial/revenue", {
    opportunityId: opp.id,
    kind: "COLLECTED",
    amountMinor: 100000,
    currency: "USD",
    reference: "INV-1"
  });
  assert.equal(collectedNoEvidence.status, 400);
  assert.equal((await collectedNoEvidence.json()).error, "COLLECTED_EVIDENCE_REQUIRED");

  const proposed = await request(adminPin, "POST", "/api/v1/commercial/revenue", {
    opportunityId: opp.id,
    kind: "PROPOSED",
    amountMinor: 100000,
    currency: "USD"
  });
  assert.equal(proposed.status, 201);

  const agreementRes = await request(adminPin, "POST", "/api/v1/commercial/agreements", {
    opportunityId: opp.id,
    type: "CUSTOMER",
    currency: "USD",
    commissionRateBps: 1000
  });
  assert.equal(agreementRes.status, 201);
  const agreement = (await agreementRes.json()).agreement;
  assert.equal(agreement.status, "DRAFT");

  const operatorApprove = await request(operator, "POST", `/api/v1/commercial/agreements/${agreement.id}/approve`, {
    evidenceRef: "signed-contract"
  });
  assert.equal(operatorApprove.status, 403);

  const noEvidence = await request(founder, "POST", `/api/v1/commercial/agreements/${agreement.id}/approve`, {});
  assert.equal(noEvidence.status, 400);
  assert.equal((await noEvidence.json()).error, "AGREEMENT_EVIDENCE_REQUIRED");

  const approved = await request(founder, "POST", `/api/v1/commercial/agreements/${agreement.id}/approve`, {
    evidenceRef: "signed-contract-ref",
    note: "Countersigned"
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).agreement.status, "ACTIVE");

  const collected = await request(adminPin, "POST", "/api/v1/commercial/revenue", {
    agreementId: agreement.id,
    kind: "COLLECTED",
    amountMinor: 50000,
    currency: "USD",
    reference: "PAY-1",
    evidenceRef: "bank-statement-1"
  });
  assert.equal(collected.status, 201);

  const refund = await request(adminPin, "POST", "/api/v1/commercial/revenue", {
    agreementId: agreement.id,
    kind: "REFUNDED",
    amountMinor: 10000,
    currency: "USD"
  });
  assert.equal(refund.status, 201);

  const commissionRes = await request(adminPin, "POST", `/api/v1/commercial/agreements/${agreement.id}/commission`);
  assert.equal(commissionRes.status, 201);
  const commission = (await commissionRes.json()).commission;
  assert.equal(commission.status, "ACCRUED");
  assert.equal(commission.commissionBaseMinor, 40000);
  assert.equal(commission.amountMinor, 4000);

  const operatorSettle = await request(operator, "POST", `/api/v1/commercial/commissions/${commission.id}/settle`, {
    settlementRef: "BANK-1"
  });
  assert.equal(operatorSettle.status, 403);

  const noRef = await request(founder, "POST", `/api/v1/commercial/commissions/${commission.id}/settle`, {});
  assert.equal(noRef.status, 400);
  assert.equal((await noRef.json()).error, "SETTLEMENT_REFERENCE_REQUIRED");

  const settled = await request(founder, "POST", `/api/v1/commercial/commissions/${commission.id}/settle`, {
    settlementRef: "BANK-1",
    evidenceRef: "transfer-receipt-1"
  });
  assert.equal(settled.status, 200);
  assert.equal((await settled.json()).commission.status, "PAID");

  const overview = await (await request(adminPin, "GET", "/api/v1/commercial/overview")).json();
  assert.equal(overview.overview.pipeline.proposedMinor, 100000);
  assert.equal(overview.overview.pipeline.collectedMinor, 50000);
  assert.equal(overview.overview.pipeline.reversalsMinor, 10000);
  assert.equal(overview.overview.pipeline.netCollectedMinor, 40000);
  assert.equal(overview.overview.commissions.paidMinor, 4000);
});

test("commercial: decisions are founder-only and require rationale and evidence", async (t) => {
  const { request, operator, adminPin, founder } = await boot(t);

  const org = (await (await request(operator, "POST", "/api/v1/commercial/organizations", { name: "Decision Co" })).json()).organization;
  const opp = (await (await request(operator, "POST", "/api/v1/commercial/opportunities", {
    organizationId: org.id,
    title: "Decision pilot"
  })).json()).opportunity;

  const notFounder = await request(adminPin, "POST", "/api/v1/commercial/decisions", {
    opportunityId: opp.id,
    decision: "CONTINUE",
    rationale: "Looks good",
    evidence: ["doc-1"]
  });
  assert.equal(notFounder.status, 403);

  const noEvidence = await request(founder, "POST", "/api/v1/commercial/decisions", {
    opportunityId: opp.id,
    decision: "CONTINUE",
    rationale: "Looks good"
  });
  assert.equal(noEvidence.status, 400);
  assert.equal((await noEvidence.json()).error, "DECISION_EVIDENCE_REQUIRED");

  const recorded = await request(founder, "POST", "/api/v1/commercial/decisions", {
    opportunityId: opp.id,
    decision: "CONTINUE",
    rationale: "Pilot evidence supports continuation",
    evidence: ["pilot-report-1"]
  });
  assert.equal(recorded.status, 201);
  const decision = (await recorded.json()).decision;
  assert.equal(decision.decision, "CONTINUE");
  assert.equal(decision.decidedBy, "founder");

  const listed = await request(adminPin, "GET", `/api/v1/commercial/decisions?opportunityId=${opp.id}`);
  assert.equal((await listed.json()).count, 1);
});

test("commercial: inbound is sanitised, idempotent and linkable", async (t) => {
  const { request, operator, analyst } = await boot(t);

  const org = (await (await request(operator, "POST", "/api/v1/commercial/organizations", { name: "Inbound Co" })).json()).organization;
  const opp = (await (await request(operator, "POST", "/api/v1/commercial/opportunities", {
    organizationId: org.id,
    title: "Inbound pilot"
  })).json()).opportunity;

  const first = await request(analyst, "POST", "/api/v1/commercial/inbound", {
    provider: "EMAIL",
    providerMessageId: "msg-1",
    sender: "buyer@example.com",
    subject: "Interest",
    body: '<script>alert("x")</script><b>Hello</b> team'
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.duplicate, false);
  assert.equal(firstBody.inbound.bodyText, "Hello team");
  assert.equal(firstBody.inbound.treatAsDataOnly, true);

  const duplicate = await request(analyst, "POST", "/api/v1/commercial/inbound", {
    provider: "EMAIL",
    providerMessageId: "msg-1",
    body: "second copy"
  });
  assert.equal(duplicate.status, 200);
  const duplicateBody = await duplicate.json();
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicateBody.inbound.id, firstBody.inbound.id);

  const linked = await request(analyst, "POST", `/api/v1/commercial/inbound/${firstBody.inbound.id}/link`, {
    opportunityId: opp.id,
    assignedTo: "operator"
  });
  assert.equal(linked.status, 200);
  const linkedBody = await linked.json();
  assert.equal(linkedBody.inbound.status, "LINKED");
  assert.equal(linkedBody.inbound.opportunityId, opp.id);

  const invalid = await request(analyst, "POST", "/api/v1/commercial/inbound", {
    provider: "CARRIER_PIGEON",
    providerMessageId: "msg-2"
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "INBOUND_PROVIDER_INVALID");
});

test("commercial: tenancy isolates records and default scope stays global", () => {
  const commercial = new CommercialOperations({ store: memoryStore() });
  const actor = { username: "operator", role: "OPERATOR" };

  commercial.createOrganization({ name: "Tenant A", tenantScope: "tenant-a", actor });
  commercial.createOrganization({ name: "Global", tenantScope: "default", actor });

  assert.equal(commercial.listOrganizations({ tenantScope: "tenant-a" }).length, 2);
  assert.equal(commercial.listOrganizations({ tenantScope: "tenant-b" }).length, 1);
  assert.equal(commercial.listOrganizations({ tenantScope: "tenant-b" })[0].name, "Global");
  assert.throws(
    () => commercial.getOrganization(commercial.listOrganizations({ tenantScope: "tenant-a" }).find((o) => o.name === "Tenant A").id, { tenantScope: "tenant-b" }),
    /TENANT_MISMATCH/
  );
});

test("commercial: pilot recommendation never invents demand", () => {
  const commercial = new CommercialOperations({ store: memoryStore() });
  const operator = { username: "operator", role: "OPERATOR" };
  const researcher = { username: "analyst", role: "ANALYST" };

  const org = commercial.createOrganization({ name: "Pilot Co", actor: operator });
  const opp = commercial.createOpportunity({
    organizationId: org.id,
    title: "Pilot opportunity",
    currency: "USD",
    actor: operator
  });
  commercial.recordActivity({
    opportunityId: opp.id,
    type: "INCOMING_MESSAGE",
    subject: "Feedback",
    actor: researcher
  });
  const pilot = commercial.createPilot({
    opportunityId: opp.id,
    product: "ADE",
    acceptanceCriteria: ["Two workflows deployed"],
    paid: true,
    currency: "USD",
    amountMinor: 10000,
    actor: operator
  });

  const empty = commercial.pilotRecommendation(pilot.id);
  assert.equal(empty.recommendation, "INSUFFICIENT_DATA");
  assert.equal(empty.advisoryOnly, true);
  assert.ok(empty.evidenceGaps.includes("NO_MILESTONES"));
  assert.ok(empty.evidenceGaps.includes("NO_COLLECTED_REVENUE"));

  const withMilestone = commercial.addMilestone(pilot.id, {
    title: "Deploy workflow",
    evidenceRef: "deploy-log-1",
    actor: operator
  });
  const milestone = withMilestone.milestones[0];
  commercial.setMilestoneStatus(pilot.id, milestone.id, "MET", {
    evidenceRef: "deploy-log-1",
    actor: operator
  });

  const stillNoRevenue = commercial.pilotRecommendation(pilot.id);
  assert.equal(stillNoRevenue.recommendation, "CONTINUE");
  assert.ok(stillNoRevenue.evidenceGaps.includes("NO_COLLECTED_REVENUE"));
});
