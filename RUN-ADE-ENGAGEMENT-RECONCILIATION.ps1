$ErrorActionPreference = "Stop"

Write-Host "`n============================================================"
Write-Host " ADE ENGAGEMENT ECOSYSTEM RECONCILIATION SPRINT"
Write-Host " READ -> BACKUP -> IMPLEMENT -> TEST -> BUILD -> AUDIT"
Write-Host "============================================================`n"

function Require-File($Path) {
    if (!(Test-Path $Path)) { throw "REQUIRED FILE MISSING: $Path" }
}

$required = @(
    "src/server.js",
    "src/intelligence/UnifiedIntakeEngine.js",
    "src/intelligence/CaseManager.js",
    "src/integrations/PartnerRegistry.js",
    "src/core/CapabilityRegistry.js",
    "src/kernel/EnterpriseKernelMaster.js",
    "src/kernel/EnterpriseEventBus.js",
    "src/kernel/FeedbackPipeline.js",
    "src/core/EventSchemaRegistry.js"
)

Write-Host "=== PHASE 0: SOURCE TRUTH GATE ==="
foreach ($f in $required) { Require-File $f }
Write-Host "PASS: Required source files exist."

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = ".ade-reconciliation-backup-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$backupFiles = @(
    "src/server.js",
    "src/intelligence/UnifiedIntakeEngine.js",
    "src/intelligence/CaseManager.js",
    "src/integrations/PartnerRegistry.js",
    "src/core/CapabilityRegistry.js",
    "src/kernel/FeedbackPipeline.js",
    "src/core/EventSchemaRegistry.js",
    "src/core/MasterIntegrationRegistry.js"
)

foreach ($f in $backupFiles) {
    if (Test-Path $f) {
        $dest = Join-Path $backup $f
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        Copy-Item $f $dest -Force
    }
}

Write-Host "PASS: Backup created at $backup"

Write-Host "`n=== PHASE 1: CREATE CANONICAL ENGAGEMENT EVENT CONTRACT ==="

New-Item -ItemType Directory -Force -Path "src/engagement" | Out-Null

@'
export const EngagementEvents = Object.freeze({
  CASE_CREATED: "engagement.case.created",
  CASE_UPDATED: "engagement.case.updated",
  CASE_TRANSITIONED: "engagement.case.transitioned",

  DISCOVERY_STARTED: "engagement.discovery.started",
  DISCOVERY_COMPLETED: "engagement.discovery.completed",
  DISCOVERY_FAILED: "engagement.discovery.failed",

  KNOWLEDGE_INGESTED: "engagement.knowledge.ingested",
  DECISION_REQUESTED: "engagement.decision.requested",
  DECISION_COMPLETED: "engagement.decision.completed",

  CAPABILITY_EVALUATED: "engagement.capability.evaluated",
  CAPABILITY_AVAILABLE: "engagement.capability.available",
  CAPABILITY_GAP: "engagement.capability.gap",

  PARTNER_MATCH_REQUESTED: "engagement.partner.match.requested",
  PARTNER_RECOMMENDED: "engagement.partner.recommended",

  WORKFLOW_STARTED: "engagement.workflow.started",
  WORKFLOW_COMPLETED: "engagement.workflow.completed",
  WORKFLOW_FAILED: "engagement.workflow.failed",

  HUMAN_ESCALATION_REQUIRED: "human.escalation.required",

  FEEDBACK_RECEIVED: "engagement.feedback.received",
  CASE_CLOSED: "engagement.case.closed"
});

export default EngagementEvents;
'@ | Set-Content "src/engagement/EngagementEvents.js" -Encoding UTF8

Write-Host "PASS: EngagementEvents created."

Write-Host "`n=== PHASE 2: CREATE CONTROLLED CASE STATE MACHINE ==="

