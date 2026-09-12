/**
 * ADE CAPABILITY ACTIVATION — sideways growth control plane (expansion batch).
 *
 * Derives truthful activation states from canonical authorities:
 * EditionPolicy (availability/tier) + CapabilityRegistry (registered/revoked).
 * Never invents handlers, never bypasses credentials, never touches vendors.
 *
 * States: AVAILABLE | ACTIVATED | CONFIGURATION_REQUIRED | PARTNER_REQUIRED |
 * EXTERNAL_CREDENTIAL_REQUIRED | PREVIEW | OFFLINE | UNAVAILABLE
 */

export const ACTIVATION_STATES = Object.freeze([
  "AVAILABLE",
  "ACTIVATED",
  "CONFIGURATION_REQUIRED",
  "PARTNER_REQUIRED",
  "EXTERNAL_CREDENTIAL_REQUIRED",
  "PREVIEW",
  "OFFLINE",
  "UNAVAILABLE"
]);

// Ecosystem catalog entries that need an external/partner side to be real.
// Kept in sync with src/app.js BUILTIN_ECOSYSTEM_CAPABILITIES (subset that
// requires more than local code).
const EXTERNAL_GATED = new Set([
  "ADE_AWBULI_HUB", // bridge side; local Suite engine is separate and live
  "LEAD_MGMT_PIPELINE",
  "AFFILIATE_LOCK",
  "MARKETING_AI_STUDIO",
  "VERTEX_AI_ADAPTER",
  "WHATSAPP_GATEWAY",
  "UNIVERSAL_WEBHOOK_ROUTER",
  "UNIVERSAL_AGGREGATOR"
]);

const CREDENTIAL_GATED = new Set([
  "VERTEX_AI_ADAPTER",
  "WHATSAPP_GATEWAY",
  "ADE_AWBULI_HUB"
]);

export class CapabilityActivation {
  constructor({ capabilityRegistry = null, editionPolicy = null, providerStatus = null } = {}) {
    this.capabilityRegistry = capabilityRegistry;
    this.editionPolicy = editionPolicy;
    this.providerStatus = providerStatus; // () => gateway.getProviderStatus()
  }

  assess() {
    let policyCaps = [];
    try { policyCaps = this.editionPolicy?.listCapabilities?.() || []; } catch { policyCaps = []; }
    let registered = [];
    try { registered = this.capabilityRegistry?.listCapabilities?.() || []; } catch { registered = []; }
    const aiConfigured = (this.providerStatus?.()?.configuredProviderCount || 0) > 0;

    return policyCaps.map((cap) => {
      const reg = registered.find((r) => r.intent === cap.intent);
      const revoked = Boolean(reg?.revoked);
      if (revoked) {
        return this._row(cap, "OFFLINE", "Capability revoked in registry.", "Restore via registry restore flow.");
      }
      if (cap.intent === "UNIVERSAL_AI_GATEWAY") {
        // Gateway itself is live; external quality is the gated part.
        return this._row(cap, reg ? "ACTIVATED" : "AVAILABLE",
          aiConfigured ? "Gateway live with configured provider(s)." : "Gateway live on lexical fallback; external quality needs a provider key.",
          aiConfigured ? null : "Optional: configure a provider key to lift quality.");
      }
      if (!cap.available) {
        return this._row(cap, "UNAVAILABLE", "Not available in current edition.", "Upgrade edition or use a COMMUNITY path.");
      }
      if (reg) return this._row(cap, "ACTIVATED", "Registered and callable through dispatch.", null);
      if (EXTERNAL_GATED.has(cap.intent)) {
        const needCred = CREDENTIAL_GATED.has(cap.intent);
        return this._row(cap, needCred ? "EXTERNAL_CREDENTIAL_REQUIRED" : "PARTNER_REQUIRED",
          needCred ? "Code/catalog present; external credential or provider required." : "Code/catalog present; partner implementation required.",
          needCred ? "Supply the provider credential, then verify." : "Ask A2MPro/operator to implement the adapter.");
      }
      return this._row(cap, "AVAILABLE", "Available in edition; registers on first use.", "Invoke through POST /api/command/execute.");
    });
  }

  ecosystemStates(builtinCatalog = []) {
    return (builtinCatalog || []).map((c) => {
      if (c.pluginRequired === false) {
        return { action: c.action, label: c.label, state: "ACTIVATED", detail: "Bound runtime path (no plugin needed)." };
      }
      if (CREDENTIAL_GATED.has(c.action)) {
        return { action: c.action, label: c.label, state: "EXTERNAL_CREDENTIAL_REQUIRED", detail: "Catalog entry; live use needs the external credential." };
      }
      if (EXTERNAL_GATED.has(c.action)) {
        return { action: c.action, label: c.label, state: "PARTNER_REQUIRED", detail: "Catalog entry; live use needs partner implementation." };
      }
      return { action: c.action, label: c.label, state: "PREVIEW", detail: "Demonstrable catalog entry; not yet a production promise." };
    });
  }

  /**
   * Safe activation: only registers when a real handler is supplied by the
   * caller (or already registered). Otherwise returns the truthful blocker.
   */
  activate(intent, { handler = null, metadata = {} } = {}) {
    const upper = String(intent || "").toUpperCase();
    if (!upper) return { ok: false, state: "UNAVAILABLE", error: "intent is required" };
    let registered = [];
    try { registered = this.capabilityRegistry?.listCapabilities?.() || []; } catch {}
    if (registered.some((r) => r.intent === upper && !r.revoked)) {
      return { ok: true, state: "ACTIVATED", intent: upper, note: "Already registered; no change." };
    }
    if (EXTERNAL_GATED.has(upper) && typeof handler !== "function") {
      const needCred = CREDENTIAL_GATED.has(upper);
      return {
        ok: false,
        state: needCred ? "EXTERNAL_CREDENTIAL_REQUIRED" : "PARTNER_REQUIRED",
        intent: upper,
        error: needCred
          ? "Activation blocked: external credential required. No handler was fabricated."
          : "Activation blocked: partner implementation required. Supply a handler via an authorized adapter.",
        requiredAction: needCred ? "Configure the provider credential, then retry." : "Implement the adapter, then register with its handler."
      };
    }
    if (typeof handler !== "function") {
      return { ok: false, state: "CONFIGURATION_REQUIRED", intent: upper, error: "No executable handler supplied; nothing was registered.", requiredAction: "Supply the capability handler through a canonical registration call." };
    }
    try {
      this.capabilityRegistry?.registerCapability?.(upper, { handler, ...metadata, sourceModule: metadata.sourceModule || "ACTIVATION" });
      return { ok: true, state: "ACTIVATED", intent: upper, note: "Registered through canonical CapabilityRegistry." };
    } catch (e) {
      return { ok: false, state: "OFFLINE", intent: upper, error: e?.message || "Registration failed." };
    }
  }

  _row(cap, state, detail, requiredAction) {
    return {
      intent: cap.intent,
      label: cap.name || cap.intent,
      tier: cap.tier || null,
      edition: cap.edition || null,
      state,
      detail,
      requiredAction,
      nextAction: state === "ACTIVATED" ? "RUN" : state === "AVAILABLE" ? "ACTIVATE" : "RESOLVE_BLOCKER"
    };
  }
}

export default CapabilityActivation;
