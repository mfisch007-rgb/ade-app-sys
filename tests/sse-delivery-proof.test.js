import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// SSE DELIVERY PROOF — a connected SSE subscriber must receive a REAL
// application-generated event through the canonical path:
// WorkforceManager operation → canonical EventBus → wildcard bridge →
// TelemetrySSEGateway → HTTP SSE subscriber → parsed event.
// "SSE CONNECTED" alone proves nothing; delivery of a genuine event does.

const { LocalStorageAdapter } = await import(
  pathToFileURL(path.resolve("src/storage/LocalStorageAdapter.js")).href
);
const { WorkforceManager } = await import(
  pathToFileURL(path.resolve("src/identity/WorkforceManager.js")).href
);
const { TelemetrySSEGateway } = await import(
  pathToFileURL(path.resolve("src/telemetry/TelemetrySSEGateway.js")).href
);
const KernelEventBus = (
  await import(pathToFileURL(path.resolve("src/core/EventBus.js")).href)
).default;

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-sse-proof-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return new LocalStorageAdapter(file);
}

test("SSE-1 — canonical bus is singular: kernel facade resolves the same instance as the gateway", async () => {
  const a = KernelEventBus.getInstance();
  const b = KernelEventBus.getInstance();
  assert.equal(a, b, "getInstance must return the singleton");
  const gw = new TelemetrySSEGateway();
  assert.equal(gw.eventBus, a, "gateway must bridge the canonical bus, not a private copy");
});

test("SSE-2 — real workforce login event reaches a live HTTP SSE subscriber end-to-end", async (t) => {
  const { default: expressMod } = await import("express");
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));
  const bus = KernelEventBus.getInstance();
  const gateway = new TelemetrySSEGateway();
  // Same route contract as src/app.js: initial STREAM_CONNECTED frame, then bridge.
  app.get("/api/v1/events/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "STREAM_CONNECTED", service: "ADE_EVENT_STREAM" })}\n\n`);
    gateway.addClient(res);
    req.on("close", () => gateway.removeClient(res));
    res.on("close", () => gateway.removeClient(res));
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // Connect a REAL HTTP SSE subscriber before the application operation.
  const received = [];
  const controller = new AbortController();
  t.after(() => { try { controller.abort(); } catch {} });
  const reader = (async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/events/stream`, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/event-stream/);
    const body = res.body;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const m = frame.match(/^data: (.*)$/m);
          if (m) {
            try {
              received.push(JSON.parse(m[1]));
            } catch {}
          }
          if (received.length >= 2) return;
        }
      }
    } catch (e) {
      if (e && e.name !== "AbortError") throw e;
    }
  })();
  const readerDone = reader.catch(() => {});

  // The subscriber must be ATTACHED before the operation (events are live,
  // not replayed): wait for the connected frame, then act.
  const attached = Date.now() + 8000;
  while (Date.now() < attached) {
    if (received.some((e) => e && e.type === "STREAM_CONNECTED")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(received.some((e) => e && e.type === "STREAM_CONNECTED"), "subscriber must attach before the operation");
  // Genuine application operation on the SAME canonical bus.
  const workforce = new WorkforceManager({ store: tempStore(t), eventBus: bus });
  await workforce.initialize();
  await workforce.provisionFounder({ fullName: "SSE Founder", username: "ssefounder", password: "SsePass!123", pin: "123456" });
  const person = await workforce.authenticate("ssefounder", "SsePass!123");
  assert.ok(person, "real login must succeed");

  // Await delivery with a bounded deadline (event path is async).
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const business = received.filter((e) => e && e.type !== "STREAM_CONNECTED");
    if (business.length >= 1) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  try { controller.abort(); } catch {}
  await readerDone;
  const types = received.map((e) => e && (e.type || e.topic));
  assert.ok(types.includes("STREAM_CONNECTED"), `subscriber must see the connected frame, saw: ${types.join(",")}`);
  const business = received.filter((e) => e && e.type !== "STREAM_CONNECTED");
  assert.ok(business.length >= 1, `at least one genuine application event must be delivered, saw: ${types.join(",")}`);
  const payload = JSON.stringify(business[0]);
  assert.ok(/WORKFORCE_LOGIN|SECURITY_EVENT|SESSION_ISSUED|ssefounder/i.test(payload),
    `delivered event must carry the real operation identity, got: ${payload.slice(0, 200)}`);
});

test("SSE-3 — heartbeat discipline: comments never masquerade as business events", () => {
  const app = fs.readFileSync(path.resolve("src/app.js"), "utf8");
  assert.ok(app.includes('res.write(": heartbeat'), "heartbeats must be SSE comments, not data frames");
  const founder = fs.readFileSync(path.resolve("public/founder.html"), "utf8");
  assert.ok(founder.includes("Waiting for live events"), "idle stream must render a truthful waiting state");
});
