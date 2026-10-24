/**
 * ADE OPERATIONAL KNOB INVENTORY (Batch 12 B/C/D/E/G/H/I/M)
 *
 * Deterministic inventory built from LIVE singletons passed in by the caller.
 * Nothing is invented: every knob cites the source it was read from, and
 * secrets are never included (presence flags and requirement names only).
 * Pure builder — no I/O. Persistence/audit stay with existing mechanisms.
 */

export const KNOB_STATUSES = Object.freeze([
  "READY",
  "CONFIGURED",
  "NOT_CONFIGURED",
  "VERIFY_REQUIRED",
  "VERIFICATION_FAILED",
  "PROVIDER_REQUIRED",
  "HUMAN_APPROVAL_REQUIRED",
  "ENABLED",
  "SUSPENDED",
  "SIMULATED",
  "LIVE_NOT_PROVEN",
  "NOT_AVAILABLE",
  "FUTURE",
  "EXPERIMENTAL"
]);

const NATIVE_INBOUND_CHANNELS = new Set(["WEB", "API", "HUMAN"]);
const CHANNEL_CONFIG_REQUIREMENTS = Object.freeze({
  EMAIL: ["email provider credential (RESEND_API_KEY)"],
  TELEGRAM: ["Telegram bot credential"],
  WEBHOOK: ["signed webhook endpoint"],
  PARTNER: ["partner adapter / credential"],
  CRM: ["CRM adapter / credential"],
  MARKETPLACE: ["marketplace adapter / credential"],
  PROCUREMENT: ["procurement adapter / credential"]
});

function knob(partial) {
  return {
    id: String(partial.id || "unknown"),
    system: String(partial.system || "ADE"),
    name: String(partial.name || partial.id || "unknown"),
    status: KNOB_STATUSES.includes(partial.status) ? partial.status : "NOT_AVAILABLE",
    whatItDoes: String(partial.whatItDoes || ""),
    mode: String(partial.mode || ""),
    lifecycle: String(partial.lifecycle || ""),
    implementation: String(partial.implementation || ""),
    configuration: String(partial.configuration || ""),
    runtime: String(partial.runtime || ""),
    userAvailability: String(partial.userAvailability || ""),
    reason: String(partial.reason || ""),
    evidence: Array.isArray(partial.evidence) ? partial.evidence.map((e) => String(e)) : [],
    verification: String(partial.verification || "NOT_VERIFIED"),
    lastVerifiedAt: partial.lastVerifiedAt || null,
    delivery: String(partial.delivery || "NOT_APPLICABLE"),
    requiredConfig: Array.isArray(partial.requiredConfig) ? partial.requiredConfig : [],
    whoCanChange: String(partial.whoCanChange || "ADMIN"),
    actions: Array.isArray(partial.actions) ? partial.actions : [],
    nextHumanAction: String(partial.nextHumanAction || ""),
    auditLocation: String(partial.auditLocation || "audit ledger"),
    tenantScope: String(partial.tenantScope || "default")
  };
}

function mapProductSurfaceStatus(state) {
  switch (String(state || "").toUpperCase()) {
    case "ACTIVATED":
    case "AVAILABLE": return "READY";
    case "CONFIGURATION_REQUIRED": return "NOT_CONFIGURED";
    case "PARTNER_REQUIRED": return "HUMAN_APPROVAL_REQUIRED";
    case "EXTERNAL_CREDENTIAL_REQUIRED": return "PROVIDER_REQUIRED";
    case "PREVIEW":
    case "EXPERIMENTAL": return "EXPERIMENTAL";
    case "FUTURE":
    case "ROADMAP": return "FUTURE";
    case "BLOCKED":
    case "OFFLINE": return "NOT_AVAILABLE";
    default: return "NOT_AVAILABLE";
  }
}

function mapProductLifecycleStatus(state) {
  switch (String(state || "").toUpperCase()) {
    case "ACTIVE":
    case "ACTIVATED":
    case "AVAILABLE": return "READY";
    case "INTEGRATED": return "VERIFY_REQUIRED";
    case "CONFIGURATION_REQUIRED": return "NOT_CONFIGURED";
    case "FUTURE":
    case "ROADMAP": return "FUTURE";
    case "EXPERIMENTAL":
    case "PREVIEW": return "EXPERIMENTAL";
    default: return "NOT_AVAILABLE";
  }
}

