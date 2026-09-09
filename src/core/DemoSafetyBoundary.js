/**
 * ADE DEMO MODE SAFETY BOUNDARY
 *
 * When ADE_DEMO_MODE=true or ADE_EDITION=DEMO, this module enforces
 * real controlled operating boundaries. It is not merely a UI label.
 *
 * Demo mode ensures:
 * - No production credentials used
 * - No real customer data processed (unless test data is explicitly safe)
 * - No real financial transactions
 * - No destructive operations
 * - No unrestricted production integrations
 * - No production webhooks
 * - No irreversible actions
 * - No secret exposure
 * - Synthetic/simulated data where appropriate
 * - Controlled/sandboxed external simulations
 * - Safe execution limits
 * - Traceable demo execution IDs
 *
 * LIVE ADE EXECUTION means ADE is genuinely executing a real pathway.
 * SIMULATED EXTERNAL INTEGRATION means an unavailable or sandboxed
 * dependency is being simulated. These are never conflated.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

const DEMO_BLOCKED_ACTIONS = Object.freeze([
  "FINANCIAL_EXECUTION",
  "PRODUCTION_DB_MUTATION",
  "DESTRUCTIVE_DB_OPERATION",
  "REAL_PAYMENT_INITIATION",
  "MESSAGING_SEND_OUTBOUND",
  "EXTERNAL_API_MUTATION",
  "PRODUCTION_WEBHOOK_MUTATION",
  "CREDENTIAL_USAGE",
  "SECRET_BEARING_CALL",
  "DESTRUCTIVE_FILESYSTEM",
  "PRIVILEGED_ADMIN_ACTION",
  "IRREVERSIBLE_OPERATION",
  "PRODUCTION_KEY_ROTATION",
  "REAL_NOTIFICATION_SEND",
  "LIVE_PARTNER_INTEGRATION"
]);

const DEMO_SIMULATED_ACTIONS = Object.freeze([
  "CASE_PROCESS",
  "CASE_EXECUTE",
  "WORKFLOW_EXECUTE",
  "AI_PROVIDER_CALL",
  "EXTERNAL_DISCOVERY",
  "MEDIA_GENERATE",
  "NOTIFICATION_SEND"
]);

const DEMO_SESSION_TTL_MS = 5 * 60 * 1000;

export class DemoSafetyBoundary {
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.activeDemoSessions = new Map();
    this._cleanupInterval = null;
  }

  isDemoMode() {
    return String(process.env.ADE_DEMO_MODE).toLowerCase() === "true" ||
           String(process.env.ADE_EDITION || "").toUpperCase() === "DEMO";
  }

  generateDemoExecutionId() {
    return `ADE-DEMO-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  }

  startDemoSession(context = {}) {
    if (!this.isDemoMode()) return null;
    this._cleanupExpiredSessions();
    this._ensureCleanupInterval();
    const demoId = this.generateDemoExecutionId();
    const session = {
      demoId,
      startedAt: new Date().toISOString(),
      context,
      stages: [],
      events: [],
      status: "RUNNING"
    };
    this.activeDemoSessions.set(demoId, session);
    this.eventBus.publish("DEMO_SESSION_STARTED", {
      demoId,
      mode: "DEMO",
      context
    });
    return session;
  }

  recordDemoStage(demoId, stage, data = {}) {
    const session = this.activeDemoSessions.get(demoId);
    if (!session) return null;
    const record = {
      stage,
      timestamp: new Date().toISOString(),
      ...data,
      classification: this.classifyExecution(stage, data)
    };
    session.stages.push(record);
    this.eventBus.publish("DEMO_STAGE_COMPLETED", {
      demoId,
      stage,
      classification: record.classification
    });
    return record;
  }

  classifyExecution(action, data = {}) {
    if (DEMO_BLOCKED_ACTIONS.includes(action)) return "BLOCKED";
    if (DEMO_SIMULATED_ACTIONS.includes(action)) return "SIMULATED";
    if (data.provider && !data.providerConfigured) return "SIMULATED";
    if (data.external && !data.available) return "SIMULATED";
    if (data.live === true) return "LIVE";
    if (data.simulated === true) return "SIMULATED";
    return "SIMULATED";
  }

  assertActionAllowed(action) {
    if (!this.isDemoMode()) return { allowed: true, mode: "PRODUCTION" };
    if (DEMO_BLOCKED_ACTIONS.includes(action)) {
      this.eventBus.publish("DEMO_ACTION_BLOCKED", { action, timestamp: new Date().toISOString() });
      return { allowed: false, mode: "DEMO_BLOCKED", reason: `Action '${action}' is blocked in demo mode.` };
    }
    return { allowed: true, mode: this.classifyExecution(action) };
  }

  finishDemoSession(demoId, status = "COMPLETED") {
    const session = this.activeDemoSessions.get(demoId);
    if (!session) return null;
    session.status = status;
    session.finishedAt = new Date().toISOString();
    session.totalStages = session.stages.length;
    const result = { ...session };
    this.activeDemoSessions.delete(demoId);
    this.eventBus.publish("DEMO_SESSION_FINISHED", {
      demoId,
      status,
      totalStages: session.totalStages
    });
    return result;
  }

  getTraceSummary(demoId) {
    const session = this.activeDemoSessions.get(demoId);
    if (!session) return null;
    return {
      demoId: session.demoId,
      status: session.status,
      startedAt: session.startedAt,
      stages: session.stages.map(s => ({
        stage: s.stage,
        classification: s.classification,
        timestamp: s.timestamp
      }))
    };
  }

  _ensureCleanupInterval() {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => {
      this._cleanupExpiredSessions();
    }, 60 * 1000);
    if (typeof this._cleanupInterval.unref === "function") {
      this._cleanupInterval.unref();
    }
  }

  dispose() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  _cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of this.activeDemoSessions) {
      const sessionStart = new Date(session.startedAt).getTime();
      if (now - sessionStart > DEMO_SESSION_TTL_MS) {
        session.status = "EXPIRED";
        session.finishedAt = new Date().toISOString();
        this.activeDemoSessions.delete(id);
        this.eventBus.publish("DEMO_SESSION_EXPIRED", { demoId: id });
      }
    }
  }
}

export default DemoSafetyBoundary;
