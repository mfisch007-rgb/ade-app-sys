/**
 * ADE canonical session-duality authority (PIN step-up).
 *
 * Contract for POST /api/v1/account/pin and POST /api/v1/auth/pin:
 * when issuing 'ade_elevated', DO NOT invalidate or clear the 'ade_token'
 * cookie. Both cookies are maintained together so base claims remain intact
 * across page navigation:
 *   ade_token    → live session token (re-issued as the elevated session;
 *                 never cleared on elevation, SameSite=Lax, httpOnly)
 *   ade_elevated → elevation marker ("1", same lifetime as ade_token)
 *
 * Security note: the *previous base token string* is revoked server-side on
 * step-up (single live token — see founder-elevation-persistence ELEV-PERSIST-5),
 * but the *ade_token cookie itself* is never cleared: it is atomically
 * re-issued with the elevated session in the same response. Clients must
 * inspect BOTH cookies: if 'ade_elevated' is set, render
 * '@FOUNDER · L3 · ELEVATED' and never auto-logout-redirect on page switch.
 */

import { registerIdentityRoutes } from "./identityRoutes.js";

export const SESSION_COOKIE = "ade_token";
export const ELEVATED_COOKIE = "ade_elevated";

export function sessionCookieOpts(expiresIn = null) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: String(process.env.VERCEL_ENV || process.env.NODE_ENV || "").toLowerCase() === "production",
    ...(Number(expiresIn) > 0 ? { maxAge: Math.floor(Number(expiresIn) * 1000) } : {}),
  };
}

/** Dual-cookie issuance: never clears ade_token on elevation. */
export function setDualSessionCookies(res, session, { pinVerified = false } = {}) {
  try {
    const opts = sessionCookieOpts(session?.expiresIn);
    res.cookie(SESSION_COOKIE, session.token, opts);
    if (pinVerified) res.cookie(ELEVATED_COOKIE, "1", opts);
    else res.clearCookie(ELEVATED_COOKIE, { path: "/" });
  } catch {}
}

export function clearDualSessionCookies(res) {
  try {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.clearCookie(ELEVATED_COOKIE, { path: "/" });
  } catch {}
}

export { registerIdentityRoutes };
export default {
  SESSION_COOKIE,
  ELEVATED_COOKIE,
  sessionCookieOpts,
  setDualSessionCookies,
  clearDualSessionCookies,
  registerIdentityRoutes,
};