function productReadiness(product = {}, surface = null) {
  const id = String(product.id || "").toLowerCase();
  const lifecycle = String(product.status || "").toUpperCase();
  const surfaceStatus = String(surface?.status || "").toUpperCase();
  const activationState = String(surface?.activation?.state || "").toUpperCase();
  const connection = surface?.connection || null;
  const transport = surface?.transport || null;
  const activeNumbers = Number(transport?.activeNumbers || 0);
  const totalNumbers = Number(surface?.transport?.totalNumbers || 0);
  const status = surface ? mapProductSurfaceStatus(surfaceStatus) : mapProductLifecycleStatus(lifecycle);
  const implementation = surface
    ? (["ACTIVATED", "AVAILABLE"].includes(activationState) ? "BOUND"
      : ["EXTERNAL_CREDENTIAL_REQUIRED", "PARTNER_REQUIRED", "CONFIGURATION_REQUIRED"].includes(activationState) ? "CODE_PRESENT_EXTERNAL_GATED"
        : "CATALOGUED")
    : (["ACTIVE", "ACTIVATED", "INTEGRATED", "AVAILABLE"].includes(lifecycle) ? "REGISTERED" : "CATALOGUED");
  let configuration = "UNKNOWN";
  if (surfaceStatus === "CONFIGURATION_REQUIRED") configuration = "REQUIRED";
  else if (["ACTIVATED", "AVAILABLE"].includes(surfaceStatus)) configuration = "NOT_REQUIRED";
  else if (surfaceStatus === "PARTNER_REQUIRED") configuration = "PARTNER_REQUIRED";
  else if (["FUTURE", "ROADMAP", "PREVIEW", "EXPERIMENTAL"].includes(surfaceStatus)) configuration = "NOT_APPLICABLE";

  const requiredConfig = [];
  const reasons = [];
  let runtime = "NOT_VERIFIED";
  let userAvailability = surfaceStatus || lifecycle || "UNKNOWN";
  let nextHumanAction = status === "READY" ? "None — use via product surface" : "Resolve the recorded blocker; see product surface.";

  if (id === "awbuli") {
    if (!transport?.live) {
      requiredConfig.push("authorized WhatsApp transport");
      reasons.push(`No authorized WhatsApp transport${transport?.reason ? ` (${transport.reason})` : ""}.`);
    }
    if (activeNumbers < 1) {
      requiredConfig.push("verified active sender identity");
      if (transport?.live) reasons.push("An authorized transport is active, but no sender identity is ACTIVE.");
    }
    if (transport?.live && activeNumbers > 0) {
      runtime = "INBOUND_TRANSPORT_ACTIVE";
      userAvailability = "AVAILABLE_FOR_INBOUND";
      reasons.push("Inbound transport and an active sender identity are present; outbound delivery is not proven.");
      nextHumanAction = "None for inbound; run a verified outbound delivery test before claiming outbound.";
    } else {
      runtime = transport?.live ? "TRANSPORT_ACTIVE_NO_SENDER" : "TRANSPORT_UNAVAILABLE";
      userAvailability = "UNAVAILABLE";
      nextHumanAction = transport?.live
        ? "Verify and activate a sender identity on the authorized transport."
        : "Register an authorized WhatsApp transport; then verify and activate a sender identity.";
    }
    configuration = requiredConfig.length ? "REQUIRED" : "CONFIGURED";
  } else if (surfaceStatus === "ACTIVATED") {
    runtime = "REGISTERED_NOT_LIVE_VERIFIED";
  } else if (surfaceStatus === "AVAILABLE") {
    runtime = "ROUTE_AVAILABLE";
  }

  if (surface?.activation?.detail && id !== "awbuli") reasons.push(surface.activation.detail);
  if (connection?.requiredAction && id !== "awbuli") reasons.push(String(connection.requiredAction));
  if (!reasons.length && surface?.errorRecovery) reasons.push(String(surface.errorRecovery));

  const evidence = [`ProductRegistry:status=${lifecycle || "UNKNOWN"}`];
  if (surface) {
    evidence.push(`ProductSurfaceMatrix:status=${surfaceStatus || "UNKNOWN"}`);
    evidence.push(`ProductSurfaceMatrix:activation=${activationState || "UNKNOWN"}`);
  }
  if (connection) evidence.push(`ConnectionFabric:grip=${Number(connection.grip || 0)}%`);
  if (id === "awbuli") {
    evidence.push(`AwbuliMessagingService:transport=${transport?.state || "UNKNOWN"}`);
    evidence.push(`WhatsAppNumberRegistry:active=${activeNumbers},total=${totalNumbers}`);
  }

  return {
    status,
    mode: surfaceStatus || lifecycle,
    lifecycle,
    implementation,
    configuration,
    runtime,
    userAvailability,
    reason: [...new Set(reasons)].join(" "),
    evidence,
    verification: id === "awbuli" && runtime === "INBOUND_TRANSPORT_ACTIVE" ? "INBOUND_ROUTE_ACTIVE" : "SHAPE_ONLY",
    delivery: id === "awbuli" ? "INBOUND_ONLY_OUTBOUND_NOT_PROVEN" : "NOT_APPLICABLE",
    requiredConfig,
    nextHumanAction
  };
}

