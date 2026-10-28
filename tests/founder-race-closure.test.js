import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import LocalStorageAdapter from "../src/storage/LocalStorageAdapter.js";
import WorkforceManager, { FOUNDER_BOOTSTRAP_KEY } from "../src/identity/WorkforceManager.js";

const CANONICAL_KEY = "ade:workforce:v1";

function credentials(suffix) {
  return {
    fullName: `Founder ${suffix}`,
    username: `founder.${suffix}`,
    password: "Founder#2026Pass",
    pin: "246810"
  };
}

test("FOUNDER-RACE-1 two instances sharing one store produce exactly one Founder", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-founder-race-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "storage.json");
  const first = new WorkforceManager({ store: new LocalStorageAdapter(file) });
  const second = new WorkforceManager({ store: new LocalStorageAdapter(file) });
  await Promise.all([first.initialize(), second.initialize()]);

  const results = await Promise.allSettled([
    first.provisionFounder(credentials("alpha")),
    second.provisionFounder(credentials("beta"))
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason?.message), /FOUNDER_ALREADY_PROVISIONED/);

  const probeStorage = new LocalStorageAdapter(file);
  const claim = await probeStorage.get(FOUNDER_BOOTSTRAP_KEY, null);
  assert.ok(claim?.state?.persons, "atomic claim persisted the bootstrap state");
  const claimedFounders = Object.values(claim.state.persons).filter((p) => p.role === "FOUNDER");
  assert.equal(claimedFounders.length, 1);

  const verifier = new WorkforceManager({ store: new LocalStorageAdapter(file) });
  await verifier.initialize();
  const persons = await verifier.listPersons();
  assert.equal(persons.filter((p) => p.role === "FOUNDER").length, 1);
  const winner = fulfilled[0].value;
  assert.equal(persons[0].id, winner.id);
  const authenticated = await verifier.authenticate(winner.username, "Founder#2026Pass");
  assert.equal(authenticated.id, winner.id);
});

test("FOUNDER-RACE-2 bootstrap claim recovers the Founder if canonical persistence is lost", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-founder-recover-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "storage.json");
  const storage = new LocalStorageAdapter(file);
  const manager = new WorkforceManager({ store: storage });
  await manager.initialize();
  const founder = await manager.provisionFounder(credentials("recover"));
  assert.equal(founder.role, "FOUNDER");

  assert.equal(await storage.delete(CANONICAL_KEY), true);
  assert.equal(await storage.get(CANONICAL_KEY, null), null);
  assert.ok(await storage.get(FOUNDER_BOOTSTRAP_KEY, null));

  const recoveredManager = new WorkforceManager({ store: new LocalStorageAdapter(file) });
  await recoveredManager.initialize();
  const persons = await recoveredManager.listPersons();
  assert.equal(persons.length, 1);
  assert.equal(persons[0].id, founder.id);
  assert.equal(persons[0].role, "FOUNDER");
  assert.ok(await storage.get(CANONICAL_KEY, null), "recovery rewrites the canonical state");

  const authenticated = await recoveredManager.authenticate("founder.recover", "Founder#2026Pass");
  assert.equal(authenticated.id, founder.id);
});
