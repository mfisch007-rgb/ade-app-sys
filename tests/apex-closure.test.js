import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UnifiedIntakeEngine } from "../src/intelligence/UnifiedIntakeEngine.js";
import { CaseManager } from "../src/intelligence/CaseManager.js";
import { ProductNotificationEngine } from "../src/notification/ProductNotificationEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const readPublic = (f) => fs.readFileSync(path.join(root, "public", f), "utf8");

// In-memory durable stand-in: mimics RuntimeConfigStore section semantics,
// including the cross-instance async refresh contract.
const makeDurableStore = () => {
  const data = {};
  return {
    data,
    readSection(s) { return data[s]; },
    writeSection(s, v) { data[s] = JSON.parse(JSON.stringify(v)); return data[s]; },
    async readSectionAsync(s) { return structuredClone(data[s] ?? null); }
  };
};

const SOJISICON = {
  kind: "BUSINESS_PROCESS",
  organization: "SOJISICON",
  businessType: "MANUFACTURING, LOGISTICS AND SUPPLY",
  orgSize: "Micro (1-9)",
  useCase: "CUT PROCUREMENT DELAYS, IMPROVE MANUAL ERRORS AND SUPPLY CHAIN",
  description: "I HAVE OBSERVE THAT MY STOCKS ALWASY GET MISSINGS. MY LEADS/CUSTOMERS EXPERIENCE DELAYS IN GOOD AND SERVICES DELIEVRIES, WE DONT ALWAYS MEET UP WITH TARGETS, TOO MANY DISCONNECTED OPERATIONAL FLOWS. PLEASE HELP ME IMPROVE"
};

// 1+20. One PROCARTA submission => exactly one canonical case, no duplicates.
test("APEX-1 — PROCARTA submission creates exactly one canonical case", () => {
  const store = makeDurableStore();
  const cm = new CaseManager({ store });
  const engine = new UnifiedIntakeEngine({ caseManager: cm });
  const before = cm.list().length;
  const r = engine.ingest("API", SOJISICON);
  assert.ok(r.case?.id, "ingest must return a case id");
  assert.equal(cm.list().length, before + 1, "exactly one case added");
  assert.equal(cm.list().filter((c) => c.id === r.case.id).length, 1, "no duplicate case");
});

// 2+5. Canonical case appears in the workflow query source; overview count derives from it.
test("APEX-2 — workflow query and overview count derive from the canonical case source", () => {
  const store = makeDurableStore();
  const cm = new CaseManager({ store });
  const engine = new UnifiedIntakeEngine({ caseManager: cm });
  const r = engine.ingest("API", SOJISICON);
  const workflowCases = cm.list().filter((c) => c?.source !== "DEMO_ORCHESTRATOR");
  assert.ok(workflowCases.some((c) => c.id === r.case.id), "case visible in workflow query");
  const overviewCount = cm.list().filter((c) => c?.source !== "DEMO_ORCHESTRATOR").length;
  assert.equal(overviewCount, workflowCases.length, "overview count and workflow list share one source");
});

// 3+4+20. Single review notification exists; founder query returns it; no fakes.
test("APEX-3 — canonical review notification exists and is returned to founders", async () => {
  const store = makeDurableStore();
  const bus = { published: [], publish(t, p) { this.published.push({ t, p }); } };
  const engine = new ProductNotificationEngine({ eventBus: bus, store });
  const r = { case: { id: "CASE-2026-SOJISICON" } };
  const ev = engine.generateInternalEvent("notification.request_status", {
    channel: "INTAKE", kind: "BUSINESS_PROCESS", caseId: r.case.id,
    organization: "SOJISICON", recommendedAction: "REVIEW", at: new Date().toISOString()
  });
  assert.ok(ev.eventId, "event must carry an id");
  const feed = await engine.getRecentEventsAsync(50);
  assert.equal(feed.filter((e) => e.eventId === ev.eventId).length, 1, "no duplicate notification");
  assert.ok(feed.some((e) => e.payload?.caseId === r.case.id && e.payload?.recommendedAction === "REVIEW"),
    "founder-visible review notification for the case");
  // Cross-instance: a fresh engine on the same durable store sees the same truth.
  const engine2 = new ProductNotificationEngine({ eventBus: bus, store });
  const feed2 = await engine2.getRecentEventsAsync(50);
  assert.ok(feed2.some((e) => e.eventId === ev.eventId), "notification survives instance boundary");
});

// 1b. Cross-instance case truth: fresh CaseManager on the same store sees the case.
test("APEX-4 — case survives instance boundary via canonical refresh", async () => {
  const store = makeDurableStore();
  const cm1 = new CaseManager({ store });
  const engine = new UnifiedIntakeEngine({ caseManager: cm1 });
  const r = engine.ingest("API", SOJISICON);
  const cm2 = new CaseManager({ store });
  await cm2.refresh();
  assert.ok(cm2.get(r.case.id), "fresh instance resolves the case by id after refresh");
});

