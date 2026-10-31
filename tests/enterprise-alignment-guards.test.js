import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// ENTERPRISE ALIGNMENT GUARDS — regression pins for the ecosystem-alignment
// release:
//   1. role invitation claims are validated by the trusted backend with
//      expiry + tenant enforcement, and NEVER grant access or issue a session;
//   2. admin settings responses mask secret-shaped leaves on read and on
//      write-echo (no raw credentials in any API response);
//   3. the public consoles configure providers and claim invitations only
//      through canonical server routes — no local ACTIVE flip, no local role
//      assignment, no authoritative role store in localStorage;
//   4. the client PIN mirror never stores PIN material or bare secret codes;
//   5. homepage positioning, the named operating loop and the System Explorer
//      are shipped; Node engines >= 24 is locked across package.json and the
//      Docker deployment target.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

async function bootIdentityApp(t) {
  const { default: expressMod } = await import("express");
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));
  const { registerIdentityRoutes } = await import(
    pathToFileURL(path.join(ROOT, "src/routes/identityRoutes.js")).href
  );
  // The claim route touches neither the workforce nor the identity issuer;
  // failing stubs prove that: any accidental access would throw and fail the
  // test instead of silently passing.
  const workforce = {
    async getPersonRecord() { return null; },
    async getPersonByUsername() { return null; },
    async getPerson() { return null; },
    async verifyPin() { return false; },
    async authenticate() { return null; }
  };
  const identity = {
    issueSession() { throw new Error("CLAIM_MUST_NOT_ISSUE_SESSIONS"); },
    verifySession() { throw new Error("CLAIM_MUST_NOT_VERIFY_SESSIONS"); },
    revokeSession() {}
  };
  registerIdentityRoutes({ app, identity, workforce });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("INV-CLAIM-1 — role invitation claims are validated server-side with expiry and tenant enforcement", async (t) => {
  const base = await bootIdentityApp(t);
  const post = (body) =>
    fetch(base + "/api/v1/onboarding/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  // Canonical default registry: lowercase input must normalise.
  const founder = await post({ code: "inv-founder" });
  assert.equal(founder.status, 200);
  assert.equal(founder.body.validated, true);
  assert.equal(founder.body.authority, "server");
  assert.equal(founder.body.claim.role, "FOUNDER_L3");
  assert.equal(founder.body.claim.level, 3);
  assert.equal(founder.body.claim.tier, "Level 3 (L3)");

  const unknown = await post({ code: "INV-NOT-A-CODE" });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "INVITATION_UNKNOWN");

  const missing = await post({ code: "" });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "INVITATION_CODE_REQUIRED");

  // Deployment override: one expired code, one tenant-scoped code.
  const prev = process.env.ADE_ROLE_INVITATION_CODES;
  process.env.ADE_ROLE_INVITATION_CODES = JSON.stringify({
    "INV-EXPIRED": { role: "ADMIN_L1", tier: "Level 1 (L1)", scope: "Supervised Support and Intake", level: 1, expiresAt: "2020-01-01T00:00:00.000Z" },
    "INV-PILOT": { role: "PILOT", tier: "Tier 1", scope: "Trading and Live Engagement Portal", level: 1, tenant: "acme-ltd", expiresAt: "2027-12-31T23:59:59.999Z" }
  });
  t.after(() => {
    if (prev === undefined) delete process.env.ADE_ROLE_INVITATION_CODES;
    else process.env.ADE_ROLE_INVITATION_CODES = prev;
  });

  const expired = await post({ code: "INV-EXPIRED" });
  assert.equal(expired.status, 410);
  assert.equal(expired.body.error, "INVITATION_EXPIRED");

  const tenantRequired = await post({ code: "INV-PILOT" });
  assert.equal(tenantRequired.status, 403);
  assert.equal(tenantRequired.body.error, "INVITATION_TENANT_REQUIRED");

  const wrongTenant = await post({ code: "INV-PILOT", tenant: "other-co" });
  assert.equal(wrongTenant.status, 403);
  assert.equal(wrongTenant.body.error, "INVITATION_TENANT_MISMATCH");

  const rightTenant = await post({ code: "INV-PILOT", tenant: "ACME-LTD" });
  assert.equal(rightTenant.status, 200);
  assert.equal(rightTenant.body.claim.tenant, "acme-ltd");
});

