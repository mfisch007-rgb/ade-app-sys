import { verify, sign } from "crypto";
import fs from "fs";
import path from "path";
import KernelEventBus from "../core/EventBus.js";
import KeyManager from "./KeyManager.js";

export const RBAC_MATRIX = {
  LEVEL_0_GUEST: { level: 0, name: "GUEST", allowedIntents: ["PING", "PUBLIC_INFO"] },
  LEVEL_1_COMMUNITY: { level: 1, name: "COMMUNITY", allowedIntents: ["WATCH_ASSET", "TELEMETRY_SSE", "UNIVERSAL_AI_GATEWAY", "OFFLINE_FALLBACK"] },
  LEVEL_2_PRO: { level: 2, name: "PRO", allowedIntents: ["WATCH_ASSET", "TELEMETRY_SSE", "UNIVERSAL_AI_GATEWAY", "OFFLINE_FALLBACK", "MULTI_STREAM", "SIGNAL_ANALYTICS"] },
  LEVEL_3_ENTERPRISE: { level: 3, name: "ENTERPRISE", allowedIntents: ["*"] },
  LEVEL_4_SYSTEM: { level: 4, name: "SYSTEM", allowedIntents: ["*"] }
};

export class CommunityEditionGuard {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.keyManager = KeyManager.getInstance();
    this.defaultTier = process.env.ADE_EDITION || "COMMUNITY";
    this.auditLogPath = path.resolve(process.cwd(), "ade_audit_persistence.json");
    
    this.PUBLIC_KEY = this.keyManager.getPublicKey();
    this.PRIVATE_KEY = this.keyManager.getPrivateKey();

    this.limits = {
      maxConcurrentStreams: 2,
      maxDailyRequests: 500,
      allowedAssets: ["EURUSD", "GBPUSD", "BTCUSD"],
      affiliateVerificationRequired: true,
      unlockedFeatures: ["TELEMETRY_SSE", "UNIVERSAL_AI_GATEWAY", "OFFLINE_FALLBACK"]
    };
    
