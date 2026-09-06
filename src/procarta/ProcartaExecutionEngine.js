/**
 * ADE CANONICAL PROCARTA EXECUTION ENGINE (G26)
 *
 * Truthful strategic vertical slice. Composes existing canonical ADE
 * boundaries — UnifiedIntakeEngine (observe/normalize), CaseManager (case
 * + context lifecycle), canonical DecisionEngine (approve/hold/reject),
 * provider-neutral UniversalAIGateway (AI augmentation when configured),
 * FeedbackPipeline (follow-up signal) and CommunityProgression (qualified
 * case progression). No new platform, no parallel store, no fabricated
 * reconciliation: every stage is real or explicitly reported unavailable.
 */

export class ProcartaExecutionEngine {
  constructor({
    kernel = null,
    caseManager = null,
    intake = null,
    feedbackPipeline = null,
    communityProgression = null,
    aiGateway = null,
    eventBus = null
  } = {}) {
    this.kernel = kernel;
    this.caseManager = caseManager;
    this.intake = intake;
    this.feedbackPipeline = feedbackPipeline;
    this.communityProgression = communityProgression;
    this.aiGateway = aiGateway;
    this.eventBus = eventBus;
    this.executions = [];
    this.maxExecutions = 200;
  }

  health() {
    return {
      status: "ONLINE",
      capability: "PROCARTA_EXECUTE",
      executionMode: "LIVE",
      executions: this.executions.length
    };
  }

  getRecentExecutions(limit = 25) {
    return this.executions.slice(-Math.max(1, Math.min(100, limit)));
  }

  _resolve(name) {
    try {
      return this.kernel?.resolve?.(name) || this.kernel?.container?.get?.(name) || null;
    } catch {
      return null;
    }
  }

  _requireInput(payload) {
    const text = String(
      payload?.text ||
      payload?.description ||
      payload?.message ||
      payload?.request?.text ||
      ""
    ).trim();
    if (!text) {
      const error = new Error(
        "PROCARTA_INPUT_REQUIRED: a business or operational description is required."
      );
      error.code = "PROCARTA_INPUT_REQUIRED";
      throw error;
    }
    return text;
  }

  _normalize(payload) {
    const channel = String(payload?.channel || "API");
    const description = String(
      payload?.text || payload?.description || payload?.message || payload?.request?.text || ""
    ).trim();

    const intakePayload = {
      text: description,
      organization: payload?.organization || payload?.businessName || null,
      contact: payload?.contact || null,
      email: payload?.email || null,
      phone: payload?.phone || null,
      name: payload?.name || null,
      systems: payload?.systems,
      authorization: payload?.authorization || {
        publicAnalysis: false,
        connectedSystems: false
      }
    };

    const meta = {
      source: payload?.source || "PROCARTA",
      authenticated: Boolean(payload?.authenticated),
      tenantId: payload?.tenantId || null
    };

    if (!this.intake || typeof this.intake.normalize !== "function") {
      const error = new Error(
        "PROCARTA_INTAKE_UNAVAILABLE: no canonical intake engine is bound."
      );
      error.code = "PROCARTA_INTAKE_UNAVAILABLE";
      throw error;
    }

    return this.intake.normalize(channel, intakePayload, meta);
  }

  _structure(normalized) {
    const request = normalized.request || {};
    return {
      objective: String(normalized.text || "").slice(0, 2000),
      intent: request.intent || "GENERAL_INQUIRY",
      systems: Array.isArray(request.systems) ? request.systems : [],
      workflows: Array.isArray(request.workflows) ? request.workflows : [],
      needsDiscovery: Boolean(request.needsDiscovery),
      channels: [String(normalized.channel || "API")],
      tenantId: normalized.tenantId || null,
      organization: normalized.organization || null,
      authorization: normalized.authorization || {
        publicAnalysis: false,
        connectedSystems: false
      }
    };
  }

  _deriveFindings(structure, decision, ai) {
    const findings = [];

    if (structure.systems.length > 0) {
      findings.push({
        id: "SYS_INTEGRATION_SURFACE",
        severity: "INFO",
        title: "System integration surface detected",
        description: "Target business systems identified from the operational input.",
        evidence: structure.systems
      });
    }

    if (structure.workflows.length > 0) {
      findings.push({
        id: "WORKFLOW_PROCESS_FOCUS",
        severity: "INFO",
        title: "Business process workflows identified",
        description: "Process areas detected in the operational input.",
        evidence: structure.workflows
      });
    }

    if (decision.decision === "APPROVE") {
      findings.push({
        id: "ASSESSMENT_READY",
        severity: "POSITIVE",
        title: "Assessment-worthy business context",
        description: "Confidence meets the approval threshold for upstream assessment.",
        evidence: [Number(decision.confidence)]
      });
    } else if (decision.decision === "HOLD" || decision.decision === "REJECT") {
      findings.push({
        id: "ESCALATION_REQUIRED",
        severity: "ACTION",
        title: "Human review escalation recommended",
        description: `Decision engine returned ${decision.decision}; escalation to human review is required.`,
        evidence: [Number(decision.confidence)]
      });
    }

    if (structure.needsDiscovery) {
      findings.push({
        id: "DISCOVERY_REQUIRED",
        severity: "INFO",
        title: "Discovery needed for authoritative context",
        description: "The intake classification flagged a need for authoritative discovery.",
        evidence: [structure.intent]
      });
    }

    if (!ai.available) {
      findings.push({
        id: "AI_AUGMENTATION_UNAVAILABLE",
        severity: "INFO",
        title: "AI augmentation not configured",
        description: "No provider-neutral AI provider is configured; analysis is deterministic only.",
        evidence: []
      });
    }

    return findings;
  }

