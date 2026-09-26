/**
 * ADE PROVIDER ADAPTER CONTRACT (Batch 8A)
 *
 * Canonical description of ONE external provider seam (WhatsApp/AWBULI
 * family first). Pure module — no I/O, no network, no credentials.
 * A descriptor proves NOTHING live; it declares what would be needed
 * and what state the provider is actually in.
 */

export const PROVIDER_TYPES = Object.freeze([
  "WHATSAPP",
  "USSD",
  "TELEGRAM",
  "APP",
  "WEB_API",
  "SDK",
  "IOT",
  "DEVICE",
  "FUTURE"
]);

export const PROVIDER_STATES = Object.freeze([
  "NOT_CONFIGURED",
  "CONFIGURED",
  "VERIFICATION_FAILED",
  "VERIFIED",
  "ENABLED",
  "SUSPENDED"
]);

export const PROVIDER_ERROR_CLASSES = Object.freeze([
  "CONFIG_MISSING",
  "CONFIG_MALFORMED",
  "CREDENTIAL_ABSENT",
  "VERIFY_TRANSPORT",
  "VERIFY_AUTH",
  "VERIFY_TIMEOUT",
  "PROVIDER_ERROR",
  "GATE_BLOCKED",
  "UNKNOWN"
]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function str(v, max = 300) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, max);
}

function strArray(v, maxItems = 30, maxLen = 200) {
  if (v === null || v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x) => x !== null && x !== undefined).slice(0, maxItems).map((x) => String(x).slice(0, maxLen));
}

/**
 * Create + validate a provider descriptor. Secret VALUES are never accepted:
 * only requirement names and presence flags travel here.
 */
export function createProviderDescriptor(input = {}) {
  const providerId = str(input.providerId, 120);
  if (!providerId) throw fail("PROVIDER_IDENTITY_REQUIRED", "providerId is required.");
  const providerType = str(input.providerType, 40);
  if (!providerType || !PROVIDER_TYPES.includes(providerType.toUpperCase())) {
    throw fail("PROVIDER_TYPE_INVALID", `must be one of ${PROVIDER_TYPES.join(",")}.`);
  }
  const tenantScope = str(input.tenantScope, 80) || "default";
  if (!tenantScope.trim()) throw fail("PROVIDER_TENANT_INVALID");
  return {
    schemaVersion: 1,
    providerId,
    providerType: providerType.toUpperCase(),
    version: str(input.version, 40) || "0",
    tenantScope,
    capabilities: strArray(input.capabilities, 30, 120),
    configRequirements: strArray(input.configRequirements, 20, 120),
    credentialRequirements: strArray(input.credentialRequirements, 20, 120),
    executionMode: ["PROVIDER_GATED", "SIMULATED", "HUMAN_ONLY"].includes(String(input.executionMode).toUpperCase())
      ? String(input.executionMode).toUpperCase()
      : "PROVIDER_GATED",
    verificationMethod: str(input.verificationMethod, 200) || "ConnectionManager.test (syntactic shape check; proves readiness, never liveness)",
    normalizedOutput: str(input.normalizedOutput, 120) || "NormalizedEventEnvelope v1",
    health: null,
    state: "NOT_CONFIGURED",
    config: {},
    configPresent: {},
    auditIdentity: str(input.auditIdentity, 200) || `provider:${providerId}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** Classify a provider-side failure without leaking values. */
export function classifyProviderError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  if (/CONFIG_MISSING|NOT_CONFIGURED|required/i.test(code + " " + msg) && /config/i.test(code + " " + msg)) return "CONFIG_MISSING";
  if (/MALFORMED|INVALID|Only HTTP/.test(code + " " + msg)) return "CONFIG_MALFORMED";
  if (/credential|CREDENTIAL_ABSENT|secret|API_KEY/i.test(code + " " + msg)) return "CREDENTIAL_ABSENT";
  if (/timeout|TIMEOUT|timed out/i.test(code + " " + msg)) return "VERIFY_TIMEOUT";
  if (/auth|AUTH|401|403/i.test(code + " " + msg)) return "VERIFY_AUTH";
  if (/GATE|TENANT_MISMATCH|PROTECTED/i.test(code)) return "GATE_BLOCKED";
  if (/transport|TRANSPORT|ENOTFOUND|ECONN/.test(code + " " + msg)) return "VERIFY_TRANSPORT";
  return "UNKNOWN";
}

export function providerHealthSnapshot(descriptor) {
  return {
    providerId: descriptor.providerId,
    state: descriptor.state,
    live: false,
    lastCheckedAt: descriptor.lastCheckedAt || null,
    lastErrorClass: descriptor.lastErrorClass || null,
    note: "Descriptor state only. VERIFIED means shape-verified, never live."
  };
}