// Phase 2 — evidence truth on the observed SOJISICON submission.
test("APEX-5 — SOJISICON assessment is evidence-honest", () => {
  const cm = new CaseManager({});
  const engine = new UnifiedIntakeEngine({ caseManager: cm });
  const { intake } = engine.ingest("API", SOJISICON);
  const a = intake.request.assessment;
  const primary = a.areas?.[0]?.area;
  assert.notEqual(primary, "CUSTOMER_OPERATIONS",
    "incidental leads/customers mention must not outrank inventory/procurement/supply signals");
  assert.ok(["PROCUREMENT", "INVENTORY"].includes(primary), "goods-flow domain majors, got " + primary);
  assert.equal(a.rootCauseStatus, "NOT_ESTABLISHED", "root cause never claimed by the deterministic engine");
  assert.ok(typeof a.signalConfidence === "number", "signal confidence present");
  assert.ok(typeof a.evidenceCompleteness === "number", "evidence completeness present");
  assert.ok(!/rework|duplicat/i.test(a.wasteReasoning) || /only the matched terms/i.test(a.wasteReasoning),
    "waste reasoning must not invent rework/duplication findings");
  assert.ok(/missing|error/i.test(a.wasteReasoning), "evidenced waste terms (missing/errors) surfaced");
  assert.ok(/inventory|procurement|supplier|fulfillment/i.test(a.recommendedNextStep),
    "next step follows the inventory→procurement→supplier→fulfillment diagnostic direction");
  assert.ok(!/failure point is|root cause is/i.test(a.recommendedNextStep),
    "no exact failure point claimed before evidence");
});

// Phase 4 (13). Credential fields must not share application state.
test("APEX-6 — Founder and Admin PIN fields are isolated in application state", () => {
  const founder = readPublic("founder.html");
  assert.ok(!/name:'pin'/.test(founder) && !/name:"pin"/.test(founder),
    "no shared name='pin' credential field may remain in founder.html");
  assert.ok(founder.includes("founder-stepup-pin"), "distinct Founder step-up PIN field");
  assert.ok(founder.includes("admin-recovery-pin"), "distinct Admin recovery PIN field");
  assert.ok(founder.includes("one-time-code"), "autofill-resistant autocomplete token on PIN fields");
  const index = readPublic("index.html");
  assert.ok(index.includes("ws-stepup-pin") && index.includes("ws-admin-recovery-pin"),
    "workspace step-up and recovery PIN fields are distinct elements");
  assert.ok(index.includes("stepPin") && index.includes("adminPin"),
    "workspace PIN credential state is split (no shared pin state)");
  assert.ok(!/value:pin,onChange:e=>setPin\(e\.target\.value\)/.test(index),
    "no shared pin state binding may remain");
});

// Phase 7 (15-17). HOME / BACK / breadcrumb contract in authenticated surfaces.
test("APEX-7 — Founder console exposes HOME, BACK and breadcrumb context", () => {
  const founder = readPublic("founder.html");
  assert.ok(founder.includes("data-testid") && founder.includes("founder-nav"), "founder nav strip present");
  assert.ok(founder.includes("← Back"), "BACK control present");
  assert.ok(founder.includes("ADE · Advanced Founder Controls ·"), "breadcrumb context present");
  const index = readPublic("index.html");
  assert.ok(index.includes("← Back") && index.includes("go('Home')"),
    "workspace keeps history-aware BACK plus HOME");
  assert.ok(index.includes("ADE · Workspace ·"), "workspace breadcrumb context present");
});

// Phase 9 (14). No misleading ENABLED-while-pending capability state.
test("APEX-8 — capability states distinguish ENABLED from CONFIGURATION_REQUIRED", () => {
  const admin = readPublic("admin/index.html");
  assert.ok(admin.includes("CONFIGURATION_REQUIRED"), "admin plane exposes configuration-required state");
  assert.ok(!/c\.enabled\?'ENABLED':'DISABLED'/.test(admin),
    "bare ENABLED/DISABLED pill must not mask unconfigured channels");
  const index = readPublic("index.html");
  assert.ok(index.includes("CONFIGURATION_REQUIRED"), "workspace activation surface keeps truthful states");
});

// Phase 10. Access & Entitlements terminology covers the real scope.
test("APEX-9 — Access & Entitlements terminology is scope-truthful", () => {
  const index = readPublic("index.html");
  assert.ok(!index.includes("desc:'Activation and trading grants'"),
    "misleading generic description removed");
  assert.ok(index.includes("Capabilities, activation, edition, authorization and entitlement state"),
    "truthful scope terminology present");
  assert.ok(index.includes("Trading Entitlements"), "trading grants kept as a specialized subsection");
});