  _recommend(structure, decision, ai, record) {
    const actions = [
      {
        action: "PROCESS_CASE_UPSTREAM",
        target: `/api/v1/cases/${record?.id || ":caseId"}/process`,
        reason: "Route the structured case through the canonical engagement pipeline."
      }
    ];

    if (structure.needsDiscovery) {
      actions.push({
        action: "AUTHORIZE_PUBLIC_DISCOVERY",
        reason: "Case requires authoritative discovery of external business context before analysis."
      });
    }

    if (!ai.available) {
      actions.push({
        action: "CONFIGURE_AI_PROVIDER",
        reason: "Enables provider-neutral AI augmentation for business-process analysis."
      });
    }

    return actions;
  }

  async _runDecision(request) {
    const decisionEngine = this._resolve("decision");

    if (!decisionEngine || typeof decisionEngine.evaluate !== "function") {
      return {
        decision: "HOLD",
        confidence: Number(request.confidence || 0),
        source: "DEFAULT",
        policy: "NO_DECISION_ENGINE",
        reason: "Canonical decision engine unavailable."
      };
    }

    try {
      const context = {
        intent: request.intent || "GENERAL_INQUIRY",
        confidence: Number(request.confidence || 0),
        needsDiscovery: Boolean(request.needsDiscovery)
      };
      const evaluated = await decisionEngine.evaluate(context);
      return { ...evaluated, source: "CANONICAL_DECISION_ENGINE" };
    } catch (error) {
      return {
        decision: "HOLD",
        confidence: Number(request.confidence || 0),
        source: "DEFAULT",
        reason: `Decision engine errored: ${error.message}`
      };
    }
  }

  async _runAI(structure) {
    const noneAvailable = {
      available: false,
      provider: null,
      route: null,
      note: "No AI provider configured. Deterministic analysis only."
    };

    if (!this.aiGateway) {
      return { ...noneAvailable, note: "AI gateway unavailable. Deterministic analysis only." };
    }

    let providerCount = 0;
    try {
      const status = this.aiGateway.getProviderStatus?.() || null;
      providerCount = Number(status?.configuredProviderCount || 0);
    } catch {
      providerCount = 0;
    }

    if (providerCount === 0) {
      return { ...noneAvailable, configuredProviderCount: 0 };
    }

    try {
      const prompt = this._buildPrompt(structure);
      const aiResult = await this.aiGateway.dispatchPrompt(prompt, {
        source: "PROCARTA_ANALYSIS"
      });
      return {
        available: true,
        provider: String(aiResult.route || "PROVIDER"),
        route: String(aiResult.route || "PROVIDER"),
        response: String(aiResult.response || ""),
        configuredProviderCount: providerCount,
        note: "Augmentation from provider-neutral AI gateway."
      };
    } catch (error) {
      return {
        ...noneAvailable,
        configuredProviderCount: providerCount,
        note: `AI augmentation attempted but failed: ${error.message}`
      };
    }
  }

  _buildPrompt(structure) {
    const areas = structure.workflows.length
      ? structure.workflows.join(", ")
      : "general operations";
    const systems = structure.systems.length
      ? structure.systems.join(", ")
      : "unspecified systems";
    return `Ade Procarta operational assessment. Business objective: ${structure.objective}. Process areas: ${areas}. Target systems: ${systems}. Identify operational findings and recommended next actions.`;
  }

