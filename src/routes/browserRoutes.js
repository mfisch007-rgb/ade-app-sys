const ERROR_STATUS = {
  ACCOUNT_REQUIRED: 400,
  BROWSER_PROVIDER_NOT_SUPPORTED: 400,
  BROWSER_URL_REQUIRED: 400,
  BROWSER_URL_INVALID: 400,
  BROWSER_URL_NOT_ALLOWED: 400,
  BROWSER_NOT_RUNNING: 404,
  BROWSER_OWNER_MISMATCH: 403,
  BROWSER_SESSION_ALREADY_ACTIVE: 409,
  BROWSER_SESSION_LIMIT: 429,
  BROWSER_RATE_LIMITED: 429,
  BROWSER_SERVERLESS_UNAVAILABLE: 503,
  BROWSER_EXECUTABLE_MISSING: 503,
  PLAYWRIGHT_NOT_INSTALLED: 503,
  BROWSER_LAUNCH_FAILED: 502,
  BROWSER_SCREENSHOT_FAILED: 502
};

function browserActor(req) {
  const person = req.person || {};
  const claims = req.claims || {};
  const identity = req.identity || {};
  return {
    id: person.id || identity.subject || claims.sub || null,
    username: person.username || identity.subject || claims.sub || null,
    role: person.role || claims.role || identity.role || null,
    tenantId: person.tenantId || claims.tenantId || claims.tid || identity.tenantId || identity.tid || "default"
  };
}

function isFounder(req) {
  const actor = browserActor(req);
  return String(actor.role || "").toUpperCase() === "FOUNDER";
}

function requireFounder(req, res, next) {
  if (!isFounder(req)) {
    return res.status(403).json({
      success: false,
      error: "INSUFFICIENT_AUTHORIZATION",
      message: "The Personal Browser is restricted to the Founder identity."
    });
  }
  return next();
}

function noStore(res) {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("X-Content-Type-Options", "nosniff");
}

function failure(res, error) {
  const code = error?.code || error?.message || "BROWSER_REQUEST_FAILED";
  const status = ERROR_STATUS[code] || 400;
  noStore(res);
  return res.status(status).json({ success: false, error: code });
}

export function registerBrowserRoutes({ app, security, browser }) {
  if (!app || !security || !browser) throw new Error("BROWSER_ROUTE_DEPENDENCY_MISSING");

  app.get("/api/v1/browser/status", security.requireLevel(2), async (req, res) => {
    try {
      const status = await browser.inspect();
      noStore(res);
      return res.json({
        success: true,
        status,
        sessions: isFounder(req) ? browser.sessionsFor(browserActor(req)) : []
      });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.get("/api/v1/browser/sessions", security.requireLevel(3), requireFounder, (req, res) => {
    try {
      noStore(res);
      return res.json({ success: true, sessions: browser.sessionsFor(browserActor(req)) });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.post(
    "/api/v1/browser/sessions",
    security.requireLevel(3),
    requireFounder,
    security.requireConfigAction("browser-session"),
    async (req, res) => {
      try {
        const session = await browser.launch({
          actor: browserActor(req),
          providerId: req.body?.providerId,
          headless: req.body?.headless === true
        });
        noStore(res);
        return res.status(201).json({ success: true, session });
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.get(
    "/api/v1/browser/sessions/:id/screenshot",
    security.requireLevel(3),
    requireFounder,
    security.requireConfigAction("browser-session"),
    async (req, res) => {
      try {
        const result = await browser.screenshot({ actor: browserActor(req), sessionId: req.params.id });
        noStore(res);
        res.set("Content-Type", "image/png");
        res.set("Content-Disposition", `inline; filename="personal-browser-${result.session.id}.png"`);
        res.set("X-Browser-Captured-At", result.capturedAt);
        return res.send(result.buffer);
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.delete(
    "/api/v1/browser/sessions/:id",
    security.requireLevel(3),
    requireFounder,
    security.requireConfigAction("browser-session"),
    async (req, res) => {
      try {
        const result = await browser.close({
          actor: browserActor(req),
          sessionId: req.params.id,
          reason: "OWNER_CLOSED"
        });
        noStore(res);
        return res.json({ success: true, ...result });
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  return browser;
}

export default registerBrowserRoutes;
