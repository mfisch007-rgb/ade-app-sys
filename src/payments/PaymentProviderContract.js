/**
 * ADE PAYMENT PROVIDER CONTRACT (NEXT enablement — additive).
 *
 * PAYMENT_PROVIDER -> configuration -> test/live state -> credentials
 * -> plan/product mapping -> checkout/payment page -> payment event/webhook
 * -> verification -> entitlement transition -> audit -> notification.
 *
 * Paystack is ONE provider implementation behind this contract, never
 * hard-coded as ADE's only possible payment provider. No new entitlement
 * engine: transitions apply to the EXISTING EditionPolicy/capability model.
 */

export const PAYMENT_ENVIRONMENTS = Object.freeze(["TEST", "LIVE"]);
export const PAYMENT_STATES = Object.freeze(["DISABLED", "TEST", "LIVE"]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export class PaymentProvider {
  constructor({ providerId = "BASE", environment = "TEST" } = {}) {
    this.providerId = String(providerId).toUpperCase().slice(0, 40);
    if (!PAYMENT_ENVIRONMENTS.includes(String(environment).toUpperCase())) throw fail("PAYMENT_ENV_INVALID");
    this.environment = String(environment).toUpperCase();
  }
  get id() { return this.providerId; }
  initializePayment() { throw fail("PAYMENT_NOT_IMPLEMENTED"); }
  verifyWebhook() { throw fail("PAYMENT_NOT_IMPLEMENTED"); }
  verifyTransaction() { throw fail("PAYMENT_NOT_IMPLEMENTED"); }
  mapEventToEntitlement() { throw fail("PAYMENT_NOT_IMPLEMENTED"); }
  describe() {
    return { provider: this.providerId, environment: this.environment, live: false };
  }
}

export function maskSecretPresence(value) {
  if (!value) return { present: false, masked: null };
  const s = String(value);
  if (s.length <= 8) return { present: true, masked: "****" };
  return { present: true, masked: `${s.slice(0, 3)}****${s.slice(-2)}` };
}

export default PaymentProvider;
