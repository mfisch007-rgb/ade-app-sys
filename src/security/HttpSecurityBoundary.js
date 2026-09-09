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

  requireAuth() {
    return this.identity.middleware({ level: 1 });
  }

  requireLevel(level) {
    return this.identity.middleware({ level });
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


