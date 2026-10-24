import { test } from "node:test";
import assert from "node:assert/strict";
import { WhatsAppNumberRegistry } from "../src/ingestion/WhatsAppNumberRegistry.js";
import { AwbuliTransportRegistry } from "../src/awbuli/AwbuliTransportRegistry.js";
import { AwbuliMessagingService } from "../src/awbuli/AwbuliMessagingService.js";

function memoryStore() {
  const sections = new Map();
  return {
    sections,
    readSection: (name) => sections.get(name) || null,
    writeSection: (name, value) => { sections.set(name, value); }
  };
}

function setup({ pipeline = null } = {}) {
  const store = memoryStore();
  const numbers = new WhatsAppNumberRegistry({ store });
  const transports = new AwbuliTransportRegistry();
  const calls = [];
  let seq = 0;
  const run = pipeline || (async (args) => {
    calls.push(args);
    seq += 1;
    return { eventId: `evt-${seq}`, caseId: `case-${seq}` };
  });
  const messaging = new AwbuliMessagingService({
    numberRegistry: numbers,
    transports,
    pipeline: { run },
    store
  });
  return { store, numbers, transports, messaging, calls };
}

function verifiedNumber(numbers, overrides = {}) {
  const rec = numbers.addNumber({
    number: overrides.number || "+2348011111111",
    tenantScope: overrides.tenantScope || "default",
    label: overrides.label || "Test line"
  });
  numbers.verifyNumber(rec.id, { method: "HUMAN_ATTESTATION", evidenceRef: "test-evidence" });
  return numbers.get(rec.id);
}

test("awbuli-transport-1 — activation is blocked and registration preserved without a transport", () => {
  const { numbers, messaging, store } = setup();
  const number = verifiedNumber(numbers);

  const result = messaging.activate(number.id, { actor: "founder", reason: "go live" });
  assert.equal(result.success, false);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.error, "TRANSPORT_UNAVAILABLE");
  assert.equal(result.transport.live, false);
  assert.equal(result.transport.state, "TRANSPORT_UNAVAILABLE");

  const saved = numbers.get(number.id);
  assert.equal(saved.state, "VERIFIED");
  assert.equal(saved.activation.state, "BLOCKED");
  assert.equal(saved.activation.reason, "TRANSPORT_UNAVAILABLE");
  assert.equal(saved.activation.transportId, null);
  assert.ok(saved.activation.missing.length > 0);
  assert.equal(numbers.findActiveByAddress("+2348011111111"), null);

  const persisted = store.readSection("whatsappNumbers");
  assert.equal(persisted[number.id].activation.state, "BLOCKED");
});

test("awbuli-transport-2 — only an authorized initialized handle can be registered", () => {
  const { transports } = setup();
  assert.throws(
    () => transports.register({ id: "wa-1", authorized: false, handle: {} }),
    (e) => e.code === "TRANSPORT_NOT_AUTHORIZED"
  );
  assert.throws(
    () => transports.register({ id: "wa-1", authorized: true, handle: null }),
    (e) => e.code === "TRANSPORT_HANDLE_REQUIRED"
  );
  const view = transports.register({
    id: "wa-1",
    authorized: true,
    tenantScope: "default",
    handle: { marker: "secret-handle" },
    kind: "FIRST_PARTY_SESSION"
  });
  assert.equal(view.id, "wa-1");
  assert.equal(view.authorized, true);
  assert.equal(view.handle, undefined);
  assert.equal(JSON.stringify(transports.list()).includes("secret-handle"), false);
  assert.equal(transports.getAuthorized("wa-1", { tenantScope: "default" }).available, true);
  assert.equal(transports.getAuthorized("wa-1", { tenantScope: "other" }).reason, "TRANSPORT_TENANT_MISMATCH");
});

