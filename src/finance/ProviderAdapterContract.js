/**
 * ADE FINANCIAL PROVIDER ADAPTER CONTRACT (additive).
 *
 * PaymentProviderAdapter exposes ONLY the capabilities a provider actually
 * supports — capability discovery determines what is available. No
 * PaystackEngine / FlutterwaveEngine as separate intelligence systems:
 * adapters normalize into the same canonical financial layer. Read-only
 * contract scopes are respected (a read-only adapter refuses mutating ops).
 *
 * Supported capability names: verifyTransaction, receiveWebhook,
 * verifyWebhook, listTransactions, retrieveTransaction, listSettlements,
 * retrieveSettlementTransactions, listRefunds, listDisputes,
 * retrieveTransfer, retrieveBalance, exportTransactions.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { normalizeTxState, buildTransactionIdentity, sha256Hex } from "./FinancialEventModel.js";
import { verifyPaystackSignature } from "../payments/PaystackProvider.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export const FIN_CAPABILITIES = Object.freeze([
  "verifyTransaction", "receiveWebhook", "verifyWebhook", "listTransactions",
  "retrieveTransaction", "listSettlements", "retrieveSettlementTransactions",
  "listRefunds", "listDisputes", "retrieveTransfer", "retrieveBalance", "exportTransactions"
]);

export const FIN_PROVIDER_STATES = Object.freeze([
  "NOT_CONFIGURED", "READY", "TEST", "CONNECTED", "VERIFIED", "LIVE", "DEGRADED", "DISABLED"
]);

export class FinancialProviderAdapter {
  constructor({ provider = "BASE", environment = "TEST", readOnly = true, contractScopes = [] } = {}) {
    this.provider = String(provider).toUpperCase().slice(0, 40);
    this.environment = String(environment).toUpperCase() === "LIVE" ? "LIVE" : "TEST";
    this.readOnly = readOnly !== false;
    this.contractScopes = Array.isArray(contractScopes) ? contractScopes.map((s) => String(s).slice(0, 80)) : [];
  }

  /** Override: subset of FIN_CAPABILITIES actually supported. */
  capabilities() { return ["verifyWebhook"]; }

  supports(cap) { return this.capabilities().includes(cap); }

  _requireCap(cap) {
    if (!this.supports(cap)) throw fail("FIN_CAP_UNSUPPORTED", `${this.provider} does not support ${cap}.`);
  }

  _requireWrite(op) {
    if (this.readOnly) throw fail("FIN_READ_ONLY", `${op} refused: contract scope is read-only.`);
  }

  verifyWebhook() { throw fail("FIN_NOT_IMPLEMENTED"); }

  normalizeWebhook() { throw fail("FIN_NOT_IMPLEMENTED"); }

  /** Server-side verification descriptor (transport executes server-side only). */
  verifyTransaction() { throw fail("FIN_NOT_IMPLEMENTED"); }

  describe() {
    return {
      provider: this.provider, environment: this.environment,
      readOnly: this.readOnly, contractScopes: [...this.contractScopes],
      capabilities: this.capabilities(), live: false,
      state: "NOT_CONFIGURED"
    };
  }
}

/** Paystack adapter: signed webhooks + server-side verification + event normalization. */
export class PaystackFinancialAdapter extends FinancialProviderAdapter {
  constructor({ environment = "TEST", secretKey = null, readOnly = true, contractScopes = [] } = {}) {
    super({ provider: "PAYSTACK", environment, readOnly, contractScopes });
    this._secretKey = secretKey ? String(secretKey) : null;
  }

  capabilities() {
    return ["verifyTransaction", "receiveWebhook", "verifyWebhook", "retrieveTransaction", "exportTransactions"];
  }

  isConfigured() { return Boolean(this._secretKey); }

  verifyWebhook({ rawBody = "", signature = "" } = {}) {
    this._requireCap("verifyWebhook");
    if (!this.isConfigured()) throw fail("FIN_PROVIDER_NOT_CONFIGURED", "Paystack secret absent.");
    const ok = verifyPaystackSignature(rawBody, signature, this._secretKey);
    if (!ok) throw fail("FIN_SIGNATURE_INVALID", "x-paystack-signature did not verify.");
    let evt = null;
    try { evt = JSON.parse(String(rawBody || "{}")); }
    catch { throw fail("FIN_EVENT_MALFORMED", "webhook body is not valid JSON."); }
    return { verified: true, event: String(evt?.event || "unknown"), data: evt?.data || {}, raw: evt, rawHash: sha256Hex(rawBody) };
  }

