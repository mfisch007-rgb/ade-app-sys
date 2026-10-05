/**
 * ADE dual-mode rate limiting for AWBULI + ProCarta endpoints.
 *
 *   GUEST/PUBLIC  → strict IP limiting (5 req/min) with monetization/upgrade
 *                   prompt (429 + tier/upgrade payload + X-RateLimit-* headers).
 *   ADMIN/FOUNDER → bypass public limits completely into UNLIMITED POWER MODE
 *                   (L2/L3: legacy ADMIN bootstrap, or FOUNDER/ADMIN role with
 *                   verified PIN, or level >= 3).
 *
 * Self-verifying: resolves the Bearer/cookie session directly so it works
 * before auth middleware (public ProCarta/AWBULI) as well as after it.
 * Never throws; enforcement is observable via headers + audit-friendly 429s.
 */

import { RateLimiter } from "../security/RateLimiter.js";

export const PUBLIC_MAX = 5;
export const PUBLIC_WINDOW_MS = 60000;

const publicLimiter = new RateLimiter({ max: PUBLIC_MAX, windowMs: PUBLIC_WINDOW_MS });

export function isUnlimited(req, claims = null) {
  try {
    const c = claims || req?.claims || req?.inboxClaims || req?.identity || {};
    const level = Number(c?.level ?? 0);
    const role = String(req?.person?.role || c?.role || c?.metadata?.role || "").toUpperCase();
    const pinVerified = c?.pinVerified === true || c?.metadata?.pinVerified === true;
    const legacy = String(c?.persona || "").toUpperCase() === "ADMIN" && level >= 2;
    if (legacy) return true;
    if (level >= 3) return true;
    if ((role === "FOUNDER" || role === "ADMIN") && level >= 2 && pinVerified) return true;
    if (req?.rbac?.unlimited === true) return true;
    return false;
  } catch {
    return false;
  }
}

export function resolveClaims(req, security = null) {
  let claims = req?.claims || req?.inboxClaims || req?.identity || null;
  if (claims) return claims;
  try {
    const get = typeof req?.get === "function" ? req.get.bind(req) : null;
    const h = get ? String(get("authorization") || "") : String(req?.headers?.authorization || "");
    const tok = h.startsWith("Bearer ")
      ? h.slice(7)
      : req?.cookies?.ade_token || req?.cookies?.ade_elevated || null;
    const sec = security || req?.app?.get?.("adeSecurity") || null;
    if (tok && sec?.identity?.verifySession) {
      try {
        return sec.identity.verifySession(tok);
      } catch {}
    }
    if (tok && globalThis.__adeSecurity?.identity?.verifySession) {
      try {
        return globalThis.__adeSecurity.identity.verifySession(tok);
      } catch {}
    }
  } catch {}
  return null;
}

export function hybridRateLimit(req, res, next) {
  try {
    const claims = resolveClaims(req, req?.app?.get?.("adeSecurity") || globalThis.__adeSecurity || null) || req?.claims || null;
    if (isUnlimited(req, claims)) {
      try {
        res.setHeader("X-RateLimit-Mode", "UNLIMITED");
        res.setHeader("X-RateLimit-Tier", "ADMIN_FOUNDER");
        res.setHeader("X-RateLimit-Power", "UNLIMITED POWER MODE");
      } catch {}
      return next();
    }
  } catch {}
  try {
    if (publicLimiter.attempt(req)) {
      try {
        res.setHeader("X-RateLimit-Mode", "LIMITED");
        res.setHeader("X-RateLimit-Tier", "PUBLIC_GUEST");
      } catch {}
      return next();
    }
  } catch {}
  return res.status(429).json({
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    tier: "PUBLIC_GUEST",
    limit: "5 req/min",
    mode: "LIMITED",
    upgrade: "Upgrade tier or add payment method to raise limits. See /api/v1/payments/availability?tier=PAID&upgrade=1.",
    popup: "MONETIZATION_UPGRADE",
  });
}

export const awbuliRateLimit = hybridRateLimit;
export const procartaRateLimit = hybridRateLimit;

export default {
  hybridRateLimit,
  awbuliRateLimit,
  procartaRateLimit,
  isUnlimited,
  PUBLIC_MAX,
  PUBLIC_WINDOW_MS,
};