/**
 * Canonical channel readiness derived from the live channel registry plus
 * provider/transport evidence. A registered inbound route is not the same as
 * a configured provider, a verified transport, or a proven delivery path.
 */
export function deriveChannelReadiness(channel = {}, evidence = {}) {
  const id = String(channel.id || channel.channel || "UNKNOWN").toUpperCase();
  const configured = channel.configured === true;
  const enabled = channel.enabled !== false;
  const baseEvidence = [`ChannelRegistry:enabled=${enabled}`, `ChannelRegistry:configured=${configured}`];

  if (!enabled) {
    return {
      status: "SUSPENDED", mode: "DISABLED", lifecycle: "REGISTERED",
      implementation: id === "WHATSAPP" ? "AWBULI_ADAPTER_BOUND" : "INBOUND_ROUTE_BOUND",
      configuration: configured ? "CONFIGURED" : "NOT_CONFIGURED",
      runtime: "SUSPENDED", userAvailability: "SUSPENDED",
      reason: "Channel is disabled by an operator.", evidence: baseEvidence,
      verification: "NOT_VERIFIED", delivery: "NOT_APPLICABLE",
      requiredConfig: [], actions: ["ENABLE", "VIEW_AUDIT"],
      nextHumanAction: "Re-enable only after configuration and verification are current."
    };
  }

  if (id === "WHATSAPP" || id === "AWBULI") {
    const transport = evidence.transport || null;
    const numbers = evidence.numbers || {};
    const live = transport?.live === true;
    const active = Number(numbers.active || 0);
    const total = Number(numbers.total || 0);
    const whatsappEvidence = [
      ...baseEvidence,
      `AwbuliMessagingService:transport=${transport?.state || "UNKNOWN"}`,
      `WhatsAppNumberRegistry:active=${active},total=${total}`
    ];
    if (live && active > 0) {
      return {
        status: "READY", mode: "INBOUND_ACTIVE",
        lifecycle: "REGISTERED", implementation: "AWBULI_ADAPTER_BOUND",
        configuration: "CONFIGURED", runtime: "INBOUND_TRANSPORT_ACTIVE",
        userAvailability: "AVAILABLE_FOR_INBOUND",
        reason: "Inbound routing is active on an authorized WhatsApp transport. Outbound delivery is not proven.",
        evidence: whatsappEvidence, verification: "INBOUND_ROUTE_ACTIVE",
        delivery: "INBOUND_ONLY_OUTBOUND_NOT_PROVEN", requiredConfig: [],
        actions: ["VERIFY", "SUSPEND", "VIEW_AUDIT"],
        nextHumanAction: "None for inbound; run a verified outbound delivery test before claiming outbound."
      };
    }
    if (live) {
      return {
        status: "NOT_CONFIGURED", mode: "TRANSPORT_ACTIVE_NO_ACTIVE_SENDER",
        lifecycle: "REGISTERED", implementation: "AWBULI_ADAPTER_BOUND",
        configuration: "REQUIRED", runtime: "TRANSPORT_ACTIVE_NO_SENDER",
        userAvailability: "UNAVAILABLE",
        reason: "An authorized WhatsApp transport is active, but no sender identity is ACTIVE.",
        evidence: whatsappEvidence, verification: "SHAPE_ONLY",
        delivery: "NOT_AVAILABLE", requiredConfig: ["verified active sender identity"],
        actions: ["CONFIGURE", "VERIFY", "SUSPEND", "VIEW_AUDIT"],
        nextHumanAction: "Verify and activate a sender identity on the authorized transport."
      };
    }
    return {
      status: "PROVIDER_REQUIRED", mode: "TRANSPORT_UNAVAILABLE",
      lifecycle: "REGISTERED", implementation: "AWBULI_ADAPTER_BOUND",
      configuration: "REQUIRED", runtime: "TRANSPORT_UNAVAILABLE",
      userAvailability: "UNAVAILABLE",
      reason: `No authorized WhatsApp transport${transport?.reason ? ` (${transport.reason})` : ""}.`,
      evidence: whatsappEvidence, verification: "SHAPE_ONLY",
      delivery: "NOT_AVAILABLE",
      requiredConfig: ["authorized WhatsApp transport", "verified active sender identity"],
      actions: ["CONFIGURE", "VERIFY", "SUSPEND", "VIEW_AUDIT"],
      nextHumanAction: "Register an authorized WhatsApp transport; then verify and activate a sender identity."
    };
  }

  if (configured) {
    return {
      status: "VERIFY_REQUIRED", mode: "CONFIGURED",
      lifecycle: "REGISTERED", implementation: "INBOUND_ROUTE_BOUND",
      configuration: "CONFIGURED", runtime: "NOT_VERIFIED",
      userAvailability: "VERIFY_REQUIRED",
      reason: "Configuration metadata exists, but no verified inbound/outbound handshake is recorded.",
      evidence: baseEvidence, verification: "SHAPE_ONLY", delivery: "NOT_APPLICABLE",
      requiredConfig: [], actions: ["VERIFY", "SUSPEND", "VIEW_AUDIT"],
      nextHumanAction: "Run channel verification before routing production traffic."
    };
  }

  if (NATIVE_INBOUND_CHANNELS.has(id)) {
    return {
      status: "READY", mode: "ENABLED",
      lifecycle: "REGISTERED", implementation: "INBOUND_ROUTE_BOUND",
      configuration: "NOT_REQUIRED", runtime: "ROUTE_AVAILABLE",
      userAvailability: "AVAILABLE_FOR_INBOUND",
      reason: "Built-in inbound intake route; no external provider is required.",
      evidence: baseEvidence, verification: "SHAPE_ONLY", delivery: "NOT_APPLICABLE",
      requiredConfig: [], actions: ["SUSPEND", "VIEW_AUDIT"],
      nextHumanAction: "None for inbound routing."
    };
  }

  const requiredConfig = CHANNEL_CONFIG_REQUIREMENTS[id] || ["channel provider configuration"];
  return {
    status: "NOT_CONFIGURED", mode: "ENABLED_UNCONFIGURED",
    lifecycle: "REGISTERED", implementation: "INBOUND_ROUTE_BOUND",
    configuration: "REQUIRED", runtime: "PROVIDER_NOT_CONFIGURED",
    userAvailability: "UNAVAILABLE",
    reason: "The inbound route is registered, but no external provider/adapter is configured.",
    evidence: baseEvidence, verification: "SHAPE_ONLY", delivery: "NOT_APPLICABLE",
    requiredConfig, actions: ["CONFIGURE", "VERIFY", "SUSPEND", "VIEW_AUDIT"],
    nextHumanAction: "Configure the channel provider, then verify before routing production traffic."
  };
}

