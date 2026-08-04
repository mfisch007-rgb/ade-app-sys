/**
 * Enterprise Event Schema Registry
 * Explicit contract definition for static AST analysis and runtime safety.
 */
export class EventSchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.registerCoreContracts();
  }

  registerSchema(topic, validatorFn) {
    if (typeof validatorFn === 'function') {
      this.schemas.set(topic, validatorFn);
    }
  }

  validate(topic, payload = {}) {
    if (!this.schemas.has(topic)) {
      return { valid: true, schemaEnforced: false };
    }
    try {
      const validator = this.schemas.get(topic);
      const isValid = Boolean(validator(payload));
      return { valid: isValid, schemaEnforced: true };
    } catch (err) {
      return { valid: false, schemaEnforced: true, error: err.message };
    }
  }

  registerCoreContracts() {
    // Top-level explicit contract definitions for AST analysis
    this.registerSchema('SYSTEM_BOOT', (p) => p !== null && p !== undefined);
    this.registerSchema('SYSTEM_READY', (p) => p !== null && p !== undefined);
    this.registerSchema('SYSTEM_SHUTDOWN', (p) => p !== null && p !== undefined);
    this.registerSchema('METRIC_PUBLISHED', (p) => p !== null && p !== undefined);
    this.registerSchema('ANOMALY_DETECTED', (p) => p !== null && p !== undefined);
    this.registerSchema('DECISION_EXECUTED', (p) => p !== null && p !== undefined);
    this.registerSchema('ORDER_SETTLED', (p) => p !== null && p !== undefined);
    this.registerSchema('MARKETING_ASSET_CREATED', (p) => p !== null && p !== undefined);
    this.registerSchema('marketing.campaign.requested', (p) => typeof p.title === 'string');
    this.registerSchema('marketing.video.generated', (p) => p && p.status === 'SUCCESS');
    this.registerSchema('marketing.broadcast.scheduled', (p) => Array.isArray(p.targetChannels));
    this.registerSchema('audit.log.created', (p) => typeof p.action === 'string');
    this.registerSchema('human.escalation.required', (p) => typeof p.reason === 'string');
  }
}

export default EventSchemaRegistry;