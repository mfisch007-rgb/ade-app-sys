/**
 * Commercial operations HTTP surface.
 *
 * All authorization is enforced server-side: reads require an authenticated
 * session, mutations require level 2, finance records require PIN proof for
 * non-Founders, and commercial decisions/settlements/agreement approvals are
 * FOUNDER-only. The client never supplies actor identity or tenant scope.
 */

const READ_LEVEL = 1;
const WRITE_LEVEL = 2;

function actorOf(req) {
  const claims = req.identity || {};
  const person = req.person || {};
  const persona = String(claims.persona || "").toUpperCase();
  const role = String(
    person.role ||
      claims.role ||
      claims.metadata?.role ||
      (persona === "ADMIN" ? "ADMIN" : persona === "FOUNDER" ? "FOUNDER" : "VIEWER")
  ).toUpperCase();
  const pinVerified =
    person.pinVerified === true ||
    claims.pinVerified === true ||
    claims.metadata?.pinVerified === true ||
    persona === "ADMIN";
  return {
    id: person.id || claims.personId || claims.sub || null,
    username: person.username || claims.sub || "unknown",
    role,
    pinVerified: Boolean(pinVerified)
  };
}

function tenantOf(req) {
  const claims = req.identity || {};
  const raw =
    req.tenantScope ??
    req.tenantId ??
    claims.tenantId ??
    claims.tid ??
    "default";
  const scope = String(raw || "default").trim();
  return !scope || scope === "default_tenant" ? "default" : scope;
}

function failure(res, error) {
  const code = String(error?.code || "COMMERCIAL_OPERATION_FAILED");
  const status = code === "NOT_FOUND"
    ? 404
    : code === "TENANT_MISMATCH"
      ? 403
      : /INSUFFICIENT_AUTHORIZATION|ELEVATED_PIN_REQUIRED|FOUNDER_/.test(code)
        ? 403
        : 400;
  return res.status(status).json({
    success: false,
    error: code,
    message: String(error?.message || code)
  });
}

