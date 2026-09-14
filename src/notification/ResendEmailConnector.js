/**
 * ADE RESEND EMAIL CONNECTOR — canonical server-side transactional email path.
 *
 * Uses the existing ProductNotificationEngine architecture: sends are recorded
 * as internal notification events and external delivery is attempted ONLY
 * through the Resend HTTP API with a server-side key. No email system is
 * duplicated; this is the single canonical Resend boundary.
 *
 * Security:
 *  - Reads RESEND_API_KEY + EMAIL_SENDER server-side only.
 *  - Never logs, prints, or returns the API key.
 *  - Never imported by client bundles (server routes only).
 *  - Preferred production sender: ADE <notifications@vibranthopecarefoundation.com.ng>
 */

const DEFAULT_SENDER = "ADE <notifications@vibranthopecarefoundation.com.ng>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Selectable production sender profiles on the verified domain.
// Default remains notifications@. Any sender outside the verified domain
// is rejected so Resend cannot fail silently on unverified identities.
const SENDER_DOMAIN = "vibranthopecarefoundation.com.ng";
const SENDER_PROFILES = Object.freeze({
  notifications: "ADE <notifications@vibranthopecarefoundation.com.ng>",
  welcome: "ADE <welcome@vibranthopecarefoundation.com.ng>",
  security: "ADE <security@vibranthopecarefoundation.com.ng>",
  support: "ADE <support@vibranthopecarefoundation.com.ng>",
  partners: "ADE <partners@vibranthopecarefoundation.com.ng>"
});

function resolveSender(explicit) {
  const s = String(explicit ?? process.env.EMAIL_SENDER ?? process.env.RESEND_FROM ?? DEFAULT_SENDER).trim();
  return s || DEFAULT_SENDER;
}

function extractAddress(sender) {
  const m = String(sender || "").match(/<([^<>]+)>/) || [null, String(sender || "").trim()];
  return String(m[1] || "").trim().toLowerCase();
}

export class ResendEmailConnector {
  constructor({ apiKey = process.env.RESEND_API_KEY, sender = resolveSender(), fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey || null;
    this.sender = sender;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.sender);
  }

  configurationError() {
    if (this.isConfigured()) return null;
    const missing = [];
    if (!this.apiKey) missing.push("RESEND_API_KEY");
    if (!this.sender) missing.push("EMAIL_SENDER");
    return new Error(`EMAIL_NOT_CONFIGURED: missing ${missing.join(", ")}`);
  }

  status() {
    if (!this.apiKey) {
      return {
        provider: "RESEND",
        configured: false,
        status: "NOT CONFIGURED",
        sender: this.sender,
        requiredEnv: ["RESEND_API_KEY", "EMAIL_SENDER (default: notifications@vibranthopecarefoundation.com.ng)"],
        note: "Resend key absent. Notifications remain internal events only. No fake email is sent."
      };
    }
    return {
      provider: "RESEND",
      configured: true,
      status: "CONFIGURED",
      sender: this.sender,
      profiles: Object.keys(SENDER_PROFILES),
      endpoint: "https://api.resend.com/emails",
      note: "Resend transactional path is configured. Delivery requires sender domain verification."
    };
  }

  #assertConfigured() {
    const err = this.configurationError();
    if (err) throw err;
  }

  static isValidEmail(to) {
    return typeof to === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  }

  static senderProfiles() {
    return { ...SENDER_PROFILES };
  }

  static resolveProfile(profile) {
    if (!profile) return DEFAULT_SENDER;
    const key = String(profile).trim().toLowerCase();
    if (SENDER_PROFILES[key]) return SENDER_PROFILES[key];
    throw new Error(`EMAIL_UNKNOWN_SENDER_PROFILE: expected one of ${Object.keys(SENDER_PROFILES).join(", ")}.`);
  }

  static assertVerifiedSender(sender) {
    const addr = extractAddress(sender);
    if (!ResendEmailConnector.isValidEmail(addr) || !addr.endsWith(`@${SENDER_DOMAIN}`)) {
      throw new Error(`EMAIL_SENDER_NOT_VERIFIED: sender must belong to ${SENDER_DOMAIN}.`);
    }
    return true;
  }

  async send({ to, subject, html, text, profile, from } = {}) {
    this.#assertConfigured();
    const sender = from || (profile ? ResendEmailConnector.resolveProfile(profile) : this.sender);
    ResendEmailConnector.assertVerifiedSender(sender);
    if (!ResendEmailConnector.isValidEmail(to)) {
      throw new Error("EMAIL_INVALID_RECIPIENT: a valid `to` email address is required.");
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      throw new Error("EMAIL_SUBJECT_REQUIRED");
    }
    if ((!html && !text) || (typeof html !== "string" && typeof text !== "string")) {
      throw new Error("EMAIL_BODY_REQUIRED: provide `html` and/or `text`.");
    }
    let res;
    try {
      res = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: sender,
          to: [to.trim()],
          subject: subject.trim(),
          ...(html ? { html } : {}),
          ...(text ? { text } : {})
        })
      });
    } catch (e) {
      throw new Error(`EMAIL_SEND_FAILED: ${e?.message || "network error"}`);
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const msg = body?.message || body?.error || `HTTP ${res.status}`;
      // Never include the key in the error.
      throw new Error(`EMAIL_SEND_FAILED: ${String(msg).slice(0, 300)}`);
    }
    return {
      success: true,
      provider: "RESEND",
      id: body?.id || null,
      to: to.trim(),
      from: sender
    };
  }
}

export const EMAIL_DEFAULT_SENDER = DEFAULT_SENDER;
export default ResendEmailConnector;
