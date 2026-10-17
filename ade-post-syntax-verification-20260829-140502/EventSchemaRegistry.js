/**
 * Enterprise Event Schema Registry
 *
 * Canonical validation registry for kernel and engagement events.
 */
export class EventSchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.registerCoreContracts();
  }

  registerSchema(topic, validatorFn) {
    if (typeof validatorFn !== "function") {
      throw new Error(`Schema validator for '${topic}' must be a function.`);
    }

    this.schemas.set(topic, validatorFn);
    return this;
  }

  validate(topic, payload = {}) {
    if (!this.schemas.has(topic)) {
      return {
        valid: true,
        schemaEnforced: false
      };
    }

    try {
      const validator = this.schemas.get(topic);
      const isValid = Boolean(validator(payload));

      return {
        valid: isValid,
        schemaEnforced: true
      };
    } catch (error) {
      return {
        valid: false,
        schemaEnforced: true,
        error: error.message
      };
    }
  }

  hasSchema(topic) {
    return this.schemas.has(topic);
  }

  listTopics() {
    return [...this.schemas.keys()];
  }

  registerCoreContracts() {
    const isObject = (p) =>
      p !== null &&
      typeof p === "object" &&
      !Array.isArray(p);

    // --------------------------------------------------------
    // KERNEL / SYSTEM EVENTS
    // --------------------------------------------------------

    this.registerSchema("SYSTEM_BOOT", (p) => p !== null && p !== undefined);
    this.registerSchema("SYSTEM_READY", (p) => p !== null && p !== undefined);
    this.registerSchema("SYSTEM_SHUTDOWN", (p) => p !== null && p !== undefined);
    this.registerSchema("METRIC_PUBLISHED", (p) => p !== null && p !== undefined);
    this.registerSchema("ANOMALY_DETECTED", (p) => p !== null && p !== undefined);
    this.registerSchema("DECISION_EXECUTED", (p) => p !== null && p !== undefined);
    this.registerSchema("ORDER_SETTLED", (p) => p !== null && p !== undefined);
    this.registerSchema("MARKETING_ASSET_CREATED", (p) => p !== null && p !== undefined);

    // --------------------------------------------------------
    // CAPABILITY EVENTS
    // --------------------------------------------------------

    this.registerSchema("CAPABILITY_REGISTERED", (p) =>
      isObject(p) && typeof p.intent === "string"
    );

    this.registerSchema("CAPABILITY_UNREGISTERED", (p) =>
      isObject(p) && typeof p.intent === "string"
    );

    this.registerSchema("CAPABILITY_REVOKED", (p) =>
      isObject(p) && typeof p.intent === "string"
    );

    this.registerSchema("CAPABILITY_RESTORED", (p) =>
      isObject(p) && typeof p.intent === "string"
    );

    // --------------------------------------------------------
    // MARKETING / AUDIT / HUMAN EVENTS
    // --------------------------------------------------------

    this.registerSchema(
      "marketing.campaign.requested",
      (p) => isObject(p) && typeof p.title === "string"
    );

    this.registerSchema(
      "marketing.video.generated",
      (p) => isObject(p) && p.status === "SUCCESS"
    );

    this.registerSchema(
      "marketing.broadcast.scheduled",
      (p) => isObject(p) && Array.isArray(p.targetChannels)
    );

    this.registerSchema(
      "audit.log.created",
      (p) => isObject(p) && typeof p.action === "string"
    );

    this.registerSchema(
      "human.escalation.required",
      (p) => isObject(p) && typeof p.reason === "string"
    );

    // --------------------------------------------------------
    // PHASE 7 — ENGAGEMENT EVENT CONTRACTS
    // --------------------------------------------------------

    this.registerSchema("engagement.case.created", isObject);
    this.registerSchema("engagement.case.updated", isObject);
    this.registerSchema("engagement.case.transitioned", isObject);

    this.registerSchema("engagement.discovery.started", isObject);
    this.registerSchema("engagement.discovery.completed", isObject);
    this.registerSchema("engagement.discovery.failed", isObject);

    this.registerSchema("engagement.knowledge.ingested", isObject);

    this.registerSchema("engagement.decision.requested", isObject);
    this.registerSchema("engagement.decision.completed", isObject);

    this.registerSchema("engagement.capability.evaluated", isObject);
    this.registerSchema("engagement.capability.available", isObject);
    this.registerSchema("engagement.capability.gap", isObject);

    this.registerSchema("engagement.partner.match.requested", isObject);
    this.registerSchema("engagement.partner.recommended", isObject);

    this.registerSchema("engagement.workflow.started", isObject);
    this.registerSchema("engagement.workflow.completed", isObject);
    this.registerSchema("engagement.workflow.failed", isObject);

    this.registerSchema("engagement.feedback.received", isObject);

    return this;
  }
}

export default EventSchemaRegistry;
