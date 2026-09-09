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
