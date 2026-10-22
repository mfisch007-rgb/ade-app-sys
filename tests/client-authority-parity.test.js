import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

// CLIENT/SERVER AUTHORITY PARITY
//
// 1. The Founder console must never offer a roster Promote/Demote transition
//    that the server rejects, and must never hide one the server allows. The
//    client decision is extracted from public/founder.html and evaluated as
//    written; the server decision is produced by the real WorkforceManager.
// 2. The Admin console must not destroy a valid session on a 503 that only
//    reports a storage/service outage. Only auth-configuration 503s may
//    end the session. The client decision is evaluated from the real
//    public/admin/index.html api() implementation.

const { LocalStorageAdapter } = await import(
  pathToFileURL(path.resolve("src/storage/LocalStorageAdapter.js")).href
);
const { WorkforceManager } = await import(
  pathToFileURL(path.resolve("src/identity/WorkforceManager.js")).href
);

const FOUNDER = { fullName: "Ade Founder", username: "founder", password: "FounderPass!1", pin: "123456" };
const ROSTER = [
  { role: "ADMIN", fullName: "Admin One", username: "adminone", password: "AdminPass!2", pin: "223344" },
  { role: "ADMIN", fullName: "Admin Two", username: "admintwo", password: "AdminPass!3", pin: "334455" },
  { role: "OPERATOR", fullName: "Op One", username: "opone", password: "OpPass!4", pin: "445566" },
  { role: "ANALYST", fullName: "An One", username: "anone", password: "AnPass!5", pin: "556677" },
  { role: "VIEWER", fullName: "Vw One", username: "vwone", password: "VwPass!6", pin: "667788" }
];

// ---------------------------------------------------------------------------
// Client source extraction helpers
// ---------------------------------------------------------------------------

const founderHtml = fs.readFileSync(path.resolve("public/founder.html"), "utf8");

// Pulls a `const <name>=...;` declaration out of the page source by matching
// balanced parentheses, so nested calls in the initializer cannot truncate it.
function extractDeclaration(source, name) {
  const marker = `const ${name}=`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `public/founder.html must declare ${name}`);
  let depth = 0;
  let i = source.indexOf("(", start);
  assert.notEqual(i, -1, `${name} must be an expression`);
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const end = source.indexOf(";", i);
  assert.notEqual(end, -1, `${name} must terminate with a semicolon`);
  return source.slice(start, end + 1);
}