    this.rateLimitMap = new Map();
    this.dailyUsageCounter = new Map();
    this.activeSessions = new Map();
  }

  static getInstance() {
    if (!global.__communityGuardInstance) {
      global.__communityGuardInstance = new CommunityEditionGuard();
    }
    return global.__communityGuardInstance;
  }

  logAuditEvent(event) {
    const record = {
      timestamp: new Date().toISOString(),
      ...event
    };
    let logs = [];
    if (fs.existsSync(this.auditLogPath)) {
      try {
        logs = JSON.parse(fs.readFileSync(this.auditLogPath, "utf8"));
      } catch (e) {
        logs = [];
      }
    }
    logs.push(record);
    fs.writeFileSync(this.auditLogPath, JSON.stringify(logs, null, 2), "utf8");
    
    this.eventBus.publish("SECURITY_AUDIT_LOG", record);
    return record;
  }

  assertCapabilityAllowed(intentName, userLevel = 1) {
    let tierName = "COMMUNITY";
    if (userLevel === 0) tierName = "GUEST";
    if (userLevel === 2) tierName = "PRO";
    if (userLevel >= 3) tierName = "ENTERPRISE";

    if (userLevel >= 3) {
      this.logAuditEvent({ type: "AUTHORIZATION_GRANTED", intent: intentName, level: userLevel, tier: tierName });
      return true;
    }

    const rbacKey = `LEVEL_${userLevel}_${tierName}`;
    const rbacRole = RBAC_MATRIX[rbacKey] || RBAC_MATRIX.LEVEL_1_COMMUNITY;

    if (!rbacRole.allowedIntents.includes(intentName) && !rbacRole.allowedIntents.includes("*")) {
      this.logAuditEvent({ type: "AUTHORIZATION_DENIED", intent: intentName, level: userLevel, tier: tierName });
      throw new Error(`Intent '${intentName}' is denied for RBAC Level ${userLevel} (${tierName}). Enterprise License Required.`);
    }

    this.logAuditEvent({ type: "AUTHORIZATION_GRANTED", intent: intentName, level: userLevel, tier: tierName });
    return true;
  }

  checkRateLimit(clientId, windowMs = 60000, maxRequests = 100) {
    const now = Date.now();
    const clientData = this.rateLimitMap.get(clientId) || { requests: [] };
    clientData.requests = clientData.requests.filter(timestamp => now - timestamp < windowMs);

    if (clientData.requests.length >= maxRequests) {
      this.logAuditEvent({ type: "RATE_LIMIT_EXCEEDED", clientId, count: clientData.requests.length });
      throw new Error(`Rate limit exceeded (${maxRequests} requests per ${windowMs / 1000}s).`);
    }

    clientData.requests.push(now);
    this.rateLimitMap.set(clientId, clientData);
    return { remaining: maxRequests - clientData.requests.length };
  }

  createSession(clientId, tier = "COMMUNITY", levelOverride = null) {
    const sessionId = `ADE-SESS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let level = 1;
    if (tier === "GUEST") level = 0;
    if (tier === "PRO") level = 2;
    if (tier === "ENTERPRISE") level = 3;
    if (levelOverride !== null) level = levelOverride;

    const sessionData = {
      sessionId,
      clientId,
      tier,
      level,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    };
    this.activeSessions.set(sessionId, sessionData);
    this.logAuditEvent({ type: "SESSION_CREATED", sessionId, clientId, tier, level });
    return sessionData;
  }

  verifySession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error("Invalid or terminated session token.");
    }
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      throw new Error("Session token expired.");
    }
    return session;
  }

  generateLicenseKey(tier = "COMMUNITY", expiresInMs = 86400000, issuer = "ADE-AUTH-SYSTEM") {
    const payload = JSON.stringify({ tier, exp: Date.now() + expiresInMs, issuer });
    const payloadBase64 = Buffer.from(payload).toString("base64");
    const header = tier === "ENTERPRISE" ? `ADE-ENT-${payloadBase64}` : `ADE-COMMUNITY-${payloadBase64}`;
    const signature = sign("SHA256", Buffer.from(payload), this.PRIVATE_KEY).toString("base64");
    return `${header}.${signature}`;
  }

  verifyLicenseKey(rawKey) {
    if (!rawKey || typeof rawKey !== "string" || !rawKey.startsWith("ADE-")) {
      return { valid: false, reason: "Malformed or invalid key prefix." };
    }
    const parts = rawKey.split(".");
    if (parts.length !== 2) {
      return { valid: false, reason: "Unsigned key structure. Cryptographic signature required." };
    }
    try {
      const header = parts[0];
      const signatureRaw = parts[1];
      const payloadRaw = Buffer.from(header.replace(/^ADE-(COMMUNITY|ENT)-/, ""), "base64").toString("utf8");
      const payload = JSON.parse(payloadRaw);

      if (payload.exp && Date.now() > payload.exp) {
        return { valid: false, reason: "License key has expired." };
      }

      const isValidSig = verify("SHA256", Buffer.from(payloadRaw), this.PUBLIC_KEY, Buffer.from(signatureRaw, "base64"));
      if (!isValidSig) {
        return { valid: false, reason: "Cryptographic signature verification failed." };
      }

      const isEnterprise = header.startsWith("ADE-ENT-") || payload.tier === "ENTERPRISE";
      return {
        valid: true,
        tier: isEnterprise ? "ENTERPRISE" : "COMMUNITY",
        issuer: payload.issuer || "ADE-AUTHENTICATOR-SYSTEM",
        limits: isEnterprise ? { maxConcurrentStreams: 999, maxDailyRequests: Infinity } : this.limits
      };
    } catch (e) {
      return { valid: false, reason: "Cryptographic payload execution or parsing failed." };
    }
  }
}

export default CommunityEditionGuard;
