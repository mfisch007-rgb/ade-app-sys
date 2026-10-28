import bcrypt from "bcryptjs";
import IdentityOnboarding from "../kernel/IdentityOnboarding.js";
import CredentialLifecycleStore from "./CredentialLifecycleStore.js";

const PIN_HASH_ENV = "ADE_ADMIN_PIN_HASH";
const DEFAULT_ADMIN_LEVEL = 2;

export class HttpSecurityBoundary {
  constructor({
    identity = IdentityOnboarding.getInstance(),
      credentialStore = new CredentialLifecycleStore(
        undefined,
        identity?.eventBus || null
      )
  } = {}) {
    this.identity = identity;
    this.credentialStore = credentialStore;
  }

  get pinHash() {
    return String(process.env[PIN_HASH_ENV] || "").trim();
  }

  async authenticatePin(pin) {
    const configuredRecoveryHash = String(
      process.env.ADE_ADMIN_RECOVERY_KEY_HASH || ""
    ).trim();

    await this.credentialStore.ensureInitialized(
      this.pinHash,
      configuredRecoveryHash || null
    );

    const valid =
      await this.credentialStore.verifyPin(pin);

    if (!valid) {
      try {
        this.identity.eventBus?.publish("SECURITY_EVENT", {
          type: "AUTHENTICATION_FAILED",
          subject: "admin",
          reason: "INVALID_CREDENTIAL"
        });
      } catch {}

      return null;
    }

    const configuredLevel = Number(
      process.env.ADE_ADMIN_SESSION_LEVEL || DEFAULT_ADMIN_LEVEL
    );

    const level =
      Number.isInteger(configuredLevel) &&
      configuredLevel >= 1 &&
      configuredLevel <= 4
        ? configuredLevel
        : DEFAULT_ADMIN_LEVEL;

    return this.identity.issueSession({
      subject: "admin",
      tier: "COMMUNITY",
      level,
      persona: "ADMIN",
      edition: process.env.ADE_RUNTIME_MODE || "COMMUNITY"
    });
  }

