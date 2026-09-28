/**
 * ADE PAYSTACK PROVIDER (NEXT enablement — additive).
 *
 * One PaymentProvider implementation. TEST and LIVE are explicitly separate
 * states; test credentials are never promoted silently. This module performs
 * no network I/O itself: `initializePayment` builds the server-side checkout
 * descriptor, `verifyTransaction` describes the server-side verification step
 * (https://api.paystack.co) for the transport layer, and `verifyWebhook`
 * authenticates inbound provider events with timing-safe HMAC-SHA512 over
 * the RAW request body using the server-side secret. Secrets are never
 * accepted from, or returned to, browser code.
 *
 * Paystack subscription lifecycle events reconciled (per provider docs):
 * subscription.create, charge.success, invoice.payment_failed,
 * subscription.disable / subscription.not_renew.
 */

import crypto from "node:crypto";
import PaymentProvider, { maskSecretPresence } from "./PaymentProviderContract.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function timingSafeEqualStr(a, b) {
  try {
    const ba = Buffer.from(String(a || ""), "hex");
    const bb = Buffer.from(String(b || ""), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

export function verifyPaystackSignature(rawBody, signatureHeader, secretKey) {
  if (!secretKey || !signatureHeader) return false;
  try {
    const digest = crypto.createHmac("sha512", String(secretKey)).update(String(rawBody ?? "")).digest("hex");
    return timingSafeEqualStr(digest, String(signatureHeader).replace(/^sha512=/i, "").trim());
  } catch { return false; }
}

const GRANTING_EVENTS = Object.freeze(["charge.success", "subscription.create", "invoice.success"]);
const FAILING_EVENTS = Object.freeze(["charge.failed", "invoice.payment_failed", "payment.failed"]);
const REVOKING_EVENTS = Object.freeze(["subscription.disable", "subscription.not_renew", "refund.processed", "chargeback", "transfer.reversed"]);

export class PaystackProvider extends PaymentProvider {
  constructor({ environment = "TEST", secretKey = null, publicKey = null, planMappings = {} } = {}) {
    super({ providerId: "PAYSTACK", environment });
    this._secretKey = secretKey ? String(secretKey) : null;
    this._publicKey = publicKey ? String(publicKey) : null;
    this.planMappings = { ...(planMappings || {}) };
  }

  static keyMatchesEnvironment(secretKey, environment) {
    const k = String(secretKey || "");
    if (String(environment).toUpperCase() === "LIVE") return k.startsWith("sk_live_");
    return k.startsWith("sk_test_");
  }

  isConfigured() {
    return Boolean(this._secretKey);
  }

  maskedConfig() {
    return {
      provider: "PAYSTACK",
      environment: this.environment,
      secret: maskSecretPresence(this._secretKey),
      publicKey: maskSecretPresence(this._publicKey),
      planMappings: { ...this.planMappings },
      keyMatchesEnvironment: this._secretKey ? PaystackProvider.keyMatchesEnvironment(this._secretKey, this.environment) : null
    };
  }

  /** Server-side checkout descriptor. Never includes the secret. */
  initializePayment({ amountKobo = 0, email = "", reference = null, planCode = null, callbackUrl = null, metadata = {} } = {}) {
    if (!this.isConfigured()) throw fail("PAYSTACK_NOT_CONFIGURED", "secret key is absent; payment cannot start.");
    const amount = Number(amountKobo);
    if (!Number.isFinite(amount) || amount <= 0) throw fail("PAYMENT_AMOUNT_INVALID");
    if (!email || !String(email).includes("@")) throw fail("PAYMENT_EMAIL_REQUIRED");
    const ref = reference || `ade-${this.environment.toLowerCase()}-${crypto.randomBytes(8).toString("hex")}`;
    return {
      provider: "PAYSTACK",
      environment: this.environment,
      live: this.environment === "LIVE",
      reference: String(ref).slice(0, 120),
      amountKobo: amount,
      email: String(email).slice(0, 200),
      planCode: planCode ? String(planCode).slice(0, 120) : null,
      callbackUrl: callbackUrl ? String(callbackUrl).slice(0, 500) : null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      verificationRequired: true,
      note: this.environment === "LIVE"
        ? "Live transaction; provider fees apply per Paystack Nigeria pricing (external policy)."
        : "Test transaction; no real charge."
    };
  }

  /** Authenticate + classify an inbound webhook. Raw body required. */
  verifyWebhook({ rawBody = "", signature = "", event = null } = {}) {
    if (!this.isConfigured()) throw fail("PAYSTACK_NOT_CONFIGURED");
    const ok = verifyPaystackSignature(rawBody, signature, this._secretKey);
    if (!ok) throw fail("PAYSTACK_SIGNATURE_INVALID", "webhook signature did not verify.");
    let evt = event;
    if (!evt) {
      try { evt = JSON.parse(String(rawBody || "{}")); }
      catch { throw fail("PAYSTACK_EVENT_MALFORMED", "body is not valid JSON."); }
    }
    const type = String(evt?.event || evt?.type || "unknown");
    return { verified: true, event: type, data: evt?.data || {}, raw: evt };
  }

  /** Descriptor for the server-side transaction verification call. */
  verifyTransaction({ reference = "" } = {}) {
    if (!reference) throw fail("PAYSTACK_REFERENCE_REQUIRED");
    if (!this.isConfigured()) throw fail("PAYSTACK_NOT_CONFIGURED");
    return {
      provider: "PAYSTACK",
      environment: this.environment,
      method: "GET",
      url: `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(reference))}`,
      authenticated: true,
      note: "Execute server-side only with the secret key; never from browser code."
    };
  }

  /** Map a verified provider event to an entitlement outcome. */
  mapEventToEntitlement(verifiedEvent) {
    const type = String(verifiedEvent?.event || "unknown");
    const data = verifiedEvent?.data || {};
    const reference = data.reference || data.transaction_reference || null;
    if (GRANTING_EVENTS.includes(type)) {
      return { outcome: "GRANT", planCode: data.plan?.plan_code || data.plan_code || null, reference, event: type };
    }
    if (REVOKING_EVENTS.includes(type)) {
      return { outcome: "REVOKE", planCode: data.plan?.plan_code || null, reference, event: type };
    }
    if (FAILING_EVENTS.includes(type)) {
      return { outcome: "NO_GRANT", planCode: null, reference, event: type };
    }
    return { outcome: "NOOP", planCode: null, reference, event: type };
  }
}

export default PaystackProvider;