@'
const TRANSITIONS = Object.freeze({
  RECEIVED: ["TRIAGED", "INFORMATION_REQUESTED", "CANCELLED"],
  TRIAGED: ["DISCOVERY_REQUIRED", "HUMAN_REVIEW", "CANCELLED"],
  DISCOVERY_REQUIRED: ["DISCOVERY_IN_PROGRESS", "INFORMATION_REQUESTED", "HUMAN_REVIEW", "CANCELLED"],
  DISCOVERY_IN_PROGRESS: ["ANALYSIS_READY", "INFORMATION_REQUESTED", "HUMAN_REVIEW", "FAILED"],
  ANALYSIS_READY: ["DECISION_PENDING", "HUMAN_REVIEW", "FAILED"],
  DECISION_PENDING: ["ROUTED", "HUMAN_REVIEW", "FAILED"],
  ROUTED: ["ADE_EXECUTION", "PARTNER_RECOMMENDED", "HUMAN_REVIEW", "INFORMATION_REQUESTED"],
  ADE_EXECUTION: ["EXECUTION_IN_PROGRESS", "HUMAN_REVIEW", "FAILED"],
  PARTNER_RECOMMENDED: ["HUMAN_REVIEW", "FEEDBACK_PENDING", "CLOSED"],
  HUMAN_REVIEW: ["DISCOVERY_REQUIRED", "DISCOVERY_IN_PROGRESS", "ANALYSIS_READY", "DECISION_PENDING", "ROUTED", "ADE_EXECUTION", "PARTNER_RECOMMENDED", "INFORMATION_REQUESTED", "CANCELLED"],
  INFORMATION_REQUESTED: ["TRIAGED", "DISCOVERY_REQUIRED", "CANCELLED"],
  EXECUTION_IN_PROGRESS: ["EVALUATION", "FAILED", "HUMAN_REVIEW"],
  EVALUATION: ["FEEDBACK_PENDING", "CLOSED", "FAILED"],
  FEEDBACK_PENDING: ["CLOSED"],
  FAILED: ["HUMAN_REVIEW", "DISCOVERY_REQUIRED"],
  CLOSED: [],
  CANCELLED: []
});

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid case transition: ${from} -> ${to}`);
  }
  return true;
}

export function allowedTransitions(status) {
  return TRANSITIONS[status] || [];
}

export default TRANSITIONS;
'@ | Set-Content "src/engagement/CaseStateMachine.js" -Encoding UTF8

Write-Host "PASS: CaseStateMachine created."

Write-Host "`n=== PHASE 3: REPLACE CASE MANAGER WITH GUARDED VERSION ==="

@'
import crypto from "crypto";
import { assertTransition, allowedTransitions } from "../engagement/CaseStateMachine.js";
import EngagementEvents from "../engagement/EngagementEvents.js";

export class CaseManager {
  constructor({ eventBus, store } = {}) {
    this.eventBus = eventBus;
    this.store = store;
    this.cases = new Map();
    try {
      for (const c of (store?.read?.().cases || [])) {
        if (c?.id) this.cases.set(c.id, c);
      }
    } catch (_) {}
  }

