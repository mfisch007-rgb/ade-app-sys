/**
 * Enterprise Schema Contract Validator (Tier 1)
 * Replaces unstructured string topics with runtime payload verification.
 */
export class EventSchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.initializeCoreContracts();
  }

  initializeCoreContracts() {
    // Marketing & AI Studio Contracts
    this.registerSchema('marketing.campaign.requested', (p) => typeof p.title === 'string');
    this.registerSchema('marketing.video.generated', (p) => p.status === 'SUCCESS' && typeof p.videoUrl === 'string');
    this.registerSchema('marketing.broadcast.scheduled', (p) => Array.isArray(p.targetChannels));

    // Governance & Security Contracts
    this.registerSchema('audit.log.created', (p) => typeof p.action === 'string' && typeof p.subsystem === 'string');
    this.registerSchema('human.escalation.required', (p) => typeof p.reason === 'string');
  }

  registerSchema(topic, validatorFn) {
    this.schemas.set(topic, validatorFn);
  }

  validate(topic, payload) {
    if (!this.schemas.has(topic)) {
      // Loose validation for unregistered dynamic topics
      return { valid: true, schemaEnforced: false };
    }
    const validator = this.schemas.get(topic);
    const isValid = validator(payload);
    return { valid: isValid, schemaEnforced: true };
  }
}

export default EventSchemaRegistry;