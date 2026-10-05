/**
 * ADE canonical tenant + RBAC hydration middleware.
 *
 * Global contract (all routes, all RBAC levels — Guest, Worker, Admin, Founder):
 *   req.tenantId ALWAYS falls back to
 *   (req.inboxClaims?.tenantId || req.inboxClaims?.tid ||
 *    req.headers['x-tenant-id'] || 'default_tenant')
 * so no handler can throw `CONNECTION_MODES_FAILED: tenantId is not defined`.
 *
 * Storage-layer canonical default remains "default" (see tenantForStore):
 * 'default_tenant' (request canonical) <-> 'default' (storage canonical).
 * Existing persisted records keep resolving; new missing-claim requests get
 * an explicit defined tenant instead of undefined.
 */

export function resolveTenantId(req) {
  try {
    const headerTenant =
      req?.headers?.["x-tenant-id"] ||
      req?.headers?.["X-Tenant-Id"] ||
      req?.headers?.["x-tenantid"] ||
      null;
    const t =
      req?.tenantId ||
      req?.person?.tenantId ||
      req?.claims?.tenantId ||
      req?.claims?.tid ||
      req?.inboxClaims?.tenantId ||
      req?.inboxClaims?.tid ||
      req?.identity?.tenantId ||
      req?.identity?.tid ||
      (headerTenant ? String(headerTenant) : null) ||
      null;
    if (t) return String(t).slice(0, 80);
  } catch {}
  return "default_tenant";
}

export function tenantForStore(tenant) {
  if (tenant === "default_tenant" || tenant === "default") return "default";
  return tenant;
}

function roleOf(req, claims) {
  try {
    return String(
      req?.person?.role || claims?.role || claims?.metadata?.role || ""
    ).toUpperCase();
  } catch {
    return "";
  }
}

/**
 * Global hydration: tenant + lightweight RBAC snapshot. Never throws, never
 * 401s/403s — enforcement stays with the security boundary. Safe to mount
 * before auth so Guest/public requests are hydrated too.
 */
export function tenantExtractionMiddleware(req, _res, next) {
  try {
    if (!req.tenantId) req.tenantId = resolveTenantId(req);
  } catch {
    try {
      req.tenantId = "default_tenant";
    } catch {}
  }
  try {
    if (!req.rbac) {
      const claims = req.claims || req.inboxClaims || req.identity || {};
      const level = Number(claims?.level ?? 0);
      const role = roleOf(req, claims);
      const pinVerified =
        claims?.pinVerified === true || claims?.metadata?.pinVerified === true;
      const legacyAdmin =
        String(claims?.persona || "").toUpperCase() === "ADMIN" && level >= 2;
      const tier = role === "FOUNDER" || role === "ADMIN" ? "ELEVATED" : level >= 1 ? "WORKER" : "GUEST";
      req.rbac = {
        role: role || (level >= 1 ? "WORKER" : "GUEST"),
        level,
        pinVerified,
        legacyAdmin,
        tier,
        tenantId: req.tenantId || "default_tenant",
        unlimited: Boolean(legacyAdmin || level >= 3 || ((role === "FOUNDER" || role === "ADMIN") && level >= 2 && pinVerified)),
      };
    } else if (!req.rbac.tenantId) {
      req.rbac.tenantId = req.tenantId || "default_tenant";
    }
  } catch {}
  try {
    next();
  } catch {}
}

export function rbacHydration(req, _res, next) {
  return tenantExtractionMiddleware(req, _res, next);
}

export default {
  resolveTenantId,
  tenantForStore,
  tenantExtractionMiddleware,
  rbacHydration,
};
