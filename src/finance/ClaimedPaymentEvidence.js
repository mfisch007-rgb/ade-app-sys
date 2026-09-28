/**
 * ADE CLAIMED-PAYMENT EVIDENCE (§50 AWBULI bridge — additive).
 *
 * "Customer says they paid ₦50,000." AWBULI must NEVER mark payment as
 * successful. Instead: extract the claimed payment (amount / currency /
 * reference / channel hints) -> canonical evidence (grade OBSERVED_FACT for
 * the CLAIM, never for the payment) -> verification request against the
 * provider -> actual transaction state -> response. Conversational claims
 * never become financial truth.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

const CURRENCY_RE = /₦|NGN|GH₵|GHS|KSh|KES|R\s?(?=\d)|ZAR|USD|\$/i;
const AMOUNT_RE = /(?:₦|NGN|GH₵|GHS|KSh|KES|ZAR|USD|\$|R)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/;
const REF_RE = /(?:reference|ref(?:erence)?(?:\s*(?:no|number|#))?|transaction(?:\s*id)?|receipt)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-_]{3,60})/i;

function detectCurrency(text) {
  const t = String(text || "");
  if (/₦|NGN/i.test(t)) return "NGN";
  if (/GH₵|GHS/i.test(t)) return "GHS";
  if (/KSh|KES/i.test(t)) return "KES";
  if (/ZAR/i.test(t)) return "ZAR";
  if (/USD/i.test(t)) return "USD";
  return null;
}

export function extractClaimedPayment(text) {
  const t = String(text || "");
  if (!/paid|payment|pay|transferr?ed|sent/i.test(t)) return null;
  const amt = AMOUNT_RE.exec(t);
  const ref = REF_RE.exec(t);
  if (!amt && !ref) return null;
  return {
    claimedAmount: amt ? Number(String(amt[1]).replace(/,/g, "")) : null,
    claimedCurrency: detectCurrency(t),
    claimedReference: ref ? ref[1].slice(0, 80) : null,
    channelHint: /bank|transfer/i.test(t) ? "BANK_TRANSFER" : /card/i.test(t) ? "CARD" : /ussd/i.test(t) ? "USSD" : null
  };
}

export class ClaimedPaymentBridge {
  constructor({ ledger = null, eventBus = null, riskEngine = null } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
    this.riskEngine = riskEngine || null;
  }

  /**
   * Build verification-ready canonical evidence from a message. Returns
   * { claimed, evidence, verification } where verification.status is always
   * CLAIMED_UNVERIFIED until a provider confirms — never SUCCESS.
   */
  fromMessage({ text = "", tenantScope = "default", actor = null, organization = null, correlationId = null } = {}) {
    const claimed = extractClaimedPayment(text);
    if (!claimed) throw fail("FIN_NO_CLAIM_FOUND", "no payment claim detected in message.");
    const scope = String(tenantScope || "default");
    const evidence = {
      kind: "CLAIMED_PAYMENT",
      tenantScope: scope,
      organization: organization ? String(organization).slice(0, 200) : null,
      reportedBy: actor ? String(actor).slice(0, 120) : null,
      claim: claimed,
      // The OBSERVED_FACT is that a claim was made — not that money moved.
      evidenceGrade: "OBSERVED_FACT",
      statement: `A payment of ${claimed.claimedAmount ?? "an unspecified amount"}${claimed.claimedCurrency ? " " + claimed.claimedCurrency : ""} was CLAIMED${claimed.claimedReference ? ` (ref ${claimed.claimedReference})` : ""}. Unverified.`,
      correlationId: correlationId || null,
      at: nowIso()
    };
    // Attempt ledger match by reference (read-only lookup, no state change).
    let match = null;
    try {
      const txs = this.ledger?.listTransactions?.({ tenantScope: scope, limit: 500 }) || [];
      if (claimed.claimedReference) {
        match = txs.find((t) => t.merchantReference === claimed.claimedReference || t.providerTxId === claimed.claimedReference || t.providerReference === claimed.claimedReference) || null;
      }
    } catch {}
    const verification = {
      status: "CLAIMED_UNVERIFIED",
      matchedTransaction: match ? match.fingerprint : null,
      nextStep: match ? "PROVIDER_VERIFY_REFERENCE" : "AWAITING_REFERENCE_OR_PROVIDER_CONFIRMATION",
      warning: "Do not treat this claim as payment success. Verify server-side with the provider."
    };
    try {
      this.eventBus?.publish?.("finance.claim.received", { tenantScope: scope, claim: claimed, verification: verification.status, at: nowIso() });
    } catch {}
    return { claimed, evidence, verification };
  }
}

export default ClaimedPaymentBridge;
