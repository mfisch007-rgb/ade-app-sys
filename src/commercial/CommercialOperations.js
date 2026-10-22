/**
 * ADE COMMERCIAL OPERATIONS (canonical server-side authority)
 *
 * Internal operating capability for commercialising ADE itself. This is NOT a
 * ninth product and NOT a parallel CRM: it composes the existing canonical
 * boundaries only.
 *
 *   - persistence : RuntimeConfigStore sections (writeSection/readSection),
 *                   the same durable/tenant-aware document contract used by
 *                   CaseManager, PartnerRegistry, CustomerRegistry and Inbox.
 *   - events      : the canonical EnterpriseEventBus. Consequential actions
 *                   publish `audit.log.created` (bridged into AuditStore by
 *                   app.js) plus a `commercial.*` domain topic.
 *   - tenancy     : every record carries tenantScope and is filtered through
 *                   the canonical assertTenantVisible governance helper.
 *
 * Invariants enforced here (server-side, never in the UI):
 *   - Stage transitions are validated against an explicit, documented map.
 *   - Revenue is recorded as PROPOSED / INVOICED / COLLECTED / REFUNDED /
 *     CHARGEBACK and never collapsed into one number.
 *   - Partner commission is computed ONLY from COLLECTED funds net of
 *     refunds/chargebacks, never from projected or invoiced revenue.
 *   - Agreements are never executed implicitly; a FOUNDER decision with an
 *     evidence reference is required.
 *   - Commercial decisions are FOUNDER-only.
 *   - Inbound message content is untrusted data: it is sanitised to plain
 *     text, bounded in size, and never interpreted as an instruction.
 */

import crypto from "node:crypto";
import { assertTenantVisible } from "../governance/DataGovernance.js";

/* ------------------------------------------------------------------------- *
 * Constants
 * ------------------------------------------------------------------------- */

export const COMMERCIAL_ROLE_AUTHORITY = Object.freeze({
  FOUNDER: 4,
  ADMIN: 3,
  OPERATOR: 2,
  ANALYST: 1,
  VIEWER: 0
});

export function commercialAuthorityOf(role) {
  return COMMERCIAL_ROLE_AUTHORITY[String(role || "").toUpperCase()] ?? -1;
}

export const OPPORTUNITY_STAGES = Object.freeze([
  "DISCOVERED",
  "QUALIFIED",
  "CONTACTED",
  "RESPONDED",
  "MEETING",
  "PROPOSAL",
  "NEGOTIATION",
  "AGREEMENT",
  "PILOT",
  "PAID_VALIDATED",
  "ONBOARDING",
  "ACTIVE_CUSTOMER",
  "FOLLOW_UP_REQUIRED",
  "PAUSED",
  "DISQUALIFIED",
  "LOST"
]);

export const STAGE_TRANSITIONS = Object.freeze({
  DISCOVERED: ["QUALIFIED", "DISQUALIFIED", "PAUSED"],
  QUALIFIED: ["CONTACTED", "PILOT", "DISQUALIFIED", "PAUSED"],
  CONTACTED: ["RESPONDED", "DISQUALIFIED", "LOST", "PAUSED"],
  RESPONDED: ["MEETING", "PROPOSAL", "FOLLOW_UP_REQUIRED", "LOST", "PAUSED"],
  MEETING: ["PROPOSAL", "FOLLOW_UP_REQUIRED", "LOST", "PAUSED"],
  PROPOSAL: ["NEGOTIATION", "AGREEMENT", "PILOT", "FOLLOW_UP_REQUIRED", "LOST", "PAUSED"],
  NEGOTIATION: ["AGREEMENT", "PROPOSAL", "PILOT", "LOST", "PAUSED"],
  AGREEMENT: ["PILOT", "ONBOARDING", "ACTIVE_CUSTOMER", "LOST", "PAUSED"],
  PILOT: ["PAID_VALIDATED", "ONBOARDING", "ACTIVE_CUSTOMER", "PAUSED", "LOST"],
  PAID_VALIDATED: ["ONBOARDING", "ACTIVE_CUSTOMER", "PAUSED"],
  ONBOARDING: ["ACTIVE_CUSTOMER", "PAUSED"],
  ACTIVE_CUSTOMER: ["PAUSED"],
  FOLLOW_UP_REQUIRED: ["RESPONDED", "MEETING", "PROPOSAL", "PAUSED", "LOST"],
  PAUSED: ["QUALIFIED", "CONTACTED", "PROPOSAL", "PILOT", "ONBOARDING", "ACTIVE_CUSTOMER", "LOST"],
  DISQUALIFIED: [],
  LOST: []
});

export const TERMINAL_STAGES = Object.freeze(["DISQUALIFIED", "LOST"]);

export const ORGANIZATION_TYPES = Object.freeze([
  "PROSPECT",
  "CUSTOMER",
  "VENTURE_STUDIO",
  "INVESTOR",
  "GTM_AGENCY",
  "IMPLEMENTATION_PARTNER",
  "CHANNEL_PARTNER",
  "PARTNER",
  "OTHER"
]);

export const ACTIVITY_TYPES = Object.freeze([
  "OUTREACH",
  "INCOMING_MESSAGE",
  "MEETING",
  "TASK",
  "NOTE",
  "FOLLOW_UP"
]);

export const PROPOSAL_STATUSES = Object.freeze([
  "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"
]);

export const AGREEMENT_STATUSES = Object.freeze([
  "DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"
]);

export const REVENUE_KINDS = Object.freeze([
  "PROPOSED", "INVOICED", "COLLECTED", "REFUNDED", "CHARGEBACK"
]);

export const COST_CATEGORIES = Object.freeze([
  "ACQUISITION", "DELIVERY", "SUPPORT", "OTHER"
]);

export const COMMISSION_STATUSES = Object.freeze([
  "ACCRUED", "DUE", "PAID", "DISPUTED", "REVERSED"
]);

export const DECISION_TYPES = Object.freeze([
  "CONTINUE", "REVISE", "EXPAND", "PAUSE", "STOP"
]);

export const INBOUND_PROVIDERS = Object.freeze([
  "EMAIL", "WHATSAPP", "WEBHOOK", "FORM", "MANUAL", "OTHER"
]);

export const INBOUND_STATUSES = Object.freeze([
  "RECEIVED", "LINKED", "PROCESSED", "DUPLICATE", "FAILED"
]);

const MAX_BODY_CHARS = 20000;
const MAX_TEXT = 2000;

/* ------------------------------------------------------------------------- *
 * Helpers
 * ------------------------------------------------------------------------- */

