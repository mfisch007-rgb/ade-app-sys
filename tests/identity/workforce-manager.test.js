import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { LocalStorageAdapter } = await import(
  pathToFileURL(path.resolve("src/storage/LocalStorageAdapter.js")).href
);
const { WorkforceManager } = await import(
  pathToFileURL(path.resolve("src/identity/WorkforceManager.js")).href
);

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-wf-test-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return new LocalStorageAdapter(file);
}

const FOUNDER = { fullName: "Ade Founder", username: "founder", password: "FounderPass!1", pin: "123456" };
const QUOTA = { fullName: "Ade Quota", username: "quota", password: "QuotaPass!2", pin: "654321" };

test("workforce: founder provisioning is single, then protects founder", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);
  assert.equal(founder.role, "FOUNDER");
  assert.equal(founder.status, "ACTIVE");
  assert.equal(founder.passwordHash, undefined, "hashes must never be returned");

  await assert.rejects(() => wf.provisionFounder(FOUNDER), /FOUNDER_ALREADY_PROVISIONED/);

  const { person: invited, inviteCode } = await wf.invite({ fullName: "New Person", role: "OPERATOR" });
  await wf.acceptInvitation({ code: inviteCode, fullName: "New Person", username: "newperson", password: "NewPass!3", pin: "112233" });

  await assert.rejects(() => wf.changeRole(founder.id, "ADMIN", invited.id), /FOUNDER_PROTECTED/);
});

test("workforce: login validates status, password and expiry", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);
  const { person: quotaPerson, inviteCode: quotaCode } = await wf.invite({ fullName: "Ade Quota", role: "OPERATOR" });
  await wf.acceptInvitation({ code: quotaCode, fullName: QUOTA.fullName, username: QUOTA.username, password: QUOTA.password, pin: QUOTA.pin });

  const ok = await wf.authenticate(QUOTA.username, QUOTA.password);
  assert.ok(ok);
  assert.equal(ok.status, "ACTIVE");

  const badPass = await wf.authenticate(QUOTA.username, "wrong-pass");
  assert.equal(badPass, null);

  await wf.setStatus(quotaPerson.id, "SUSPENDED", founder.id);
  const suspended = await wf.authenticate(QUOTA.username, QUOTA.password);
  assert.equal(suspended, null);
});

test("workforce: pin, password and pin lifecycle", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);

  assert.equal(await wf.verifyPin(founder.id, FOUNDER.pin), true);
  assert.equal(await wf.verifyPin(founder.id, "000000"), false);

  await wf.changePin(founder.id, FOUNDER.password, "999999");
  assert.equal(await wf.verifyPin(founder.id, "999999"), true);
  assert.equal(await wf.verifyPin(founder.id, FOUNDER.pin), false);

  await wf.changePassword(founder.id, FOUNDER.password, "NewFounderPass!9");
  const relogin = await wf.authenticate(FOUNDER.username, "NewFounderPass!9");
  assert.ok(relogin);
  assert.equal(await wf.authenticate(FOUNDER.username, FOUNDER.password), null);
});

test("workforce: recovery codes recover a password once", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);
  const { codes } = await wf.rotateRecoveryCodes(founder.id, founder.id);
  assert.equal(codes.length, 5);

  assert.equal(await wf.verifyRecoveryCode(FOUNDER.username, codes[0]), true);
  await wf.recoverPassword(FOUNDER.username, codes[0], "RecoveredPass!7");
  assert.ok(await wf.authenticate(FOUNDER.username, "RecoveredPass!7"));
  await assert.rejects(
    () => wf.recoverPassword(FOUNDER.username, codes[0], "AnotherPass!8"),
    /RECOVERY_FAILED/,
    "single-use recovery code must be spent"
  );
});

test("workforce: role and status lifecycle with founder protection", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);
  const { person: operatorPerson, inviteCode: operatorCode } = await wf.invite({ fullName: "Ade Admin", role: "OPERATOR", createdBy: founder.username });
  await wf.acceptInvitation({ code: operatorCode, fullName: "Ade Admin", username: "adeadmin", password: "AdminPass!4", pin: "223344" });

  const admin = await wf.getPersonRecord(operatorPerson.id);

  await wf.changeRole(operatorPerson.id, "ADMIN", founder.id);
  let person = await wf.getPerson(operatorPerson.id);
  assert.equal(person.role, "ADMIN");

  await wf.changeRole(operatorPerson.id, "ANALYST", founder.id);
  person = await wf.getPerson(operatorPerson.id);
  assert.equal(person.level, 1);

  await wf.setStatus(operatorPerson.id, "SUSPENDED", founder.id);
  person = await wf.getPerson(operatorPerson.id);
  assert.equal(person.status, "SUSPENDED");

  await wf.setStatus(operatorPerson.id, "ACTIVE", founder.id);
  await wf.setExpiry(operatorPerson.id, Date.now() + 60_000, founder.id);
  person = await wf.getPerson(operatorPerson.id);
  assert.ok(person.accessExpiryAt > Date.now());

  await assert.rejects(() => wf.changeRole(operatorPerson.id, "FOUNDER", admin.id), /INVALID_ROLE/);
  await assert.rejects(() => wf.changeRole(founder.id, "ADMIN", operatorPerson.id), /FOUNDER_PROTECTED/);
  await assert.rejects(() => wf.setStatus(founder.id, "SUSPENDED", operatorPerson.id), /FOUNDER_PROTECTED/);
});

