import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { getBrowserProvider, listBrowserProviders, validateBrowserUrl } from "./browserProviders.js";

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 3;
const LAUNCH_WINDOW_MS = 60 * 1000;
const LAUNCH_LIMIT_PER_WINDOW = 5;

function failure(code, detail) {
  const error = new Error(code);
  error.code = code;
  if (detail) error.detail = String(detail).slice(0, 500);
  return error;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.origin === "null" ? null : parsed.origin;
  } catch {
    return null;
  }
}

function safeTitle(value) {
  return String(value || "").trim().slice(0, 200) || null;
}

export class PersonalBrowserService {
  constructor({
    profileRoot,
    eventBus = null,
    env = process.env,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxSessions = DEFAULT_MAX_SESSIONS,
    now = () => Date.now()
  } = {}) {
    this.env = env;
    this.eventBus = eventBus;
    this.now = now;
    this.profileRoot = path.resolve(
      profileRoot || env.ADE_BROWSER_PROFILE_DIR || path.join(process.cwd(), "data", "browser-profiles")
    );
    this.idleTimeoutMs = positiveInteger(idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS);
    this.maxSessions = positiveInteger(maxSessions, DEFAULT_MAX_SESSIONS);
    this.serverless = Boolean(
      env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || String(env.ADE_SERVERLESS || "").toLowerCase() === "true"
    );
    this.forceHeadless = String(env.ADE_BROWSER_HEADLESS || "").toLowerCase() === "true";
    this.sessions = new Map();
    this.launchAttempts = new Map();
    this.driver = null;
    this.driverError = null;
    this.driverPromise = null;
    this.cleanupTimer = setInterval(() => {
      void this.cleanupIdleSessions();
    }, Math.min(60_000, this.idleTimeoutMs));
    this.cleanupTimer.unref?.();
  }

  audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", {
        category: "PERSONAL_BROWSER",
        action,
        at: new Date(this.now()).toISOString(),
        ...fields
      });
    } catch {}
  }

  async loadDriver() {
    if (this.driver) return this.driver;
    if (this.driverError) throw failure(this.driverError);
    if (this.driverPromise) return this.driverPromise;

    this.driverPromise = (async () => {
      try {
        const playwright = await import("playwright");
        if (!playwright.chromium) throw new Error("CHROMIUM_UNAVAILABLE");
        this.driver = { name: "playwright", kind: "playwright", api: playwright };
        return this.driver;
      } catch (playwrightError) {
        try {
          const puppeteer = await import("puppeteer");
          if (!puppeteer.default?.launch) throw new Error("PUPPETEER_UNAVAILABLE");
          this.driver = { name: "puppeteer", kind: "puppeteer", api: puppeteer.default };
          return this.driver;
        } catch {
          this.driverError = "PLAYWRIGHT_NOT_INSTALLED";
          throw failure("PLAYWRIGHT_NOT_INSTALLED", playwrightError?.message);
        }
      }
    })().finally(() => {
      this.driverPromise = null;
    });

    return this.driverPromise;
  }

  browserInstalled(driver) {
    try {
      if (driver.kind === "playwright") return existsSync(driver.api.chromium.executablePath());
      return existsSync(driver.api.executablePath());
    } catch {
      return false;
    }
  }

  async inspect() {
    if (this.serverless) {
      return this.statusView({
        driverAvailable: false,
        browserInstalled: false,
        available: false,
        reason: "BROWSER_SERVERLESS_UNAVAILABLE"
      });
    }
    try {
      const driver = await this.loadDriver();
      const browserInstalled = this.browserInstalled(driver);
      return this.statusView({
        driverName: driver.name,
        driverAvailable: true,
        browserInstalled,
        available: browserInstalled,
        reason: browserInstalled ? null : "BROWSER_EXECUTABLE_MISSING"
      });
    } catch (error) {
      return this.statusView({
        driverAvailable: false,
        browserInstalled: false,
        available: false,
        reason: error.code || "PLAYWRIGHT_NOT_INSTALLED"
      });
    }
  }

  statusView({ driverName = null, driverAvailable, browserInstalled, available, reason }) {
    return {
      available,
      serverless: this.serverless,
      driver: driverName,
      driverAvailable,
      browserInstalled,
      reason,
      defaultHeadless: this.forceHeadless,
      providers: listBrowserProviders(),
      activeSessions: this.sessions.size,
      maxSessions: this.maxSessions,
      idleTimeoutMs: this.idleTimeoutMs,
      profileStorage: "LOCAL_BROWSER_PROFILE_DIRECTORY",
      credentialsCollected: false,
      authenticated: false,
      inputAutomation: false,
      note: available
        ? "A real Chromium window is opened on the server host. Sign in directly at the provider; ADE never receives your provider password."
        : "Browser automation is unavailable on this host or runtime. No provider connection is claimed."
    };
  }

  ownerKey(actor) {
    const id = String(actor?.id || "").trim();
    if (!id) throw failure("ACCOUNT_REQUIRED");
    const tenantId = String(actor?.tenantId || "default").trim() || "default";
    return { id, tenantId, role: String(actor?.role || "").toUpperCase(), key: `${tenantId}\u0000${id}` };
  }

  profileDirectory(owner) {
    const digest = createHash("sha256").update(owner.key).digest("hex").slice(0, 24);
    const target = path.resolve(this.profileRoot, digest);
    if (!target.startsWith(`${this.profileRoot}${path.sep}`)) {
      throw failure("BROWSER_LAUNCH_FAILED");
    }
    return target;
  }

  enforceRateLimit(owner) {
    const now = this.now();
    const attempts = (this.launchAttempts.get(owner.key) || []).filter((at) => now - at < LAUNCH_WINDOW_MS);
    if (attempts.length >= LAUNCH_LIMIT_PER_WINDOW) {
      throw failure("BROWSER_RATE_LIMITED");
    }
    attempts.push(now);
    this.launchAttempts.set(owner.key, attempts);
  }

  activeForOwner(owner) {
    return [...this.sessions.values()].find((session) => session.ownerKey === owner.key) || null;
  }

  async launch({ actor, providerId, headless } = {}) {
    if (this.serverless) throw failure("BROWSER_SERVERLESS_UNAVAILABLE");
    const owner = this.ownerKey(actor);
    this.enforceRateLimit(owner);
    if (this.activeForOwner(owner)) throw failure("BROWSER_SESSION_ALREADY_ACTIVE");
    if (this.sessions.size >= this.maxSessions) throw failure("BROWSER_SESSION_LIMIT");

    const provider = getBrowserProvider(providerId);
    if (!provider) throw failure("BROWSER_PROVIDER_NOT_SUPPORTED");
    const target = validateBrowserUrl(provider.url, provider);
    if (!target.ok) throw failure(target.code);

    let driver;
    try {
      driver = await this.loadDriver();
    } catch (error) {
      throw failure(error.code || "PLAYWRIGHT_NOT_INSTALLED");
    }
    if (!this.browserInstalled(driver)) throw failure("BROWSER_EXECUTABLE_MISSING");

    const profileDir = this.profileDirectory(owner);
    await mkdir(profileDir, { recursive: true, mode: 0o700 });
    await chmod(profileDir, 0o700).catch(() => {});

    const useHeadless = this.forceHeadless || headless === true;
    let context = null;
    let browser = null;
    let page = null;
    try {
      if (driver.kind === "playwright") {
        context = await driver.api.chromium.launchPersistentContext(profileDir, {
          headless: useHeadless,
          viewport: { width: 1280, height: 800 },
          args: ["--no-first-run", "--no-default-browser-check"]
        });
        page = context.pages()[0] || (await context.newPage());
      } else {
        browser = await driver.api.launch({
          headless: useHeadless,
          userDataDir: profileDir,
          args: ["--no-first-run", "--no-default-browser-check"]
        });
        page = (await browser.pages())[0] || (await browser.newPage());
      }
      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (error) {
      await context?.close?.().catch(() => {});
      await browser?.close?.().catch(() => {});
      this.audit("SESSION_LAUNCH_FAILED", {
        actor: owner.id,
        tenantId: owner.tenantId,
        provider: provider.id,
        detail: String(error?.message || "launch failed").slice(0, 200)
      });
      throw failure("BROWSER_LAUNCH_FAILED", error?.message);
    }

    const id = randomUUID();
    const startedAt = new Date(this.now()).toISOString();
    const session = {
      id,
      ownerId: owner.id,
      tenantId: owner.tenantId,
      ownerKey: owner.key,
      provider,
      driver: driver.name,
      headless: useHeadless,
      state: "RUNNING",
      startedAt,
      lastActivityAt: this.now(),
      screenshotCount: 0,
      title: null,
      context,
      browser,
      page
    };
    try {
      session.title = safeTitle(await page.title());
    } catch {}
    this.sessions.set(id, session);
    this.audit("SESSION_LAUNCHED", {
      actor: owner.id,
      tenantId: owner.tenantId,
      provider: provider.id,
      headless: useHeadless,
      sessionId: id
    });
    return this.sessionView(session);
  }

  sessionView(session, { includeScreenshot = false } = {}) {
    let currentUrl = null;
    try {
      currentUrl = session.page.url();
    } catch {}
    return {
      id: session.id,
      provider: {
        id: session.provider.id,
        label: session.provider.label,
        url: session.provider.url
      },
      state: session.state,
      driver: session.driver,
      headless: session.headless,
      startedAt: session.startedAt,
      lastActivityAt: new Date(session.lastActivityAt).toISOString(),
      currentUrl,
      origin: safeOrigin(currentUrl),
      title: session.title,
      screenshotAvailable: session.state === "RUNNING",
      screenshotCount: includeScreenshot ? session.screenshotCount : undefined,
      authenticated: false,
      credentialsCollected: false,
      inputAutomation: false
    };
  }

  sessionsFor(actor) {
    const owner = this.ownerKey(actor);
    return [...this.sessions.values()]
      .filter((session) => session.ownerKey === owner.key)
      .map((session) => this.sessionView(session));
  }

  sessionFor(actor, sessionId) {
    const owner = this.ownerKey(actor);
    const session = this.sessions.get(String(sessionId || ""));
    if (!session) throw failure("BROWSER_NOT_RUNNING");
    if (session.ownerKey !== owner.key) throw failure("BROWSER_OWNER_MISMATCH");
    return session;
  }

  async screenshot({ actor, sessionId } = {}) {
    const session = this.sessionFor(actor, sessionId);
    if (session.state !== "RUNNING") throw failure("BROWSER_NOT_RUNNING");
    session.lastActivityAt = this.now();
    let buffer;
    try {
      buffer = await session.page.screenshot({ type: "png", animations: "disabled" });
    } catch (error) {
      throw failure("BROWSER_SCREENSHOT_FAILED", error?.message);
    }
    session.screenshotCount += 1;
    try {
      session.title = safeTitle(await session.page.title());
    } catch {}
    if (session.screenshotCount === 1) {
      this.audit("SCREENSHOT_CAPTURED", {
        actor: session.ownerId,
        tenantId: session.tenantId,
        provider: session.provider.id,
        sessionId: session.id
      });
    }
    return {
      buffer,
      capturedAt: new Date(this.now()).toISOString(),
      session: this.sessionView(session)
    };
  }

  async close({ actor, sessionId, reason = "OWNER_CLOSED" } = {}) {
    const session = this.sessionFor(actor, sessionId);
    this.sessions.delete(session.id);
    session.state = "CLOSED";
    await Promise.race([
      Promise.resolve(session.context?.close?.() ?? session.browser?.close?.()),
      new Promise((resolve) => setTimeout(resolve, 10_000))
    ]).catch(() => {});
    this.audit("SESSION_CLOSED", {
      actor: session.ownerId,
      tenantId: session.tenantId,
      provider: session.provider.id,
      sessionId: session.id,
      reason
    });
    return { id: session.id, closed: true, reason };
  }

  async cleanupIdleSessions() {
    const now = this.now();
    for (const session of [...this.sessions.values()]) {
      if (now - session.lastActivityAt < this.idleTimeoutMs) continue;
      try {
        await this.close({
          actor: { id: session.ownerId, tenantId: session.tenantId },
          sessionId: session.id,
          reason: "IDLE_TIMEOUT"
        });
      } catch {}
    }
  }

  async shutdown() {
    clearInterval(this.cleanupTimer);
    await Promise.allSettled(
      [...this.sessions.values()].map((session) =>
        this.close({
          actor: { id: session.ownerId, tenantId: session.tenantId },
          sessionId: session.id,
          reason: "SERVER_SHUTDOWN"
        })
      )
    );
  }
}

export default PersonalBrowserService;