function queryLimit(req, fallback) {
  const n = Number(req.query?.limit);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function registerCommercialRoutes({
  app,
  security,
  commercial,
  requireDurableStorage = null
} = {}) {
  if (!app || !security || !commercial) {
    throw new Error("registerCommercialRoutes requires app, security and commercial.");
  }
  const gate = typeof requireDurableStorage === "function" ? requireDurableStorage : (req, res, next) => next();
  const read = security.requireLevel(READ_LEVEL);
  const write = security.requireLevel(WRITE_LEVEL);

  function requireFounder(req, res, next) {
    const actor = actorOf(req);
    if (actor.role !== "FOUNDER") {
      return res.status(403).json({
        success: false,
        error: "FOUNDER_DECISION_REQUIRED",
        message: "This action is reserved for the Founder."
      });
    }
    req.commercialActor = actor;
    return next();
  }

  function requireFinancePin(req, res, next) {
    const actor = actorOf(req);
    if (actor.role !== "FOUNDER" && actor.pinVerified !== true) {
      return res.status(403).json({
        success: false,
        error: "ELEVATED_PIN_REQUIRED",
        message: "Verify the authorization PIN before recording financial evidence."
      });
    }
    req.commercialActor = actor;
    return next();
  }

  const actor = (req) => req.commercialActor || actorOf(req);
  const tenant = (req) => tenantOf(req);

  /* --------------------------------------------------------------- overview */

  app.get("/api/v1/commercial/overview", read, (req, res) => {
    try {
      res.json({ success: true, overview: commercial.overview({ tenantScope: tenant(req) }) });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ---------------------------------------------------------- organizations */

  app.get("/api/v1/commercial/organizations", read, (req, res) => {
    try {
      const organizations = commercial.listOrganizations({
        tenantScope: tenant(req),
        type: req.query?.type || null,
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, organizations, count: organizations.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.get("/api/v1/commercial/organizations/:id", read, (req, res) => {
    try {
      res.json({
        success: true,
        organization: commercial.getOrganization(req.params.id, { tenantScope: tenant(req) })
      });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/organizations", write, gate, (req, res) => {
    try {
      const organization = commercial.createOrganization({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, organization });
    } catch (error) {
      failure(res, error);
    }
  });

  app.patch("/api/v1/commercial/organizations/:id", write, gate, (req, res) => {
    try {
      const organization = commercial.updateOrganization(
        req.params.id,
        req.body || {},
        { tenantScope: tenant(req), actor: actor(req) }
      );
      res.json({ success: true, organization });
    } catch (error) {
      failure(res, error);
    }
  });

  /* --------------------------------------------------------------- contacts */

  app.get("/api/v1/commercial/contacts", read, (req, res) => {
    try {
      const contacts = commercial.listContacts({
        organizationId: req.query?.organizationId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, contacts, count: contacts.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/contacts", write, gate, (req, res) => {
    try {
      const contact = commercial.createContact({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, contact });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ---------------------------------------------------------- opportunities */

  app.get("/api/v1/commercial/opportunities", read, (req, res) => {
    try {
      const opportunities = commercial.listOpportunities({
        tenantScope: tenant(req),
        stage: req.query?.stage || null,
        organizationId: req.query?.organizationId || null,
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, opportunities, count: opportunities.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.get("/api/v1/commercial/opportunities/:id", read, (req, res) => {
    try {
      res.json({
        success: true,
        opportunity: commercial.getOpportunity(req.params.id, { tenantScope: tenant(req) })
      });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/opportunities", write, gate, (req, res) => {
    try {
      const opportunity = commercial.createOpportunity({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, opportunity });
    } catch (error) {
      failure(res, error);
    }
  });

  app.patch("/api/v1/commercial/opportunities/:id", write, gate, (req, res) => {
    try {
      const opportunity = commercial.updateOpportunity(
        req.params.id,
        req.body || {},
        { tenantScope: tenant(req), actor: actor(req) }
      );
      res.json({ success: true, opportunity });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/opportunities/:id/transition", write, gate, (req, res) => {
    try {
      const opportunity = commercial.transitionOpportunity(
        req.params.id,
        req.body?.to || req.body?.stage,
        {
          reason: req.body?.reason || "",
          evidenceRef: req.body?.evidenceRef || null,
          tenantScope: tenant(req),
          actor: actor(req)
        }
      );
      res.json({ success: true, opportunity });
    } catch (error) {
      failure(res, error);
    }
  });

  /* -------------------------------------------------------------- activities */

  app.get("/api/v1/commercial/activities", read, (req, res) => {
    try {
      const activities = commercial.listActivities({
        opportunityId: req.query?.opportunityId || null,
        tenantScope: tenant(req),
        type: req.query?.type || null,
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, activities, count: activities.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/activities", write, gate, (req, res) => {
    try {
      const activity = commercial.recordActivity({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, activity });
    } catch (error) {
      failure(res, error);
    }
  });

  /* --------------------------------------------------------------- proposals */

  app.get("/api/v1/commercial/proposals", read, (req, res) => {
    try {
      const proposals = commercial.listProposals({
        opportunityId: req.query?.opportunityId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, proposals, count: proposals.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/proposals", write, gate, (req, res) => {
    try {
      const proposal = commercial.createProposal({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, proposal });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/proposals/:id/status", write, gate, (req, res) => {
    try {
      const proposal = commercial.setProposalStatus(
        req.params.id,
        req.body?.status || req.body?.to,
        { reason: req.body?.reason || "", tenantScope: tenant(req), actor: actor(req) }
      );
      res.json({ success: true, proposal });
    } catch (error) {
      failure(res, error);
    }
  });

  /* -------------------------------------------------------------- agreements */

  app.get("/api/v1/commercial/agreements", read, (req, res) => {
    try {
      const agreements = commercial.listAgreements({
        opportunityId: req.query?.opportunityId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, agreements, count: agreements.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/agreements", write, gate, (req, res) => {
    try {
      const agreement = commercial.createAgreement({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, agreement });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/agreements/:id/approve", write, gate, requireFounder, (req, res) => {
    try {
      const agreement = commercial.approveAgreement(req.params.id, {
        decision: req.body?.decision || "APPROVE",
        evidenceRef: req.body?.evidenceRef,
        note: req.body?.note || "",
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.json({ success: true, agreement });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ------------------------------------------------------------------ pilots */

  app.get("/api/v1/commercial/pilots", read, (req, res) => {
    try {
      const pilots = commercial.listPilots({
        opportunityId: req.query?.opportunityId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, pilots, count: pilots.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.get("/api/v1/commercial/pilots/:id/recommendation", read, (req, res) => {
    try {
      res.json({
        success: true,
        pilotRecommendation: commercial.pilotRecommendation(req.params.id, { tenantScope: tenant(req) })
      });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/pilots", write, gate, (req, res) => {
    try {
      const pilot = commercial.createPilot({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, pilot });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/pilots/:id/milestones", write, gate, (req, res) => {
    try {
      const pilot = commercial.addMilestone(req.params.id, {
        title: req.body?.title,
        dueAt: req.body?.dueAt || null,
        evidenceRef: req.body?.evidenceRef || null,
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, pilot });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/pilots/:id/milestones/:milestoneId/status", write, gate, (req, res) => {
    try {
      const pilot = commercial.setMilestoneStatus(
        req.params.id,
        req.params.milestoneId,
        req.body?.status || req.body?.to,
        {
          evidenceRef: req.body?.evidenceRef || null,
          tenantScope: tenant(req),
          actor: actor(req)
        }
      );
      res.json({ success: true, pilot });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ----------------------------------------------------------------- revenue */

  app.get("/api/v1/commercial/revenue", read, (req, res) => {
    try {
      const revenue = commercial.listRevenue({
        opportunityId: req.query?.opportunityId || null,
        agreementId: req.query?.agreementId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 500)
      });
      res.json({ success: true, revenue, count: revenue.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/revenue", write, gate, requireFinancePin, (req, res) => {
    try {
      const revenue = commercial.recordRevenue({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, revenue });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ------------------------------------------------------------------- costs */

  app.get("/api/v1/commercial/costs", read, (req, res) => {
    try {
      const costs = commercial.listCosts({
        opportunityId: req.query?.opportunityId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 500)
      });
      res.json({ success: true, costs, count: costs.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/costs", write, gate, requireFinancePin, (req, res) => {
    try {
      const cost = commercial.recordCost({
        ...(req.body || {}),
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, cost });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ------------------------------------------------------------- commissions */

  app.get("/api/v1/commercial/commissions", read, (req, res) => {
    try {
      const commissions = commercial.listCommissions({
        tenantScope: tenant(req),
        agreementId: req.query?.agreementId || null,
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, commissions, count: commissions.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/agreements/:id/commission", write, gate, (req, res) => {
    try {
      const commission = commercial.computeCommission(req.params.id, {
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, commission });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/commissions/:id/settle", write, gate, requireFounder, (req, res) => {
    try {
      const commission = commercial.settleCommission(req.params.id, {
        settlementRef: req.body?.settlementRef,
        evidenceRef: req.body?.evidenceRef || null,
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.json({ success: true, commission });
    } catch (error) {
      failure(res, error);
    }
  });

  /* --------------------------------------------------------------- decisions */

  app.get("/api/v1/commercial/decisions", read, (req, res) => {
    try {
      const decisions = commercial.listDecisions({
        opportunityId: req.query?.opportunityId || null,
        tenantScope: tenant(req),
        limit: queryLimit(req, 100)
      });
      res.json({ success: true, decisions, count: decisions.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/decisions", write, gate, requireFounder, (req, res) => {
    try {
      const decision = commercial.recordDecision({
        opportunityId: req.body?.opportunityId || null,
        pilotId: req.body?.pilotId || null,
        decision: req.body?.decision,
        rationale: req.body?.rationale,
        evidence: req.body?.evidence,
        reviewAt: req.body?.reviewAt || null,
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.status(201).json({ success: true, decision });
    } catch (error) {
      failure(res, error);
    }
  });

  /* ----------------------------------------------------------------- inbound */

  app.get("/api/v1/commercial/inbound", read, (req, res) => {
    try {
      const inbound = commercial.listInbound({
        tenantScope: tenant(req),
        status: req.query?.status || null,
        limit: queryLimit(req, 200)
      });
      res.json({ success: true, inbound, count: inbound.length });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/inbound", read, gate, (req, res) => {
    try {
      const result = commercial.ingestInbound({
        provider: req.body?.provider,
        providerMessageId: req.body?.providerMessageId,
        sender: req.body?.sender || null,
        recipient: req.body?.recipient || null,
        subject: req.body?.subject || null,
        body: req.body?.body || "",
        receivedAt: req.body?.receivedAt || null,
        linkUrl: req.body?.linkUrl || null,
        tenantScope: tenant(req)
      });
      res.status(result.duplicate ? 200 : 201).json({
        success: true,
        duplicate: result.duplicate,
        inbound: result.message
      });
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/v1/commercial/inbound/:id/link", read, gate, (req, res) => {
    try {
      const inbound = commercial.linkInbound(req.params.id, {
        opportunityId: req.body?.opportunityId || null,
        assignedTo: req.body?.assignedTo ?? null,
        tenantScope: tenant(req),
        actor: actor(req)
      });
      res.json({ success: true, inbound });
    } catch (error) {
      failure(res, error);
    }
  });
}

export default registerCommercialRoutes;
