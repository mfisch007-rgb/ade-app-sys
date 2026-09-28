/**
 * ADE DETERMINISTIC SYNTHETIC FINANCIAL FIXTURES (additive, test-only).
 * No real credentials, no network, no randomness. Covers: normal, duplicate,
 * failed, pending, reversed, refund, partial refund, dispute, duplicate
 * webhook, invalid signature, late/out-of-order events, amount/currency/
 * settlement/fee mismatches, missing transaction, unexpected transfer,
 * balance mismatch.
 */
import crypto from "node:crypto";

export function signTest(secret, rawBody) {
  return crypto.createHmac("sha512", String(secret)).update(String(rawBody)).digest("hex");
}

export const TEST_SECRET = "sk_test_financial_fixture_secret";

export function paystackEvent({ event = "charge.success", reference = "ref-fixture-1", amount = 100000, currency = "NGN", status = "success", channel = "card", customer = "CUS_fixture", metadata = {} } = {}) {
  return {
    event,
    data: {
      id: 1000001, reference, amount, currency, status, channel,
      paid_at: "2026-09-01T10:00:00.000Z",
      customer: { customer_code: customer, email: "buyer@example.test" },
      metadata
    }
  };
}

export function transferEvent({ event = "transfer.success", reference = "trf-fixture-1", amount = 50000 } = {}) {
  return {
    event,
    data: {
      id: 2000001, reference, amount, currency: "NGN", status: event.includes("success") ? "success" : event.includes("revers") ? "reversed" : "failed",
      created_at: "2026-09-01T11:00:00.000Z",
      recipient: { name: "BENEFICIARY", account_number: "0123456789" },
      metadata: {}
    }
  };
}

export function txRecord({ fingerprint = "fintx-fixture-1", provider = "PAYSTACK", environment = "TEST", status = "SUCCESS", amount = 100000, currency = "NGN", grade = "PROVIDER_CONFIRMED", tenantScope = "org-a", merchantReference = "ref-fixture-1" } = {}) {
  return {
    adeTransactionId: fingerprint, fingerprint,
    canonicalKey: `${provider}|${environment}|${fingerprint}`,
    provider, providerTxId: "1000001", providerReference: merchantReference,
    merchantReference, tenantScope, organization: "Fixture Foods",
    currency, amount, requestedAmount: amount, actualAmount: amount,
    status, providerStatusRaw: status.toLowerCase(), channel: "card",
    customerReference: "CUS_fixture", source: "SIGNED_WEBHOOK", environment,
    occurredAt: "2026-09-01T10:00:00.000Z", receivedAt: "2026-09-01T10:00:01.000Z",
    correlationId: "fin-fixture-1", metadata: {},
    provenance: { adapter: "PAYSTACK_FINANCIAL_ADAPTER", grade }
  };
}

export function settlementRecord({ settlementId = "set-fixture-1", netAmount = 98500, tenantScope = "org-a" } = {}) {
  return {
    settlementId, provider: "PAYSTACK", environment: "TEST", tenantScope,
    organization: "Fixture Foods", currency: "NGN", status: "SETTLED",
    settlementDate: "2026-09-02", destinationAccount: "****6789",
    grossAmount: 100000, feeTotal: 1500, deductionTotal: 0, netAmount,
    items: [{ fingerprint: "fintx-fixture-1", providerTxId: "1000001", amount: 100000, fee: 1500, deduction: 0, netAmount }],
    source: "AUTHORIZED_FEED", receivedAt: "2026-09-02T08:00:00.000Z"
  };
}

export default { signTest, TEST_SECRET, paystackEvent, transferEvent, txRecord, settlementRecord };