  #live(level) {
    // Authenticate at the lowest level first so the signed token is verified,
    // then hydrate the live workforce record, and only then enforce the
    // requested level. Checking the requested level against stale token
    // claims allowed a demoted/suspended identity to keep its old authority.
    const base = this.identity.middleware({ level: 1 });
    return (req, res, next) => base(req, res, (error) => {
      if (error) return next(error);
      this.#hydrateLiveIdentity(req, res, (hydrateError) => {
        if (hydrateError) return next(hydrateError);
        return this.#enforceLevel(level, req, res, next);
      });
    });
  }

  #enforceLevel(level, req, res, next) {
    const required = Number(level);
    const liveLevel = Number(req.person?.level ?? req.identity?.level ?? req.claims?.level ?? 0);
    if (!Number.isFinite(required) || required < 1) {
      return res.status(500).json({ success: false, error: "AUTHORIZATION_CONFIG_INVALID" });
    }
    if (!Number.isFinite(liveLevel) || liveLevel < required) {
      return res.status(403).json({ success: false, error: "INSUFFICIENT_AUTHORIZATION" });
    }
    return next();
  }

  #applyAuthenticatedTenant(req, claims = {}, person = null) {
    const tenant =
      person?.tenantId ||
      claims?.tenantId ||
      claims?.tid ||
      claims?.metadata?.tenantId ||
      claims?.metadata?.tid ||
      null;
    if (!tenant) return;
    const scope = String(tenant).slice(0, 80);
    if (!scope) return;
    req.tenantId = scope;
    try {
      if (req.query && typeof req.query === "object") {
        req.query.tenant = scope;
        req.query.tenantId = scope;
      }
    } catch {}
    try {
      if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
        for (const key of ["tenant", "tenantId", "tenantScope"]) {
          if (Object.prototype.hasOwnProperty.call(req.body, key)) req.body[key] = scope;
        }
      }
    } catch {}
  }

  async #hydrateLiveIdentity(req, res, next) {
    const claims = req.identity || {};
    this.#applyAuthenticatedTenant(req, claims);
    const personId = String(claims.personId || claims.sub || "").trim();
    const isWorkforce = String(claims.persona || "").toUpperCase() === "WORKFORCE" || Boolean(claims.personId);
    if (!this.workforce || !isWorkforce || !personId) return next();
    try {
      let person = await this.workforce.getPersonRecord(personId);
      if (!person && claims.sub && typeof this.workforce.getPersonByUsername === "function") {
        person = await this.workforce.getPersonByUsername(claims.sub);
      }
      if (!person) return res.status(401).json({ success: false, error: "SESSION_PERSON_MISSING" });
      const status = String(person.status || "ACTIVE").toUpperCase();
      if (status !== "ACTIVE") return res.status(403).json({ success: false, error: "ACCOUNT_NOT_ACTIVE", status });
      const expiry = Number(person.accessExpiryAt);
      if (Number.isFinite(expiry) && expiry > 0 && Date.now() > expiry) {
        return res.status(403).json({ success: false, error: "ACCESS_EXPIRED" });
      }
      req.person = person;
      req.claims = claims;
      this.#applyAuthenticatedTenant(req, claims, person);
      claims.personId = person.id;
      claims.role = person.role;
      claims.level = Number(person.level) || claims.level;
      claims.persona = "WORKFORCE";
      return next();
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("STORAGE") || message.includes("UNAVAILABLE")) {
        return res.status(503).json({ success: false, error: "AUTH_STORAGE_UNAVAILABLE" });
      }
      return res.status(401).json({ success: false, error: "SESSION_PERSON_MISSING" });
    }
  }

  requireAuth() {
    return this.#live(1);
  }

  requireLevel(level) {
    return this.#live(level);
  }

  // Action-specific authorization for AWBULI/WhatsApp sender-identity and
  // provider/channel configuration mutations. Chain AFTER requireLevel so
  // the L2 population and its 401/403 denials are unchanged; this adds only
  // the identity-bound six-digit PIN step-up factor on top.
  // - Metadata actions (register/edit/verify/default/provider-configure):
  //   L2 session + PIN proof. PIN proof is the workforce pinVerified claim
  //   (base session + POST /api/v1/account/pin) in claims or metadata, or a
  //   legacy ADMIN session (PIN-proven at POST /api/v1/auth/pin issuance).
  // - State actions (enable/suspend/state): metadata rule PLUS an
  //   attributable workforce (persona WORKFORCE) or legacy-ADMIN identity,
  //   so every live-facing change has an accountable owner. Bare
  //   non-workforce L2 tokens are denied fail-closed.
  // Denials are 403 ELEVATED_PIN_REQUIRED / INSUFFICIENT_AUTHORIZATION —
  // the same codes as the canonical workforce guards. No PIN, token, key
  // or secret value is ever read here beyond presence, and none is written
  // to any record. Reads are never passed through this guard.
  requireConfigAction(action) {
    const STATE_ACTIONS = new Set(["enable", "suspend", "state"]);
    return (req, res, next) => {
      try {
        const id = req.identity || {};
        const persona = String(id.persona || "").toUpperCase();
        const pin =
          id.pinVerified === true ||
          id?.metadata?.pinVerified === true;
        const legacyAdmin = persona === "ADMIN" && Number(id.level) >= 2;
        if (!pin && !legacyAdmin) {
          return res.status(403).json({
            success: false,
            error: "ELEVATED_PIN_REQUIRED",
            message: "Identity-bound six-digit PIN step-up required — verify the authorization PIN for this identity, then retry."
          });
        }
        if (STATE_ACTIONS.has(String(action || "").toLowerCase())) {
          const attributable = persona === "WORKFORCE" || legacyAdmin;
          if (!attributable) {
            return res.status(403).json({
              success: false,
              error: "INSUFFICIENT_AUTHORIZATION",
              message: "State changes require an attributable workforce or administrator identity."
            });
          }
        }
        return next();
      } catch {
        return res.status(403).json({ success: false, error: "ELEVATED_PIN_REQUIRED" });
      }
    };
  }

  revokeToken(token) {
    return this.identity.revokeSession(token);
  }

  async rotatePin(newPin) {
    return this.credentialStore.rotatePin(newPin);
  }

  async recoverPin(recoveryKey, newPin) {
    return this.credentialStore.recoverPin(recoveryKey, newPin);
  }
}

export default HttpSecurityBoundary;


