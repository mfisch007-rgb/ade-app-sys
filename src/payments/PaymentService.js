/**
 * ADE PAYMENT SERVICE (NEXT enablement — additive).
 *
 * Optional commercial capability. Community/free + trial operation work
 * without Paystack. Activation requires: configured + verified + enabled +
 * authorized + appropriate to the customer entitlement state.
 *
 * State model per tenant:
 *   payments: DISABLED | TEST | LIVE        (provider state)
 *   customerFacing: OFF | ON                (presentation gate)
 *
 * Safety (server-authoritative):
 * - Secrets server-side only (ConnectionManager secret vault / env).
 * - Entitlement transitions ONLY from verified webhooks (or verified
 *   transaction checks), never from client redirects/flags.
 * - Payment failure never grants access. Disable removes customer UI.
 * - Founder logout never disables payments (state is durable, not session).
 * - Every transition audited, tenant-aware, timestamped, attributed.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import PaystackProvider from "./PaystackProvider.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

const SECTION = "paymentService";
const VALID_STATES = Object.freeze(["DISABLED", "TEST", "LIVE"]);

export class PaymentService {
  constructor({ store = null, secrets = null, eventBus = null, editionPolicy = null } = {}) {
    this.store = store;
    this.secrets = secrets;
    this.eventBus = eventBus;
    this.editionPolicy = editionPolicy || null;
    this.tenants = new Map();
    this.entitlements = new Map(); // tenantScope -> { plan, ... }
    this._pending = new Map(); // reference -> checkout intent
    this._hydrationError = null;
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(SECTION);
      const obj = saved && typeof saved === "object" ? saved : {};
      for (const [tenant, cfg] of Object.entries(obj.tenants || {})) this.tenants.set(tenant, cfg);
      for (const [tenant, ent] of Object.entries(obj.entitlements || {})) this.entitlements.set(tenant, ent);
      for (const [reference, intent] of Object.entries(obj.pending || {})) this._pending.set(reference, intent);
    } catch (error) {
      this._hydrationError = error;
    }
  }

  _assertHydrated() {
    if (this._hydrationError) {
      throw fail("PAYMENT_STATE_UNAVAILABLE", "payment state could not be read; refusing to mutate or overwrite it.");
    }
  }

  #snapshot() {
    return {
      tenants: new Map(this.tenants),
      entitlements: new Map(this.entitlements),
      pending: new Map([...this._pending].map(([reference, intent]) => [reference, { ...intent }]))
    };
  }

  #restore(snapshot) {
    this.tenants = snapshot.tenants;
    this.entitlements = snapshot.entitlements;
    this._pending = snapshot.pending;
  }

  _persist() {
    this._assertHydrated();
    this.store?.writeSection?.(SECTION, {
      tenants: Object.fromEntries(this.tenants),
      entitlements: Object.fromEntries(this.entitlements),
      pending: Object.fromEntries(this._pending)
    });
  }

  async _persistAsync() {
    if (typeof this.store?.writeSectionAsync === "function") {
      await this.store.writeSectionAsync(SECTION, {
        tenants: Object.fromEntries(this.tenants),
        entitlements: Object.fromEntries(this.entitlements),
        pending: Object.fromEntries(this._pending)
      });
      return;
    }
    this._persist();
  }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "PAYMENTS", action, at: nowIso(), ...fields }); } catch {}
  }

  _config(tenantScope) {
    const scope = String(tenantScope || "default");
    const existing = this.tenants.get(scope);
    return existing ? { ...existing } : {
      tenantScope: scope, provider: "PAYSTACK", state: "DISABLED", customerFacing: "OFF",
      environment: "TEST", verified: false, lastVerifiedAt: null, lastError: null,
      updatedBy: null, updatedAt: null, history: []
    };
  }
  _save(scope, cfg) {
    this._assertHydrated();
    const previous = this.tenants.get(scope);
    this.tenants.set(scope, cfg);
    try {
      this._persist();
    } catch (error) {
      if (previous) this.tenants.set(scope, previous);
      else this.tenants.delete(scope);
      throw error;
    }
    return cfg;
  }
  _touch(cfg, { actor, reason, extra = {} }) {
    cfg.history = [...(cfg.history || []), { at: nowIso(), actor: String(actor).slice(0, 120), reason: String(reason || "").slice(0, 500), ...extra }].slice(-50);
    cfg.updatedBy = String(actor).slice(0, 120);
    cfg.updatedAt = nowIso();
  }

  /** Public, safe snapshot: masked credentials, no secrets. */
  status({ tenantScope = "default" } = {}) {
    const scope = String(tenantScope || "default");
    const cfg = this._config(scope);
    const secret = this.secrets?.getSecret?.(`ADE_PAYSTACK_${scope}`) || process.env.PAYSTACK_SECRET_KEY || null;
    const present = Boolean(secret);
    return {
      tenantScope: scope,
      provider: "PAYSTACK",
      state: cfg.state,
      customerFacing: cfg.customerFacing,
      environment: cfg.environment,
      configured: present,
      verified: Boolean(cfg.verified),
      lastVerifiedAt: cfg.lastVerifiedAt,
      lastError: cfg.lastError,
      entitlement: this.entitlements.get(scope) || { plan: "COMMUNITY", via: "DEFAULT", at: null }
    };
  }

  configure({ tenantScope = "default", environment = "TEST", secretKey = null, publicKey = null, planMappings = {}, actor = "SYSTEM", reason = "" } = {}) {
    this._assertHydrated();
    const scope = String(tenantScope || "default");
    const env = String(environment || "TEST").toUpperCase();
    if (!["TEST", "LIVE"].includes(env)) throw fail("PAYMENT_ENV_INVALID");
    if (secretKey && this.secrets?.setSecret) this.secrets.setSecret(`ADE_PAYSTACK_${scope}`, String(secretKey));
    else if (secretKey) throw fail("PAYMENT_VAULT_UNAVAILABLE", "server secret vault is unavailable.");
    if (publicKey) {
      // Public key is non-secret but still server-stored; never echoed.
      try { this.store?.writeSection?.(`paymentPublic:${scope}`, { present: true }); } catch {}
    }
    const cfg = this._config(scope);
    cfg.environment = env;
    cfg.planMappings = { ...(planMappings || {}) };
    if (cfg.state !== "DISABLED") cfg.state = "DISABLED"; // re-config resets to locked until verified
    cfg.verified = false;
    this._touch(cfg, { actor, reason: reason || `configured for ${env} (shape only)` });
    this._save(scope, cfg);
    this._audit("PAYMENT_CONFIGURED", { tenantScope: scope, environment: env, actor: String(actor).slice(0, 120) });
    return this.status({ tenantScope: scope });
  }

  /** Syntactic verification: presence + env/prefix match. Never claims LIVE money. */
  verify({ tenantScope = "default", actor = "SYSTEM" } = {}) {
    this._assertHydrated();
    const scope = String(tenantScope || "default");
    const secret = this.secrets?.getSecret?.(`ADE_PAYSTACK_${scope}`) || process.env.PAYSTACK_SECRET_KEY || null;
    const cfg = this._config(scope);
    if (!secret) {
      cfg.verified = false; cfg.lastError = "SECRET_ABSENT";
      this._touch(cfg, { actor, reason: "verification failed: secret absent" });
      this._save(scope, cfg);
      this._audit("PAYMENT_VERIFY_FAILED", { tenantScope: scope, error: "SECRET_ABSENT" });
      return this.status({ tenantScope: scope });
    }
    const matches = PaystackProvider.keyMatchesEnvironment(secret, cfg.environment);
    if (!matches) {
      cfg.verified = false; cfg.lastError = "KEY_ENVIRONMENT_MISMATCH";
      this._touch(cfg, { actor, reason: `verification failed: key prefix does not match ${cfg.environment}` });
      this._save(scope, cfg);
      this._audit("PAYMENT_VERIFY_FAILED", { tenantScope: scope, error: "KEY_ENVIRONMENT_MISMATCH" });
      return this.status({ tenantScope: scope });
    }
    cfg.verified = true; cfg.lastVerifiedAt = nowIso(); cfg.lastError = null;
    this._touch(cfg, { actor, reason: `syntactic verification passed for ${cfg.environment}` });
    this._save(scope, cfg);
    this._audit("PAYMENT_VERIFIED", { tenantScope: scope, environment: cfg.environment });
    return this.status({ tenantScope: scope });
  }

  setState({ tenantScope = "default", to = "DISABLED", actor = "SYSTEM", reason = "" } = {}) {
    this._assertHydrated();
    const scope = String(tenantScope || "default");
    const target = String(to || "").toUpperCase();
    if (!VALID_STATES.includes(target)) throw fail("PAYMENT_STATE_INVALID", to);
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    const cfg = this._config(scope);
    if (target === "LIVE") {
      if (!cfg.verified || cfg.environment !== "LIVE") {
        throw fail("PAYMENT_LIVE_REQUIRES_VERIFICATION", "LIVE activation requires verified LIVE configuration.");
      }
      const secret = this.secrets?.getSecret?.(`ADE_PAYSTACK_${scope}`) || process.env.PAYSTACK_SECRET_KEY || null;
      if (!PaystackProvider.keyMatchesEnvironment(secret, "LIVE")) {
        throw fail("PAYMENT_LIVE_REQUIRES_VERIFICATION", "live secret does not match LIVE environment.");
      }
    }
    if (target === "TEST" && !cfg.verified) {
      throw fail("PAYMENT_TEST_REQUIRES_VERIFICATION", "TEST activation requires verification first.");
    }
    const from = cfg.state;
    cfg.state = target;
    if (target === "DISABLED") cfg.customerFacing = "OFF";
    this._touch(cfg, { actor, reason, extra: { from, to: target } });
    this._save(scope, cfg);
    this._audit(target === "DISABLED" ? "PAYMENT_DISABLED" : "PAYMENT_ENABLED", { tenantScope: scope, from, to: target, actor: String(actor).slice(0, 120) });
    return this.status({ tenantScope: scope });
  }

  setCustomerFacing({ tenantScope = "default", on = false, actor = "SYSTEM", reason = "" } = {}) {
    this._assertHydrated();
    const scope = String(tenantScope || "default");
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    const cfg = this._config(scope);
    if (on && cfg.state === "DISABLED") throw fail("PAYMENT_CUSTOMER_BLOCKED", "customer payments cannot turn ON while payments are DISABLED.");
    cfg.customerFacing = on ? "ON" : "OFF";
    this._touch(cfg, { actor, reason, extra: { customerFacing: cfg.customerFacing } });
    this._save(scope, cfg);
    this._audit(on ? "PAYMENT_CUSTOMER_ENABLED" : "PAYMENT_CUSTOMER_DISABLED", { tenantScope: scope, actor: String(actor).slice(0, 120) });
    return this.status({ tenantScope: scope });
  }

  /**
   * Customer-facing availability gate. Truthful presentation only:
   * - DISABLED or customerFacing OFF -> no payment button; contact-admin message.
   * - COMMUNITY/TRIAL with nothing owed -> no payment UI.
   * - Paid/upgrade condition + enabled -> UPGRADE/SUBSCRIBE/PAY action.
   */
  availability({ tenantScope = "default", customerTier = "COMMUNITY", upgradeRequired = false } = {}) {
    const scope = String(tenantScope || "default");
    const cfg = this._config(scope);
    const tier = String(customerTier || "COMMUNITY").toUpperCase();
    if (cfg.state === "DISABLED" || cfg.customerFacing !== "ON") {
      return { showPayment: false, state: cfg.state, action: null, message: "Online payment is currently unavailable. Contact your administrator." };
    }
    if ((tier === "COMMUNITY" || tier === "FREE" || tier === "TRIAL") && !upgradeRequired) {
      return { showPayment: false, state: cfg.state, action: null, message: null };
    }
    return {
      showPayment: true, state: cfg.state, environment: cfg.environment,
      action: upgradeRequired || tier !== "COMMUNITY" ? "UPGRADE_SUBSCRIBE_PAY" : "PAY",
      message: cfg.environment === "TEST" ? "Test mode — no real charge." : null
    };
  }

  /** Prepare a server-side checkout intent. No provider network call is made. */
  startPayment({ tenantScope = "default", amountKobo = 0, email = "", planCode = null, callbackUrl = null, metadata = {} } = {}) {
    this._assertHydrated();
    const scope = String(tenantScope || "default");
    const cfg = this._config(scope);
    if (cfg.state === "DISABLED") throw fail("PAYMENT_DISABLED", "payments are disabled for this tenant.");
    if (cfg.customerFacing !== "ON" && !metadata?.adminInitiated) {
      throw fail("PAYMENT_CUSTOMER_BLOCKED", "customer-facing payments are OFF.");
    }
    const secret = this.secrets?.getSecret?.(`ADE_PAYSTACK_${scope}`) || process.env.PAYSTACK_SECRET_KEY || null;
    const provider = new PaystackProvider({ environment: cfg.environment, secretKey: secret, planMappings: cfg.planMappings });
    const checkout = provider.initializePayment({ amountKobo, email, planCode, callbackUrl, metadata });
    const intent = {
      reference: checkout.reference,
      tenantScope: scope,
      amountKobo: checkout.amountKobo,
      email: checkout.email,
      planCode: checkout.planCode,
      status: "PREPARED",
      providerContacted: false,
      createdAt: nowIso(),
      expiresAt: Date.now() + 30 * 60 * 1000
    };
    this._pending.set(checkout.reference, intent);
    if (this._pending.size > 500) {
      const oldest = [...this._pending.entries()].sort((a, b) => String(a[1].createdAt).localeCompare(String(b[1].createdAt)))[0];
      if (oldest) this._pending.delete(oldest[0]);
    }
    try {
      this._persist();
    } catch (error) {
      this._pending.delete(checkout.reference);
      throw error;
    }
    this._audit("PAYMENT_REQUEST_PREPARED", { tenantScope: scope, reference: checkout.reference, environment: cfg.environment, providerContacted: false });
    try { this.eventBus?.publish?.("payment.prepared", { tenantScope: scope, reference: checkout.reference, providerContacted: false }); } catch {}
    return {
      ...checkout,
      status: "PAYMENT_REQUEST_PREPARED",
      providerContacted: false,
      checkoutUrl: null,
      accessCode: null
    };
  }

  /**
   * Webhook handler - the ONLY path that mutates entitlements.
   * Client redirects/success URLs never grant anything.
   */
  handleWebhook({ tenantScope = "default", rawBody = "", signature = "", event = null } = {}) {
    this._assertHydrated();
    const scope = String(tenantScope || "default");
    const secret = this.secrets?.getSecret?.(`ADE_PAYSTACK_${scope}`) || process.env.PAYSTACK_SECRET_KEY || null;
    const cfg = this._config(scope);
    const provider = new PaystackProvider({ environment: cfg.environment, secretKey: secret, planMappings: cfg.planMappings });
    let verified;
    try {
      verified = provider.verifyWebhook({ rawBody, signature, event });
    } catch (e) {
      this._audit("PAYMENT_FAILED", { tenantScope: scope, error: e.code || "SIGNATURE_INVALID" });
      throw e;
    }
    const mapping = provider.mapEventToEntitlement(verified);
    if (mapping.outcome === "GRANT") {
      const reference = mapping.reference;
      if (!reference) throw fail("PAYMENT_REFERENCE_REQUIRED", "verified grant carries no transaction reference.");
      const existing = this.entitlements.get(scope);
      if (existing?.reference === reference && existing?.plan) {
        const grantedIntent = this._pending.get(reference);
        if (grantedIntent) grantedIntent.status = "GRANTED";
        return { success: true, duplicate: true, outcome: "GRANT", entitlement: { ...existing } };
      }
      const intent = this._pending.get(reference);
      if (!intent || intent.tenantScope !== scope) {
        throw fail("PAYMENT_INTENT_NOT_FOUND", "no prepared checkout intent matches this transaction.");
      }
      if (Number(intent.expiresAt) > 0 && Date.now() > Number(intent.expiresAt)) {
        throw fail("PAYMENT_INTENT_EXPIRED", "checkout intent has expired.");
      }
      const eventAmount = Number(verified.data?.amount);
      if (Number.isFinite(eventAmount) && eventAmount > 0 && Number(intent.amountKobo) > 0 && eventAmount !== Number(intent.amountKobo)) {
        throw fail("PAYMENT_AMOUNT_MISMATCH", "verified amount does not match the prepared checkout intent.");
      }
      const unresolvedEventPlan = mapping.planCode ? String(mapping.planCode) : null;
      const eventPlan = unresolvedEventPlan && cfg.planMappings?.[unresolvedEventPlan]
        ? String(cfg.planMappings[unresolvedEventPlan])
        : unresolvedEventPlan;
      const expectedPlan = intent.planCode
        ? String(cfg.planMappings?.[intent.planCode] || intent.planCode)
        : null;
      if (eventPlan && expectedPlan && eventPlan.toLowerCase() !== expectedPlan.toLowerCase()) {
        throw fail("PAYMENT_PLAN_MISMATCH", "verified plan does not match the prepared checkout intent.");
      }
      const plan = (mapping.planCode && cfg.planMappings?.[mapping.planCode]) || mapping.planCode || "PROFESSIONAL";
      const ent = { plan: String(plan).toUpperCase().slice(0, 40), via: `PAYSTACK:${verified.event}`, reference, at: nowIso() };
      const previousEntitlement = existing;
      this.entitlements.set(scope, ent);
      intent.status = "GRANTED";
      intent.grantedAt = ent.at;
      try {
        this._persist();
      } catch (error) {
        if (previousEntitlement) this.entitlements.set(scope, previousEntitlement);
        else this.entitlements.delete(scope);
        intent.status = "PREPARED";
        delete intent.grantedAt;
        throw error;
      }
      this._audit("PAYMENT_VERIFIED", { tenantScope: scope, event: verified.event, reference });
      this._audit("ENTITLEMENT_GRANTED", { tenantScope: scope, plan: ent.plan, reference });
      try { this.eventBus?.publish?.("entitlement.granted", { tenantScope: scope, plan: ent.plan }); } catch {}
      return { success: true, outcome: "GRANT", entitlement: { ...ent } };
    }
    if (mapping.outcome === "REVOKE") {
      const reference = mapping.reference;
      const intent = reference ? this._pending.get(reference) : null;
      const current = this.entitlements.get(scope);
      if (reference && !intent && current?.reference !== reference) {
        throw fail("PAYMENT_INTENT_NOT_FOUND", "no prepared checkout intent matches this revocation.");
      }
      const ent = { plan: "COMMUNITY", via: `PAYSTACK:${verified.event}`, reference: reference || null, at: nowIso() };
      const previousEntitlement = current;
      if (intent) intent.status = "REVOKED";
      this.entitlements.set(scope, ent);
      try {
        this._persist();
      } catch (error) {
        if (previousEntitlement) this.entitlements.set(scope, previousEntitlement);
        else this.entitlements.delete(scope);
        if (intent) intent.status = "GRANTED";
        throw error;
      }
      this._audit("ENTITLEMENT_REVOKED", { tenantScope: scope, event: verified.event, reference });
      try { this.eventBus?.publish?.("entitlement.revoked", { tenantScope: scope }); } catch {}
      return { success: true, outcome: "REVOKE", entitlement: { ...ent } };
    }
    this._audit("PAYMENT_FAILED", { tenantScope: scope, event: verified.event, reference: mapping.reference });
    return { success: true, outcome: mapping.outcome, entitlement: this.entitlements.get(scope) || { plan: "COMMUNITY", via: "DEFAULT", at: null } };
  }

  async handleWebhookAsync(args = {}) {
    const snapshot = this.#snapshot();
    try {
      const result = this.handleWebhook(args);
      await this._persistAsync();
      return result;
    } catch (error) {
      this.#restore(snapshot);
      throw error;
    }
  }

  entitlementFor(tenantScope = "default") {
    if (tenantScope && typeof tenantScope === "object") {
      tenantScope = tenantScope.tenantScope || tenantScope.tenant || "default";
    }
    const scope = String(tenantScope || "default");
    return this.entitlements.get(scope) || { plan: "COMMUNITY", via: "DEFAULT", at: null };
  }
}

export default PaymentService;