function fail(code, detail) {
  const error = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  error.code = code;
  return error;
}

function text(value, max = MAX_TEXT) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return s ? s.slice(0, max) : null;
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw fail("DATE_INVALID", String(value));
  return d.toISOString();
}

function isoNow() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function amountMinor(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw fail("AMOUNT_MINOR_INVALID", String(value));
  return n;
}

function currency(value) {
  const c = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw fail("CURRENCY_INVALID", String(value || ""));
  return c;
}

function oneOf(value, allowed, code) {
  const v = String(value || "").trim().toUpperCase();
  if (!allowed.includes(v)) throw fail(code, v || "(empty)");
  return v;
}

function bps(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10000) throw fail("COMMISSION_RATE_INVALID", String(value));
  return n;
}

/**
 * Inbound content is untrusted. Reduce it to bounded plain text: strip
 * scripting/style blocks, then every tag, then control characters. Never
 * decode entities into markup and never evaluate anything.
 */
export function sanitizeInboundBody(value) {
  const raw = String(value ?? "");
  const truncated = raw.length > MAX_BODY_CHARS;
  const clipped = raw.slice(0, MAX_BODY_CHARS);
  const withoutBlocks = clipped
    .replace(/<\s*(script|style|iframe|object|embed|template)[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*(script|style|iframe|object|embed|template)[^>]*>/gi, " ");
  const withoutTags = withoutBlocks.replace(/<[^>]*>/g, " ");
  const plain = withoutTags
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { bodyText: plain.slice(0, MAX_BODY_CHARS), truncated };
}

function requireActor(actor) {
  const name = text(actor?.username || actor?.id, 120);
  if (!name) throw fail("ACTOR_REQUIRED");
  return {
    id: text(actor?.id, 120) || name,
    username: name,
    role: String(actor?.role || "UNKNOWN").toUpperCase()
  };
}

function requireRole(actor, minimum, code = "INSUFFICIENT_AUTHORIZATION") {
  const authority = commercialAuthorityOf(actor?.role);
  if (authority < minimum) throw fail(code, `role '${actor?.role || "UNKNOWN"}'`);
  return authority;
}

function requireFounder(actor, code = "FOUNDER_DECISION_REQUIRED") {
  if (String(actor?.role || "").toUpperCase() !== "FOUNDER") throw fail(code);
  return true;
}

/* ------------------------------------------------------------------------- *
 * Service
 * ------------------------------------------------------------------------- */

const SECTIONS = Object.freeze({
  organizations: "commercial_organizations",
  contacts: "commercial_contacts",
  opportunities: "commercial_opportunities",
  activities: "commercial_activities",
  proposals: "commercial_proposals",
  agreements: "commercial_agreements",
  pilots: "commercial_pilots",
  revenue: "commercial_revenue",
  costs: "commercial_costs",
  commissions: "commercial_commissions",
  decisions: "commercial_decisions",
  inbound: "commercial_inbound"
});

const MAX_PER_SECTION = 5000;

export class CommercialOperations {
  constructor({ store = null, eventBus = null, maxPerSection = MAX_PER_SECTION } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.maxPerSection = maxPerSection;
    this.data = {};
    for (const [key, section] of Object.entries(SECTIONS)) {
      this.data[key] = this._hydrate(section);
    }
  }

  _hydrate(section) {
    try {
      const rows = this.store?.readSection?.(section);
      const list = Array.isArray(rows) ? rows : rows && typeof rows === "object" ? Object.values(rows) : [];
      return list.slice(-this.maxPerSection);
    } catch {
      return [];
    }
  }

  _section(key) {
    return this.data[key];
  }

  _persist(key) {
    try {
      const rows = this.data[key];
      if (rows.length > this.maxPerSection) rows.splice(0, rows.length - this.maxPerSection);
      this.store?.writeSection?.(SECTIONS[key], rows);
    } catch (error) {
      console.warn(`[CommercialOperations] persist ${key} failed: ${error.message}`);
    }
  }

  _audit(action, fields = {}) {
    const payload = { category: "COMMERCIAL", action, at: isoNow(), ...fields };
    try {
      const result = this.eventBus?.publish?.("audit.log.created", payload);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {}
    return payload;
  }

  _emit(topic, payload) {
    try {
      const result = this.eventBus?.publish?.(topic, payload);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {}
  }

  _record(key, record, action, auditFields = {}) {
    this.data[key].push(record);
    this._persist(key);
    this._audit(action, { recordId: record.id, tenantScope: record.tenantScope, ...auditFields });
    return record;
  }

  _find(key, recordId, { tenantScope = "default" } = {}) {
    const record = this.data[key].find((row) => row.id === recordId);
    if (!record) throw fail("NOT_FOUND", recordId);
    assertTenantVisible(record.tenantScope, tenantScope);
    return record;
  }

  _visible(rows, tenantScope) {
    const scope = String(tenantScope || "default");
    return rows.filter((row) => {
      try {
        assertTenantVisible(row.tenantScope, scope);
        return true;
      } catch {
        return false;
      }
    });
  }

  /* ---------------------------------------------------------------- orgs */

  createOrganization({ name, type = "PROSPECT", website = null, country = null, source = "MANUAL", ownerId = null, notes = null, tenantScope = "default", actor } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const label = text(name, 200);
    if (!label) throw fail("ORGANIZATION_NAME_REQUIRED");
    const record = {
      id: id("org"),
      name: label,
      type: oneOf(type, ORGANIZATION_TYPES, "ORGANIZATION_TYPE_INVALID"),
      website: text(website, 300),
      country: text(country, 80),
      source: text(source, 80) || "MANUAL",
      ownerId: text(ownerId, 120),
      notes: text(notes, 2000),
      tenantScope: text(tenantScope, 80) || "default",
      createdBy: who.username,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    this._record("organizations", record, "ORGANIZATION_CREATED", { organizationId: record.id, type: record.type, by: who.username });
    this._emit("commercial.organization.created", { organizationId: record.id, type: record.type, tenantScope: record.tenantScope });
    return { ...record };
  }

  listOrganizations({ tenantScope = "default", type = null, limit = 200 } = {}) {
    const cap = Math.max(1, Math.min(500, Number(limit) || 200));
    return this._visible(this.data.organizations, tenantScope)
      .filter((row) => !type || row.type === String(type).toUpperCase())
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, cap)
      .map((row) => ({ ...row }));
  }

  getOrganization(organizationId, { tenantScope = "default" } = {}) {
    return { ...this._find("organizations", organizationId, { tenantScope }) };
  }

  updateOrganization(organizationId, patch = {}, { tenantScope = "default", actor } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const record = this._find("organizations", organizationId, { tenantScope });
    if (patch.name !== undefined) {
      const label = text(patch.name, 200);
      if (!label) throw fail("ORGANIZATION_NAME_REQUIRED");
      record.name = label;
    }
    if (patch.type !== undefined) record.type = oneOf(patch.type, ORGANIZATION_TYPES, "ORGANIZATION_TYPE_INVALID");
    if (patch.website !== undefined) record.website = text(patch.website, 300);
    if (patch.country !== undefined) record.country = text(patch.country, 80);
    if (patch.ownerId !== undefined) record.ownerId = text(patch.ownerId, 120);
    if (patch.notes !== undefined) record.notes = text(patch.notes, 2000);
    record.updatedAt = isoNow();
    this._persist("organizations");
    this._audit("ORGANIZATION_UPDATED", { organizationId: record.id, by: who.username });
    return { ...record };
  }

  /* ------------------------------------------------------------ contacts */

  createContact({ organizationId, name, role = null, email = null, phone = null, consent = {}, tenantScope = "default", actor } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const org = this._find("organizations", organizationId, { tenantScope });
    const label = text(name, 200);
    if (!label) throw fail("CONTACT_NAME_REQUIRED");
    const emailValue = text(email, 200);
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) throw fail("CONTACT_EMAIL_INVALID");
    const record = {
      id: id("con"),
      organizationId: org.id,
      name: label,
      role: text(role, 120),
      email: emailValue,
      phone: text(phone, 40),
      consent: {
        email: consent?.email === true,
        whatsapp: consent?.whatsapp === true,
        recordedAt: consent?.email === true || consent?.whatsapp === true ? isoNow() : null
      },
      tenantScope: org.tenantScope,
      createdBy: who.username,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    this._record("contacts", record, "CONTACT_CREATED", { contactId: record.id, organizationId: org.id, by: who.username });
    return { ...record };
  }

  listContacts({ organizationId = null, tenantScope = "default", limit = 200 } = {}) {
    const cap = Math.max(1, Math.min(500, Number(limit) || 200));
    return this._visible(this.data.contacts, tenantScope)
      .filter((row) => !organizationId || row.organizationId === organizationId)
      .slice(0, cap)
      .map((row) => ({ ...row }));
  }

  /* ------------------------------------------------------- opportunities */

  createOpportunity({
    organizationId,
    contactId = null,
    title,
    product = null,
    source = "MANUAL",
    attribution = null,
    ownerId = null,
    useCase = null,
    currency: currencyCode = null,
    proposedMinor = null,
    stage = "DISCOVERED",
    nextAction = null,
    followUpDueAt = null,
    tenantScope = "default",
    actor
  } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const org = this._find("organizations", organizationId, { tenantScope });
    const label = text(title, 200);
    if (!label) throw fail("OPPORTUNITY_TITLE_REQUIRED");
    const initialStage = oneOf(stage, OPPORTUNITY_STAGES, "OPPORTUNITY_STAGE_INVALID");
    if (initialStage !== "DISCOVERED") throw fail("OPPORTUNITY_STAGE_START_INVALID", initialStage);
    if (proposedMinor !== null && proposedMinor !== undefined && !currencyCode) throw fail("CURRENCY_REQUIRED");
    if (contactId) this._find("contacts", contactId, { tenantScope: org.tenantScope });
    const now = isoNow();
    const record = {
      id: id("opp"),
      organizationId: org.id,
      contactId: contactId || null,
      title: label,
      product: text(product, 80),
      source: text(source, 80) || "MANUAL",
      attribution: text(attribution, 200),
      ownerId: text(ownerId, 120),
      useCase: text(useCase, 2000),
      stage: initialStage,
      stageHistory: [{ from: null, to: initialStage, actor: who.username, reason: "CREATED", at: now }],
      currency: currencyCode ? currency(currencyCode) : null,
      proposedMinor: proposedMinor === null || proposedMinor === undefined ? null : amountMinor(proposedMinor),
      nextAction: text(nextAction, 500),
      followUpDueAt: isoOrNull(followUpDueAt),
      lastInteractionAt: null,
      tenantScope: org.tenantScope,
      createdBy: who.username,
      createdAt: now,
      updatedAt: now
    };
    this._record("opportunities", record, "OPPORTUNITY_CREATED", { opportunityId: record.id, organizationId: org.id, stage: record.stage, by: who.username });
    this._emit("commercial.opportunity.created", { opportunityId: record.id, organizationId: org.id, stage: record.stage, tenantScope: record.tenantScope });
    return { ...record };
  }

  listOpportunities({ tenantScope = "default", stage = null, organizationId = null, limit = 200 } = {}) {
    const cap = Math.max(1, Math.min(500, Number(limit) || 200));
    return this._visible(this.data.opportunities, tenantScope)
      .filter((row) => !stage || row.stage === String(stage).toUpperCase())
      .filter((row) => !organizationId || row.organizationId === organizationId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, cap)
      .map((row) => ({ ...row, stageHistory: [...(row.stageHistory || [])] }));
  }

  getOpportunity(opportunityId, { tenantScope = "default" } = {}) {
    const row = this._find("opportunities", opportunityId, { tenantScope });
    return { ...row, stageHistory: [...(row.stageHistory || [])] };
  }

  updateOpportunity(opportunityId, patch = {}, { tenantScope = "default", actor } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const record = this._find("opportunities", opportunityId, { tenantScope });
    if (patch.title !== undefined) {
      const label = text(patch.title, 200);
      if (!label) throw fail("OPPORTUNITY_TITLE_REQUIRED");
      record.title = label;
    }
    if (patch.product !== undefined) record.product = text(patch.product, 80);
    if (patch.ownerId !== undefined) record.ownerId = text(patch.ownerId, 120);
    if (patch.useCase !== undefined) record.useCase = text(patch.useCase, 2000);
    if (patch.nextAction !== undefined) record.nextAction = text(patch.nextAction, 500);
    if (patch.followUpDueAt !== undefined) record.followUpDueAt = isoOrNull(patch.followUpDueAt);
    if (patch.attribution !== undefined) record.attribution = text(patch.attribution, 200);
    if (patch.currency !== undefined) record.currency = currency(patch.currency);
    if (patch.proposedMinor !== undefined) record.proposedMinor = amountMinor(patch.proposedMinor);
    record.updatedAt = isoNow();
    this._persist("opportunities");
    this._audit("OPPORTUNITY_UPDATED", { opportunityId: record.id, by: who.username });
    return { ...record, stageHistory: [...(record.stageHistory || [])] };
  }

  transitionOpportunity(opportunityId, toStage, { reason = "", evidenceRef = null, tenantScope = "default", actor } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const record = this._find("opportunities", opportunityId, { tenantScope });
    const target = oneOf(toStage, OPPORTUNITY_STAGES, "OPPORTUNITY_STAGE_INVALID");
    const allowed = STAGE_TRANSITIONS[record.stage] || [];
    if (!allowed.includes(target)) {
      throw fail("OPPORTUNITY_TRANSITION_FORBIDDEN", `${record.stage} -> ${target}`);
    }
    if (TERMINAL_STAGES.includes(target) && !text(reason, 500)) {
      throw fail("OPPORTUNITY_TERMINAL_REASON_REQUIRED", target);
    }
    const from = record.stage;
    const at = isoNow();
    record.stage = target;
    record.updatedAt = at;
    record.lastInteractionAt = at;
    record.stageHistory = [...(record.stageHistory || []), { from, to: target, actor: who.username, reason: text(reason, 500) || null, evidenceRef: text(evidenceRef, 300), at }].slice(-100);
    this._persist("opportunities");
    this._audit("OPPORTUNITY_TRANSITIONED", { opportunityId: record.id, from, to: target, by: who.username, evidenceRef: text(evidenceRef, 300) });
    this._emit("commercial.opportunity.transitioned", { opportunityId: record.id, from, to: target, tenantScope: record.tenantScope });
    return { ...record, stageHistory: [...record.stageHistory] };
  }

  /* ------------------------------------------------------------ activities */

  recordActivity({ opportunityId, type, subject, notes = null, dueAt = null, completedAt = null, outcome = null, actor, tenantScope = "default", actorOverride } = {}) {
    const who = requireActor(actor || actorOverride);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.ANALYST);
    const opportunity = this._find("opportunities", opportunityId, { tenantScope });
    const record = {
      id: id("act"),
      opportunityId: opportunity.id,
      organizationId: opportunity.organizationId,
      type: oneOf(type, ACTIVITY_TYPES, "ACTIVITY_TYPE_INVALID"),
      subject: text(subject, 300),
      notes: text(notes, 4000),
      dueAt: isoOrNull(dueAt),
      completedAt: isoOrNull(completedAt),
      outcome: text(outcome, 500),
      tenantScope: opportunity.tenantScope,
      createdBy: who.username,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    if (!record.subject) throw fail("ACTIVITY_SUBJECT_REQUIRED");
    opportunity.lastInteractionAt = record.createdAt;
    opportunity.updatedAt = record.createdAt;
    this._persist("opportunities");
    this._record("activities", record, "ACTIVITY_RECORDED", { activityId: record.id, opportunityId: opportunity.id, type: record.type, by: who.username });
    this._emit("commercial.activity.recorded", { activityId: record.id, opportunityId: opportunity.id, type: record.type, tenantScope: record.tenantScope });
    return { ...record };
  }

  listActivities({ opportunityId = null, tenantScope = "default", type = null, limit = 200 } = {}) {
    const cap = Math.max(1, Math.min(500, Number(limit) || 200));
    return this._visible(this.data.activities, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .filter((row) => !type || row.type === String(type).toUpperCase())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, cap)
      .map((row) => ({ ...row }));
  }

  /* ------------------------------------------------------------- proposals */

  createProposal({ opportunityId, title, amountMinor: value, currency: code, scope = null, validUntil = null, actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const opportunity = this._find("opportunities", opportunityId, { tenantScope });
    const label = text(title, 200);
    if (!label) throw fail("PROPOSAL_TITLE_REQUIRED");
    const record = {
      id: id("prp"),
      opportunityId: opportunity.id,
      organizationId: opportunity.organizationId,
      title: label,
      amountMinor: amountMinor(value),
      currency: currency(code),
      scope: text(scope, 2000),
      validUntil: isoOrNull(validUntil),
      status: "DRAFT",
      statusHistory: [{ from: null, to: "DRAFT", actor: who.username, at: isoNow() }],
      tenantScope: opportunity.tenantScope,
      createdBy: who.username,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    if (record.amountMinor === null) throw fail("PROPOSAL_AMOUNT_REQUIRED");
    this._record("proposals", record, "PROPOSAL_CREATED", { proposalId: record.id, opportunityId: opportunity.id, by: who.username });
    this._emit("commercial.proposal.created", { proposalId: record.id, opportunityId: opportunity.id, tenantScope: record.tenantScope });
    return { ...record };
  }

  setProposalStatus(proposalId, status, { reason = "", actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const record = this._find("proposals", proposalId, { tenantScope });
    const target = oneOf(status, PROPOSAL_STATUSES, "PROPOSAL_STATUS_INVALID");
    const allowed = {
      DRAFT: ["SENT", "WITHDRAWN"],
      SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"],
      ACCEPTED: [],
      REJECTED: [],
      EXPIRED: [],
      WITHDRAWN: []
    }[record.status] || [];
    if (!allowed.includes(target)) throw fail("PROPOSAL_STATUS_FORBIDDEN", `${record.status} -> ${target}`);
    const from = record.status;
    record.status = target;
    record.updatedAt = isoNow();
    record.statusHistory = [...(record.statusHistory || []), { from, to: target, actor: who.username, reason: text(reason, 500), at: record.updatedAt }].slice(-50);
    this._persist("proposals");
    this._audit("PROPOSAL_STATUS_CHANGED", { proposalId: record.id, from, to: target, by: who.username });
    return { ...record };
  }

  listProposals({ opportunityId = null, tenantScope = "default", limit = 200 } = {}) {
    return this._visible(this.data.proposals, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map((row) => ({ ...row }));
  }

  /* ------------------------------------------------------------ agreements */

  createAgreement({
    opportunityId = null,
    partnerOrganizationId = null,
    type = "CUSTOMER",
    scope = null,
    currency: code,
    commissionRateBps = 0,
    commissionFixedMinor = 0,
    commissionBase = "COLLECTED",
    effectiveFrom = null,
    expiresAt = null,
    actor,
    tenantScope = "default"
  } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.ADMIN);
    const opportunity = opportunityId ? this._find("opportunities", opportunityId, { tenantScope }) : null;
    if (partnerOrganizationId) this._find("organizations", partnerOrganizationId, { tenantScope });
    const base = oneOf(commissionBase, ["COLLECTED"], "COMMISSION_BASE_UNSUPPORTED");
    const record = {
      id: id("agr"),
      opportunityId: opportunity?.id || null,
      partnerOrganizationId: partnerOrganizationId || null,
      type: oneOf(type, ["CUSTOMER", "PARTNER", "REFERRAL", "RESELLER"], "AGREEMENT_TYPE_INVALID"),
      scope: text(scope, 2000),
      currency: currency(code),
      commissionRateBps: bps(commissionRateBps),
      commissionFixedMinor: amountMinor(commissionFixedMinor) || 0,
      commissionBase: base,
      status: "DRAFT",
      statusHistory: [{ from: null, to: "DRAFT", actor: who.username, at: isoNow() }],
      approvedBy: null,
      approvedAt: null,
      approvalEvidenceRef: null,
      effectiveFrom: isoOrNull(effectiveFrom),
      expiresAt: isoOrNull(expiresAt),
      tenantScope: opportunity?.tenantScope || text(tenantScope, 80) || "default",
      createdBy: who.username,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    this._record("agreements", record, "AGREEMENT_CREATED", { agreementId: record.id, opportunityId: record.opportunityId, by: who.username });
    this._emit("commercial.agreement.created", { agreementId: record.id, tenantScope: record.tenantScope });
    return { ...record };
  }

  /**
   * The ONLY path that can make an agreement executable. Requires a FOUNDER
   * actor and a verifiable evidence reference. A draft or unsigned agreement
   * is never treated as executed.
   */
  approveAgreement(agreementId, { decision = "APPROVE", evidenceRef, note = "", actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireFounder(who);
    const record = this._find("agreements", agreementId, { tenantScope });
    const evidence = text(evidenceRef, 500);
    if (!evidence) throw fail("AGREEMENT_EVIDENCE_REQUIRED");
    const verdict = oneOf(decision, ["APPROVE", "REJECT"], "AGREEMENT_DECISION_INVALID");
    if (record.approvedAt) throw fail("AGREEMENT_ALREADY_DECIDED", record.status);
    const at = isoNow();
    if (verdict === "APPROVE") {
      record.status = "ACTIVE";
      record.statusHistory.push({ from: "DRAFT", to: "ACTIVE", actor: who.username, reason: text(note, 500), evidenceRef: evidence, at });
    } else {
      record.status = "TERMINATED";
      record.statusHistory.push({ from: "DRAFT", to: "TERMINATED", actor: who.username, reason: text(note, 500), evidenceRef: evidence, at });
    }
    record.approvedBy = who.username;
    record.approvedAt = at;
    record.approvalEvidenceRef = evidence;
    record.updatedAt = at;
    this._persist("agreements");
    this._audit(verdict === "APPROVE" ? "AGREEMENT_APPROVED" : "AGREEMENT_REJECTED", { agreementId: record.id, by: who.username, evidenceRef: evidence, decision: verdict });
    this._emit("commercial.agreement.approved", { agreementId: record.id, decision: verdict, tenantScope: record.tenantScope });
    return { ...record };
  }

  listAgreements({ opportunityId = null, tenantScope = "default", limit = 200 } = {}) {
    return this._visible(this.data.agreements, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map((row) => ({ ...row }));
  }

  /* ---------------------------------------------------------------- pilots */

  createPilot({
    opportunityId,
    product,
    scope = null,
    ownerId = null,
    startAt = null,
    endAt = null,
    acceptanceCriteria = [],
    paid = false,
    currency: code = null,
    amountMinor: value = null,
    actor,
    tenantScope = "default"
  } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const opportunity = this._find("opportunities", opportunityId, { tenantScope });
    const productName = text(product, 80);
    if (!productName) throw fail("PILOT_PRODUCT_REQUIRED");
    const criteria = (Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [])
      .map((row) => text(row, 300))
      .filter(Boolean)
      .slice(0, 20);
    if (criteria.length === 0) throw fail("PILOT_ACCEPTANCE_CRITERIA_REQUIRED");
    const amount = amountMinor(value);
    if (amount !== null && !code) throw fail("CURRENCY_REQUIRED");
    const record = {
      id: id("plt"),
      opportunityId: opportunity.id,
      organizationId: opportunity.organizationId,
      product: productName,
      scope: text(scope, 2000),
      ownerId: text(ownerId, 120),
      startAt: isoOrNull(startAt),
      endAt: isoOrNull(endAt),
      acceptanceCriteria: criteria,
      paid: paid === true,
      currency: code ? currency(code) : null,
      amountMinor: amount,
      status: "PLANNED",
      milestones: [],
      tenantScope: opportunity.tenantScope,
      createdBy: who.username,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    this._record("pilots", record, "PILOT_CREATED", { pilotId: record.id, opportunityId: opportunity.id, by: who.username });
    this._emit("commercial.pilot.created", { pilotId: record.id, opportunityId: opportunity.id, tenantScope: record.tenantScope });
    return { ...record, milestones: [] };
  }

  addMilestone(pilotId, { title, dueAt = null, evidenceRef = null, actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const pilot = this._find("pilots", pilotId, { tenantScope });
    const label = text(title, 300);
    if (!label) throw fail("MILESTONE_TITLE_REQUIRED");
    pilot.milestones.push({
      id: id("mil"),
      title: label,
      dueAt: isoOrNull(dueAt),
      status: "PENDING",
      evidenceRef: text(evidenceRef, 500),
      updatedAt: isoNow()
    });
    pilot.updatedAt = isoNow();
    this._persist("pilots");
    this._audit("PILOT_MILESTONE_ADDED", { pilotId: pilot.id, by: who.username });
    return { ...pilot, milestones: pilot.milestones.map((m) => ({ ...m })) };
  }

  setMilestoneStatus(pilotId, milestoneId, status, { evidenceRef = null, actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.OPERATOR);
    const pilot = this._find("pilots", pilotId, { tenantScope });
    const milestone = pilot.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw fail("MILESTONE_NOT_FOUND", milestoneId);
    const target = oneOf(status, ["PENDING", "MET", "MISSED"], "MILESTONE_STATUS_INVALID");
    if (target === "MET" && !text(evidenceRef, 500) && !milestone.evidenceRef) {
      throw fail("MILESTONE_EVIDENCE_REQUIRED");
    }
    milestone.status = target;
    milestone.evidenceRef = text(evidenceRef, 500) || milestone.evidenceRef;
    milestone.updatedAt = isoNow();
    pilot.updatedAt = milestone.updatedAt;
    this._persist("pilots");
    this._audit("PILOT_MILESTONE_UPDATED", { pilotId: pilot.id, milestoneId, status: target, by: who.username });
    return { ...pilot, milestones: pilot.milestones.map((m) => ({ ...m })) };
  }

  listPilots({ opportunityId = null, tenantScope = "default", limit = 200 } = {}) {
    return this._visible(this.data.pilots, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map((row) => ({ ...row, milestones: (row.milestones || []).map((m) => ({ ...m })) }));
  }

  /**
   * Evidence-based recommendation. Returns INSUFFICIENT_DATA when the recorded
   * evidence cannot support a recommendation — it never invents demand.
   * This is advisory only; the decision remains an explicit FOUNDER action.
   */
  pilotRecommendation(pilotId, { tenantScope = "default" } = {}) {
    const pilot = this._find("pilots", pilotId, { tenantScope });
    const revenue = this.data.revenue.filter((r) => r.opportunityId === pilot.opportunityId);
    const collected = revenue.filter((r) => r.kind === "COLLECTED").reduce((sum, r) => sum + r.amountMinor, 0);
    const refunded = revenue.filter((r) => r.kind === "REFUNDED" || r.kind === "CHARGEBACK").reduce((sum, r) => sum + r.amountMinor, 0);
    const met = pilot.milestones.filter((m) => m.status === "MET").length;
    const missed = pilot.milestones.filter((m) => m.status === "MISSED").length;
    const total = pilot.milestones.length;
    const basis = [];
    basis.push({ indicator: "MILESTONES_MET", value: met, of: total });
    basis.push({ indicator: "MILESTONES_MISSED", value: missed, of: total });
    basis.push({ indicator: "COLLECTED_MINOR", value: Math.max(0, collected - refunded), currency: pilot.currency });
    const feedback = this.data.activities.filter((a) => a.opportunityId === pilot.opportunityId && a.type === "INCOMING_MESSAGE").length;
    basis.push({ indicator: "RECORDED_FEEDBACK", value: feedback });

    const evidenceGaps = [];
    if (total === 0) evidenceGaps.push("NO_MILESTONES");
    if (collected <= 0) evidenceGaps.push("NO_COLLECTED_REVENUE");
    if (feedback === 0) evidenceGaps.push("NO_CUSTOMER_FEEDBACK");
    if (!pilot.startAt || !pilot.endAt) evidenceGaps.push("PILOT_WINDOW_INCOMPLETE");

    let recommendation = "INSUFFICIENT_DATA";
    if (total > 0) {
      if (missed > 0 && met === 0) recommendation = "STOP";
      else if (total > 0 && met === total && collected - refunded > 0) recommendation = "EXPAND";
      else if (met > 0) recommendation = "CONTINUE";
      else recommendation = "REVISE";
    }
    return {
      pilotId: pilot.id,
      opportunityId: pilot.opportunityId,
      recommendation,
      basis,
      evidenceGaps,
      insufficientData: recommendation === "INSUFFICIENT_DATA",
      advisoryOnly: true,
      decidedBy: null
    };
  }

  /* -------------------------------------------------------------- revenue */

  recordRevenue({
    opportunityId = null,
    agreementId = null,
    kind,
    amountMinor: value,
    currency: code,
    reference = null,
    evidenceRef = null,
    occurredAt = null,
    actor,
    tenantScope = "default"
  } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.ADMIN);
    if (who.role !== "FOUNDER" && String(actor?.pinVerified) !== "true") {
      // Finance records require an elevated session for non-Founders.
      if (actor?.pinVerified !== true) throw fail("ELEVATED_PIN_REQUIRED");
    }
    const type = oneOf(kind, REVENUE_KINDS, "REVENUE_KIND_INVALID");
    const amount = amountMinor(value);
    if (amount === null || amount <= 0) throw fail("REVENUE_AMOUNT_REQUIRED");
    const opportunity = opportunityId ? this._find("opportunities", opportunityId, { tenantScope }) : null;
    const agreement = agreementId ? this._find("agreements", agreementId, { tenantScope }) : null;
    if (!opportunity && !agreement) throw fail("REVENUE_SUBJECT_REQUIRED");
    if (type === "COLLECTED" && !text(evidenceRef, 500)) throw fail("COLLECTED_EVIDENCE_REQUIRED");
    if (type === "COLLECTED" && !text(reference, 200)) throw fail("COLLECTED_REFERENCE_REQUIRED");
    const record = {
      id: id("rev"),
      opportunityId: opportunity?.id || agreement?.opportunityId || null,
      agreementId: agreement?.id || null,
      kind: type,
      amountMinor: amount,
      currency: currency(code),
      reference: text(reference, 200),
      evidenceRef: text(evidenceRef, 500),
      occurredAt: isoOrNull(occurredAt) || isoNow(),
      tenantScope: opportunity?.tenantScope || agreement?.tenantScope || text(tenantScope, 80) || "default",
      recordedBy: who.username,
      createdAt: isoNow()
    };
    this._record("revenue", record, "REVENUE_RECORDED", { revenueId: record.id, kind: type, amountMinor: amount, opportunityId: record.opportunityId, by: who.username });
    this._emit("commercial.revenue.recorded", { revenueId: record.id, kind: type, opportunityId: record.opportunityId, tenantScope: record.tenantScope });
    return { ...record };
  }

  listRevenue({ opportunityId = null, agreementId = null, tenantScope = "default", limit = 500 } = {}) {
    return this._visible(this.data.revenue, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .filter((row) => !agreementId || row.agreementId === agreementId)
      .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
      .slice(-Math.max(1, Math.min(2000, Number(limit) || 500)))
      .map((row) => ({ ...row }));
  }

  /* ---------------------------------------------------------------- costs */

  recordCost({
    opportunityId = null,
    category,
    amountMinor: value,
    currency: code,
    evidenceRef = null,
    note = null,
    occurredAt = null,
    actor,
    tenantScope = "default"
  } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.ADMIN);
    if (who.role !== "FOUNDER" && actor?.pinVerified !== true) throw fail("ELEVATED_PIN_REQUIRED");
    const opportunity = opportunityId ? this._find("opportunities", opportunityId, { tenantScope }) : null;
    const amount = amountMinor(value);
    if (amount === null || amount <= 0) throw fail("COST_AMOUNT_REQUIRED");
    const record = {
      id: id("cost"),
      opportunityId: opportunity?.id || null,
      category: oneOf(category, COST_CATEGORIES, "COST_CATEGORY_INVALID"),
      amountMinor: amount,
      currency: currency(code),
      evidenceRef: text(evidenceRef, 500),
      note: text(note, 1000),
      occurredAt: isoOrNull(occurredAt) || isoNow(),
      tenantScope: opportunity?.tenantScope || text(tenantScope, 80) || "default",
      recordedBy: who.username,
      createdAt: isoNow()
    };
    this._record("costs", record, "COST_RECORDED", { costId: record.id, category: record.category, amountMinor: amount, by: who.username });
    return { ...record };
  }

  listCosts({ opportunityId = null, tenantScope = "default", limit = 500 } = {}) {
    return this._visible(this.data.costs, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
      .slice(-Math.max(1, Math.min(2000, Number(limit) || 500)))
      .map((row) => ({ ...row }));
  }

  /* ----------------------------------------------------------- commissions */

  /**
   * Commission is derived from COLLECTED money only, net of refunds and
   * chargebacks. Idempotent per agreement: recomputation updates the single
   * ACCRUED commission instead of creating duplicates.
   */
  computeCommission(agreementId, { actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.ADMIN);
    const agreement = this._find("agreements", agreementId, { tenantScope });
    if (agreement.commissionBase !== "COLLECTED") throw fail("COMMISSION_BASE_UNSUPPORTED");
    if (!agreement.approvedAt) throw fail("AGREEMENT_NOT_EXECUTED");
    const rows = this.data.revenue.filter((r) => r.agreementId === agreement.id);
    const collected = rows.filter((r) => r.kind === "COLLECTED").reduce((s, r) => s + r.amountMinor, 0);
    const reversals = rows.filter((r) => r.kind === "REFUNDED" || r.kind === "CHARGEBACK").reduce((s, r) => s + r.amountMinor, 0);
    const base = Math.max(0, collected - reversals);
    const computed = Math.round((base * agreement.commissionRateBps) / 10000) + agreement.commissionFixedMinor;

    const existing = this.data.commissions.find((c) => c.agreementId === agreement.id);
    if (existing && existing.status !== "ACCRUED") {
      throw fail("COMMISSION_ALREADY_SETTLED", existing.status);
    }
    const record = existing || {
      id: id("com"),
      agreementId: agreement.id,
      partnerOrganizationId: agreement.partnerOrganizationId,
      currency: agreement.currency,
      status: "ACCRUED",
      createdAt: isoNow()
    };
    record.basis = "COLLECTED";
    record.collectedMinor = collected;
    record.reversalsMinor = reversals;
    record.commissionBaseMinor = base;
    record.rateBps = agreement.commissionRateBps;
    record.fixedMinor = agreement.commissionFixedMinor;
    record.amountMinor = computed;
    record.computedAt = isoNow();
    record.computedBy = who.username;
    record.updatedAt = record.computedAt;
    if (!existing) this.data.commissions.push(record);
    this._persist("commissions");
    this._audit("COMMISSION_COMPUTED", { commissionId: record.id, agreementId: agreement.id, amountMinor: computed, collectedMinor: collected, by: who.username });
    this._emit("commercial.commission.accrued", { commissionId: record.id, agreementId: agreement.id, amountMinor: computed, tenantScope: record.tenantScope });
    return { ...record };
  }

  settleCommission(commissionId, { settlementRef, evidenceRef = null, actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireFounder(who, "FOUNDER_SETTLEMENT_REQUIRED");
    const record = this._find("commissions", commissionId, { tenantScope });
    if (record.status === "PAID") throw fail("COMMISSION_ALREADY_PAID");
    if (record.status === "REVERSED") throw fail("COMMISSION_REVERSED");
    const ref = text(settlementRef, 200);
    if (!ref) throw fail("SETTLEMENT_REFERENCE_REQUIRED");
    record.status = "PAID";
    record.settlementRef = ref;
    record.settlementEvidenceRef = text(evidenceRef, 500);
    record.settledBy = who.username;
    record.settledAt = isoNow();
    record.updatedAt = record.settledAt;
    this._persist("commissions");
    this._audit("COMMISSION_SETTLED", { commissionId: record.id, agreementId: record.agreementId, amountMinor: record.amountMinor, by: who.username });
    this._emit("commercial.commission.settled", { commissionId: record.id, amountMinor: record.amountMinor, tenantScope: record.tenantScope });
    return { ...record };
  }

  listCommissions({ tenantScope = "default", agreementId = null, limit = 200 } = {}) {
    return this._visible(this.data.commissions, tenantScope)
      .filter((row) => !agreementId || row.agreementId === agreementId)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map((row) => ({ ...row }));
  }

  /* ------------------------------------------------------------ decisions */

  recordDecision({ opportunityId = null, pilotId = null, decision, rationale, evidence = [], reviewAt = null, actor, tenantScope = "default" } = {}) {
    const who = requireActor(actor);
    requireFounder(who);
    const type = oneOf(decision, DECISION_TYPES, "DECISION_TYPE_INVALID");
    const reason = text(rationale, 2000);
    if (!reason) throw fail("DECISION_RATIONALE_REQUIRED");
    const evidenceRefs = (Array.isArray(evidence) ? evidence : []).map((e) => text(e, 500)).filter(Boolean).slice(0, 20);
    if (evidenceRefs.length === 0) throw fail("DECISION_EVIDENCE_REQUIRED");
    if (!opportunityId && !pilotId) throw fail("DECISION_SUBJECT_REQUIRED");
    let subject;
    if (pilotId) subject = this._find("pilots", pilotId, { tenantScope });
    else subject = this._find("opportunities", opportunityId, { tenantScope });
    const record = {
      id: id("dec"),
      opportunityId: opportunityId || subject.opportunityId || null,
      pilotId: pilotId || null,
      decision: type,
      rationale: reason,
      evidence: evidenceRefs,
      reviewAt: isoOrNull(reviewAt),
      decidedBy: who.username,
      decidedAt: isoNow(),
      tenantScope: subject.tenantScope
    };
    this._record("decisions", record, "DECISION_RECORDED", { decisionId: record.id, decision: type, opportunityId: record.opportunityId, by: who.username });
    this._emit("commercial.decision.recorded", { decisionId: record.id, decision: type, opportunityId: record.opportunityId, tenantScope: record.tenantScope });
    return { ...record };
  }

  listDecisions({ opportunityId = null, tenantScope = "default", limit = 100 } = {}) {
    return this._visible(this.data.decisions, tenantScope)
      .filter((row) => !opportunityId || row.opportunityId === opportunityId)
      .sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
      .map((row) => ({ ...row }));
  }

  /* -------------------------------------------------------------- inbound */

  /**
   * Provider-neutral inbound message ingestion. Idempotent on
   * provider+providerMessageId. Body is sanitised to bounded plain text and
   * never treated as an instruction.
   */
  ingestInbound({
    provider,
    providerMessageId,
    sender = null,
    recipient = null,
    subject = null,
    body = "",
    receivedAt = null,
    linkUrl = null,
    tenantScope = "default"
  } = {}) {
    const providerName = oneOf(provider, INBOUND_PROVIDERS, "INBOUND_PROVIDER_INVALID");
    const messageId = text(providerMessageId, 200);
    if (!messageId) throw fail("INBOUND_MESSAGE_ID_REQUIRED");
    const existing = this.data.inbound.find((row) => row.provider === providerName && row.providerMessageId === messageId);
    if (existing) {
      this._audit("INBOUND_DUPLICATE_SUPPRESSED", { inboundId: existing.id, provider: providerName });
      return { duplicate: true, message: { ...existing } };
    }
    const scope = text(tenantScope, 80) || "default";
    const sanitized = sanitizeInboundBody(body);
    const record = {
      id: id("inb"),
      provider: providerName,
      providerMessageId: messageId,
      sender: text(sender, 200),
      recipient: text(recipient, 200),
      subject: text(subject, 300),
      bodyText: sanitized.bodyText,
      bodyTruncated: sanitized.truncated,
      linkUrl: /^https?:\/\//i.test(String(linkUrl || "")) ? text(linkUrl, 800) : null,
      receivedAt: isoOrNull(receivedAt) || isoNow(),
      status: "RECEIVED",
      opportunityId: null,
      assignedTo: null,
      processedBy: null,
      processedAt: null,
      treatAsDataOnly: true,
      tenantScope: scope
    };
    this._record("inbound", record, "INBOUND_RECEIVED", { inboundId: record.id, provider: providerName, tenantScope: scope });
    this._emit("commercial.inbound.received", { inboundId: record.id, provider: providerName, tenantScope: scope });
    return { duplicate: false, message: { ...record } };
  }

  listInbound({ tenantScope = "default", status = null, limit = 200 } = {}) {
    return this._visible(this.data.inbound, tenantScope)
      .filter((row) => !status || row.status === String(status).toUpperCase())
      .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map((row) => ({ ...row }));
  }

  linkInbound(inboundId, { opportunityId = null, assignedTo = null, tenantScope = "default", actor } = {}) {
    const who = requireActor(actor);
    requireRole(who, COMMERCIAL_ROLE_AUTHORITY.ANALYST);
    const record = this._find("inbound", inboundId, { tenantScope });
    if (opportunityId) {
      const opportunity = this._find("opportunities", opportunityId, { tenantScope });
      record.opportunityId = opportunity.id;
      record.organizationId = opportunity.organizationId;
      record.status = "LINKED";
    }
    if (assignedTo !== null) record.assignedTo = text(assignedTo, 120);
    record.processedBy = who.username;
    record.processedAt = isoNow();
    this._persist("inbound");
    this._audit("INBOUND_LINKED", { inboundId: record.id, opportunityId: record.opportunityId, by: who.username });
    return { ...record };
  }

  /* --------------------------------------------------------------- overview */

  overview({ tenantScope = "default" } = {}) {
    const opportunities = this._visible(this.data.opportunities, tenantScope);
    const revenue = this._visible(this.data.revenue, tenantScope);
    const costs = this._visible(this.data.costs, tenantScope);
    const commissions = this._visible(this.data.commissions, tenantScope);
    const byStage = {};
    for (const stage of OPPORTUNITY_STAGES) byStage[stage] = 0;
    for (const row of opportunities) byStage[row.stage] = (byStage[row.stage] || 0) + 1;

    const sum = (rows) => rows.reduce((total, row) => total + (Number(row.amountMinor) || 0), 0);
    const kinds = (kind) => revenue.filter((row) => row.kind === kind);
    const collected = sum(kinds("COLLECTED"));
    const refunded = sum(kinds("REFUNDED")) + sum(kinds("CHARGEBACK"));
    const invoiced = sum(kinds("INVOICED"));
    const proposed = sum(kinds("PROPOSED"));

    const costByCategory = {};
    for (const category of COST_CATEGORIES) costByCategory[category] = 0;
    for (const row of costs) costByCategory[row.category] = (costByCategory[row.category] || 0) + row.amountMinor;

    const overdueFollowUps = opportunities.filter((row) => row.followUpDueAt && new Date(row.followUpDueAt).getTime() < Date.now() && !TERMINAL_STAGES.includes(row.stage)).length;
    const inbound = this._visible(this.data.inbound, tenantScope);

    const pilots = this._visible(this.data.pilots, tenantScope).map((pilot) => ({
      pilotId: pilot.id,
      product: pilot.product,
      status: pilot.status,
      paid: pilot.paid,
      milestonesMet: (pilot.milestones || []).filter((m) => m.status === "MET").length,
      milestonesTotal: (pilot.milestones || []).length,
      recommendation: this.pilotRecommendation(pilot.id, { tenantScope }).recommendation
    }));

    return {
      tenantScope: String(tenantScope || "default"),
      generatedAt: isoNow(),
      opportunities: { total: opportunities.length, byStage, overdueFollowUps },
      pipeline: {
        proposedMinor: proposed,
        invoicedMinor: invoiced,
        collectedMinor: collected,
        reversalsMinor: refunded,
        netCollectedMinor: Math.max(0, collected - refunded)
      },
      costs: { totalMinor: sum(costs), byCategory: costByCategory },
      commissions: {
        accruedMinor: sum(commissions.filter((c) => c.status === "ACCRUED")),
        paidMinor: sum(commissions.filter((c) => c.status === "PAID")),
        disputedMinor: sum(commissions.filter((c) => c.status === "DISPUTED"))
      },
      inbound: {
        total: inbound.length,
        received: inbound.filter((i) => i.status === "RECEIVED").length,
        failed: inbound.filter((i) => i.status === "FAILED").length
      },
      pilots,
      decisions: this.listDecisions({ tenantScope, limit: 10 }),
      evidenceGaps: [
        ...(collected === 0 ? ["NO_COLLECTED_REVENUE"] : []),
        ...(invoiced > 0 && collected === 0 ? ["INVOICED_NOT_COLLECTED"] : []),
        ...(opportunities.length === 0 ? ["NO_OPPORTUNITIES"] : []),
        ...(pilots.some((p) => p.recommendation === "INSUFFICIENT_DATA") ? ["PILOT_EVIDENCE_INCOMPLETE"] : [])
      ],
      partnerAccess: { enabled: false, reason: "NO_AUTHORIZED_PARTNER_IDENTITY" }
    };
  }
}

export default CommercialOperations;
