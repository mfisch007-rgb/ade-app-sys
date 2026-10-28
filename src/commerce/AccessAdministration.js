/**
 * Canonical administrative access/tier/trial grants.
 *
 * This is an account-scoped overlay on the existing commercial entitlement
 * lens. EditionPolicy remains the runtime edition authority and PaymentService
 * remains the only authority allowed to grant paid access from a provider
 * transaction. Grants here are explicitly ADMIN_ENTITLEMENT records: they are
 * never presented as a payment and they never mutate PaymentService state.
 */

import crypto from "node:crypto";
import { COMMERCIAL_TIERS } from "./CommercialEntitlement.js";
import { nowIso } from "../capabilities/CapabilityRecord.js";

const SECTION = "accessAdministration";
const DAY_MS = 24 * 60 * 60 * 1000;
const REASON_MIN = 3;

export const ACCESS_PRODUCTS = Object.freeze(["AWBULI", "PROCARTA"]);
export const ACCESS_TIERS = Object.freeze(
  COMMERCIAL_TIERS.filter((t) => ["COMMUNITY", "TRIAL", "PAID", "ENTERPRISE"].includes(t))
);

const POLICIES = Object.freeze({
  FOUNDER: {
    tiers: ACCESS_TIERS,
    trialMaxDays: 30,
    grantMaxDays: 365,
    canRevoke: true,
    ownGrantsOnly: false
  },
  ADMIN: {
    tiers: ["COMMUNITY", "TRIAL", "PAID"],
    trialMaxDays: 15,
    grantMaxDays: 90,
    canRevoke: true,
    ownGrantsOnly: false
  },
  OPERATOR: {
    tiers: ["COMMUNITY", "TRIAL"],
    trialMaxDays: 14,
    grantMaxDays: 30,
    canRevoke: true,
    ownGrantsOnly: true
  }
});

