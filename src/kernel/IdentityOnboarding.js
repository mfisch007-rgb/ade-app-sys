import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import KeyManager from "../security/KeyManager.js";
import EnterpriseEventBus from "./EnterpriseEventBus.js";
import CredentialLifecycleStore from "../security/CredentialLifecycleStore.js";

const SESSION_TTL_SECONDS = Number(process.env.ADE_SESSION_TTL_SECONDS || 3600);

export class IdentityOnboarding {
  constructor({ keyManager = KeyManager.getInstance(), eventBus = EnterpriseEventBus.getInstance(), credentialStore = new CredentialLifecycleStore() } = {}) {
    this.keyManager = keyManager;
    this.eventBus = eventBus;
    this.credentialStore = credentialStore;
    this.revocationPath = path.resolve(process.env.ADE_SESSION_REVOCATION_FILE || ".ade_session_revocations.json");
    this.revoked = this.#loadRevocations();
  }

  static getInstance() {
    if (!globalThis.__ADE_IDENTITY_ONBOARDING__) {
      globalThis.__ADE_IDENTITY_ONBOARDING__ = new IdentityOnboarding();
    }
    return globalThis.__ADE_IDENTITY_ONBOARDING__;
  }

  #loadRevocations() {
    try {
      if (!fs.existsSync(this.revocationPath)) return new Set();
      const value = JSON.parse(fs.readFileSync(this.revocationPath, "utf8"));
      return new Set(Array.isArray(value) ? value : []);
    } catch {
      return new Set();
    }
  }

  #persistRevocations() {
    try {
      const dir = path.dirname(this.revocationPath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.revocationPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this.revoked].slice(-5000), null, 2), "utf8");
      fs.renameSync(tmp, this.revocationPath);
    } catch {
      // Filesystem unavailable (e.g. serverless) — revocations survive only in this instance.
    }
  }

  #claims({ subject, tier = "COMMUNITY", level = 1, persona = "OPERATOR", edition = "COMMUNITY", metadata = {} }) {
    return {
      iss: process.env.ADE_TOKEN_ISSUER || "ADE-APEX",
      aud: process.env.ADE_TOKEN_AUDIENCE || "ADE-APEX-RUNTIME",
      sub: subject,
      jti: crypto.randomUUID(),
      tier,
      level,
      persona,
      edition,
      ...metadata
    };
  }

  #base64url(value) { return Buffer.from(value).toString("base64url"); }

  #signJwt(payload, privateKey) {
    const header = this.#base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const body = this.#base64url(JSON.stringify(payload));
    const input = `${header}.${body}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
    return `${input}.${signature}`;
  }

  #verifyJwt(token, publicKey) {
    const parts = String(token).split(".");
    if (parts.length !== 3) throw new Error("Malformed session token.");
    const [header, body, signature] = parts;
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (decodedHeader.alg !== "RS256" || decodedHeader.typ !== "JWT") throw new Error("Unsupported session token algorithm.");
    const valid = crypto.verify("RSA-SHA256", Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, "base64url"));
    if (!valid) throw new Error("Cryptographic session signature verification failed.");
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  }

  issueSession({ subject = "operator", tier = "COMMUNITY", level = 1, persona = "OPERATOR", edition = "COMMUNITY", metadata = {} } = {}) {
    if (!subject) throw new Error("Identity subject is required.");
    const privateKey = this.keyManager.getPrivateKey();
    const now = Math.floor(Date.now() / 1000);
    let credentialVersion;

    try {
      credentialVersion =
        this.credentialStore.getCredentialVersion();
    } catch (error) {
      if (
        Number(level) >= 2 &&
        String(persona).toUpperCase() === "ADMIN"
      ) {
        throw new Error(
          "CREDENTIAL_LIFECYCLE_UNAVAILABLE"
        );
      }

      credentialVersion = null;
    }

    const claims = {
      ...this.#claims({ subject, tier, level, persona, edition, metadata }),
      ...(credentialVersion !== null ? { credentialVersion } : {}),
      iat: now,
      exp: now + SESSION_TTL_SECONDS
    };
    const token = this.#signJwt(claims, privateKey);
    this.#audit("SESSION_ISSUED", { subject, tier, level, persona, jti: claims.jti });
    return { token, expiresIn: SESSION_TTL_SECONDS, expiresAt: claims.exp * 1000, identity: { subject, tier, level, persona, edition } };
  }

  verifySession(token) {
    if (!token || typeof token !== "string") throw new Error("Bearer session token is required.");
    const publicKey = this.keyManager.getPublicKey();
    let claims;
    try { claims = this.#verifyJwt(token, publicKey); } catch (error) { throw new Error(`Invalid session: ${error.message}`); }
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && now >= claims.exp) throw new Error("Session has expired.");
    if (claims.iss !== (process.env.ADE_TOKEN_ISSUER || "ADE-APEX")) throw new Error("Session issuer is invalid.");
    if (claims.aud !== (process.env.ADE_TOKEN_AUDIENCE || "ADE-APEX-RUNTIME")) throw new Error("Session audience is invalid.");
    if (this.revoked.has(claims.jti)) throw new Error("Session has been revoked.");
    if (!claims.sub || !claims.jti) throw new Error("Session identity is incomplete.");
    const isPrivilegedAdmin =
      Number(claims.level) >= 2 &&
      String(claims.persona || "").toUpperCase() === "ADMIN";

    if (isPrivilegedAdmin && claims.credentialVersion === undefined) {
      throw new Error(
        "Privileged session credential version is missing."
      );
    }

    if (claims.credentialVersion !== undefined) {
      let currentCredentialVersion;
      try {
        currentCredentialVersion = this.credentialStore.getCredentialVersion();
      } catch {
        throw new Error("Credential lifecycle state is unavailable.");
      }

      if (
        Number(claims.credentialVersion) !==
        Number(currentCredentialVersion)
      ) {
        throw new Error("Session was invalidated by credential rotation.");
      }
    }
    return claims;
  }

  revokeSession(tokenOrJti) {
    let jti = tokenOrJti;
    if (typeof tokenOrJti === "string" && tokenOrJti.split(".").length === 3) {
      const claims = this.verifySession(tokenOrJti);
      jti = claims.jti;
    }
    if (!jti) throw new Error("Session identifier is required.");
    this.revoked.add(jti);
    this.#persistRevocations();
    this.#audit("SESSION_REVOKED", { jti });
    return true;
  }

  authorize(claims, { level = 1, roles = [], personas = [] } = {}) {
    if (!claims || Number(claims.level) < level) return false;
    if (roles.length && !roles.includes(claims.role || claims.persona)) return false;
    if (personas.length && !personas.includes(claims.persona)) return false;
    return true;
  }

  middleware(options = {}) {
    return (req, res, next) => {
      try {
        const header = req.get("authorization") || "";
        if (!header.startsWith("Bearer ")) return res.status(401).json({ success: false, error: "Authentication required" });
        const claims = this.verifySession(header.slice(7));
        if (!this.authorize(claims, options)) return res.status(403).json({ success: false, error: "Insufficient authorization" });
        req.identity = claims;
        next();
      } catch (error) {
        this.#audit("AUTHORIZATION_DENIED", { path: req.path, reason: error.message });
        return res.status(401).json({ success: false, error: error.message });
      }
    };
  }

  #audit(type, payload) {
    try { this.eventBus.publish("SECURITY_EVENT", { type, ...payload }); } catch {}
  }
}

export default IdentityOnboarding;