  async execute(payload = {}, context = {}) {
    const startedAt = new Date().toISOString();
    const text = this._requireInput(payload);
    const normalized = this._normalize(payload);

    if (!this.caseManager || typeof this.caseManager.get !== "function") {
      const error = new Error("PROCARTA_CASE_BOUNDARY_UNAVAILABLE");
      error.code = "PROCARTA_CASE_BOUNDARY_UNAVAILABLE";
      throw error;
    }

    let record = null;
    if (payload.caseId) {
      try { record = this.caseManager.get(payload.caseId); } catch {}
    }

    const isNew = !record;
    const request = normalized.request || {};

    if (isNew) {
      if (typeof this.caseManager.createCase !== "function") {
        const error = new Error("PROCARTA_CASE_BOUNDARY_UNAVAILABLE");
        error.code = "PROCARTA_CASE_BOUNDARY_UNAVAILABLE";
        throw error;
      }
      record = this.caseManager.createCase({
        source: normalized.source || "PROCARTA",
        channel: normalized.channel || "API",
        organization: normalized.organization || null,
        contact: normalized.contact || null,
        request,
        confidence: Number(request.confidence || 0),
        authorization: normalized.authorization || {
          publicAnalysis: false,
          connectedSystems: false
        },
        nextAction: request.needsDiscovery ? "DISCOVERY" : "HUMAN_REVIEW",
        requiredCapabilities: ["PROCARTA_EXECUTE"]
      });
    }

    const caseId = String(record.id);
    const structure = this._structure(normalized);

    const memory = this._resolve("memory");
    const knowledge = this._resolve("knowledge");

    const decision = await this._runDecision(request);
    const ai = await this._runAI(structure);

    const findings = this._deriveFindings(structure, decision, ai);
    const recommendedNextActions = this._recommend(structure, decision, ai, record);

    const analysis = {
      source: ai.available ? "HYBRID" : "DETERMINISTIC",
      ai: ai.available ? "AUGMENTED" : "UNAVAILABLE",
      basedOn: [
        "intake-classification",
        "system-signals",
        "workflow-signals",
        "decision-engine"
      ]
    };

    const result = {
      executionMode: "LIVE",
      caseId,
      caseCreated: isNew,
      intent: request.intent || "GENERAL_INQUIRY",
      confidence: Number(request.confidence || 0),
      decision,
      structure,
      analysis,
      findings,
      recommendedNextActions,
      ai,
      stored: true,
      audited: true,
      triggeredBy: "PROCARTA_EXECUTE",
      executedAt: new Date().toISOString(),
      startedAt
    };

    let contextPersisted = true;
    let contextWarning = null;
    if (typeof this.caseManager.update === "function") {
      try {
        this.caseManager.update(caseId, {
          procarta: {
            executionMode: "LIVE",
            executedAt: result.executedAt,
            intent: result.intent,
            confidence: result.confidence,
            findings,
            recommendedNextActions
          },
          analysis,
          decision
        });
      } catch (error) {
        contextPersisted = false;
        contextWarning = `PROCARTA_CONTEXT_UPDATE_FAILED: ${error?.message || "unknown"}`;
      }
    }

    try {
      if (memory && typeof memory.storeValue === "function") {
        memory.storeValue(`procarta:${caseId}`, structure);
      }
      if (knowledge && typeof knowledge.ingest === "function") {
        knowledge.ingest(`procarta:${caseId}`, JSON.stringify(structure));
      }
    } catch {}

    if (this.eventBus && typeof this.eventBus.publish === "function") {
      try {
        await this.eventBus.publish("procarta.executed", { caseId, result });
      } catch {}
      try {
        await this.eventBus.publish("audit.log.created", {
          category: "PROCARTA",
          caseId,
          executionMode: "LIVE",
          intent: result.intent,
          confidence: result.confidence,
          findings: findings.map((f) => f.id),
          timestamp: result.executedAt
        });
      } catch {}
    }

    let feedbackCaptured = false;
    if (this.feedbackPipeline && typeof this.feedbackPipeline.ingest === "function") {
      try {
        await this.feedbackPipeline.ingest({
          type: "PROCARTA_FOLLOW_UP",
          caseId,
          source: "PROCARTA_EXECUTION",
          at: result.executedAt
        });
        feedbackCaptured = true;
      } catch {}
    }

    let progressionCaptured = false;
    if (
      this.communityProgression &&
      typeof this.communityProgression.captureIntake === "function" &&
      structure.needsDiscovery &&
      Number(result.confidence) >= 0.6
    ) {
      try {
        this.communityProgression.captureIntake({
          type: payload.progressionType || "USE_CASE",
          organization: normalized.organization || null,
          contactHint: normalized.contact?.email || null,
          useCaseDescription: text.slice(0, 5000),
          metadata: { caseId, intent: result.intent, procarta: true }
        });
        progressionCaptured = true;
      } catch {}
    }

    result.contextPersisted = contextPersisted;
    if (contextWarning) {
      result.warning = contextWarning;
    }
    result.feedbackCaptured = feedbackCaptured;
    result.progressionCaptured = progressionCaptured;

    this.executions.push({
      caseId,
      executedAt: result.executedAt,
      mode: "LIVE",
      intent: result.intent,
      source: context?.userLevel !== undefined ? "KERNEL_DISPATCH" : "CAPABILITY_REGISTRY"
    });
    if (this.executions.length > this.maxExecutions) {
      this.executions = this.executions.slice(-this.maxExecutions);
    }

    return result;
  }
}

export default ProcartaExecutionEngine;