test("awbuli-transport-3 — activation binds one transport and routes by recipient idempotently", async () => {
  const { numbers, transports, messaging, calls, store } = setup();
  const number = verifiedNumber(numbers);
  const other = verifiedNumber(numbers, { number: "+2348022222222", label: "Second line" });

  assert.equal(messaging.transportStatus().live, false);
  transports.register({ id: "wa-live-1", authorized: true, tenantScope: "default", handle: { marker: "secret-handle" } });

  const activated = messaging.activate(number.id, { actor: "founder", reason: "verified sender" });
  assert.equal(activated.success, true);
  assert.equal(activated.status, "ACTIVE");
  assert.equal(activated.number.state, "ENABLED");
  assert.equal(activated.number.activation.state, "ACTIVE");
  assert.equal(activated.number.activation.transportId, "wa-live-1");
  assert.equal(messaging.activate(other.id, { actor: "founder" }).success, true);
  assert.equal(messaging.transportStatus().live, true);
  assert.equal(JSON.stringify(messaging.transportStatus()).includes("secret-handle"), false);

  const first = await messaging.ingest({
    transportId: "wa-live-1",
    tenantScope: "default",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold 5 bags of rice for 5k",
    messageId: "wamid-1"
  });
  assert.equal(first.success, true);
  assert.equal(first.routed, true);
  assert.equal(first.deliveryClaimed, false);
  assert.equal(first.outbound, "NOT_ATTEMPTED");
  assert.equal(first.numberId, number.id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, "AWBULI");
  assert.equal(calls[0].tenantScope, "default");
  assert.equal(calls[0].input.transportId, "wa-live-1");

  const replay = await messaging.ingest({
    transportId: "wa-live-1",
    tenantScope: "default",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold 5 bags of rice for 5k",
    messageId: "wamid-1"
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.caseId, first.caseId);
  assert.equal(calls.length, 1);

  const second = await messaging.ingest({
    transportId: "wa-live-1",
    tenantScope: "default",
    from: "+2348033333333",
    to: "+2348022222222",
    text: "stock rice 10 500",
    messageId: "wamid-2"
  });
  assert.equal(second.numberId, other.id);

  const wrongRecipient = await messaging.ingest({
    transportId: "wa-live-1",
    tenantScope: "default",
    from: "+2348033333333",
    to: "+2348099999999",
    text: "sold rice 1000",
    messageId: "wamid-3"
  });
  assert.equal(wrongRecipient.success, false);
  assert.equal(wrongRecipient.reason, "NUMBER_NOT_ACTIVE");
  assert.equal(calls.length, 2);

  const receipts = store.readSection("awbuliInboundReceipts");
  assert.equal(Object.keys(receipts).length, 2);
  assert.equal(Object.values(receipts).every((r) => r.tenantScope === "default"), true);
  assert.equal(Object.values(receipts).every((r) => r.deliveryClaimed === false), true);
});

test("awbuli-transport-3b — receipts survive a service restart and replay stays duplicate", async () => {
  const { store, numbers, transports, messaging } = setup();
  const number = verifiedNumber(numbers);
  transports.register({ id: "wa-restart", authorized: true, handle: {} });
  messaging.activate(number.id, { actor: "founder" });
  const args = {
    transportId: "wa-restart",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-restart"
  };
  const first = await messaging.ingest(args);
  assert.equal(first.success, true);
  assert.equal(first.duplicate, false);

  const restarted = new AwbuliMessagingService({
    numberRegistry: numbers,
    transports,
    pipeline: { run: async () => { throw new Error("restart replay must not run the pipeline"); } },
    store
  });
  const replay = await restarted.ingest(args);
  assert.equal(replay.success, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.caseId, first.caseId);
  assert.equal(replay.eventId, first.eventId);
});

test("awbuli-transport-4 — tenant isolation, disabled transport and mismatch never route", async () => {
  const { numbers, transports, messaging, calls } = setup();
  const number = verifiedNumber(numbers, { tenantScope: "tenant-a" });
  transports.register({ id: "wa-a", authorized: true, tenantScope: "tenant-a", handle: {} });
  assert.equal(messaging.activate(number.id, { actor: "founder" }).success, true);

  const crossTenant = await messaging.ingest({
    transportId: "wa-a",
    tenantScope: "tenant-b",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-tenant-1"
  });
  assert.equal(crossTenant.success, false);
  assert.equal(crossTenant.reason, "TRANSPORT_TENANT_MISMATCH");
  assert.equal(calls.length, 0);

  const wrongNumberTenant = await messaging.ingest({
    transportId: "wa-a",
    tenantScope: "tenant-a",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-tenant-2"
  });
  assert.equal(wrongNumberTenant.success, true);

  transports.markState("wa-a", "OFFLINE", { reason: "socket closed" });
  assert.equal(messaging.transportStatus({ tenantScope: "tenant-a" }).live, false);
  const offline = await messaging.ingest({
    transportId: "wa-a",
    tenantScope: "tenant-a",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-tenant-3"
  });
  assert.equal(offline.success, false);
  assert.equal(offline.reason, "TRANSPORT_OFFLINE");
  assert.equal(calls.length, 1);

  const second = verifiedNumber(numbers, { number: "+2348044444444", tenantScope: "tenant-a" });
  const blocked = messaging.activate(second.id, { actor: "founder" });
  assert.equal(blocked.success, false);
  assert.equal(blocked.number.activation.state, "BLOCKED");
});

test("awbuli-transport-4b — suspension stops routing until an explicit re-activation", async () => {
  const { numbers, transports, messaging, calls } = setup();
  const number = verifiedNumber(numbers);
  transports.register({ id: "wa-suspend", authorized: true, handle: {} });
  assert.equal(messaging.activate(number.id, { actor: "founder" }).success, true);

  numbers.setState(number.id, "SUSPENDED", { actor: "founder", reason: "pause", level: 2 });
  assert.equal(numbers.get(number.id).activation.state, "SUSPENDED");
  assert.equal(numbers.findActiveByAddress("+2348011111111"), null);

  const blocked = await messaging.ingest({
    transportId: "wa-suspend",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-suspended"
  });
  assert.equal(blocked.success, false);
  assert.equal(blocked.reason, "NUMBER_NOT_ACTIVE");
  assert.equal(calls.length, 0);

  const reactivated = messaging.activate(number.id, { actor: "founder", reason: "resume" });
  assert.equal(reactivated.success, true);
  assert.equal(reactivated.number.activation.state, "ACTIVE");
});

test("awbuli-transport-4c — public transport status exposes no handle or owner internals", () => {
  const { numbers, transports, messaging } = setup();
  const number = verifiedNumber(numbers);
  transports.register({
    id: "wa-public",
    authorized: true,
    handle: { marker: "secret-handle" },
    authorizationRef: "founder-approval-1",
    registeredBy: "founder@example.test"
  });
  messaging.activate(number.id, { actor: "founder" });

  const status = messaging.publicStatus();
  assert.equal(status.live, true);
  assert.equal(status.inbound, true);
  assert.equal(status.transport, undefined);
  assert.equal(status.authorizationRef, undefined);
  assert.equal(status.registeredBy, undefined);
  const blob = JSON.stringify(status);
  assert.equal(blob.includes("wa-public"), false);
  assert.equal(blob.includes("secret-handle"), false);
  assert.equal(blob.includes("founder@example.test"), false);
});

test("awbuli-transport-4d — concurrent duplicate delivery routes exactly once", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const run = async () => {
    calls += 1;
    await gate;
    return { eventId: "evt-concurrent", caseId: "case-concurrent" };
  };
  const { numbers, transports, messaging } = setup({ pipeline: run });
  const number = verifiedNumber(numbers);
  transports.register({ id: "wa-concurrent", authorized: true, handle: {} });
  messaging.activate(number.id, { actor: "founder" });

  const args = {
    transportId: "wa-concurrent",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-concurrent"
  };
  const first = messaging.ingest(args);
  const second = messaging.ingest(args);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1, "second concurrent delivery must not start a second pipeline run");
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.caseId, a.caseId);
  assert.equal(calls, 1);
});

