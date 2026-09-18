import { authRateLimit } from "../security/RateLimiter.js";

function parseBearer(req) {
  const header = String(req.get("authorization") || "");
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (!token) return null;
  return token;
}

export function registerIdentityRoutes({
  app,
  identity,
  workforce,
  announcements,
  auditStore,
  runtimeMode = "COMMUNITY",
  requireDurableStorage = null
} = {}) {
  if (!app || !workforce) {
    throw new Error("registerIdentityRoutes requires app and workforce.");
  }
  const gate = typeof requireDurableStorage === "function" ? requireDurableStorage : (req, res, next) => next();

  const elevatedRoles = ["FOUNDER", "ADMIN", "OPERATOR"];

  function issueWorkforceSession(person, { pinVerified = false, levelOverride = null } = {}) {
    const level = levelOverride ?? person.level;
    return identity.issueSession({
      subject: person.username,
      tier: "COMMUNITY",
      level,
      persona: "WORKFORCE",
      edition: runtimeMode,
      metadata: {
        role: person.role,
        personId: person.id,
        pinVerified: Boolean(pinVerified)
      }
    });
  }

  async function loadAuthenticated(req, res, next) {
    const token = parseBearer(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    let claims;
    try {
      claims = identity.verifySession(token);
    } catch (error) {
      return res.status(401).json({ success: false, error: error.message });
    }
    const persona = String(claims.persona || "").toUpperCase();
    const legacyAdmin = persona === "ADMIN" && Number(claims.level) >= 2;
    if (persona !== "WORKFORCE") {
      if (!legacyAdmin) {
        return res.status(401).json({ success: false, error: "WORKFORCE_SESSION_REQUIRED" });
      }
      req.token = token;
      req.claims = { ...claims, pinVerified: true };
      req.person = {
        id: null,
        username: String(claims.sub || "admin"),
        fullName: "Legacy Administrator",
        role: "ADMIN",
        level: Number(claims.level) || 2,
        status: "ACTIVE",
        accessExpiryAt: null
      };
      req.workforceToken = token;
      return next();
    }
    const personId = claims.personId || claims.sub;
    let person;
    try {
      person = await workforce.getPersonRecord(personId);
    } catch {
      return res.status(401).json({ success: false, error: "PERSON_NOT_FOUND" });
    }
    if (person.status !== "ACTIVE") {
      return res.status(403).json({ success: false, error: "ACCOUNT_NOT_ACTIVE", status: person.status });
    }
    if (person.accessExpiryAt && Date.now() > person.accessExpiryAt) {
      return res.status(403).json({ success: false, error: "ACCESS_EXPIRED" });
    }
    req.token = token;
    req.claims = claims;
    req.person = person;
    req.workforceToken = token;
    return next();
  }

  function requireElevatedPin(req, res, next) {
    if (req.claims?.pinVerified !== true) {
      return res.status(403).json({ success: false, error: "ELEVATED_PIN_REQUIRED" });
    }
    return next();
  }

  async function requireWorkforceAdmin(req, res, next) {
    const token = parseBearer(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    let claims;
    try {
      claims = identity.verifySession(token);
    } catch (error) {
      return res.status(401).json({ success: false, error: error.message });
    }
    const legacyAdmin =
      String(claims.persona || "").toUpperCase() === "ADMIN" &&
      Number(claims.level) >= 2;
    if (legacyAdmin) {
      req.claims = claims;
      // Synthesize the same legacy person record as loadAuthenticated so
      // downstream handlers (createdBy username, actor id) behave exactly
      // as they did before workforce-mutating routes were admin-guarded.
      req.person = {
        id: null,
        username: String(claims.sub || "admin"),
        fullName: "Legacy Administrator",
        role: "ADMIN",
        level: Number(claims.level) || 2,
        status: "ACTIVE",
        accessExpiryAt: null
      };
      return next();
    }
    if (String(claims.persona || "").toUpperCase() !== "WORKFORCE") {
      return res.status(403).json({ success: false, error: "INSUFFICIENT_AUTHORIZATION" });
    }
    const personId = claims.personId || claims.sub;
    let person;
    try {
      person = await workforce.getPersonRecord(personId);
    } catch {
      return res.status(403).json({ success: false, error: "INSUFFICIENT_AUTHORIZATION" });
    }
    if (person.status !== "ACTIVE") {
      return res.status(403).json({ success: false, error: "ACCOUNT_NOT_ACTIVE" });
    }
    if (claims.pinVerified !== true) {
      return res.status(403).json({ success: false, error: "ELEVATED_PIN_REQUIRED" });
    }
    if (!elevatedRoles.includes(person.role)) {
      return res.status(403).json({ success: false, error: "INSUFFICIENT_AUTHORIZATION" });
    }
    req.claims = claims;
    req.person = person;
    return next();
  }

  const routeError = (res, error, fallback = "REQUEST_FAILED") => {
    const statusMap = {
      PERSON_NOT_FOUND: 404,
      INVALID_PASSWORD: 400,
      INVALID_PIN: 400,
      INVALID_USERNAME: 400,
      INVALID_FULL_NAME: 400,
      USERNAME_TAKEN: 409,
      CURRENT_PASSWORD_INVALID: 401,
      RECOVERY_FAILED: 401,
      ACCOUNT_NOT_ACTIVE: 403,
      FOUNDER_PROTECTED: 403,
      FOUNDER_ALREADY_PROVISIONED: 409,
      INVALID_ROLE: 400,
      INVALID_STATUS: 400,
      INVALID_EXPIRY: 400,
      EXPIRY_MUST_BE_FUTURE: 400,
      INVALID_INVITE_WINDOW: 400,
      INVITATION_INVALID: 403,
      INVITATION_EXPIRED: 403,
      INVALID_AGENT_NAME: 400,
      INVALID_AGENT_STATUS: 400,
      AGENT_NOT_FOUND: 404,
      ANNOUNCEMENT_NOT_FOUND: 404,
      ANNOUNCEMENT_TITLE_REQUIRED: 400,
      USE_SELF_SERVICE_CHANGE: 400,
      ELEVATED_PIN_REQUIRED: 403,
      INSUFFICIENT_AUTHORIZATION: 403
    };
    const code = error?.message || fallback;
    const status = statusMap[code] ?? 400;
    return res.status(status).json({ success: false, error: code });
  };

  app.post("/api/v1/account/login", authRateLimit(), async (req, res) => {
    const { username, password } = req.body || {};
    const person = await workforce.authenticate(username, password);
    if (!person) {
      return res.status(401).json({ success: false, error: "INVALID_CREDENTIALS" });
    }
    const session = issueWorkforceSession(person);
    return res.status(200).json({
      success: true,
      token: session.token,
      expiresIn: session.expiresIn,
      expiresAt: session.expiresAt,
      identity: session.identity,
      person
    });
  });

  app.post("/api/v1/account/pin", loadAuthenticated, async (req, res) => {
    const { pin } = req.body || {};
    const valid = await workforce.verifyPin(req.person.id, pin);
    if (!valid) {
      return res.status(403).json({ success: false, error: "INVALID_PIN" });
    }
    // Single live session: the presented base token is revoked as the
    // elevated token is issued, so elevation never leaves two valid
    // sessions behind. Failure to revoke never blocks elevation itself.
    try {
      if (req.token) identity.revokeSession(req.token);
    } catch {}
    const session = issueWorkforceSession(req.person, { pinVerified: true });
    return res.status(200).json({
      success: true,
      elevated: true,
      token: session.token,
      expiresIn: session.expiresIn,
      expiresAt: session.expiresAt,
      identity: session.identity
    });
  });

  app.get("/api/v1/account/session", loadAuthenticated, async (req, res) => {
    const persona = String(req.claims?.persona || "").toUpperCase();
    const person =
      req.person?.id === null &&
      persona === "ADMIN" &&
      Number(req.claims?.level) >= 2
        ? {
            id: null,
            username: String(req.claims.sub || "admin"),
            fullName: "Legacy Administrator",
            role: "ADMIN",
            level: Number(req.claims.level) || 2,
            status: "ACTIVE",
            accessExpiryAt: null
          }
        : await workforce.getPerson(req.person.id);
    return res.json({
      success: true,
      person,
      claims: {
        role: req.claims.role,
        level: req.claims.level,
        persona: req.claims.persona,
        edition: req.claims.edition,
        pinVerified: req.claims.pinVerified === true
      },
      expiresAt: req.claims.exp * 1000
    });
  });

  app.post("/api/v1/account/logout", loadAuthenticated, (req, res) => {
    try {
      identity.revokeSession(req.token);
    } catch {}
    return res.json({ success: true, status: "SESSION_REVOKED" });
  });

  app.post("/api/v1/account/change-password", loadAuthenticated, gate, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      await workforce.changePassword(req.person.id, currentPassword, newPassword);
      return res.json({ success: true, status: "PASSWORD_CHANGED" });
    } catch (error) {
      return routeError(res, error, "PASSWORD_CHANGE_FAILED");
    }
  });

  app.post("/api/v1/account/change-pin", loadAuthenticated, gate, async (req, res) => {
    try {
      const { currentPassword, newPin } = req.body || {};
      await workforce.changePin(req.person.id, currentPassword, newPin);
      return res.json({ success: true, status: "PIN_CHANGED" });
    } catch (error) {
      return routeError(res, error, "PIN_CHANGE_FAILED");
    }
  });

  app.post("/api/v1/account/recovery-codes/rotate", loadAuthenticated, requireElevatedPin, gate, async (req, res) => {
    try {
      const result = await workforce.rotateRecoveryCodes(req.person.id, req.person.id);
      return res.json({ success: true, status: "RECOVERY_CODES_ROTATED", ...result });
    } catch (error) {
      return routeError(res, error, "RECOVERY_CODES_FAILED");
    }
  });

  app.post("/api/v1/account/forgot-password", authRateLimit(), gate, async (req, res) => {
    try {
      const { username, recoveryCode, newPassword } = req.body || {};
      await workforce.recoverPassword(username, recoveryCode, newPassword);
      return res.json({ success: true, status: "PASSWORD_RECOVERED" });
    } catch (error) {
      return routeError(res, error, "RECOVERY_FAILED");
    }
  });

  app.post("/api/v1/account/accept-invitation", authRateLimit(), gate, async (req, res) => {
    try {
      const result = await workforce.acceptInvitation(req.body || {});
      return res.status(201).json({ success: true, person: result, status: "INVITATION_ACCEPTED" });
    } catch (error) {
      return routeError(res, error, "INVITATION_ACCEPT_FAILED");
    }
  });

  app.get("/api/v1/workforce", requireWorkforceAdmin, async (req, res) => {
    const [persons, agents] = await Promise.all([
      workforce.listPersons(),
      workforce.listAgents()
    ]);
    return res.json({ success: true, persons, agents, stats: workforce.stats() });
  });

  app.post("/api/v1/workforce/provision-founder", gate, async (req, res) => {
    try {
      const count = await workforce.personCount();
      if (count > 0) {
        // Bootstrap is complete: any further provision attempt is an
        // authenticated admin action that truthfully fails with
        // FOUNDER_ALREADY_PROVISIONED (409). Never hang the request.
        let nextCalled = false;
        await new Promise((resolve) => {
          requireWorkforceAdmin(req, res, () => { nextCalled = true; resolve(); });
          setImmediate(() => resolve());
        });
        if (!nextCalled) return;
      }
      const person = await workforce.provisionFounder(req.body || {});
      return res.status(201).json({ success: true, person, status: "FOUNDER_PROVISIONED" });
    } catch (error) {
      return routeError(res, error, "FOUNDER_PROVISION_FAILED");
    }
  });

  app.post("/api/v1/workforce/invite", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate, async (req, res) => {
    try {
      const result = await workforce.invite({
        ...(req.body || {}),
        createdBy: req.person.username
      });
      return res.status(201).json({ success: true, ...result, status: "INVITATION_ISSUED" });
    } catch (error) {
      return routeError(res, error, "INVITATION_FAILED");
    }
  });

  const personAction = (fn, fallback) => async (req, res) => {
    try {
      const person = await workforce.getPersonRecord(req.params.id);
      const result = await fn(req, person);
      return res.json({ success: true, person: result });
    } catch (error) {
      return routeError(res, error, fallback);
    }
  };

  const withActor = (fn) => (req, person, extra = {}) =>
    fn(person, req.body || {}, req.person?.id ?? null, extra);

  app.post("/api/v1/workforce/:id/promote", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, body, actorId) => workforce.changeRole(person.id, body.role, actorId)),
      "PROMOTE_FAILED"
    ));

  app.post("/api/v1/workforce/:id/demote", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, body, actorId) => workforce.changeRole(person.id, body.role, actorId)),
      "DEMOTE_FAILED"
    ));

  app.post("/api/v1/workforce/:id/suspend", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, _body, actorId) => workforce.setStatus(person.id, "SUSPENDED", actorId)),
      "SUSPEND_FAILED"
    ));

  app.post("/api/v1/workforce/:id/revoke", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, _body, actorId) => workforce.setStatus(person.id, "REVOKED", actorId)),
      "REVOKE_FAILED"
    ));

  app.post("/api/v1/workforce/:id/activate", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, _body, actorId) => workforce.setStatus(person.id, "ACTIVE", actorId)),
      "ACTIVATE_FAILED"
    ));

  app.patch("/api/v1/workforce/:id/expiry", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, body, actorId) => workforce.setExpiry(person.id, body.accessExpiryAt ?? null, actorId)),
      "EXPIRY_FAILED"
    ));

  app.post("/api/v1/workforce/:id/reset-password", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, body, actorId) => workforce.resetPassword(person.id, actorId, body.newPassword)),
      "PASSWORD_RESET_FAILED"
    ));

  app.post("/api/v1/workforce/:id/reset-pin", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate,
    personAction(
      withActor((person, body, actorId) => workforce.imposePin(person.id, actorId, body.newPin)),
      "PIN_RESET_FAILED"
    ));

  app.get("/api/v1/workforce/agents", requireWorkforceAdmin, async (req, res) => {
    return res.json({ success: true, agents: await workforce.listAgents() });
  });

  app.post("/api/v1/workforce/agents", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate, async (req, res) => {
    try {
      const agent = await workforce.createAgent({
        ...(req.body || {}),
        createdBy: req.person.username
      });
      return res.status(201).json({ success: true, agent });
    } catch (error) {
      return routeError(res, error, "AGENT_CREATE_FAILED");
    }
  });

  app.patch("/api/v1/workforce/agents/:id", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate, async (req, res) => {
    try {
      const agent = await workforce.updateAgent(req.params.id, req.body || {}, req.person.id);
      return res.json({ success: true, agent });
    } catch (error) {
      return routeError(res, error, "AGENT_UPDATE_FAILED");
    }
  });

  app.get("/api/v1/audit", requireWorkforceAdmin, (req, res) => {
    try {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
      const type = String(req.query.type || "").trim();
      let entries = auditStore ? auditStore.query(limit) : [];
      if (type) {
        entries = entries.filter((e) => {
          const candidate = e.payload?.type ?? e.type ?? e.topic;
          return candidate === type;
        });
      }
      return res.json({ success: true, count: entries.length, entries });
    } catch (error) {
      return res.status(500).json({ success: false, error: "AUDIT_READ_FAILED" });
    }
  });

  app.get("/api/v1/announcements", async (req, res) => {
    try {
      const items = await announcements.list();
      return res.json({ success: true, count: items.length, announcements: items });
    } catch (error) {
      return res.status(500).json({ success: false, error: "ANNOUNCEMENTS_READ_FAILED" });
    }
  });

  app.get("/api/v1/announcements/admin", requireWorkforceAdmin, async (req, res) => {
    try {
      const items = await announcements.list(true);
      return res.json({ success: true, stats: await announcements.stats(), announcements: items });
    } catch (error) {
      return res.status(500).json({ success: false, error: "ANNOUNCEMENTS_ADMIN_READ_FAILED" });
    }
  });

  app.post("/api/v1/announcements", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate, async (req, res) => {
    try {
      const entry = await announcements.create({
        ...(req.body || {}),
        createdBy: req.person.username
      });
      return res.status(201).json({ success: true, announcement: entry });
    } catch (error) {
      return routeError(res, error, "ANNOUNCEMENT_CREATE_FAILED");
    }
  });

  app.patch("/api/v1/announcements/:id", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate, async (req, res) => {
    try {
      const entry = await announcements.update(req.params.id, req.body || {}, req.person.id);
      return res.json({ success: true, announcement: entry });
    } catch (error) {
      return routeError(res, error, "ANNOUNCEMENT_UPDATE_FAILED");
    }
  });

  app.delete("/api/v1/announcements/:id", loadAuthenticated, requireElevatedPin, requireWorkforceAdmin, gate, async (req, res) => {
    try {
      const result = await announcements.remove(req.params.id, req.person.id);
      return res.json({ success: true, ...result });
    } catch (error) {
      return routeError(res, error, "ANNOUNCEMENT_REMOVE_FAILED");
    }
  });
}

export default registerIdentityRoutes;