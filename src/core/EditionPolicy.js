/**
 * ADE CANONICAL EDITION & CAPABILITY POLICY
 *
 * This is the single runtime authority for edition-based entitlement
 * in the JavaScript/Node.js runtime. It bridges the TypeScript edition
 * types (types/ade/edition.ts) into the actual operational policy.
 *
 * One ADE core, multiple editions, different entitlements.
 * No duplicate kernel. No separate ADE products.
 */

const ADE_EDITIONS = Object.freeze({
  DEMO: "DEMO",
  COMMUNITY: "COMMUNITY",
  PILOT: "PILOT",
  PROFESSIONAL: "PROFESSIONAL",
  ENTERPRISE: "ENTERPRISE",
  SYSTEM: "SYSTEM"
});

const EDITION_COMPATIBILITY_ALIASES = Object.freeze({
  FULL: "COMMUNITY"
});

const CAPABILITY_AVAILABILITY = Object.freeze({
  PING: {
    description: "Kernel health ping",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  PUBLIC_INFO: {
    description: "Public platform information",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  WATCH_ASSET: {
    description: "Subscribe to asset stream",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  TELEMETRY_SSE: {
    description: "Live telemetry stream",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  UNIVERSAL_AI_GATEWAY: {
    description: "Universal AI prompt dispatch",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE", note: "AI providers may be unconfigured"
  },
  MULTI_STREAM: {
    description: "Multi-stream operations",
    demo: false, community: false, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "PRO"
  },
  SYSTEM_HEALTH: {
    description: "System health diagnostic",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  SYSTEM_SHUTDOWN: {
    description: "Controlled system shutdown",
    demo: false, community: false, pilot: false, professional: false, enterprise: true, system: true,
    executionMode: "LIVE", tier: "ENTERPRISE"
  },
  CASE_CREATE: {
    description: "Create a case via universal intake",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  CASE_PROCESS: {
    description: "Process a case through decision engine",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "SIMULATED_IN_DEMO", tier: "FREE"
  },
  CASE_EXECUTE: {
    description: "Execute workflow for a case",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "SIMULATED_IN_DEMO", tier: "FREE"
  },
  FEEDBACK_SUBMIT: {
    description: "Submit feedback on ADE operations",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  DEMO_ORCHESTRATE: {
    description: "Run a guided demonstration workflow",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "SIMULATED", tier: "FREE"
  },
  MEDIA_GENERATE: {
    description: "Generate media assets via provider registry",
    demo: false, community: false, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "SIMULATED_IN_DEMO", tier: "PRO"
  },
  MEDIA_ORCHESTRATE: {
    description: "Orchestrate media campaign production",
    demo: false, community: false, pilot: false, professional: true, enterprise: true, system: true,
    executionMode: "SIMULATED_IN_DEMO", tier: "ENTERPRISE"
  },
  PILOT_INTAKE: {
    description: "Register pilot interest or qualification",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  PARTNER_REGISTRATION: {
    description: "Register as a partner or integration",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE"
  },
  PROCARTA_EXECUTE: {
    description: "Execute a Procarta business-process analysis slice",
    demo: true, community: true, pilot: true, professional: true, enterprise: true, system: true,
    executionMode: "LIVE", tier: "FREE", note: "Deterministic analysis; AI augmentation when a provider is configured"
  }
});

const EDITION_LIMITS = Object.freeze({
  DEMO: {
    maxDailyCases: 10,
    maxConcurrentStreams: 1,
    maxActiveAssets: 2,
    aiProvidersAllowed: false,
    externalIntegrations: false,
    productionCredentials: false,
    destructiveOperations: false,
    persistentState: "session",
    label: "DEMO"
  },
  COMMUNITY: {
    maxDailyCases: 50,
    maxConcurrentStreams: 2,
    maxActiveAssets: 3,
    aiProvidersAllowed: true,
    externalIntegrations: false,
    productionCredentials: false,
    destructiveOperations: false,
    persistentState: "durable",
    label: "COMMUNITY EDITION"
  },
  PILOT: {
    maxDailyCases: 200,
    maxConcurrentStreams: 5,
    maxActiveAssets: 10,
    aiProvidersAllowed: true,
    externalIntegrations: true,
    productionCredentials: false,
    destructiveOperations: false,
    persistentState: "durable",
    label: "PILOT"
  },
  PROFESSIONAL: {
    maxDailyCases: 1000,
    maxConcurrentStreams: 10,
    maxActiveAssets: 50,
    aiProvidersAllowed: true,
    externalIntegrations: true,
    productionCredentials: true,
    destructiveOperations: false,
    persistentState: "durable",
    label: "PROFESSIONAL"
  },
  ENTERPRISE: {
    maxDailyCases: Infinity,
    maxConcurrentStreams: Infinity,
    maxActiveAssets: Infinity,
    aiProvidersAllowed: true,
    externalIntegrations: true,
    productionCredentials: true,
    destructiveOperations: true,
    persistentState: "durable",
    label: "ENTERPRISE"
  },
  SYSTEM: {
    maxDailyCases: Infinity,
    maxConcurrentStreams: Infinity,
    maxActiveAssets: Infinity,
    aiProvidersAllowed: true,
    externalIntegrations: true,
    productionCredentials: true,
    destructiveOperations: true,
    persistentState: "durable",
    label: "SYSTEM"
  }
});

export class EditionPolicy {
  constructor(edition = null) {
    this.edition = edition || process.env.ADE_EDITION || process.env.ADE_RUNTIME_MODE || "COMMUNITY";
    this.edition = String(this.edition).trim().toUpperCase();
    if (EDITION_COMPATIBILITY_ALIASES[this.edition]) {
      this.edition = EDITION_COMPATIBILITY_ALIASES[this.edition];
    }
    if (!ADE_EDITIONS[this.edition]) {
      this.edition = "COMMUNITY";
    }
  }

  getEdition() { return this.edition; }

  isDemoMode() {
    return this.edition === "DEMO" || String(process.env.ADE_DEMO_MODE).toLowerCase() === "true";
  }

  isCommunityMode() {
    return this.edition === "COMMUNITY";
  }

  getLimits() {
    return EDITION_LIMITS[this.edition] || EDITION_LIMITS.COMMUNITY;
  }

  isCapabilityAvailable(capability) {
    const cap = CAPABILITY_AVAILABILITY[capability];
    if (!cap) return false;
    return Boolean(cap[this.edition.toLowerCase()]);
  }

  getCapabilityExecutionMode(capability) {
    const cap = CAPABILITY_AVAILABILITY[capability];
    if (!cap) return "UNAVAILABLE";
    if (!cap[this.edition.toLowerCase()]) return "UNAVAILABLE";
    if (this.isDemoMode() && cap.executionMode === "SIMULATED_IN_DEMO") return "SIMULATED";
    return cap.executionMode;
  }

  listCapabilities() {
    return Object.entries(CAPABILITY_AVAILABILITY).map(([intent, meta]) => ({
      intent,
      description: meta.description,
      available: Boolean(meta[this.edition.toLowerCase()]),
      executionMode: this.getCapabilityExecutionMode(intent),
      tier: meta.tier,
      note: meta.note || null
    }));
  }

  getEditionBadge() {
    const badges = {
      DEMO: "ADE DEMO MODE",
      COMMUNITY: "ADE COMMUNITY EDITION · PUBLIC MVP",
      PILOT: "ADE PILOT EDITION",
      PROFESSIONAL: "ADE PROFESSIONAL",
      ENTERPRISE: "ADE ENTERPRISE",
      SYSTEM: "ADE SYSTEM"
    };
    return badges[this.edition] || "ADE COMMUNITY EDITION · PUBLIC MVP";
  }

  toJSON() {
    return {
      edition: this.edition,
      isDemoMode: this.isDemoMode(),
      limits: this.getLimits(),
      badge: this.getEditionBadge(),
      capabilities: this.listCapabilities()
    };
  }
}

export { ADE_EDITIONS, EDITION_COMPATIBILITY_ALIASES, CAPABILITY_AVAILABILITY, EDITION_LIMITS };
export default EditionPolicy;