test("awbuli-transport-5 — failed pipeline work is not receipted and can be retried", async () => {
  let shouldFail = true;
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (shouldFail) {
      const e = new Error("pipeline unavailable");
      e.code = "PIPELINE_DOWN";
      throw e;
    }
    return { eventId: "evt-retry", caseId: "case-retry" };
  };
  const { numbers, transports, messaging, store } = setup({ pipeline: run });
  const number = verifiedNumber(numbers);
  transports.register({ id: "wa-retry", authorized: true, handle: {} });
  messaging.activate(number.id, { actor: "founder" });

  await assert.rejects(
    () => messaging.ingest({
      transportId: "wa-retry",
      from: "+2348033333333",
      to: "+2348011111111",
      text: "sold rice 1000",
      messageId: "wamid-retry"
    }),
    (e) => e.code === "PIPELINE_DOWN"
  );
  assert.equal(store.readSection("awbuliInboundReceipts"), null);

  shouldFail = false;
  const retried = await messaging.ingest({
    transportId: "wa-retry",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-retry"
  });
  assert.equal(retried.routed, true);
  assert.equal(retried.caseId, "case-retry");
  assert.equal(calls.length, 2);

  const replay = await messaging.ingest({
    transportId: "wa-retry",
    from: "+2348033333333",
    to: "+2348011111111",
    text: "sold rice 1000",
    messageId: "wamid-retry"
  });
  assert.equal(replay.duplicate, true);
  assert.equal(calls.length, 2);
});