test("INV-CLAIM-2 — claim validation never issues a session, token or cookie", async (t) => {
  const base = await bootIdentityApp(t);
  const r = await fetch(base + "/api/v1/onboarding/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "INV-FOUNDER" })
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.grantsAccess, false);
  assert.ok(!("token" in body), "no session token in a claim response");
  assert.ok(!("expiresIn" in body), "no session lifetime in a claim response");
  assert.equal(r.headers.get("set-cookie"), null, "no session cookie is set by claim validation");
});

test("SETTINGS-MASK-1 — admin settings mask secret-shaped leaves and keep policy values", async () => {
  const { maskSettingsSecrets, safeSettingsView, validateSettingsPatch } = await import(
    pathToFileURL(path.join(ROOT, "src/security/SettingsRedaction.js")).href
  );
  const masked = maskSettingsSecrets({
    policies: { demoMode: false, humanApproval: "CONSEQUENTIAL_ACTIONS_ONLY", partnerMode: "standard" },
    integrations: { resendApiKey: "re_live_1234567890", plain: "visible" },
    nested: [{ token: "abc123" }],
    num: 7
  });
  assert.equal(masked.policies.demoMode, false);
  assert.equal(masked.policies.humanApproval, "CONSEQUENTIAL_ACTIONS_ONLY");
  assert.equal(masked.policies.partnerMode, "standard");
  assert.equal(masked.integrations.plain, "visible");
  assert.equal(masked.integrations.resendApiKey, "••••••••");
  assert.equal(masked.nested[0].token, "••••••••");
  assert.equal(masked.num, 7);
  assert.ok(!JSON.stringify(masked).includes("re_live_1234567890"), "raw credential never survives masking");

  const safe = safeSettingsView({
    settings: { theme: "ocean", apiKey: "sk-live-should-not-leak" },
    ui: { compact: true },
    policies: { demoMode: false, humanApproval: "CONSEQUENTIAL_ACTIONS_ONLY" },
    integrations: { resendApiKey: "re_live_1234567890" },
    cases: [{ id: "CASE-1" }]
  });
  assert.deepEqual(Object.keys(safe).sort(), ["policies", "settings", "ui"]);
  assert.equal(safe.settings.theme, "ocean");
  assert.equal("apiKey" in safe.settings, false, "secret-shaped settings keys are omitted");
  assert.equal(safe.policies.demoMode, false);
  assert.equal("integrations" in safe, false, "non-allowlisted sections are omitted");
  assert.equal("cases" in safe, false, "runtime collections are omitted");

  assert.equal(validateSettingsPatch({ integrations: { value: 1 } }).error, "SETTINGS_SECTION_NOT_ALLOWED");
  assert.equal(validateSettingsPatch({ policies: { apiKey: "x" } }).error, "SETTINGS_KEY_NOT_ALLOWED");
  assert.equal(validateSettingsPatch({ policies: { demoMode: { nested: true } } }).error, "SETTINGS_VALUE_INVALID");
  assert.equal(validateSettingsPatch({ policies: { demoMode: true, partnerMode: "standard" } }).ok, true);

  const app = read("src/app.js");
  assert.ok(app.includes("safeSettingsView(runtimeConfig.read())"), "GET /api/v1/admin/settings returns the allowlisted safe view");
  assert.ok(app.includes("safeSettingsView(d)"), "PATCH /api/v1/admin/settings returns the allowlisted safe view");
  assert.ok(app.includes("validateSettingsPatch"), "PATCH /api/v1/admin/settings validates sections, keys and values");
  assert.ok(!app.includes("settings:runtimeConfig.read()"), "overview no longer serializes the full runtime config");
});