test("workforce: elevated roles cannot self-manage or exceed their authority", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);

  const { person: operator, inviteCode: operatorCode } = await wf.invite({
    fullName: "Ops One",
    role: "OPERATOR",
    actor: founder
  });
  await wf.acceptInvitation({
    code: operatorCode,
    fullName: "Ops One",
    username: "opsone",
    password: "OpsPass!5",
    pin: "334455"
  });

  const { person: admin, inviteCode: adminCode } = await wf.invite({
    fullName: "Admin One",
    role: "ADMIN",
    actor: founder
  });
  await wf.acceptInvitation({
    code: adminCode,
    fullName: "Admin One",
    username: "adminone",
    password: "AdminPass!6",
    pin: "445566"
  });

  const { person: adminTwo, inviteCode: adminTwoCode } = await wf.invite({
    fullName: "Admin Two",
    role: "ADMIN",
    actor: founder
  });
  await wf.acceptInvitation({
    code: adminTwoCode,
    fullName: "Admin Two",
    username: "admintwo",
    password: "AdminPass!7",
    pin: "556677"
  });

  await assert.rejects(
    () => wf.changeRole(operator.id, "ADMIN", operator.id),
    /SELF_MANAGEMENT_FORBIDDEN/
  );
  await assert.rejects(
    () => wf.setStatus(admin.id, "SUSPENDED", admin.id),
    /SELF_MANAGEMENT_FORBIDDEN/
  );
  await assert.rejects(
    () => wf.setExpiry(admin.id, Date.now() + 60_000, admin.id),
    /SELF_MANAGEMENT_FORBIDDEN/
  );

  await assert.rejects(
    () => wf.invite({ fullName: "Too High", role: "ADMIN", actor: operator }),
    /INSUFFICIENT_AUTHORIZATION/
  );
  assert.equal(
    (await wf.invite({ fullName: "Allowed Viewer", role: "VIEWER", actor: operator })).person.role,
    "VIEWER"
  );

  await assert.rejects(
    () => wf.changeRole(admin.id, "VIEWER", operator.id),
    /INSUFFICIENT_AUTHORIZATION/
  );
  const peerDemotion = await wf.changeRole(adminTwo.id, "VIEWER", admin.id);
  assert.equal(peerDemotion.role, "VIEWER");

  await assert.rejects(
    () => wf.resetPassword(founder.id, admin.id, "HackedPass!8"),
    /FOUNDER_PROTECTED/
  );
  await assert.rejects(
    () => wf.imposePin(founder.id, admin.id, "000000"),
    /FOUNDER_PROTECTED/
  );
});

test("workforce: last active admin is protected except for founder recovery", async (t) => {
  const wf = new WorkforceManager({ store: tempStore(t) });
  const founder = await wf.provisionFounder(FOUNDER);
  const { person: admin, inviteCode } = await wf.invite({
    fullName: "Only Admin",
    role: "ADMIN",
    actor: founder
  });
  await wf.acceptInvitation({
    code: inviteCode,
    fullName: "Only Admin",
    username: "onlyadmin",
    password: "AdminPass!9",
    pin: "667788"
  });

  const legacyAdmin = { id: null, username: "admin", role: "ADMIN", level: 2 };
  await assert.rejects(
    () => wf.changeRole(admin.id, "ANALYST", legacyAdmin),
    /LAST_ADMIN_PROTECTED/
  );
  await assert.rejects(
    () => wf.setStatus(admin.id, "SUSPENDED", legacyAdmin),
    /LAST_ADMIN_PROTECTED/
  );
  await assert.rejects(
    () => wf.setExpiry(admin.id, Date.now() + 60_000, legacyAdmin),
    /LAST_ADMIN_PROTECTED/
  );

  const demoted = await wf.changeRole(admin.id, "ANALYST", founder.id);
  assert.equal(demoted.role, "ANALYST");
});

test("workforce: AI agent identities are registered and managed", async (t) => {
  const store = tempStore(t);
  const wf = new WorkforceManager({ store });
  await wf.provisionFounder(FOUNDER);

  await assert.rejects(() => wf.createAgent({ name: "no-purpose" }), /INVALID_AGENT_PURPOSE/);
  const agent = await wf.createAgent({ name: "procarta-agent", purpose: "Process intake analysis", createdBy: "founder" });
  assert.equal(agent.status, "ACTIVE");
  assert.equal(agent.purpose, "Process intake analysis");

  const updated = await wf.updateAgent(agent.id, { status: "SUSPENDED" });
  assert.equal(updated.status, "SUSPENDED");
  await assert.rejects(() => wf.updateAgent(agent.id, { purpose: "" }), /INVALID_AGENT_PURPOSE/);

  const used = await wf.markAgentUsed(agent.id);
  assert.ok(used.lastUsedAt);
  const reread = new WorkforceManager({ store });
  const persisted = (await reread.listAgents()).find((a) => a.id === agent.id);
  assert.ok(persisted.lastUsedAt, "lastUsedAt must persist across manager instances");

  const agents = await wf.listAgents();
  assert.equal(agents.length, 1);
  assert.equal(agents[0].name, "procarta-agent");
});

test("workforce: state persists through the provider boundary", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-wf-persist-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  const first = new WorkforceManager({ store: new LocalStorageAdapter(file) });
  await first.provisionFounder(FOUNDER);

  const second = new WorkforceManager({ store: new LocalStorageAdapter(file) });
  const persons = await second.listPersons();
  assert.equal(persons.length, 1);
  assert.equal(persons[0].username, FOUNDER.username);
  assert.equal(persons[0].passwordHash, undefined);
});