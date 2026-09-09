/**
 * ADE-APEX Supporting Engines
 *
 * Concrete runtime services owned by the canonical kernel.
 * They provide deterministic, testable contracts without pretending to be
 * external vector databases, LLMs or persistent infrastructure.
 */

export class StructuredJSONLogger {
  info(msg, meta = {}) {
    console.log(JSON.stringify({ level: "INFO", msg, meta, time: new Date().toISOString() }));
  }
  warn(msg, meta = {}) {
    console.warn(JSON.stringify({ level: "WARN", msg, meta, time: new Date().toISOString() }));
  }
  error(msg, meta = {}) {
    console.error(JSON.stringify({ level: "ERROR", msg, meta, time: new Date().toISOString() }));
  }
}

class EngineBase {
  constructor({ kernel = null } = {}) {
    this.kernel = kernel;
    this.initialized = false;
  }
  _assertReady() {
    if (!this.initialized) throw new Error(`${this.constructor.name} is not initialized.`);
  }
  health() {
    return { status: this.initialized ? "HEALTHY" : "OFFLINE" };
  }
  async initialize() {
    this.initialized = true;
    return { status: "READY" };
  }
  async dispose() {
    this.initialized = false;
  }
}

/* ----------------------------- MEMORY ----------------------------- */

export class ContextMemoryEngine extends EngineBase {
  constructor({ kernel = null, maxEntries = 10000 } = {}) {
    super({ kernel });
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("Memory maxEntries must be a positive integer.");
    }
    this.maxEntries = maxEntries;
    this.store = new Map();
    this.sequence = 0;
  }

  async initialize() {
    this.initialized = true;
    return { status: "READY", entries: this.store.size };
  }

  async dispose() {
    this.initialized = false;
  }

  set(key, value, metadata = {}) {
    this._assertReady();
    if (key === undefined || key === null || String(key).trim() === "") {
      throw new Error("Memory key is required.");
    }
    const normalized = String(key);
    const previous = this.store.get(normalized);
    const now = new Date().toISOString();
    const entry = {
      id: previous?.id ?? ++this.sequence,
      key: normalized,
      value,
      metadata,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    this.store.set(normalized, entry);
    while (this.store.size > this.maxEntries) {
      this.store.delete(this.store.keys().next().value);
    }
    this.kernel && (this.kernel.metrics.memoryOperations++);
    return structuredClone(entry);
  }

  storeValue(key, value, metadata = {}) {
    return this.set(key, value, metadata);
  }

  get(key, defaultValue = null) {
    this._assertReady();
    this.kernel && (this.kernel.metrics.memoryOperations++);
    const value = this.store.get(String(key));
    return value ? structuredClone(value) : defaultValue;
  }

  retrieve(key, defaultValue = null) {
    return this.get(key, defaultValue);
  }

  has(key) {
    this._assertReady();
    return this.store.has(String(key));
  }

  delete(key) {
    this._assertReady();
    const deleted = this.store.delete(String(key));
    this.kernel && (this.kernel.metrics.memoryOperations++);
    return deleted;
  }

  forget(key) {
    return this.delete(key);
  }

  clear() {
    this._assertReady();
    const count = this.store.size;
    this.store.clear();
    this.kernel && (this.kernel.metrics.memoryOperations += count);
    return { cleared: count };
  }

  stats() {
    this._assertReady();
    return {
      entries: this.store.size,
      capacity: this.maxEntries,
      utilization: this.store.size / this.maxEntries,
      operations: this.kernel?.metrics?.memoryOperations ?? 0
    };
  }

  size() {
    return this.store.size;
  }

  snapshot() {
    this._assertReady();
    return Array.from(this.store.values()).map(structuredClone);
  }

  health() {
    return {
      ...super.health(),
      entries: this.store.size,
      capacity: this.maxEntries
    };
  }
}

/* ---------------------------- KNOWLEDGE ---------------------------- */

export class KnowledgeEngine extends EngineBase {
  constructor({ kernel = null, memory = null } = {}) {
    super({ kernel });
    this.memory = memory;
    this.documents = new Map();
    this.index = new Map();
  }

  async initialize() {
    this.initialized = true;
    return { status: "READY", documents: this.documents.size };
  }

