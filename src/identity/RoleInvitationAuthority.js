/**
 * Canonical server-side authority for role-class invitation claims
 * (INV-FOUNDER, INV-ADMIN-L3/L2/L1/L0, INV-PILOT, INV-PARTNER).
 *
 * Validation only: a valid claim NEVER issues a session, token or role — it
 * confirms the claim for onboarding routing. Account provisioning stays with
 * WorkforceManager (hashed per-person invitation codes + expiry) and the
 * identity session issuer. Codes carry an expiry and an optional tenant scope;
 * both are enforced here, on the server, never in the browser.
 *
 * Override the registry per deployment with ADE_ROLE_INVITATION_CODES:
 *   JSON object keyed by code, or JSON array of
 *   {code, role, tier, scope, level, tenant, expiresAt}.
 * A malformed override never weakens the defaults.
 */

const DEFAULT_EXPIRES_AT = "2027-12-31T23:59:59.999Z";

export const ROLE_INVITATION_DEFAULTS = Object.freeze({
  "INV-FOUNDER": { role: "FOUNDER_L3", tier: "Level 3 (L3)", scope: "Full Sovereign Control Plane and Vaults", level: 3, tenant: null },
  "INV-ADMIN-L3": { role: "ADMIN_L3", tier: "Level 3 (L3)", scope: "Executive System Administration", level: 3, tenant: null },
  "INV-ADMIN-L2": { role: "ADMIN_L2", tier: "Level 2 (L2)", scope: "Operational and Channel Management", level: 2, tenant: null },
  "INV-ADMIN-L1": { role: "ADMIN_L1", tier: "Level 1 (L1)", scope: "Supervised Support and Intake", level: 1, tenant: null },
  "INV-ADMIN-L0": { role: "ADMIN_L0", tier: "Level 0 (L0)", scope: "Basic Administrative Viewer", level: 0, tenant: null },
  "INV-PILOT": { role: "PILOT", tier: "Tier 1", scope: "Trading and Live Engagement Portal", level: 1, tenant: null },
  "INV-PARTNER": { role: "PARTNER", tier: "Enterprise Gateway", scope: "A2MPro Integration and Settlement Mesh", level: 2, tenant: null }
});

export function loadRoleInvitationRegistry(env = process.env) {
  const registry = {};
  for (const [code, def] of Object.entries(ROLE_INVITATION_DEFAULTS)) {
    registry[code] = { ...def, expiresAt: DEFAULT_EXPIRES_AT };
  }
  const raw = env?.ADE_ROLE_INVITATION_CODES;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed)
        ? parsed.map((e) => [String(e?.code || "").toUpperCase(), e])
        : Object.entries(parsed);
      for (const [code, def] of entries) {
        if (!code || !def || typeof def !== "object") continue;
        const base = registry[code] || {};
        registry[code] = {
          role: String(def.role || base.role || "ADMIN_L0"),
          tier: String(def.tier || base.tier || ""),
          scope: String(def.scope || base.scope || ""),
          level: Number.isFinite(Number(def.level)) ? Number(def.level) : (base.level ?? 0),
          tenant: def.tenant == null ? null : String(def.tenant),
          expiresAt: def.expiresAt ? String(def.expiresAt) : (base.expiresAt || DEFAULT_EXPIRES_AT)
        };
      }
    } catch {
      // Malformed override: defaults stay in force.
    }
  }
  return registry;
}

export function validateRoleInvitation(code, { tenant = null, registry = null, now = Date.now() } = {}) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return { ok: false, status: 400, error: "INVITATION_CODE_REQUIRED" };
  const reg = registry || loadRoleInvitationRegistry();
  const claim = reg[key];
  if (!claim) return { ok: false, status: 404, error: "INVITATION_UNKNOWN" };
  const expiresAtMs = Date.parse(claim.expiresAt);
  if (Number.isFinite(expiresAtMs) && now > expiresAtMs) {
    return { ok: false, status: 410, error: "INVITATION_EXPIRED", expiresAt: claim.expiresAt };
  }
  if (claim.tenant) {
    const requested = tenant == null ? "" : String(tenant).trim();
    if (!requested) return { ok: false, status: 403, error: "INVITATION_TENANT_REQUIRED" };
    if (requested.toLowerCase() !== claim.tenant.toLowerCase()) {
      return { ok: false, status: 403, error: "INVITATION_TENANT_MISMATCH" };
    }
  }
  return {
    ok: true,
    claim: {
      code: key,
      role: claim.role,
      tier: claim.tier,
      scope: claim.scope,
      level: claim.level,
      tenant: claim.tenant,
      expiresAt: claim.expiresAt
    }
  };
}

export default { ROLE_INVITATION_DEFAULTS, loadRoleInvitationRegistry, validateRoleInvitation };