  createCase(input = {}) {
    const id = `CASE-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const now = new Date().toISOString();

    const record = {
      id,
      status: input.status || "DISCOVERY_REQUIRED",
      source: input.source || "UNKNOWN",
      channel: input.channel || "UNKNOWN",
      organization: input.organization || null,
      contact: input.contact || null,
      request: input.request || {},
      confidence: Number(input.confidence ?? 0),
      authorization: input.authorization || {
        publicAnalysis: false,
        connectedSystems: false
      },
      nextAction: input.nextAction || "DISCOVERY",
      requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [],
      partnerRecommendations: [],
      discovery: null,
      decision: null,
      workflow: null,
      feedback: [],
      history: [{
        from: null,
        to: input.status || "DISCOVERY_REQUIRED",
        reason: "CASE_CREATED",
        at: now
      }],
      createdAt: now,
      updatedAt: now
    };

    this.cases.set(id, record);
    this.persist();
    this.publish("case.created", record);
    this.publish(EngagementEvents.CASE_CREATED, record);
    return record;
  }

  list() {
    return Array.from(this.cases.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  get(id) {
    return this.cases.get(id) || null;
  }

  transition(id, targetStatus, context = {}) {
    const current = this.get(id);
    if (!current) return null;

    assertTransition(current.status, targetStatus);

    const now = new Date().toISOString();
    const next = {
      ...current,
      ...context.patch,
      status: targetStatus,
      nextAction: context.nextAction ?? current.nextAction,
      updatedAt: now,
      history: [
        ...(Array.isArray(current.history) ? current.history : []),
        {
          from: current.status,
          to: targetStatus,
          reason: context.reason || "STATE_TRANSITION",
          actor: context.actor || "SYSTEM",
          at: now
        }
      ]
    };

    this.cases.set(id, next);
    this.persist();

    this.publish("case.updated", next);
    this.publish(EngagementEvents.CASE_UPDATED, next);
    this.publish(EngagementEvents.CASE_TRANSITIONED, {
      caseId: id,
      from: current.status,
      to: targetStatus,
      case: next
    });

    return next;
  }

  update(id, patch = {}) {
    const current = this.get(id);
    if (!current) return null;

    if (patch.status && patch.status !== current.status) {
      throw new Error("Direct status updates are forbidden. Use transition().");
    }

    const forbidden = ["id", "createdAt", "history"];
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !forbidden.includes(key))
    );

    const next = {
      ...current,
      ...safePatch,
      updatedAt: new Date().toISOString()
    };

    this.cases.set(id, next);
    this.persist();
    this.publish("case.updated", next);
    this.publish(EngagementEvents.CASE_UPDATED, next);
    return next;
  }

  getAllowedTransitions(id) {
    const current = this.get(id);
    return current ? allowedTransitions(current.status) : [];
  }

  persist() {
    try {
      if (this.store?.write) this.store.write("cases", this.list());
    } catch (_) {}
  }

  publish(type, payload) {
    try {
      const result = this.eventBus?.publish?.(type, payload);
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  }
}

export default CaseManager;
'@ | Set-Content "src/intelligence/CaseManager.js" -Encoding UTF8

Write-Host "PASS: CaseManager guarded."

Write-Host "`n=== PHASE 4: CREATE CANONICAL ENGAGEMENT ORCHESTRATOR ==="

@'
import EngagementEvents from "./EngagementEvents.js";

export class EngagementOrchestrator {
  constructor({
    caseManager,
    partnerRegistry,
    capabilityRegistry,
    feedbackPipeline,
    publicDiscovery,
    kernel,
    eventBus
  } = {}) {
    this.caseManager = caseManager;
    this.partnerRegistry = partnerRegistry;
    this.capabilityRegistry = capabilityRegistry;
    this.feedbackPipeline = feedbackPipeline;
    this.publicDiscovery = publicDiscovery;
    this.kernel = kernel;
    this.eventBus = eventBus || kernel?.eventBus;
  }

  publish(type, payload) {
    try {
      const result = this.eventBus?.publish?.(type, payload);
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  }

  resolve(name) {
    try {
      if (typeof this.kernel?.resolve === "function") return this.kernel.resolve(name);
    } catch (_) {}
    try {
      if (typeof this.kernel?.container?.resolve === "function") return this.kernel.container.resolve(name);
    } catch (_) {}
    try {
      if (typeof this.kernel?.container?.get === "function") return this.kernel.container.get(name);
    } catch (_) {}
    return null;
  }

  async process(caseId, options = {}) {
    let record = this.caseManager.get(caseId);
    if (!record) throw new Error("CASE_NOT_FOUND");

    if (record.status === "DISCOVERY_REQUIRED") {
      record = await this.runDiscovery(record, options);
    }

    if (record.status === "ANALYSIS_READY") {
      record = await this.runAnalysis(record);
    }

    if (record.status === "DECISION_PENDING") {
      record = await this.runDecision(record);
    }

    return record;
  }

  async runDiscovery(record, options = {}) {
    this.publish(EngagementEvents.DISCOVERY_STARTED, { caseId: record.id });

    record = this.caseManager.transition(record.id, "DISCOVERY_IN_PROGRESS", {
      reason: "DISCOVERY_STARTED",
      nextAction: "DISCOVERY"
    });

    try {
      let discovery = {
        source: "NONE",
        completedAt: new Date().toISOString()
      };

      const url = options.url || record.request?.url || record.request?.website || record.organization?.website;

      if (url && record.authorization?.publicAnalysis && typeof this.publicDiscovery === "function") {
        discovery = await this.publicDiscovery(url);
        discovery = { ...discovery, source: "PUBLIC_DISCOVERY", url };
      }

      record = this.caseManager.transition(record.id, "ANALYSIS_READY", {
        reason: "DISCOVERY_COMPLETED",
        nextAction: "ANALYZE",
        patch: { discovery }
      });

      this.publish(EngagementEvents.DISCOVERY_COMPLETED, {
        caseId: record.id,
        discovery
      });

      return record;
    } catch (error) {
      this.publish(EngagementEvents.DISCOVERY_FAILED, {
        caseId: record.id,
        error: error.message
      });

      return this.caseManager.transition(record.id, "FAILED", {
        reason: "DISCOVERY_FAILED",
        nextAction: "HUMAN_REVIEW",
        patch: { failure: { stage: "DISCOVERY", message: error.message } }
      });
    }
  }

  async runAnalysis(record) {
    const knowledge = this.resolve("knowledgeEngine");

    const analysisInput = {
      caseId: record.id,
      request: record.request,
      discovery: record.discovery,
      organization: record.organization
    };

    let knowledgeResult = analysisInput;

    try {
      if (knowledge?.process) knowledgeResult = await knowledge.process(analysisInput);
      else if (knowledge?.ingest) {
        knowledge.ingest(record.id, JSON.stringify(analysisInput));
        knowledgeResult = { ...analysisInput, ingested: true };
      }
    } catch (_) {
      knowledgeResult = { ...analysisInput, knowledgeStatus: "UNAVAILABLE" };
    }

    this.publish(EngagementEvents.KNOWLEDGE_INGESTED, {
      caseId: record.id,
      knowledge: knowledgeResult
    });

    return this.caseManager.transition(record.id, "DECISION_PENDING", {
      reason: "ANALYSIS_COMPLETED",
      nextAction: "DECIDE",
      patch: { analysis: knowledgeResult }
    });
  }

  async runDecision(record) {
    this.publish(EngagementEvents.DECISION_REQUESTED, { caseId: record.id });

    const decisionEngine = this.resolve("decisionEngine");

    const input = {
      caseId: record.id,
      request: record.request,
      discovery: record.discovery,
      analysis: record.analysis
    };

    let decision = {
      route: "HUMAN_REVIEW",
      confidence: Number(record.confidence || 0)
    };

    try {
      if (decisionEngine?.process) decision = await decisionEngine.process(input);
      else if (decisionEngine?.evaluate) decision = await decisionEngine.evaluate(input);
    } catch (error) {
      decision = {
        route: "HUMAN_REVIEW",
        confidence: 0,
        error: error.message
      };
    }

    const requiredCapabilities = Array.from(new Set(
      decision?.requiredCapabilities ||
      decision?.capabilities ||
      record.requiredCapabilities ||
      []
    )).filter(Boolean);

    this.publish(EngagementEvents.DECISION_COMPLETED, {
      caseId: record.id,
      decision,
      requiredCapabilities
    });

    const evaluated = requiredCapabilities.map(intent => ({
      intent,
      available: Boolean(this.capabilityRegistry?.getCapability?.(intent))
    }));

    const missing = evaluated.filter(x => !x.available).map(x => x.intent);

    this.publish(EngagementEvents.CAPABILITY_EVALUATED, {
      caseId: record.id,
      evaluated
    });

    if (missing.length === 0 && requiredCapabilities.length > 0) {
      this.publish(EngagementEvents.CAPABILITY_AVAILABLE, {
        caseId: record.id,
        capabilities: requiredCapabilities
      });

      record = this.caseManager.transition(record.id, "ROUTED", {
        reason: "ADE_CAPABILITIES_AVAILABLE",
        nextAction: "ADE_EXECUTION",
        patch: { decision, requiredCapabilities }
      });

      return this.caseManager.transition(record.id, "ADE_EXECUTION", {
        reason: "ROUTED_TO_ADE",
        nextAction: "START_WORKFLOW"
      });
    }

    if (missing.length > 0) {
      this.publish(EngagementEvents.CAPABILITY_GAP, {
        caseId: record.id,
        missing
      });

      const matches = this.partnerRegistry?.match?.(missing) || [];

      this.publish(EngagementEvents.PARTNER_MATCH_REQUESTED, {
        caseId: record.id,
        capabilities: missing
      });

      const recommendations = matches
        .filter(x => x.score > 0)
        .slice(0, 10);

      this.publish(EngagementEvents.PARTNER_RECOMMENDED, {
        caseId: record.id,
        recommendations
      });

      record = this.caseManager.transition(record.id, "ROUTED", {
        reason: "CAPABILITY_GAP_IDENTIFIED",
        nextAction: "PARTNER_MATCH",
        patch: { decision, requiredCapabilities, missingCapabilities: missing }
      });

      return this.caseManager.transition(record.id, "PARTNER_RECOMMENDED", {
        reason: "PARTNER_RECOMMENDATIONS_READY",
        nextAction: "HUMAN_REVIEW",
        patch: { partnerRecommendations: recommendations }
      });
    }

    return this.caseManager.transition(record.id, "HUMAN_REVIEW", {
      reason: "NO_EXECUTABLE_CAPABILITY_ROUTE",
      nextAction: "HUMAN_REVIEW",
      patch: { decision, requiredCapabilities }
    });
  }

  async executeCase(caseId) {
    let record = this.caseManager.get(caseId);
    if (!record) throw new Error("CASE_NOT_FOUND");
    if (record.status !== "ADE_EXECUTION") {
      throw new Error(`CASE_NOT_READY_FOR_EXECUTION:${record.status}`);
    }

    const workflow = this.resolve("workflowEngine");

    if (!workflow || typeof workflow.executeAutonomousWorkflow !== "function") {
      return this.caseManager.transition(caseId, "HUMAN_REVIEW", {
        reason: "WORKFLOW_ENGINE_UNAVAILABLE",
        nextAction: "HUMAN_REVIEW"
      });
    }

    record = this.caseManager.transition(caseId, "EXECUTION_IN_PROGRESS", {
      reason: "WORKFLOW_STARTED",
      nextAction: "EXECUTE"
    });

    this.publish(EngagementEvents.WORKFLOW_STARTED, { caseId });

    try {
      const result = await workflow.executeAutonomousWorkflow(caseId, {
        case: record,
        decision: record.decision
      });

      record = this.caseManager.transition(caseId, "EVALUATION", {
        reason: "WORKFLOW_COMPLETED",
        nextAction: "EVALUATE",
        patch: { workflow: result }
      });

      this.publish(EngagementEvents.WORKFLOW_COMPLETED, {
        caseId,
        result
      });

      return this.caseManager.transition(caseId, "FEEDBACK_PENDING", {
        reason: "EVALUATION_READY",
        nextAction: "REQUEST_FEEDBACK"
      });
    } catch (error) {
      this.publish(EngagementEvents.WORKFLOW_FAILED, {
        caseId,
        error: error.message
      });

      return this.caseManager.transition(caseId, "FAILED", {
        reason: "WORKFLOW_FAILED",
        nextAction: "HUMAN_REVIEW",
        patch: { failure: { stage: "WORKFLOW", message: error.message } }
      });
    }
  }

  async ingestFeedback(caseId, payload = {}) {
    const record = this.caseManager.get(caseId);
    if (!record) throw new Error("CASE_NOT_FOUND");

    const item = this.feedbackPipeline
      ? await this.feedbackPipeline.ingest({ caseId, ...payload })
      : { caseId, payload, status: "RECEIVED" };

    const feedback = [...(record.feedback || []), item];

    const next = this.caseManager.update(caseId, { feedback });

    this.publish(EngagementEvents.FEEDBACK_RECEIVED, {
      caseId,
      feedback: item
    });

    if (next.status === "FEEDBACK_PENDING") {
      return this.caseManager.transition(caseId, "CLOSED", {
        reason: "FEEDBACK_RECEIVED",
        nextAction: "NONE"
      });
    }

    return next;
  }
}

export default EngagementOrchestrator;
'@ | Set-Content "src/engagement/EngagementOrchestrator.js" -Encoding UTF8

Write-Host "PASS: EngagementOrchestrator created."

Write-Host "`n=== PHASE 5: CREATE CANONICAL WORKFLOW ADAPTER ==="

@'
export class CanonicalWorkflowAdapter {
  constructor(kernel) {
    this.kernel = kernel;
  }

  resolve(name) {
    try { if (typeof this.kernel?.resolve === "function") return this.kernel.resolve(name); } catch (_) {}
    try { if (typeof this.kernel?.container?.resolve === "function") return this.kernel.container.resolve(name); } catch (_) {}
    try { if (typeof this.kernel?.container?.get === "function") return this.kernel.container.get(name); } catch (_) {}
    return null;
  }

  getCanonicalWorkflow() {
    const workflow = this.resolve("workflowEngine");
    if (!workflow) throw new Error("CANONICAL_WORKFLOW_ENGINE_NOT_FOUND");
    return workflow;
  }

  async execute(workflowId, payload) {
    const workflow = this.getCanonicalWorkflow();
    if (typeof workflow.executeAutonomousWorkflow === "function") {
      return workflow.executeAutonomousWorkflow(workflowId, payload);
    }
    if (typeof workflow.process === "function") {
      return workflow.process({ workflowId, payload });
    }
    throw new Error("CANONICAL_WORKFLOW_ENGINE_HAS_NO_SUPPORTED_EXECUTION_METHOD");
  }
}

export default CanonicalWorkflowAdapter;
'@ | Set-Content "src/engagement/CanonicalWorkflowAdapter.js" -Encoding UTF8

Write-Host "PASS: Canonical workflow adapter created."

Write-Host "`n=== PHASE 6: ADD FEEDBACK ROUTE AND ORCHESTRATION ROUTES ==="

$server = Get-Content "src/server.js" -Raw

$imports = @'
import EngagementOrchestrator from "./engagement/EngagementOrchestrator.js";
import FeedbackPipeline from "./kernel/FeedbackPipeline.js";
import CapabilityRegistry from "./core/CapabilityRegistry.js";
'@

if ($server -notmatch 'EngagementOrchestrator') {
    $anchor = 'import \{ publicDiscovery \} from "./intelligence/PublicDiscovery\.js";'
    if ($server -notmatch $anchor) { throw "SERVER IMPORT ANCHOR NOT FOUND" }
    $server = $server -replace $anchor, ('$0' + "`n" + $imports.Trim())
}

if ($server -notmatch 'const feedbackPipeline = new FeedbackPipeline') {
    $anchor = 'const partners = new PartnerRegistry\(\);'
    if ($server -notmatch $anchor) { throw "PARTNER INITIALIZATION ANCHOR NOT FOUND" }

    $replacement = @'
const partners = new PartnerRegistry();
const feedbackPipeline = new FeedbackPipeline({ eventBus: kernel?.eventBus });
const engagementOrchestrator = new EngagementOrchestrator({
  caseManager,
  partnerRegistry: partners,
  capabilityRegistry: CapabilityRegistry,
  feedbackPipeline,
  publicDiscovery,
  kernel,
  eventBus: kernel?.eventBus
});
'@
    $server = $server -replace $anchor, $replacement.Trim()
}

if ($server -notmatch '/api/v1/cases/:id/process') {
    $routeAnchor = "app.get('/api/v1/cases/:id'"
    $newRoutes = @'
app.post('/api/v1/cases/:id/process',async(req,res)=>{try{const result=await engagementOrchestrator.process(req.params.id,req.body||{});res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.post('/api/v1/cases/:id/execute',async(req,res)=>{try{const result=await engagementOrchestrator.executeCase(req.params.id);res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.post('/api/v1/cases/:id/feedback',async(req,res)=>{try{const result=await engagementOrchestrator.ingestFeedback(req.params.id,req.body||{});res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.get('/api/v1/cases/:id/transitions',(req,res)=>{const c=caseManager.get(req.params.id);if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'});res.json({success:true,status:c.status,allowedTransitions:caseManager.getAllowedTransitions(req.params.id)});});
'@
    if ($server -notmatch [regex]::Escape($routeAnchor)) { throw "CASE ROUTE ANCHOR NOT FOUND" }
    $server = $server.Replace($routeAnchor, ($newRoutes.Trim() + "`n" + $routeAnchor))
}

Set-Content "src/server.js" $server -Encoding UTF8

Write-Host "PASS: Server orchestration routes installed."

Write-Host "`n=== PHASE 7: NORMALIZE CRITICAL EVENT ALIASES ==="

$schema = "src/core/EventSchemaRegistry.js"
$schemaText = Get-Content $schema -Raw

$eventAdds = @(
  'engagement.case.created',
  'engagement.case.updated',
  'engagement.case.transitioned',
  'engagement.discovery.started',
  'engagement.discovery.completed',
  'engagement.discovery.failed',
  'engagement.knowledge.ingested',
  'engagement.decision.requested',
  'engagement.decision.completed',
  'engagement.capability.evaluated',
  'engagement.capability.available',
  'engagement.capability.gap',
  'engagement.partner.match.requested',
  'engagement.partner.recommended',
  'engagement.workflow.started',
  'engagement.workflow.completed',
  'engagement.workflow.failed',
  'engagement.feedback.received'
)

foreach ($evt in $eventAdds) {
    if ($schemaText -notmatch [regex]::Escape($evt)) {
        $insert = "`n    this.registerSchema('$evt', (p) => p && typeof p === 'object');"
        $pos = $schemaText.LastIndexOf("}")
        if ($pos -lt 0) { throw "SCHEMA FILE STRUCTURE INVALID" }
        $schemaText = $schemaText.Insert($pos, $insert)
    }
}

Set-Content $schema $schemaText -Encoding UTF8

Write-Host "PASS: Engagement event schemas added where absent."

Write-Host "`n=== PHASE 8: CREATE RECONCILIATION TEST ==="

@'
import test from "node:test";
import assert from "node:assert/strict";
import { CaseManager } from "../src/intelligence/CaseManager.js";
import { PartnerRegistry } from "../src/integrations/PartnerRegistry.js";
import EngagementOrchestrator from "../src/engagement/EngagementOrchestrator.js";

test("engagement case lifecycle is guarded", () => {
  const cases = new CaseManager();
  const c = cases.createCase({ organization: "Test" });

  assert.equal(c.status, "DISCOVERY_REQUIRED");

  assert.throws(
    () => cases.transition(c.id, "CLOSED"),
    /Invalid case transition/
  );

  const started = cases.transition(c.id, "DISCOVERY_IN_PROGRESS");
  assert.equal(started.status, "DISCOVERY_IN_PROGRESS");
});

test("partner routing returns capability matches", async () => {
  const cases = new CaseManager();
  const partners = new PartnerRegistry();

  partners.upsert({
    name: "Integration Partner",
    capabilities: ["ODOO_IMPLEMENTATION", "API_INTEGRATION"]
  });

  const orchestrator = new EngagementOrchestrator({
    caseManager: cases,
    partnerRegistry: partners,
    capabilityRegistry: {
      getCapability: () => undefined
    },
    kernel: null
  });

  let c = cases.createCase({
    request: { intent: "ENTERPRISE_IMPLEMENTATION" },
    requiredCapabilities: ["ODOO_IMPLEMENTATION"]
  });

  c = cases.transition(c.id, "DISCOVERY_IN_PROGRESS");
  c = cases.transition(c.id, "ANALYSIS_READY");
  c = cases.transition(c.id, "DECISION_PENDING");

  orchestrator.resolve = () => ({
    evaluate: async () => ({
      requiredCapabilities: ["ODOO_IMPLEMENTATION"],
      confidence: 0.9
    })
  });

  c = await orchestrator.runDecision(c);

  assert.equal(c.status, "PARTNER_RECOMMENDED");
  assert.equal(c.partnerRecommendations.length, 1);
  assert.equal(c.partnerRecommendations[0].name, "Integration Partner");
});

test("feedback closes feedback-pending case", async () => {
  const cases = new CaseManager();

  const pipeline = {
    ingest: async (payload) => ({
      id: "feedback-1",
      payload,
      status: "RECEIVED"
    })
  };

  const orchestrator = new EngagementOrchestrator({
    caseManager: cases,
    feedbackPipeline: pipeline
  });

  let c = cases.createCase();
  c = cases.transition(c.id, "DISCOVERY_IN_PROGRESS");
  c = cases.transition(c.id, "ANALYSIS_READY");
  c = cases.transition(c.id, "DECISION_PENDING");
  c = cases.transition(c.id, "ROUTED");
  c = cases.transition(c.id, "ADE_EXECUTION");
  c = cases.transition(c.id, "EXECUTION_IN_PROGRESS");
  c = cases.transition(c.id, "EVALUATION");
  c = cases.transition(c.id, "FEEDBACK_PENDING");

  c = await orchestrator.ingestFeedback(c.id, { text: "completed successfully" });

  assert.equal(c.status, "CLOSED");
  assert.equal(c.feedback.length, 1);
});
'@ | Set-Content "tests/engagement-reconciliation.test.js" -Encoding UTF8

Write-Host "PASS: Reconciliation tests created."

Write-Host "`n=== PHASE 9: STATIC SYNTAX GATE ==="

$syntaxFiles = @(
  "src/engagement/EngagementEvents.js",
  "src/engagement/CaseStateMachine.js",
  "src/engagement/EngagementOrchestrator.js",
  "src/engagement/CanonicalWorkflowAdapter.js",
  "src/intelligence/CaseManager.js",
  "src/server.js"
)

foreach ($f in $syntaxFiles) {
    node --check $f
    if ($LASTEXITCODE -ne 0) { throw "SYNTAX FAILED: $f" }
}

Write-Host "PASS: Syntax gate."

Write-Host "`n=== PHASE 10: RUN ENGAGEMENT TEST ==="
node --test tests/engagement-reconciliation.test.js
if ($LASTEXITCODE -ne 0) { throw "ENGAGEMENT RECONCILIATION TEST FAILED" }

Write-Host "`n=== PHASE 11: RUN PROJECT TEST SUITE ==="
npm test
if ($LASTEXITCODE -ne 0) { throw "PROJECT TEST SUITE FAILED" }

Write-Host "`n=== PHASE 12: BUILD GATE ==="
npm run build
if ($LASTEXITCODE -ne 0) { throw "BUILD FAILED" }

Write-Host "`n=== PHASE 13: POST-IMPLEMENTATION WIRING AUDIT ==="

$patterns = @(
  'EngagementOrchestrator',
  'CaseStateMachine',
  'engagement.case.created',
  'engagement.discovery.completed',
  'engagement.decision.completed',
  'engagement.capability.gap',
  'engagement.partner.recommended',
  'engagement.workflow.completed',
  'engagement.feedback.received',
  'PARTNER_RECOMMENDED',
  'FEEDBACK_PENDING',
  'getAllowedTransitions',
  'Direct status updates are forbidden'
)

Get-ChildItem -Path .\src,.\tests -Recurse -File -Include *.js,*.mjs |
Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\' } |
Select-String -Pattern $patterns -SimpleMatch |
ForEach-Object {
  "{0}:{1}: {2}" -f $_.Path.Replace((Get-Location).Path + '\',''), $_.LineNumber, $_.Line.Trim()
}

Write-Host "`n=== PHASE 14: GIT TRUTH ==="
git status --short
git diff -- src/server.js src/intelligence/CaseManager.js src/engagement tests/engagement-reconciliation.test.js
git diff --check

if ($LASTEXITCODE -ne 0) { throw "GIT WHITESPACE / DIFF CHECK FAILED" }

Write-Host "`n============================================================"
Write-Host " ENGAGEMENT RECONCILIATION SPRINT COMPLETED SUCCESSFULLY"
Write-Host " ALL EXECUTED GATES PASSED"
Write-Host " BACKUP: $backup"
Write-Host "============================================================"