  async dispose() {
    this.initialized = false;
  }

  _removeFromIndex(document) {
    if (!document) return;
    const tokens = new Set(
      document.content.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean)
    );
    for (const token of tokens) {
      const ids = this.index.get(token);
      if (!ids) continue;
      ids.delete(document.id);
      if (ids.size === 0) this.index.delete(token);
    }
  }

  ingest(id, content, metadata = {}) {
    this._assertReady();
    if (id === undefined || id === null || String(id).trim() === "") {
      throw new Error("Knowledge document id is required.");
    }
    if (content === undefined || content === null || String(content).trim() === "") {
      throw new Error("Knowledge content is required.");
    }

    const key = String(id);
    this._removeFromIndex(this.documents.get(key));

    const now = new Date().toISOString();
    const document = {
      id: key,
      content: String(content),
      metadata: structuredClone(metadata),
      createdAt: this.documents.get(key)?.createdAt ?? now,
      updatedAt: now
    };
    this.documents.set(key, document);

    const tokens = new Set(document.content.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
    for (const token of tokens) {
      if (!this.index.has(token)) this.index.set(token, new Set());
      this.index.get(token).add(key);
    }

    this.kernel && (this.kernel.metrics.knowledgeOperations++);
    return structuredClone(document);
  }

  get(id) {
    this._assertReady();
    this.kernel && (this.kernel.metrics.knowledgeOperations++);
    const doc = this.documents.get(String(id));
    return doc ? structuredClone(doc) : null;
  }

  retrieve(id) {
    return this.get(id);
  }

  query(query, limit = 10) {
    return this.search(query, limit);
  }

  search(query, limit = 10) {
    this._assertReady();
    const tokens = String(query ?? "").toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
    if (!tokens.length) throw new Error("Knowledge query is required.");

    this.kernel && (this.kernel.metrics.knowledgeOperations++);
    const scores = new Map();

    for (const token of new Set(tokens)) {
      for (const id of this.index.get(token) ?? []) {
        scores.set(id, (scores.get(id) ?? 0) + 1);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, limit))
      .map(([id, score]) => ({ ...structuredClone(this.documents.get(id)), score }));
  }

  explain(query) {
    const results = this.search(query);
    return {
      query: String(query),
      resultCount: results.length,
      matches: results.map(r => ({ id: r.id, score: r.score }))
    };
  }

  stats() {
    this._assertReady();
    return {
      documents: this.documents.size,
      indexedTerms: this.index.size,
      operations: this.kernel?.metrics?.knowledgeOperations ?? 0
    };
  }

  size() {
    return this.documents.size;
  }

  health() {
    return {
      ...super.health(),
      documents: this.documents.size,
      indexedTerms: this.index.size
    };
  }
}

/* ----------------------------- DECISION ---------------------------- */

export class DecisionEngine extends EngineBase {
  constructor({
    kernel = null,
    memory = null,
    knowledge = null,
    policy = {}
  } = {}) {
    super({ kernel });
    this.memory = memory;
    this.knowledge = knowledge;
    this.policy = {
      approveThreshold: 0.8,
      holdThreshold: 0.5,
      ...policy
    };
    this.evaluationCount = 0;
    this.lastDecision = null;
  }

  async initialize() {
    if (this.policy.approveThreshold <= this.policy.holdThreshold) {
      throw new Error("Decision policy thresholds are invalid.");
    }
    this.initialized = true;
    return { status: "READY", policy: this.getPolicy() };
  }

  async dispose() {
    this.initialized = false;
  }

  async evaluate(context = {}) {
    this._assertReady();
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      throw new Error("Decision context must be an object.");
    }

    this.evaluationCount++;
    this.kernel && (this.kernel.metrics.decisionsEvaluated++);

    let confidence = Number.isFinite(context.confidence)
      ? Math.max(0, Math.min(1, context.confidence))
      : 0.5;

    let decision;
    let reason;

