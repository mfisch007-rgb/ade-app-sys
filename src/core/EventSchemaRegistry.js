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

    // --------------------------------------------------------
    // G21 — OBSERVABILITY / INTERNAL OPERATIONS CONTRACTS
    // --------------------------------------------------------

    this.registerSchema("SYS_HEALTH", (p) =>
      isObject(p) && typeof p.status === "string"
    );

    this.registerSchema("AUDIT_LOGS", (p) =>
      isObject(p) && typeof p.entry === "string" || isObject(p) && typeof p.message === "string"
    );

    this.registerSchema("AI_GATEWAY", (p) =>
      isObject(p) && typeof p.provider === "string" || isObject(p) && typeof p.source === "string"
    );

    this.registerSchema("KERNEL_EVENTS", isObject);
    this.registerSchema("SUBSYSTEM_EVENTS", isObject);
    this.registerSchema("KERNEL_STATUS", (p) => isObject(p) && typeof p.status === "string");
    this.registerSchema("KERNEL_BOOT_COMPLETE", (p) => isObject(p) && typeof p.status === "string");
    this.registerSchema("KERNEL_BOOT_FAILED", (p) => isObject(p) && typeof p.status === "string");
    this.registerSchema("KERNEL_SHUTDOWN_COMPLETE", (p) => isObject(p) && typeof p.status === "string");
    this.registerSchema("KERNEL_INTENT", (p) => isObject(p) && typeof p.intent === "string");
    this.registerSchema("KERNEL_SUBSYSTEM_ATTACHED", (p) => isObject(p) && typeof p.moduleName === "string");
    this.registerSchema("METRIC_SNAPSHOT", (p) => isObject(p));
    this.registerSchema("SECURITY_EVENT", (p) =>
      isObject(p) && (typeof p.type === "string" || typeof p.action === "string")
    );
    this.registerSchema("HEALTH_CHECK", (p) => isObject(p) && typeof p.status === "string");
    this.registerSchema("ALERT_RAISED", (p) => isObject(p) && typeof p.severity === "string");
    this.registerSchema("DEPLOYMENT_RELEASED", (p) => isObject(p) && typeof p.version === "string");
    this.registerSchema("ERROR_OCCURRED", (p) => isObject(p) && typeof p.error === "string");
    this.registerSchema("AI_PROVIDER_ERROR", (p) => isObject(p) && typeof p.provider === "string");

    // --------------------------------------------------------
    // PHASE 8/9 — DEMO, MEDIA, FEEDBACK, COMMUNITY, PRODUCT, ICX CONTRACTS
    // --------------------------------------------------------

    this.registerSchema("DEMO_RUN_STARTED", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_STAGE_DONE", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_RUN_COMPLETED", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_RUN_FAILED", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_SESSION_STARTED", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_SESSION_FINISHED", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_SESSION_EXPIRED", (p) => isObject(p) && typeof p.demoId === "string");
    this.registerSchema("DEMO_STAGE_COMPLETED", (p) => isObject(p));
    this.registerSchema("DEMO_ACTION_BLOCKED", (p) => isObject(p));

    this.registerSchema("MEDIA_REQUEST_CREATED", (p) => isObject(p) && typeof p.requestId === "string");
    this.registerSchema("MEDIA_CONCEPT_CREATED", (p) => isObject(p) && typeof p.conceptId === "string");

    this.registerSchema("FEEDBACK_CAPTURED", isObject);
    this.registerSchema("PROGRESSION_INTAKE_CAPTURED", isObject);
    this.registerSchema("IMPROVEMENT_PROPOSAL_CREATED", isObject);

    this.registerSchema("PRODUCT_EVENT", (p) => isObject(p) && typeof p.productId === "string");

    this.registerSchema("notification.new_capability", (p) => isObject(p) && typeof p.eventId === "string");
    this.registerSchema("notification.release_update", (p) => isObject(p) && typeof p.eventId === "string");
    this.registerSchema("notification.pilot_update", (p) => isObject(p) && typeof p.eventId === "string");
    this.registerSchema("notification.request_status", (p) => isObject(p) && typeof p.eventId === "string");
    this.registerSchema("notification.capability_available", (p) => isObject(p) && typeof p.eventId === "string");
    this.registerSchema("notification.improvement_deployed", (p) => isObject(p) && typeof p.eventId === "string");
    this.registerSchema("notification.demo_completed", (p) => isObject(p) && typeof p.eventId === "string");

    this.registerSchema("ASSET_REGISTERED", (p) => isObject(p) && typeof p.assetId === "string");
    this.registerSchema("ASSET_UPDATED", (p) => isObject(p) && typeof p.assetId === "string");

    this.registerSchema("ICX_STAFF_UPSERTED", (p) => isObject(p) && typeof p.id === "string");
    this.registerSchema("ICX_PRESENCE_CHANGED", (p) => isObject(p) && typeof p.id === "string");
    this.registerSchema("ICX_MESSAGE_SENT", (p) => isObject(p) && typeof p.id === "string");
    this.registerSchema("ICX_ESCALATION_CREATED", (p) => isObject(p) && typeof p.id === "string");

    return this;
  }
}

export default EventSchemaRegistry;