  /** Normalize a verified Paystack event (charge/transfer/refund/dispute/subscription/invoice). */
  normalizeWebhook(verified, { tenantScope = "default" } = {}) {
    this._requireCap("receiveWebhook");
    const type = String(verified?.event || "unknown");
    const d = verified?.data || {};
    const kind = /^transfer/.test(type) ? "TRANSFER"
      : /^refund/.test(type) ? "REFUND"
      : /^charge/.test(type) && /dispute|chargeback/.test(type) ? "DISPUTE"
      : /dispute/.test(type) ? "DISPUTE"
      : /^subscription/.test(type) ? "SUBSCRIPTION"
      : /^invoice/.test(type) ? "INVOICE"
      : "PAYMENT";
    const providerStatus = d.status || (/success|create/.test(type) ? "success" : /fail/.test(type) ? "failed" : /revers/.test(type) ? "reversed" : "unknown");
    const tx = buildTransactionIdentity({
      provider: "PAYSTACK", environment: this.environment,
      providerTxId: d.id || d.transaction_id || d.reference,
      providerReference: d.reference || d.transaction_reference || null,
      merchantReference: d.metadata?.merchant_reference || d.metadata?.reference || d.reference || null,
      tenantScope, organization: d.metadata?.organization || null,
      currency: d.currency || d.plan?.currency || null,
      amount: d.amount ?? d.requested_amount ?? null,
      requestedAmount: d.requested_amount ?? null,
      actualAmount: d.amount ?? null,
      status: normalizeTxState(providerStatus),
      providerStatusRaw: providerStatus,
      channel: d.channel || d.payment_channel || null,
      customerReference: d.customer?.customer_code || d.customer?.email || null,
      source: "SIGNED_WEBHOOK", occurredAt: d.paid_at || d.created_at || d.transaction_date || null,
      correlationId: d.reference || null,
      metadata: { paystackEvent: type },
      provenanceAdapter: "PAYSTACK_FINANCIAL_ADAPTER", evidenceGrade: "PROVIDER_CONFIRMED"
    });
    return { kind, paystackEvent: type, transaction: tx, rawHash: verified?.rawHash || null };
  }

  verifyTransaction({ reference = "" } = {}) {
    this._requireCap("verifyTransaction");
    if (!reference) throw fail("FIN_REFERENCE_REQUIRED");
    if (!this.isConfigured()) throw fail("FIN_PROVIDER_NOT_CONFIGURED");
    return {
      provider: "PAYSTACK", environment: this.environment, method: "GET",
      url: `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(reference))}`,
      authenticated: true,
      note: "Execute server-side only with the secret key; never from browser code."
    };
  }

  describe() {
    return { ...super.describe(), configured: this.isConfigured(), state: this.isConfigured() ? (this.environment === "LIVE" ? "TEST" : "TEST") : "NOT_CONFIGURED" };
  }
}

/** Generic adapter for contracted-but-unconfigured providers (no fake data). */
export class GenericFinancialAdapter extends FinancialProviderAdapter {
  constructor({ provider = "GENERIC", environment = "TEST", readOnly = true, contractScopes = [] } = {}) {
    super({ provider, environment, readOnly, contractScopes });
  }
  capabilities() { return []; }
  describe() { return { ...super.describe(), state: "NOT_CONFIGURED", note: "Contracted provider slot; no credentials, no data." }; }
}

const KNOWN_PROVIDERS = Object.freeze(["PAYSTACK", "FLUTTERWAVE", "INTERSWITCH", "QUICKTELLER", "PAGA"]);

export class FinancialAdapterRegistry {
  constructor({ secrets = null, eventBus = null } = {}) {
    this.secrets = secrets;
    this.eventBus = eventBus;
    this.adapters = new Map();
  }

  _secretFor(provider, tenantScope) {
    const scope = String(tenantScope || "default");
    return this.secrets?.getSecret?.(`ADE_PAYSTACK_${scope}`) || process.env.PAYSTACK_SECRET_KEY || null;
  }

  get(provider, { tenantScope = "default", environment = "TEST" } = {}) {
    const key = `${String(tenantScope || "default")}::${String(provider).toUpperCase()}`;
    if (this.adapters.has(key)) return this.adapters.get(key);
    const p = String(provider).toUpperCase();
    let adapter = null;
    if (p === "PAYSTACK") {
      adapter = new PaystackFinancialAdapter({ environment, secretKey: this._secretFor(p, tenantScope) });
    } else {
      adapter = new GenericFinancialAdapter({ provider: KNOWN_PROVIDERS.includes(p) ? p : "GENERIC", environment });
    }
    this.adapters.set(key, adapter);
    return adapter;
  }

  /** Capability discovery: what is actually available for this provider/tenant. */
  discover(provider, opts = {}) {
    const adapter = this.get(provider, opts);
    const d = adapter.describe();
    return {
      provider: d.provider, state: d.state, environment: d.environment,
      capabilities: d.capabilities, readOnly: d.readOnly,
      contractScopes: d.contractScopes || [],
      note: d.capabilities.length ? "Declared capabilities only; each call still requires credentials + authorization." : "No capabilities available; provider NOT_CONFIGURED."
    };
  }

  static knownProviders() { return [...KNOWN_PROVIDERS]; }
}

export default FinancialProviderAdapter;