    if (context.reject === true) {
      decision = "REJECT";
      reason = "Explicit rejection policy.";
    } else if (context.hold === true) {
      decision = "HOLD";
      reason = "Explicit hold policy.";
    } else if (confidence >= this.policy.approveThreshold) {
      decision = "APPROVE";
      reason = "Confidence meets approval threshold.";
    } else if (confidence >= this.policy.holdThreshold) {
      decision = "HOLD";
      reason = "Confidence is below approval threshold.";
    } else {
      decision = "REJECT";
      reason = "Confidence is below hold threshold.";
    }

    const result = {
      decision,
      confidence,
      policy: "ADE-BASELINE-DETERMINISTIC",
      thresholds: {
        approve: this.policy.approveThreshold,
        hold: this.policy.holdThreshold
      },
      reason,
      evaluatedAt: new Date().toISOString(),
      context: structuredClone(context)
    };

    this.lastDecision = result;
    return structuredClone(result);
  }

  validateDecision(result) {
    this._assertReady();
    if (!result || !["APPROVE", "HOLD", "REJECT"].includes(result.decision)) return false;
    if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) return false;
    if (result.decision === "APPROVE" && result.confidence < this.policy.approveThreshold) return false;
    if (result.decision === "REJECT" && result.confidence >= this.policy.holdThreshold && result.context?.reject !== true) return false;
    return true;
  }

  explainDecision(result = this.lastDecision) {
    this._assertReady();
    if (!result) return { valid: false, explanation: "No decision has been evaluated." };
    return {
      valid: this.validateDecision(result),
      decision: result.decision,
      confidence: result.confidence,
      reason: result.reason,
      policy: this.getPolicy()
    };
  }

  getPolicy() {
    return { ...this.policy };
  }

  stats() {
    return {
      evaluations: this.evaluationCount,
      lastDecision: this.lastDecision ? structuredClone(this.lastDecision) : null
    };
  }

  health() {
    return {
      ...super.health(),
      evaluations: this.evaluationCount,
      policy: this.getPolicy()
    };
  }
}

/* --------------------------- OTHER ENGINES ------------------------- */

export class OracleIntelligenceEngine extends EngineBase {
  constructor({ kernel = null, knowledge = null, decision = null } = {}) {
    super({ kernel });
    this.knowledge = knowledge;
    this.decision = decision;
  }
  async inspect(context = {}) {
    this._assertReady();
    return { status: "ANALYZED", timestamp: new Date().toISOString(), context: structuredClone(context) };
  }
}

export class GuardianSecurityEngine extends EngineBase {
  constructor({ kernel = null, guard = null } = {}) {
    super({ kernel });
    this.guard = guard;
  }
  async authorize(token) {
    this._assertReady();
    if (!token) return { valid: false, tier: "NONE" };
    if (this.guard?.verifyLicenseKey) return this.guard.verifyLicenseKey(token);
    return { valid: true, tier: "COMMUNITY" };
  }
}

export class NotificationEngine extends EngineBase {
  async send(target, msg, metadata = {}) {
    this._assertReady();
    if (!target || msg === undefined) throw new Error("Notification target and message are required.");
    return { success: true, target, message: String(msg), metadata, timestamp: new Date().toISOString() };
  }
}

export class NexusLedgerEngine extends EngineBase {
  constructor({ kernel = null } = {}) {
    super({ kernel });
    this.transactions = [];
  }
  async record(tx = {}) {
    this._assertReady();
    if (!tx || typeof tx !== "object") throw new Error("Ledger transaction must be an object.");
    const entry = {
      id: this.transactions.length + 1,
      transaction: structuredClone(tx),
      timestamp: new Date().toISOString()
    };
    this.transactions.push(entry);
    return structuredClone(entry);
  }
  size() { return this.transactions.length; }
}