function safeList(fn) {
  try {
    const v = fn();
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapActivationState(state) {
  switch (String(state || "").toUpperCase()) {
    case "ACTIVATED": return "READY";
    case "AVAILABLE": return "READY";
    case "CONFIGURATION_REQUIRED": return "NOT_CONFIGURED";
    case "PARTNER_REQUIRED": return "HUMAN_APPROVAL_REQUIRED";
    case "EXTERNAL_CREDENTIAL_REQUIRED": return "PROVIDER_REQUIRED";
    case "PREVIEW": return "EXPERIMENTAL";
    case "OFFLINE": return "SUSPENDED";
    case "UNAVAILABLE": return "NOT_AVAILABLE";
    default: return "NOT_AVAILABLE";
  }
}

function mapGateState(state) {
  switch (String(state || "").toUpperCase()) {
    case "NOT_CONFIGURED": return "NOT_CONFIGURED";
    case "CONFIGURED": return "VERIFY_REQUIRED";
    case "VERIFICATION_FAILED": return "VERIFICATION_FAILED";
    case "VERIFIED": return "HUMAN_APPROVAL_REQUIRED";
    case "ENABLED": return "ENABLED";
    case "SUSPENDED": return "SUSPENDED";
    default: return "NOT_AVAILABLE";
  }
}

/**
 * Build the inventory. All inputs optional; unavailable sources yield
 * NOT_AVAILABLE knobs (never fabricated).
 */
export function buildKnobInventory(deps = {}) {
  const knobs = [];
  const at = new Date().toISOString();

  for (const g of safeList(() => deps.providerGates)) {
    const state = mapGateState(g.state);
    knobs.push(knob({
      id: `provider:${g.providerId}`,
      system: "PROVIDER",
      name: `${g.providerId} (${g.providerType || "unknown"})`,
      status: state,
      whatItDoes: "External provider seam: verification + human-gated enablement. VERIFIED means shape-verified, never live.",
      mode: g.state || "NOT_CONFIGURED",
      lifecycle: "PROVIDER_SEAM",
      implementation: "GATE_BOUND",
      configuration: g.state || "NOT_CONFIGURED",
      runtime: "NOT_LIVE_VERIFIED",
      userAvailability: g.state || "NOT_CONFIGURED",
      reason: "ProviderGate verification is syntactic only; live connectivity is never claimed without a successful remote call.",
      evidence: [`ProviderGate:${g.state || "NOT_CONFIGURED"}`],
      verification: "SHAPE_ONLY",
      delivery: "NOT_APPLICABLE",
      requiredConfig: ["baseUrl", ...((g.configPresent && g.configPresent.credentialNames && g.configPresent.credentialNames.length ? g.configPresent.credentialNames : (g.credentialRequirements || [])))],
      whoCanChange: "ADMIN (L2+)",
      actions: ["CONFIGURE", "VERIFY", "ENABLE", "SUSPEND", "VIEW_AUDIT"],
      nextHumanAction: state === "NOT_CONFIGURED" ? "Declare baseUrl shape (no secrets) via Providers tab"
        : state === "VERIFY_REQUIRED" ? "Run VERIFY, then L2+ enable with a recorded reason"
        : state === "VERIFICATION_FAILED" ? "Fix the reported shape problem and re-verify"
        : state === "HUMAN_APPROVAL_REQUIRED" ? "L2+ enable with a recorded reason, or keep gated"
        : state === "ENABLED" ? "Suspend when the trial or contract ends"
        : state === "SUSPENDED" ? "Re-verify before any re-enable"
        : "Review provider record",
      auditLocation: "audit ledger (PROVIDER_GATE topic)",
      tenantScope: g.tenantScope || "default"
    }));
  }

  for (const row of safeList(() => deps.activationRows).slice(0, 200)) {
    const activationState = String(row.state || "UNKNOWN").toUpperCase();
    knobs.push(knob({
      id: `capability:${row.intent}`,
      system: "CAPABILITY",
      name: String(row.intent || "unknown"),
      status: mapActivationState(row.state),
      whatItDoes: String(row.detail || "ADE capability activation state."),
      mode: String(row.state || ""),
      lifecycle: "EDITION_POLICY",
      implementation: activationState === "ACTIVATED" ? "REGISTERED"
        : activationState === "AVAILABLE" ? "POLICY_AVAILABLE"
          : activationState === "UNAVAILABLE" ? "NOT_IN_EDITION" : "CODE_OR_PROVIDER_GATED",
      configuration: ["EXTERNAL_CREDENTIAL_REQUIRED", "CONFIGURATION_REQUIRED"].includes(activationState) ? "REQUIRED"
        : activationState === "UNAVAILABLE" ? "NOT_APPLICABLE" : "NOT_REQUIRED",
      runtime: activationState === "ACTIVATED" ? "REGISTERED" : "NOT_VERIFIED",
      userAvailability: activationState,
      reason: String(row.detail || row.requiredAction || ""),
      evidence: [`CapabilityActivation.assess:${activationState}`],
      verification: "POLICY_ONLY",
      delivery: "NOT_APPLICABLE",
      requiredConfig: row.state === "EXTERNAL_CREDENTIAL_REQUIRED" ? ["provider credential (human-owned)"] : [],
      whoCanChange: "ADMIN (L2+) for state-affecting changes",
      actions: ["VIEW", "VIEW_AUDIT"],
      nextHumanAction: String(row.requiredAction || (mapActivationState(row.state) === "READY" ? "None — operational" : "See capability detail")),
      auditLocation: "audit ledger"
    }));
  }

  const surfacesById = new Map(safeList(() => deps.productSurfaces)
    .map((s) => [String(s?.id || "").toLowerCase(), s]));
  for (const p of safeList(() => deps.products).slice(0, 100)) {
    const readiness = productReadiness(p, surfacesById.get(String(p.id || "").toLowerCase()) || null);
    knobs.push(knob({
      id: `product:${p.id || p.label}`,
      system: "PRODUCT",
      name: String(p.label || p.id || "unknown"),
      whatItDoes: String(p.declaration || p.description || "ADE product surface."),
      ...readiness,
      whoCanChange: "ADMIN (catalog changes are code-level)",
      actions: ["VIEW"],
      auditLocation: "audit ledger"
    }));
  }

  for (const c of safeList(() => deps.channels)) {
    const readiness = deriveChannelReadiness(c, deps.channelEvidence?.[String(c.id || "").toUpperCase()] || {});
    knobs.push(knob({
      id: `channel:${c.id}`,
      system: "CHANNEL",
      name: String(c.label || c.id),
      whatItDoes: `Inbound channel (inbound=${Boolean(c.inbound)}, outbound=${Boolean(c.outbound)}).`,
      ...readiness,
      whoCanChange: "ADMIN (L2+)",
      auditLocation: "audit ledger"
    }));
  }

  if (deps.procarta) {
    const pc = deps.procarta;
    knobs.push(knob({
      id: "procarta:engine",
      system: "PROCARTA",
      name: "Canonical PROCARTA execution engine",
      status: String(pc.status || "").toUpperCase() === "ONLINE" ? "READY" : "NOT_AVAILABLE",
      whatItDoes: `Deterministic assessment + decision + findings. Mode ${pc.executionMode || "unknown"}. Canonical owner — never duplicated.`,
      mode: String(pc.executionMode || ""),
      lifecycle: "CANONICAL_ENGINE",
      implementation: "ENGINE_BOUND",
      configuration: "NOT_REQUIRED",
      runtime: String(pc.status || "UNKNOWN").toUpperCase(),
      userAvailability: String(pc.status || "").toUpperCase() === "ONLINE" ? "AVAILABLE" : "UNAVAILABLE",
      reason: String(pc.status || "").toUpperCase() === "ONLINE" ? "" : "Canonical engine is not reporting ONLINE.",
      evidence: [`ProcartaEngine.health:${pc.status || "UNKNOWN"}`, `executionMode=${pc.executionMode || "UNKNOWN"}`],
      verification: "RUNTIME_SELF_REPORT",
      delivery: "NOT_APPLICABLE",
      requiredConfig: [],
      whoCanChange: "FOUNDER (engine changes are code-level)",
      actions: ["VIEW", "VIEW_AUDIT"],
      nextHumanAction: "None — operational. Pilot promotions stay operator-approved.",
      auditLocation: "audit ledger (PROCARTA topic)"
    }));
  }
  if (Number.isFinite(Number(deps?.procarta?.pilotCandidates))) {
    knobs.push(knob({
      id: "procarta:pilot-queue",
      system: "PROCARTA",
      name: "Pilot candidate queue",
      status: "READY",
      whatItDoes: `${deps.procarta.pilotCandidates} engine-qualified candidate(s) awaiting operator review.`,
      mode: `${deps.procarta.pilotCandidates} queued`,
      lifecycle: "OPERATOR_QUEUE",
      implementation: "PILOT_GATE_BOUND",
      configuration: "NOT_REQUIRED",
      runtime: "QUEUE_AVAILABLE",
      userAvailability: "AVAILABLE",
      reason: deps.procarta.pilotCandidates > 0 ? "Operator review is pending." : "No candidates are waiting.",
      evidence: [`PilotGate:candidates=${deps.procarta.pilotCandidates}`],
      verification: "RUNTIME_SELF_REPORT",
      delivery: "NOT_APPLICABLE",
      requiredConfig: [],
      whoCanChange: "ADMIN (L2+) approve/verdict with reason",
      actions: ["APPROVE", "VERDICT", "VIEW_AUDIT"],
      nextHumanAction: deps.procarta.pilotCandidates > 0 ? "Review candidates in Providers/Operations or Founder Pilots" : "None — queue empty",
      auditLocation: "audit ledger (PILOT topic)"
    }));
  }

  if (deps.ai) {
    const configuredCount = Number(deps.ai.configuredProviderCount || 0);
    const totalCount = Number(deps.ai.totalProviderCount || 0);
    const providerStates = safeList(() => deps.ai.providers)
      .map((p) => `${String(p.name || "UNKNOWN")}:${String(p.state || (p.configured ? "CONFIGURED" : "UNCONFIGURED"))}`);
    knobs.push(knob({
      id: "ai:providers",
      system: "AI",
      name: "AI providers",
      status: configuredCount > 0 ? "CONFIGURED" : "NOT_CONFIGURED",
      whatItDoes: "External AI quality behind the lexical-fallback gateway. Gateway itself is live.",
      mode: `${configuredCount} of ${totalCount} configured`,
      lifecycle: "PROVIDER_NEUTRAL_GATEWAY",
      implementation: "UNIVERSAL_AI_GATEWAY_BOUND",
      configuration: configuredCount > 0 ? "CONFIGURED" : "NOT_CONFIGURED",
      runtime: configuredCount > 0 ? "CONFIGURED_NOT_LIVE_VERIFIED" : "LEXICAL_FALLBACK_ACTIVE",
      userAvailability: configuredCount > 0 ? "EXTERNAL_AI_CONFIGURED_NOT_LIVE_VERIFIED" : "AVAILABLE_VIA_LEXICAL_FALLBACK",
      reason: configuredCount > 0
        ? "External provider keys are present, but connectivity is not proven until a real dispatch succeeds."
        : "No external provider key is configured. The deterministic lexical fallback is active, not external AI.",
      evidence: [`UniversalAIGateway:configured=${configuredCount}/${totalCount}`, ...providerStates],
      verification: "CONFIGURATION_ONLY",
      delivery: "NOT_APPLICABLE",
      requiredConfig: configuredCount > 0 ? [] : ["provider key (optional, human-owned)"],
      whoCanChange: "FOUNDER",
      actions: ["CONFIGURE", "VIEW"],
      nextHumanAction: configuredCount > 0 ? "Optional: verify with a real dispatch" : "Optional: configure a provider key to lift quality; fallback remains usable.",
      auditLocation: "audit ledger"
    }));
  }

  if (deps.storage) {
    knobs.push(knob({
      id: "storage:durable",
      system: "STORAGE",
      name: `Durable storage (${deps.storage.provider || "local"})`,
      status: deps.storage.configured ? "CONFIGURED" : "NOT_CONFIGURED",
      whatItDoes: "Durable home for cases, records, receipts and audit spillover.",
      mode: String(deps.storage.provider || "local"),
      lifecycle: "STORAGE_PROVIDER",
      implementation: "STORAGE_ADAPTER_BOUND",
      configuration: deps.storage.configured ? "CONFIGURED" : "REQUIRED",
      runtime: deps.storage.configured ? "CONFIGURED_NOT_LIVE_VERIFIED" : "LOCAL_FALLBACK_ONLY",
      userAvailability: deps.storage.configured ? "DURABLE_STORAGE_CONFIGURED" : "LOCAL_ONLY",
      reason: deps.storage.configured ? "Durable storage is configured; run the storage verify probe before relying on it." : "No durable storage provider is configured; local storage is ephemeral for deployment purposes.",
      evidence: [`StorageProvider:${deps.storage.provider || "local"}`, `configured=${Boolean(deps.storage.configured)}`],
      verification: "CONFIGURATION_ONLY",
      delivery: "NOT_APPLICABLE",
      requiredConfig: deps.storage.configured ? [] : ["SUPABASE_URL", "service/anon keys (human-owned)"],
      whoCanChange: "FOUNDER",
      actions: ["VERIFY", "VIEW"],
      nextHumanAction: deps.storage.configured ? "None" : "Provide Supabase project + keys, then verify",
      auditLocation: "audit ledger"
    }));
  }

  if (deps.telemetry) {
    const t = deps.telemetry;
    knobs.push(knob({
      id: "telemetry:bus",
      system: "TELEMETRY",
      name: "EventBus telemetry",
      status: t.connected === false ? "NOT_AVAILABLE" : "READY",
      whatItDoes: `Live event fabric summary. ${t.eventCount ?? 0} recent event(s)${t.lastEventAt ? `, last at ${t.lastEventAt}` : ""}${t.health ? `, health ${t.health}` : ""}.`,
      mode: t.connected === false ? "DISCONNECTED" : "CONNECTED",
      lifecycle: "EVENT_FABRIC",
      implementation: "EVENT_BUS_BOUND",
      configuration: "NOT_REQUIRED",
      runtime: t.connected === false ? "DISCONNECTED" : "CONNECTED",
      userAvailability: t.connected === false ? "UNAVAILABLE" : "AVAILABLE",
      reason: t.connected === false ? "EventBus telemetry is disconnected." : "EventBus telemetry is reporting.",
      evidence: [`EventBus:connected=${t.connected !== false}`, `health=${t.health || "UNKNOWN"}`],
      verification: "RUNTIME_SELF_REPORT",
      delivery: "NOT_APPLICABLE",
      requiredConfig: [],
      whoCanChange: "— (read-only summary)",
      actions: ["VIEW"],
      nextHumanAction: (t.attentionRequired ? "Attention required: " + t.attentionRequired : "None"),
      auditLocation: "telemetry stream"
    }));
  }

  if (deps.edition) {
    knobs.push(knob({
      id: "platform:edition",
      system: "PLATFORM",
      name: `Edition (${deps.edition})`,
      status: "READY",
      whatItDoes: "Runtime edition gating all capability availability.",
      mode: String(deps.edition),
      lifecycle: "RUNTIME_EDITION",
      implementation: "EDITION_POLICY_BOUND",
      configuration: "CONFIGURED",
      runtime: "RUNTIME_ACTIVE",
      userAvailability: String(deps.edition),
      reason: "Edition is resolved by the running backend.",
      evidence: [`EditionPolicy:${deps.edition}`],
      verification: "RUNTIME_SELF_REPORT",
      delivery: "NOT_APPLICABLE",
      requiredConfig: [],
      whoCanChange: "FOUNDER (deployment config)",
      actions: ["VIEW"],
      nextHumanAction: "None",
      auditLocation: "audit ledger"
    }));
  }

  return { generatedAt: at, total: knobs.length, knobs };
}

/**
 * Master human-action checklist: dynamic entries derived from knob states
 * plus the known static configuration surface. Machine-readable (JSON) and
 * dashboard-renderable. Secret VALUES never appear — names only.
 */
export function buildHumanChecklist(inventory) {
  const actions = [];
  let n = 0;
  const add = (a) => {
    n += 1;
    actions.push({
      id: `HA-${String(n).padStart(3, "0")}`,
      system: a.system || "ADE",
      purpose: a.purpose || "",
      status: a.status || "OPEN",
      why: a.why || "",
      configRequired: a.configRequired || [],
      where: a.where || "",
      who: a.who || "ADMIN",
      elevation: a.elevation || "L2",
      verifyAction: a.verifyAction || "",
      expectedState: a.expectedState || "",
      rollback: a.rollback || "",
      auditLocation: a.auditLocation || "audit ledger"
    });
  };
  for (const k of inventory?.knobs || []) {
    if (["NOT_CONFIGURED", "VERIFY_REQUIRED", "VERIFICATION_FAILED", "PROVIDER_REQUIRED", "HUMAN_APPROVAL_REQUIRED"].includes(k.status)) {
      add({
        system: k.system,
        purpose: k.nextHumanAction,
        status: "OPEN",
        why: `${k.name} is ${k.status}`,
        configRequired: k.requiredConfig,
        where: k.system === "PROVIDER" ? "Admin → Providers tab" : "Admin → Operations tab",
        who: /FOUNDER/.test(k.whoCanChange) ? "FOUNDER" : "ADMIN",
        elevation: /FOUNDER/.test(k.whoCanChange) ? "L3" : "L2",
        verifyAction: k.actions.includes("VERIFY") ? "Run VERIFY on the same surface" : "Re-check status",
        expectedState: "READY / ENABLED",
        rollback: k.actions.includes("SUSPEND") ? "SUSPEND on the same surface" : "Revert the configuration change",
        auditLocation: k.auditLocation
      });
    }
  }
  const STATIC = [
    { system: "TRADING", purpose: "Authorize any live broker surface (FBS/MT5, Deriv, Binary, Gaming)", status: "PROTECTED", why: "Live execution is locked by default", configRequired: ["venue credentials (human-owned)", "entitlement grant"], where: "Founder → Trading (L3)", who: "FOUNDER", elevation: "L3", verifyAction: "Paper-mode verification first", expectedState: "PAPER_ONLY until explicitly enabled", rollback: "Suspend entitlement", auditLocation: "audit ledger (TRADING topic)" },
    { system: "MESSAGING", purpose: "Configure Resend/email delivery", status: "OPEN", why: "Transactional notifications need a sender", configRequired: ["RESEND_API_KEY (human-owned)"], where: "Server environment + External Services", who: "FOUNDER", elevation: "L3", verifyAction: "Send a test message to self", expectedState: "CONFIGURED", rollback: "Remove key", auditLocation: "audit ledger" },
    { system: "MONITORING", purpose: "Uptime monitoring of production health", status: "OPEN", why: "Detect outages without watching dashboards", configRequired: ["UptimeRobot account + monitor on /api/v1/health"], where: "UptimeRobot dashboard (external)", who: "ADMIN", elevation: "L2", verifyAction: "Expect 200 on the health endpoint", expectedState: "MONITORED", rollback: "Pause monitor", auditLocation: "external" },
    { system: "DEPLOYMENT", purpose: "Deploy current main to production", status: "OPEN", why: "Production serves an older build until redeployed", configRequired: ["Vercel project access"], where: "Vercel dashboard", who: "FOUNDER", elevation: "L3", verifyAction: "Check /api/v1/health build commit", expectedState: "build commit == main HEAD", rollback: "Redeploy previous build", auditLocation: "Vercel deployment log" },
    { system: "CONTENT", purpose: "Approve announcements / release notes", status: "OPEN", why: "Public comms need human sign-off", configRequired: [], where: "Admin → Announcements", who: "ADMIN", elevation: "L2", verifyAction: "Preview on homepage", expectedState: "PUBLISHED", rollback: "Unpublish", auditLocation: "audit ledger" }
  ];
  for (const s of STATIC) add(s);
  return { generatedAt: new Date().toISOString(), total: actions.length, actions };
}

export default buildKnobInventory;
