/**
 * Enterprise Schema Contract Validator (Tier 1 & Tier 2)
 * Replaces unstructured string topics with runtime payload verification.
 */
export class EventSchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.initializeCoreContracts();
  }

  /**
   * Registers default production event contracts across subsystems
   */
  initializeCoreContracts() {
    // --- System Lifecycle & Operational Contracts ---
    this.registerSchema('SYSTEM_BOOT', (p) => p && typeof p.timestamp === 'number');
    this.registerSchema('SYSTEM_READY', (p) => p && typeof p.subsystemCount === 'number');
    this.registerSchema('SYSTEM_SHUTDOWN', (p) => p && typeof p.reason === 'string');
    this.registerSchema('METRIC_PUBLISHED', (p) => p && typeof p.metric === 'string' && typeof p.value === 'number');

    // --- Core Engine Contracts ---
    this.registerSchema('ANOMALY_DETECTED', (p) => p && typeof p.severity === 'string' && typeof p.source === 'string');
    this.registerSchema('DECISION_EXECUTED', (p) => p && typeof p.decisionId === 'string' && Boolean(p.action));
    this.registerSchema('ORDER_SETTLED', (p) => p && typeof p.transactionId === 'string' && typeof p.amount === 'number');

    // --- Marketing & AI Studio Contracts ---
    this.registerSchema('marketing.campaign.requested', (p) => p && typeof p.title === 'string');
    this.registerSchema('marketing.video.generated', (p) => p && p.status === 'SUCCESS' && typeof p.videoUrl === 'string');
    this.registerSchema('marketing.broadcast.scheduled', (p) => p && Array.isArray(p.targetChannels));
    this.registerSchema('MARKETING_ASSET_CREATED', (p) => p && typeof p.assetId === 'string');

    // --- Governance & Security Contracts ---
    this.registerSchema('audit.log.created', (p) => p && typeof p.action === 'string' && typeof p.subsystem === 'string');
    this.registerSchema('human.escalation.required', (p) => p && typeof p.reason === 'string');
  }

  /**
   * Register a new schema validator function for a specific topic
   * @param {string} topic 
   * @param {Function} validatorFn 
   */
  registerSchema(topic, validatorFn) {
    if (typeof validatorFn !== 'function') {
      throw new TypeError(`[EventSchemaRegistry] Validator for topic '${topic}' must be a function.`);
    }
    this.schemas.set(topic, validatorFn);
  }

  /**
   * Validates event payload against registered contract
   * @param {string} topic 
   * @param {Object} payload 
   * @returns {{ valid: boolean, schemaEnforced: boolean, error?: string }}
   */
  validate(topic, payload = {}) {
    if (!this.schemas.has(topic)) {
      // Loose validation for unregistered dynamic topics to prevent blocking unknown events
      return { valid: true, schemaEnforced: false };
    }

    const validator = this.schemas.get(topic);
    try {
      const isValid = Boolean(validator(payload));
      return {
        valid: isValid,
        schemaEnforced: true,
        ...(isValid ? {} : { error: `Payload structure mismatch for event topic '${topic}'` })
      };
    } catch (err) {
      return {
        valid: false,
        schemaEnforced: true,
        error: `Validator threw exception on topic '${topic}': ${err.message}`
      };
    }
  }
}

export default EventSchemaRegistry;