export class WorkflowEngine extends EngineBase {
  async execute(txPayload = {}) {
    this._assertReady();
    if (!txPayload || typeof txPayload !== "object") throw new Error("Workflow payload must be an object.");

    const bus = this.kernel.resolve("eventBus");
    const ledger = this.kernel.resolve("ledger");

    this.kernel.metrics.workflowStarted++;
    try {
      const started = await bus.publish("workflow.started", txPayload);
      this.kernel.metrics.eventsDelivered += started.deliveredCount;
      this.kernel.metrics.eventsFailed += started.failedCount;
      if (started.failedCount) throw new Error("workflow.started delivery failed.");

      const ledgerResult = await ledger.record(txPayload);

      const completed = await bus.publish("workflow.completed", {
        txPayload,
        ledger: ledgerResult
      });
      this.kernel.metrics.eventsDelivered += completed.deliveredCount;
      this.kernel.metrics.eventsFailed += completed.failedCount;
      if (completed.failedCount) throw new Error("workflow.completed delivery failed.");

      this.kernel.metrics.workflowCompleted++;
      this.kernel.metrics.workflowExecutions++;

      return {
        status: "SUCCESS",
        txPayload: structuredClone(txPayload),
        ledger: ledgerResult
      };
    } catch (error) {
      this.kernel.metrics.workflowFailed++;
      this.kernel.metrics.errors++;
      throw error;
    }
  }

  async executeAutonomousWorkflow(workflowId, inputData = {}) {
    this._assertReady();
    if (!workflowId) throw new Error("Workflow id is required.");

    const bus = this.kernel.resolve("eventBus");
    const ledger = this.kernel.resolve("ledger");
    const caseData = inputData.case || inputData;

    const context = {
      caseId: workflowId,
      request: caseData.request || inputData.request || {},
      organization: caseData.organization || inputData.organization || null,
      decision: inputData.decision || caseData.decision || null,
      confidence: Number(
        caseData.confidence ?? inputData.decision?.confidence ?? 0
      )
    };

    this.kernel.metrics.workflowStarted++;

    const emit = async (topic, payload) => {
      const result = await bus.publish(topic, payload);
      this.kernel.metrics.eventsDelivered += result.deliveredCount;
      this.kernel.metrics.eventsFailed += result.failedCount;
      if (result.failedCount) {
        throw new Error(`${topic} delivery failed.`);
      }
      return result;
    };

    try {
      await emit("engagement.workflow.started", {
        workflowId,
        caseContext: context
      });

      // OBSERVE + LEARN: persist the case context into the canonical
      // memory and knowledge authorities so downstream work is grounded.
      const memory = this.kernel.resolve("memory");
      const knowledge = this.kernel.resolve("knowledge");

      if (memory?.set) {
        memory.storeValue(`workflow:${workflowId}`, structuredClone(context));
      }
      if (knowledge?.ingest) {
        knowledge.ingest(`workflow:${workflowId}`, JSON.stringify(context));
      }

      // DECIDE: run the canonical deterministic decision gate. HOLD and
      // REJECT never proceed silently — they escalate to human review.
      const decisionEngine = this.kernel.resolve("decision");
      let decisionResult = {
        decision: "HOLD",
        reason: "Decision engine unavailable.",
        confidence: context.confidence
      };

      if (decisionEngine?.evaluate) {
        decisionResult = await decisionEngine.evaluate(context);
      }

      if (decisionResult.decision === "REJECT") {
        throw new Error("WORKFLOW_REJECTED");
      }

      if (decisionResult.decision === "HOLD") {
        await emit("human.escalation.required", {
          workflowId,
          reason: decisionResult.reason || "HOLD"
        });
        throw new Error("WORKFLOW_ESCALATED");
      }

      // EXECUTE: record an immutable ledger transaction for the action.
      const ledgerResult = await ledger.record({
        type: "CASE_EXECUTION",
        caseId: workflowId,
        decision: decisionResult.decision,
        confidence: context.confidence,
        source: "AUTONOMOUS_WORKFLOW"
      });

      // EVALUATE + COMPLETE: produce an objective completion result.
      const result = {
        status: "COMPLETED",
        workflowId,
        decision: decisionResult,
        context: context.decision || null,
        ledger: ledgerResult,
        completedAt: new Date().toISOString()
      };

      await emit("engagement.workflow.completed", {
        workflowId,
        result
      });

      this.kernel.metrics.workflowCompleted++;
      this.kernel.metrics.workflowExecutions++;

      return structuredClone(result);
    } catch (error) {
      this.kernel.metrics.workflowFailed++;
      this.kernel.metrics.errors++;
      try {
        await emit("engagement.workflow.failed", {
          workflowId,
          error: error?.message || String(error)
        }).catch(() => {});
      } catch {}
      throw error;
    }
  }
}