const TIER_RANK = Object.freeze({ COMMUNITY: 0, TRIAL: 1, PAID: 2, ENTERPRISE: 3 });

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export class AccessAdministration {
  #queue = Promise.resolve();

  constructor({ store, eventBus = null } = {}) {
    if (!store) throw new Error("AccessAdministration requires a store.");
    this.store = store;
    this.eventBus = eventBus;
  }

  #audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", {
        category: "ACCESS",
        action,
        at: nowIso(),
        ...fields
      });
    } catch {}
  }

  #assertState(value) {
    if (value === null || value === undefined) {
      return { grants: [], history: [] };
    }
    if (
      typeof value !== "object" ||
      (value.grants !== undefined && !Array.isArray(value.grants)) ||
      (value.history !== undefined && !Array.isArray(value.history))
    ) {
      throw fail("ACCESS_STORE_CORRUPT");
    }
    return {
      grants: Array.isArray(value.grants) ? value.grants : [],
      history: Array.isArray(value.history) ? value.history : []
    };
  }

  async #load() {
    try {
      const value = typeof this.store.readSectionStrictAsync === "function"
        ? await this.store.readSectionStrictAsync(SECTION)
        : this.store.readSection(SECTION);
      return this.#assertState(value);
    } catch (error) {
      if (error?.code === "ACCESS_STORE_CORRUPT") throw error;
      throw fail("ACCESS_STORAGE_UNAVAILABLE");
    }
  }

  async #persist(state) {
    try {
      if (typeof this.store.writeSectionAsync === "function") {
        await this.store.writeSectionAsync(SECTION, state);
      } else if (typeof this.store.writeSection === "function") {
        this.store.writeSection(SECTION, state);
      } else {
        throw new Error("WRITE_UNAVAILABLE");
      }
    } catch {
      throw fail("ACCESS_STORAGE_UNAVAILABLE");
    }
  }

  #serialize(work) {
    const run = this.#queue.then(work, work);
    this.#queue = run.then(() => {}, () => {});
    return run;
  }

  #actor(actor) {
    const role = normalized(actor?.role);
    const policy = POLICIES[role];
    if (!policy) throw fail("INSUFFICIENT_AUTHORIZATION");
    const id = actor?.id != null ? String(actor.id) : null;
    const username = cleanText(actor?.username, 80) || id;
    if (!username) throw fail("APPROVAL_IDENTITY_REQUIRED");
    return { id, username, role, policy };
  }

  #assertReason(reason) {
    const value = cleanText(reason, 500);
    if (value.length < REASON_MIN) throw fail("REASON_REQUIRED");
    return value;
  }

  #assertManage(actor, grant) {
    if (!actor.policy.canRevoke) throw fail("INSUFFICIENT_AUTHORIZATION");
    if (actor.policy.ownGrantsOnly && grant.grantedBy !== actor.username) {
      throw fail("INSUFFICIENT_AUTHORIZATION");
    }
  }

  #decorated(grant) {
    const expired = grant.status === "ACTIVE" && grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now();
    return {
      id: grant.id,
      tenantScope: grant.tenantScope,
      accountId: grant.accountId,
      accountLabel: grant.accountLabel,
      product: grant.product,
      tier: grant.tier,
      source: grant.source,
      via: "ADMIN_ENTITLEMENT",
      status: expired ? "EXPIRED" : grant.status,
      effectiveAt: grant.effectiveAt,
      expiresAt: grant.expiresAt,
      reason: grant.reason,
      grantedBy: grant.grantedBy,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
      revokedAt: grant.revokedAt || null,
      revokedBy: grant.revokedBy || null,
      revokeReason: grant.revokeReason || null,
      paymentReference: null,
      paymentStatus: "NOT_APPLICABLE"
    };
  }

  #event(state, grant, action, actor, reason) {
    state.history = [
      ...state.history,
      {
        id: `ACE-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        grantId: grant.id,
        tenantScope: grant.tenantScope,
        accountId: grant.accountId,
        product: grant.product,
        tier: grant.tier,
        action,
        reason,
        actor: actor.username,
        at: nowIso()
      }
    ].slice(-1000);
  }

  async list({ tenantScope = "default", accountId = null, product = null, status = null, limit = 100 } = {}) {
    const state = await this.#load();
    const scope = String(tenantScope || "default");
    const account = accountId ? String(accountId) : null;
    const prod = product ? normalized(product) : null;
    const wantedStatus = status ? normalized(status) : null;
    const max = Math.min(500, Math.max(1, Number(limit) || 100));
    return state.grants
      .filter((g) => g.tenantScope === scope)
      .filter((g) => !account || g.accountId === account || g.accountLabel === account)
      .filter((g) => !prod || g.product === prod)
      .map((g) => this.#decorated(g))
      .filter((g) => !wantedStatus || g.status === wantedStatus)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, max);
  }

  async effectiveAccess({ tenantScope = "default", accountId, product } = {}) {
    const scope = String(tenantScope || "default");
    const prod = normalized(product);
    if (!ACCESS_PRODUCTS.includes(prod)) throw fail("ACCESS_PRODUCT_INVALID");
    if (!accountId) throw fail("ACCOUNT_REQUIRED");
    const grants = await this.list({ tenantScope: scope, accountId, product: prod, limit: 500 });
    const active = grants
      .filter((g) => g.status === "ACTIVE")
      .sort((a, b) => (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!active.length) {
      return {
        tenantScope: scope,
        accountId: String(accountId),
        product: prod,
        tier: "COMMUNITY",
        source: "EDITION_POLICY",
        via: "EDITION_POLICY",
        status: "ACTIVE",
        grantId: null,
        expiresAt: null
      };
    }
    const grant = active[0];
    return {
      tenantScope: scope,
      accountId: grant.accountId,
      product: prod,
      tier: grant.tier,
      source: grant.source,
      via: "ADMIN_ENTITLEMENT",
      status: "ACTIVE",
      grantId: grant.id,
      expiresAt: grant.expiresAt
    };
  }

  async grant({
    tenantScope = "default",
    account = {},
    product,
    tier,
    days,
    actor,
    reason
  } = {}) {
    return this.#serialize(async () => {
      const principal = this.#actor(actor);
      const why = this.#assertReason(reason);
      const scope = String(tenantScope || "default").slice(0, 80);
      const prod = normalized(product);
      const nextTier = normalized(tier);
      if (!ACCESS_PRODUCTS.includes(prod)) throw fail("ACCESS_PRODUCT_INVALID");
      if (!ACCESS_TIERS.includes(nextTier)) throw fail("ACCESS_TIER_INVALID");
      if (!principal.policy.tiers.includes(nextTier)) throw fail("ACCESS_TIER_NOT_PERMITTED");
      const accountId = String(account?.id || account?.username || "").trim().slice(0, 120);
      const accountLabel = cleanText(account?.username || account?.id, 120);
      if (!accountId) throw fail("ACCOUNT_REQUIRED");
      if (normalized(account?.role) === "FOUNDER") throw fail("FOUNDER_ACCESS_INHERENT");
      if (accountId === principal.id || accountLabel === principal.username) {
        throw fail("SELF_GRANT_FORBIDDEN");
      }
      const windowDays = Number(days);
      const maxDays = nextTier === "TRIAL" ? principal.policy.trialMaxDays : principal.policy.grantMaxDays;
      if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > maxDays) {
        throw fail(nextTier === "TRIAL" ? "TRIAL_WINDOW_INVALID" : "ACCESS_WINDOW_INVALID");
      }
      const at = nowIso();
      const expiresAt = new Date(Date.now() + windowDays * DAY_MS).toISOString();
      const state = await this.#load();
      for (const existing of state.grants) {
        if (
          existing.tenantScope === scope &&
          existing.accountId === accountId &&
          existing.product === prod &&
          existing.status === "ACTIVE"
        ) {
          existing.status = "SUPERSEDED";
          existing.revokedAt = at;
          existing.revokedBy = principal.username;
          existing.revokeReason = "SUPERSEDED_BY_NEW_GRANT";
          existing.updatedAt = at;
          this.#event(state, existing, "SUPERSEDED", principal, "SUPERSEDED_BY_NEW_GRANT");
        }
      }
      const grant = {
        id: `ACC-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        tenantScope: scope,
        accountId,
        accountLabel: accountLabel || accountId,
        product: prod,
        tier: nextTier,
        source: nextTier === "TRIAL" ? "ADMIN_TRIAL" : "ADMIN_ENTITLEMENT",
        status: "ACTIVE",
        effectiveAt: at,
        expiresAt,
        reason: why,
        grantedBy: principal.username,
        createdAt: at,
        updatedAt: at,
        revokedAt: null,
        revokedBy: null,
        revokeReason: null
      };
      state.grants.push(grant);
      this.#event(state, grant, "GRANTED", principal, why);
      await this.#persist(state);
      this.#audit("ACCESS_GRANTED", {
        tenantScope: scope,
        grantId: grant.id,
        accountId,
        product: prod,
        tier: nextTier,
        expiresAt,
        by: principal.username
      });
      return this.#decorated(grant);
    });
  }

  async extend({ tenantScope = "default", grantId, days, actor, reason } = {}) {
    return this.#serialize(async () => {
      const principal = this.#actor(actor);
      const why = this.#assertReason(reason);
      const scope = String(tenantScope || "default");
      const extraDays = Number(days);
      if (!Number.isInteger(extraDays) || extraDays < 1) throw fail("ACCESS_WINDOW_INVALID");
      const state = await this.#load();
      const grant = state.grants.find((g) => g.id === grantId && g.tenantScope === scope);
      if (!grant) throw fail("ACCESS_GRANT_NOT_FOUND");
      if (["REVOKED", "SUPERSEDED"].includes(grant.status)) throw fail("ACCESS_GRANT_NOT_ACTIVE");
      this.#assertManage(principal, grant);
      const maxDays = grant.tier === "TRIAL" ? principal.policy.trialMaxDays : principal.policy.grantMaxDays;
      const now = Date.now();
      const currentlyActive = grant.status === "ACTIVE" && Date.parse(grant.expiresAt) > now;
      const base = currentlyActive ? Date.parse(grant.expiresAt) : now;
      const expiresAtMs = base + extraDays * DAY_MS;
      const windowStart = currentlyActive ? Date.parse(grant.effectiveAt) : now;
      if ((expiresAtMs - windowStart) / DAY_MS > maxDays) {
        throw fail(grant.tier === "TRIAL" ? "TRIAL_WINDOW_EXCEEDED" : "ACCESS_WINDOW_EXCEEDED");
      }
      const at = nowIso();
      if (!currentlyActive) grant.effectiveAt = at;
      grant.status = "ACTIVE";
      grant.expiresAt = new Date(expiresAtMs).toISOString();
      grant.updatedAt = at;
      this.#event(state, grant, "EXTENDED", principal, why);
      await this.#persist(state);
      this.#audit("ACCESS_EXTENDED", {
        tenantScope: scope,
        grantId: grant.id,
        accountId: grant.accountId,
        product: grant.product,
        tier: grant.tier,
        expiresAt: grant.expiresAt,
        by: principal.username
      });
      return this.#decorated(grant);
    });
  }

  async revoke({ tenantScope = "default", grantId, actor, reason } = {}) {
    return this.#serialize(async () => {
      const principal = this.#actor(actor);
      const why = this.#assertReason(reason);
      const scope = String(tenantScope || "default");
      const state = await this.#load();
      const grant = state.grants.find((g) => g.id === grantId && g.tenantScope === scope);
      if (!grant) throw fail("ACCESS_GRANT_NOT_FOUND");
      if (grant.status === "REVOKED") throw fail("ACCESS_GRANT_ALREADY_REVOKED");
      this.#assertManage(principal, grant);
      const at = nowIso();
      grant.status = "REVOKED";
      grant.revokedAt = at;
      grant.revokedBy = principal.username;
      grant.revokeReason = why;
      grant.updatedAt = at;
      this.#event(state, grant, "REVOKED", principal, why);
      await this.#persist(state);
      this.#audit("ACCESS_REVOKED", {
        tenantScope: scope,
        grantId: grant.id,
        accountId: grant.accountId,
        product: grant.product,
        tier: grant.tier,
        by: principal.username
      });
      return this.#decorated(grant);
    });
  }

  async summary({ tenantScope = "default" } = {}) {
    const grants = await this.list({ tenantScope, limit: 500 });
    return {
      total: grants.length,
      active: grants.filter((g) => g.status === "ACTIVE").length,
      trial: grants.filter((g) => g.status === "ACTIVE" && g.tier === "TRIAL").length,
      paid: grants.filter((g) => g.status === "ACTIVE" && g.tier === "PAID").length,
      expired: grants.filter((g) => g.status === "EXPIRED").length,
      revoked: grants.filter((g) => g.status === "REVOKED" || g.status === "SUPERSEDED").length
    };
  }
}

export default AccessAdministration;
