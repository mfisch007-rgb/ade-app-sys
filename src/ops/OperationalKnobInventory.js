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

function knob(partial) {
  return {
    id: String(partial.id || "unknown"),
    system: String(partial.system || "ADE"),
    name: String(partial.name || partial.id || "unknown"),
    status: KNOB_STATUSES.includes(partial.status) ? partial.status : "NOT_AVAILABLE",
    whatItDoes: String(partial.whatItDoes || ""),
    mode: String(partial.mode || ""),
    requiredConfig: Array.isArray(partial.requiredConfig) ? partial.requiredConfig : [],
    whoCanChange: String(partial.whoCanChange || "ADMIN"),
    actions: Array.isArray(partial.actions) ? partial.actions : [],
    nextHumanAction: String(partial.nextHumanAction || ""),
    auditLocation: String(partial.auditLocation || "audit ledger"),
    tenantScope: String(partial.tenantScope || "default")
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
    knobs.push(knob({
      id: `capability:${row.intent}`,
      system: "CAPABILITY",
      name: String(row.intent || "unknown"),
      status: mapActivationState(row.state),
      whatItDoes: String(row.detail || "ADE capability activation state."),
      mode: String(row.state || ""),
      requiredConfig: row.state === "EXTERNAL_CREDENTIAL_REQUIRED" ? ["provider credential (human-owned)"] : [],
      whoCanChange: "ADMIN (L2+) for state-affecting changes",
      actions: ["VIEW", "VIEW_AUDIT"],
      nextHumanAction: String(row.requiredAction || (mapActivationState(row.state) === "READY" ? "None — operational" : "See capability detail")),
      auditLocation: "audit ledger"
    }));
  }

  for (const p of safeList(() => deps.products).slice(0, 100)) {
    const st = String(p.status || "").toUpperCase();
    knobs.push(knob({
      id: `product:${p.id || p.label}`,
      system: "PRODUCT",
      name: String(p.label || p.id || "unknown"),
      status: ["ACTIVATED", "AVAILABLE"].includes(st) ? "READY"
        : st === "CONFIGURATION_REQUIRED" ? "NOT_CONFIGURED"
        : ["FUTURE", "ROADMAP"].includes(st) ? "FUTURE"
        : ["EXPERIMENTAL", "PREVIEW"].includes(st) ? "EXPERIMENTAL" : "NOT_AVAILABLE",
      whatItDoes: String(p.declaration || p.description || "ADE product surface."),
      mode: st || "",
      requiredConfig: [],
      whoCanChange: "ADMIN (catalog changes are code-level)",
      actions: ["VIEW"],
      nextHumanAction: ["ACTIVATED", "AVAILABLE"].includes(st) ? "None — use via product surface" : `Follows ${st || "catalog"} lifecycle; see product surface`,
      auditLocation: "audit ledger"
    }));
  }

  for (const c of safeList(() => deps.channels)) {
    knobs.push(knob({
      id: `channel:${c.id}`,
      system: "CHANNEL",
      name: String(c.label || c.id),
      status: c.enabled === false ? "SUSPENDED" : "READY",
      whatItDoes: `Inbound channel (inbound=${Boolean(c.inbound)}, outbound=${Boolean(c.outbound)}).`,
      mode: c.enabled === false ? "DISABLED" : "ENABLED",
      requiredConfig: [],
      whoCanChange: "ADMIN (L2+)",
      actions: ["ENABLE", "SUSPEND", "VIEW_AUDIT"],
      nextHumanAction: "None unless traffic routing changes",
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
      requiredConfig: [],
      whoCanChange: "ADMIN (L2+) approve/verdict with reason",
      actions: ["APPROVE", "VERDICT", "VIEW_AUDIT"],
      nextHumanAction: deps.procarta.pilotCandidates > 0 ? "Review candidates in Providers/Operations or Founder Pilots" : "None — queue empty",
      auditLocation: "audit ledger (PILOT topic)"
    }));
  }

  if (deps.ai) {
    knobs.push(knob({
      id: "ai:providers",
      system: "AI",
      name: "AI providers",
      status: Number(deps.ai.configuredProviderCount) > 0 ? "CONFIGURED" : "NOT_CONFIGURED",
      whatItDoes: "External AI quality behind the lexical-fallback gateway. Gateway itself is live.",
      mode: `${deps.ai.configuredProviderCount || 0} of ${deps.ai.totalProviderCount || 0} configured`,
      requiredConfig: ["provider key (human-owned)"],
      whoCanChange: "FOUNDER",
      actions: ["CONFIGURE", "VIEW"],
      nextHumanAction: Number(deps.ai.configuredProviderCount) > 0 ? "None" : "Optional: configure a provider key to lift quality",
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