test("CLIENT-AUTHORITY-1 — consoles configure and claim only via canonical server routes", () => {
  for (const f of ["public/index.html", "public/founder.html"]) {
    const html = read(f);
    const cfg = html.match(/<script id="ade-interactive-config">[\s\S]*?<\/script>/);
    const inv = html.match(/<script id="ade-invitation-banner">[\s\S]*?<\/script>/);
    assert.ok(cfg && inv, `${f} ships both injected scripts`);
    assert.ok(cfg[0].includes("/api/v1/connect/channels/configure"), `${f}: config submits to the canonical channel authority`);
    assert.ok(cfg[0].includes("CONFIGURED_UNVERIFIED"), `${f}: config persists the honest unverified state`);
    assert.ok(cfg[0].includes("CONFIGURED — AWAITING VERIFICATION"), `${f}: config renders the honest unverified badge`);
    assert.ok(!cfg[0].includes("state:'ACTIVE'"), `${f}: config never flips a badge to ACTIVE locally`);
    assert.ok(inv[0].includes("/api/v1/onboarding/claim"), `${f}: invitation validates against the server`);
    assert.ok(inv[0].includes("authoritative:false"), `${f}: invitation record is explicitly non-authoritative`);
    assert.ok(!inv[0].includes("acceptedAt"), `${f}: invitation no longer fabricates a local assignment`);
    assert.ok(!/role:\s*c\.role/.test(inv[0]), `${f}: invitation cannot assign roles client-side`);
  }
});

test("PIN-STATE-1 — the client PIN mirror never stores PIN material or bare codes", async () => {
  const src = read("public/js/ade-pin-state.js");
  const mkStore = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k)
    };
  };
  const sessionStorage = mkStore();
  const localStorage = mkStore();
  const sandbox = { sessionStorage, localStorage, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const PS = sandbox.ADE_PIN_STATE;
  assert.ok(PS, "ADE_PIN_STATE is exposed");

  PS.set({ method: "PIN", role: "FOUNDER", level: 3, subject: "founder" });
  const raw = JSON.parse(sessionStorage.getItem(PS.KEY));
  assert.equal(localStorage.getItem(PS.KEY), null, "PIN mirror is session-scoped, never localStorage");
  assert.equal(raw.active, true);
  assert.equal(raw.role, "FOUNDER");
  assert.equal(raw.tier, "Level 3 (L3)");
  assert.equal(raw.scope, "Full Sovereign Control Plane and Vaults");
  for (const k of Object.keys(raw)) {
    assert.ok(!/pin|password|secret|credential|token/i.test(k), `no credential-bearing field in the mirror: ${k}`);
  }
  for (const v of Object.values(raw)) {
    assert.ok(!(typeof v === "string" && /^\d{4,8}$/.test(v)), "no bare numeric code is stored in the mirror");
  }

  PS.clear();
  PS.hydrateFromClaims({ person: { username: "founder", role: "ADMIN", level: 2 }, claims: { pinVerified: true } });
  const raw2 = JSON.parse(sessionStorage.getItem(PS.KEY));
  assert.equal(localStorage.getItem(PS.KEY), null, "re-hydration also stays session-scoped");
  assert.equal(raw2.method, "SERVER_VERIFIED");
  assert.equal(raw2.subject, "founder");
  assert.equal(raw2.role, "ADMIN");
});

test("HOME-NARRATIVE-1 — positioning, the named operating loop and System Explorer are shipped", () => {
  const html = read("public/index.html");
  for (const marker of [
    "THE DIGITAL OPERATING LAYER FOR AFRICA",
    "'data-testid':'operating-philosophy'",
    "'01 · Observe'",
    "'02 · Learn'",
    "'03 · Decide'",
    "'04 · Execute'",
    "'05 · Continuously Improve'",
    "'data-testid':'system-explorer'",
    "'data-testid':'sysview-'+v.toLowerCase()",
    "const SYSVIEWS=",
    "'Business'",
    "'Product'",
    "'Operational'",
    "'Architecture'",
    "'Developer'",
    "/api/v1/onboarding/claim"
  ]) {
    assert.ok(html.includes(marker), `homepage ships: ${marker}`);
  }
});

test("ENGINES-24-1 — Node engines >= 24 is locked across package.json and deployment targets", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.engines && typeof pkg.engines.node === "string", "package.json declares engines.node");
  const m = /^>=\s*(\d+)/.exec(pkg.engines.node.trim());
  assert.ok(m, "engines.node uses a >= range");
  assert.ok(Number(m[1]) >= 24, "engines.node requires Node 24+");

  const dockerfile = read("Dockerfile");
  const from = /FROM\s+node:(\d+)/i.exec(dockerfile);
  assert.ok(from, "Dockerfile pins a node base image");
  assert.ok(Number(from[1]) >= 24, `Dockerfile base image ${from[1]} satisfies engines >= 24`);

  const nvmrc = read(".nvmrc").trim();
  assert.equal(nvmrc, "24", ".nvmrc pins the release Node major");
});