const rolesLiteral = (() => {
  const match = founderHtml.match(/const AUTHORITY_ROLES=(\[[^\]]*\]);/);
  assert.ok(match, "public/founder.html must declare the AUTHORITY_ROLES ordering");
  return match[1];
})();
const ROLE_ORDER = JSON.parse(rolesLiteral.replace(/'/g, '"'));

const authorityBody = (() => {
  const match = founderHtml.match(/const authorityOf=([^;]+);/);
  assert.ok(match, "public/founder.html must declare the authorityOf helper");
  return match[1];
})();

// Evaluates the real Founder roster row logic against one (actor, target) pair.
function evaluateRosterRow({ actor, target, srvElevated = true, isLegacyAdmin = false, serverAuth }) {
  const script = `
const AUTHORITY_ROLES = ${rolesLiteral};
const authorityOf = ${authorityBody};
const isLegacyAdmin = ${isLegacyAdmin};
const _accessRole = ${JSON.stringify(actor.role)};
const srvElevated = ${srvElevated};
const serverAuth = ${serverAuth ? JSON.stringify(serverAuth) : "null"};
${extractDeclaration(founderHtml, "canManagePeople")}
${extractDeclaration(founderHtml, "actorAuthority")}
${extractDeclaration(founderHtml, "actorPersonId")}
const p = ${JSON.stringify({ id: target.id, role: target.role })};
const h = (type, props, ...children) => ({ type, props, children });
const doPromote = () => {};
const doDemote = () => {};
${extractDeclaration(founderHtml, "promoteBtn")}
${extractDeclaration(founderHtml, "demoteBtn")}
(() => ({
  promote: promoteBtn,
  demote: demoteBtn,
  canManagePeople,
  actorAuthority
}))()
`;
  return vm.runInNewContext(script, { console });
}

const buttonLabel = (button) => {
  if (!button) return null;
  const children = button.children || [];
  return String(children[children.length - 1]);
};

async function serverAcceptsRoleChange(wf, targetId, role, actorId) {
  try {
    await wf.changeRole(targetId, role, actorId);
    return { accepted: true, code: null };
  } catch (error) {
    return { accepted: false, code: String(error?.message || error) };
  }
}

test("CLIENT-AUTH-1 — founder roster Promote/Demote visibility is exactly the set the server accepts", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-roster-parity-"));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  const file = path.join(dir, "store.json");
  const store = new LocalStorageAdapter(file);
  const wf = new WorkforceManager({ store });
  await wf.initialize();

  const founder = await wf.provisionFounder(FOUNDER);
  for (const spec of ROSTER) {
    const { inviteCode } = await wf.invite({
      fullName: spec.fullName,
      role: spec.role,
      createdBy: founder.username
    });
    await wf.acceptInvitation({
      code: inviteCode,
      fullName: spec.fullName,
      username: spec.username,
      password: spec.password,
      pin: spec.pin
    });
  }

  const pristine = await wf.listPersons();
  const byUsername = (name) => pristine.find((person) => person.username === name);
  const founderPerson = byUsername(FOUNDER.username);
  const adminPerson = byUsername("adminone");
  assert.ok(founderPerson, "founder must exist in the roster");
  assert.ok(adminPerson, "an admin must exist in the roster");

  const actors = [founderPerson, adminPerson];
  const snapshot = fs.readFileSync(file, "utf8");
  const restore = () => fs.writeFileSync(file, snapshot, "utf8");

  let checked = 0;
  for (const actor of actors) {
    for (const target of pristine) {
      restore();
      const client = evaluateRosterRow({
        actor,
        target,
        serverAuth: { person: { id: actor.id, role: actor.role }, claims: { pinVerified: true } }
      });

      assert.equal(
        client.canManagePeople,
        true,
        `${actor.role} must be able to manage people once elevated`
      );
      assert.equal(
        client.actorAuthority,
        ROLE_ORDER.indexOf(actor.role),
        `${actor.role} authority must come from the explicit ordering, never array position`
      );

      const index = ROLE_ORDER.indexOf(target.role);
      const promoteRole = index >= 0 && index < ROLE_ORDER.length - 1 ? ROLE_ORDER[index + 1] : null;
      const demoteRole = index > 0 ? ROLE_ORDER[index - 1] : null;

      const serverPromote = promoteRole
        ? await serverAcceptsRoleChange(wf, target.id, promoteRole, actor.id)
        : { accepted: false, code: "NO_ADJACENT_ROLE" };
      const serverDemote = demoteRole
        ? await serverAcceptsRoleChange(wf, target.id, demoteRole, actor.id)
        : { accepted: false, code: "NO_ADJACENT_ROLE" };

      assert.equal(
        Boolean(client.promote),
        serverPromote.accepted,
        `${actor.role} -> ${target.role} promote visibility must match server ` +
          `(client=${Boolean(client.promote)}, server=${serverPromote.accepted}, code=${serverPromote.code})`
      );
      assert.equal(
        Boolean(client.demote),
        serverDemote.accepted,
        `${actor.role} -> ${target.role} demote visibility must match server ` +
          `(client=${Boolean(client.demote)}, server=${serverDemote.accepted}, code=${serverDemote.code})`
      );

      if (client.promote) {
        assert.equal(
          buttonLabel(client.promote),
          `↑ Promote to ${promoteRole}`,
          "promote label must name the target role"
        );
      }
      if (client.demote) {
        assert.equal(
          buttonLabel(client.demote),
          `↓ Demote to ${demoteRole}`,
          "demote label must name the target role"
        );
      }
      checked += 1;
    }
  }
  restore();
  assert.ok(checked >= 12, "parity must cover every actor/target pair");
});

test("CLIENT-AUTH-2 — an ADMIN never sees a Promote button the server rejects with INSUFFICIENT_AUTHORIZATION", () => {
  const admin = { id: "actor-admin", role: "ADMIN" };
  const operator = { id: "target-operator", role: "OPERATOR" };
  const row = evaluateRosterRow({
    actor: admin,
    target: operator,
    serverAuth: { person: { id: admin.id, role: admin.role }, claims: { pinVerified: true } }
  });
  assert.equal(
    row.promote,
    null,
    "an ADMIN must not be offered a promote to ADMIN, which the server refuses"
  );
  assert.ok(row.demote, "an ADMIN must still be offered a demote to ANALYST");
  assert.equal(buttonLabel(row.demote), "↓ Demote to ANALYST");
});

test("CLIENT-AUTH-3 — a FOUNDER never sees a Demote button on a FOUNDER or on its own row", () => {
  const founder = { id: "actor-founder", role: "FOUNDER" };
  const protectedFounder = { id: "other-founder", role: "FOUNDER" };
  const selfRow = { id: founder.id, role: founder.id === founder.id ? "FOUNDER" : "ADMIN" };

  const onProtected = evaluateRosterRow({
    actor: founder,
    target: protectedFounder,
    serverAuth: { person: { id: founder.id, role: founder.role }, claims: { pinVerified: true } }
  });
  assert.equal(onProtected.promote, null, "FOUNDER rows are never promotable");
  assert.equal(onProtected.demote, null, "FOUNDER rows are never demotable");

  const onSelf = evaluateRosterRow({
    actor: { id: "actor-admin", role: "ADMIN" },
    target: { id: "actor-admin", role: "ADMIN" },
    serverAuth: { person: { id: "actor-admin", role: "ADMIN" }, claims: { pinVerified: true } }
  });
  assert.equal(onSelf.promote, null, "an actor must not be offered to promote itself");
  assert.equal(onSelf.demote, null, "an actor must not be offered to demote itself");
  assert.ok(selfRow);
});

test("CLIENT-AUTH-4 — a workforce ADMIN without an elevated PIN is read-only, matching requireElevatedPin", () => {
  const admin = { id: "actor-admin", role: "ADMIN" };
  const operator = { id: "target-operator", role: "OPERATOR" };

  const notElevated = evaluateRosterRow({
    actor: admin,
    target: operator,
    srvElevated: false,
    serverAuth: { person: { id: admin.id, role: admin.role }, claims: { pinVerified: false } }
  });
  assert.equal(notElevated.canManagePeople, false, "a non-elevated ADMIN cannot manage people");
  assert.equal(notElevated.actorAuthority, -1, "a non-elevated ADMIN holds no roster authority");

  const elevated = evaluateRosterRow({
    actor: admin,
    target: operator,
    srvElevated: true,
    serverAuth: { person: { id: admin.id, role: admin.role }, claims: { pinVerified: true } }
  });
  assert.equal(elevated.canManagePeople, true, "an elevated ADMIN can manage people");
});

// ---------------------------------------------------------------------------
// Admin console session handling
// ---------------------------------------------------------------------------

const adminHtml = fs.readFileSync(path.resolve("public/admin/index.html"), "utf8");

function extractAdminApi() {
  const start = adminHtml.indexOf("async function api(");
  assert.notEqual(start, -1, "public/admin/index.html must declare api()");
  const end = adminHtml.indexOf("function loginCard(");
  assert.ok(end > start, "public/admin/index.html must declare api() before loginCard()");
  return adminHtml.slice(start, end).trim();
}

function evaluateAdminApi(response) {
  const observed = { renderLogin: [], setAuthUI: 0, removedKeys: [] };
  const authState = { token: "valid-admin-token" };
  const sandbox = {
    authState,
    A: "http://127.0.0.1:9",
    fetch: async () => response,
    sessionStorage: {
      removeItem: (key) => observed.removedKeys.push(key)
    },
    window: {
      ADE_PIN_STATE: {
        clear: () => {
          observed.setAuthUI += 1;
        }
      }
    },
    setAuthUI: () => {
      observed.setAuthUI += 1;
    },
    renderLogin: (message, code) => observed.renderLogin.push({ message, code }),
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(extractAdminApi(), sandbox);
  return { api: sandbox.api, authState, observed };
}

const serviceUnavailable = (error, message) => ({
  status: 503,
  json: async () => ({ success: false, error, message })
});

test("CLIENT-AUTH-5 — admin 503 clears the session only for auth-configuration failures", async () => {
  const clearing = await evaluateAdminApi(serviceUnavailable("AUTH_NOT_CONFIGURED")).api("/x", {});
  assert.equal(clearing.success, false);
  assert.equal(clearing.error, "AUTH_NOT_CONFIGURED");

  const clearingState = await evaluateAdminApi(serviceUnavailable("AUTH_NOT_CONFIGURED"));
  await clearingState.api("/x", {});
  assert.equal(clearingState.authState.token, null, "AUTH_NOT_CONFIGURED must end the session");
  assert.ok(clearingState.observed.removedKeys.includes("ade_admin_token"));
  assert.equal(clearingState.observed.renderLogin.length, 1);

  const initialPin = await evaluateAdminApi(serviceUnavailable("INITIAL_PIN_HASH_REQUIRED"));
  await initialPin.api("/x", {});
  assert.equal(initialPin.authState.token, null, "INITIAL_PIN_HASH_REQUIRED must end the session");
  assert.ok(initialPin.observed.removedKeys.includes("ade_admin_token"));
  assert.equal(initialPin.observed.renderLogin.length, 1);
});

test("CLIENT-AUTH-6 — admin 503 that only reports a storage outage preserves the session", async () => {
  const storage = await evaluateAdminApi(serviceUnavailable("STORAGE_NOT_CONFIGURED"));
  const result = await storage.api("/x", {});
  assert.equal(result.success, false);
  assert.equal(result.error, "STORAGE_NOT_CONFIGURED", "the real error code must reach the caller");
  assert.equal(
    storage.authState.token,
    "valid-admin-token",
    "a storage outage must not destroy a valid admin session"
  );
  assert.deepEqual(storage.observed.removedKeys, [], "no session key may be removed on a storage outage");
  assert.equal(storage.observed.renderLogin.length, 0, "a storage outage must not re-render the login screen");
  assert.equal(storage.observed.setAuthUI, 0, "a storage outage must not reset the auth UI");

  const unknown = await evaluateAdminApi(serviceUnavailable("SERVICE_UNAVAILABLE"));
  const unknownResult = await unknown.api("/x", {});
  assert.equal(unknownResult.error, "SERVICE_UNAVAILABLE");
  assert.equal(unknown.authState.token, "valid-admin-token", "an unknown 503 must preserve the session");
  assert.equal(unknown.observed.renderLogin.length, 0);
});

test("CLIENT-AUTH-7 — admin 401 still ends the session (no regression of the 503 fix)", async () => {
  const unauthorized = await evaluateAdminApi({ status: 401, json: async () => ({ success: false }) });
  const result = await unauthorized.api("/x", {});
  assert.equal(result.error, "UNAUTHORIZED");
  assert.equal(unauthorized.authState.token, null, "a 401 must end the session");
  assert.ok(unauthorized.observed.removedKeys.includes("ade_admin_token"));
});
