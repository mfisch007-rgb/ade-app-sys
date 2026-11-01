import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PersonalBrowserService } from "../../src/browser/PersonalBrowserService.js";
import { getBrowserProvider, validateBrowserUrl } from "../../src/browser/browserProviders.js";

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-browser-test-"));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return dir;
}

function fakeBrowser({ screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47]) } = {}) {
  const state = { closed: false, navigated: null, screenshots: 0 };
  const page = {
    async goto(url) {
      state.navigated = url;
    },
    url: () => state.navigated || "about:blank",
    async title() {
      return "Fake provider login";
    },
    async screenshot() {
      state.screenshots += 1;
      return screenshot;
    }
  };
  const context = {
    pages: () => [page],
    async newPage() {
      return page;
    },
    async close() {
      state.closed = true;
    }
  };
  return {
    state,
    driver: {
      name: "playwright",
      kind: "playwright",
      api: {
        chromium: {
          executablePath: () => process.execPath,
          launchPersistentContext: async () => context
        }
      }
    }
  };
}

function serviceWithFake(t, options = {}) {
  const root = tempRoot(t);
  const service = new PersonalBrowserService({
    profileRoot: root,
    env: { ADE_BROWSER_HEADLESS: "true", ...(options.env || {}) },
    ...options
  });
  const fake = fakeBrowser(options.fake);
  service.loadDriver = async () => fake.driver;
  t.after(async () => {
    await service.shutdown();
  });
  return { service, root, fake };
}

const founder = { id: "founder-1", tenantId: "tenant-a", role: "FOUNDER" };

test("personal browser: provider URLs are HTTPS and allowlist-bound", () => {
  const iq = getBrowserProvider("IQ_OPTION");
  assert.equal(validateBrowserUrl("https://sub.iqoption.com/en/login", iq).ok, true);
  assert.equal(validateBrowserUrl("https://iqoption.com.evil.example/login", iq).ok, false);
  assert.equal(validateBrowserUrl("http://iqoption.com/en/login", iq).ok, false);
  assert.equal(validateBrowserUrl("https://user:pass@iqoption.com/", iq).ok, false);
  assert.equal(validateBrowserUrl("https://iqoption.com:8443/", iq).ok, false);
  assert.equal(validateBrowserUrl("https://evil.example/", iq).ok, false);
  assert.equal(validateBrowserUrl("about:blank", iq).ok, false);
  assert.equal(validateBrowserUrl("about:blank", getBrowserProvider("BLANK")).ok, true);
});

test("personal browser: status is truthful and never claims authentication", async (t) => {
  const { service } = serviceWithFake(t);
  const status = await service.inspect();
  assert.equal(status.available, true);
  assert.equal(status.driver, "playwright");
  assert.equal(status.browserInstalled, true);
  assert.equal(status.authenticated, false);
  assert.equal(status.credentialsCollected, false);
  assert.equal(status.inputAutomation, false);
  assert.equal(status.serverless, false);
  assert.ok(status.providers.some((provider) => provider.id === "IQ_OPTION"));
});

test("personal browser: launch, owner isolation, screenshot and close", async (t) => {
  const { service, root, fake } = serviceWithFake(t);
  const launched = await service.launch({ actor: founder, providerId: "IQ_OPTION", headless: false });
  assert.equal(launched.provider.id, "IQ_OPTION");
  assert.equal(launched.state, "RUNNING");
  assert.equal(launched.authenticated, false);
  assert.equal(fake.state.navigated, "https://iqoption.com/en/login");

  const profiles = fs.readdirSync(root);
  assert.equal(profiles.length, 1);
  assert.match(profiles[0], /^[a-f0-9]{24}$/);

  assert.equal(service.sessionsFor({ ...founder, id: "someone-else" }).length, 0);
  await assert.rejects(
    () => service.screenshot({ actor: { ...founder, id: "someone-else" }, sessionId: launched.id }),
    /BROWSER_OWNER_MISMATCH/
  );
  await assert.rejects(
    () => service.launch({ actor: founder, providerId: "DERIV" }),
    /BROWSER_SESSION_ALREADY_ACTIVE/
  );

  const shot = await service.screenshot({ actor: founder, sessionId: launched.id });
  assert.equal(Buffer.isBuffer(shot.buffer), true);
  assert.equal(fake.state.screenshots, 1);

  const closed = await service.close({ actor: founder, sessionId: launched.id });
  assert.equal(closed.closed, true);
  assert.equal(fake.state.closed, true);
  assert.equal(service.sessionsFor(founder).length, 0);
});

test("personal browser: global session cap and per-owner rate limit", async (t) => {
  const { service } = serviceWithFake(t, { maxSessions: 1 });
  await service.launch({ actor: founder, providerId: "DERIV" });
  await assert.rejects(
    () => service.launch({ actor: { id: "founder-2", tenantId: "tenant-b", role: "FOUNDER" }, providerId: "FBS" }),
    /BROWSER_SESSION_LIMIT/
  );

  const { service: ratelimited } = serviceWithFake(t);
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      () => ratelimited.launch({ actor: founder, providerId: "NOT_A_PROVIDER" }),
      /BROWSER_PROVIDER_NOT_SUPPORTED/
    );
  }
  await assert.rejects(
    () => ratelimited.launch({ actor: founder, providerId: "IQ_OPTION" }),
    /BROWSER_RATE_LIMITED/
  );
});

test("personal browser: idle sessions are closed and serverless fails closed", async (t) => {
  const { service, fake } = serviceWithFake(t, { idleTimeoutMs: 1000 });
  let now = 10_000;
  service.now = () => now;
  const launched = await service.launch({ actor: founder, providerId: "SPORTYBET" });
  now += 1001;
  await service.cleanupIdleSessions();
  assert.equal(service.sessionsFor(founder).length, 0);
  assert.equal(fake.state.closed, true);
  await assert.rejects(
    () => service.screenshot({ actor: founder, sessionId: launched.id }),
    /BROWSER_NOT_RUNNING/
  );

  const serverless = new PersonalBrowserService({
    profileRoot: tempRoot(t),
    env: { VERCEL: "1", ADE_BROWSER_HEADLESS: "true" }
  });
  t.after(async () => {
    await serverless.shutdown();
  });
  const status = await serverless.inspect();
  assert.equal(status.available, false);
  assert.equal(status.serverless, true);
  assert.equal(status.reason, "BROWSER_SERVERLESS_UNAVAILABLE");
  await assert.rejects(
    () => serverless.launch({ actor: founder, providerId: "DERIV" }),
    /BROWSER_SERVERLESS_UNAVAILABLE/
  );
});

test("personal browser: missing driver is reported without inventing availability", async (t) => {
  const { service } = serviceWithFake(t);
  service.loadDriver = async () => {
    const error = new Error("PLAYWRIGHT_NOT_INSTALLED");
    error.code = "PLAYWRIGHT_NOT_INSTALLED";
    throw error;
  };
  const status = await service.inspect();
  assert.equal(status.available, false);
  assert.equal(status.driverAvailable, false);
  assert.equal(status.reason, "PLAYWRIGHT_NOT_INSTALLED");
  await assert.rejects(
    () => service.launch({ actor: founder, providerId: "IQ_OPTION" }),
    /PLAYWRIGHT_NOT_INSTALLED/
  );
});
