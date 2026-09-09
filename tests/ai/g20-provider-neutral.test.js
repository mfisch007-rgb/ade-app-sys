import { test } from "node:test";
import assert from "node:assert/strict";
import { UniversalAIGateway } from "../../src/ai/UniversalAIGateway.js";

/**
 * G20 — Provider-Neutral AI Contract (canonical authority: UniversalAIGateway)
 *
 * These tests prove behaviour WITHOUT calling any live paid API:
 *  - canonical gateway authority is the single provider-neutral entry point
 *  - provider selection is deterministic and config-gated
 *  - missing configuration is handled safely (no fabricated connectivity)
 *  - provider failure is isolated and never crashes the caller
 *  - offline lexical fallback is honest (never masquerades as live AI)
 *  - no fake external-provider success is ever produced
 */

// Snapshot the environment so tests never depend on real keys.
const ORIGINAL_ENV = { ...process.env };
function clearProviderEnv() {
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "DEEPSEEK_API_KEY", "QWEN_API_KEY"]) {
    delete process.env[k];
  }
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV) && k !== undefined) delete process.env[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function freshGateway() {
  const gateway = new UniversalAIGateway();
  gateway.semanticCache.clear();
  return gateway;
}

test("G20.A — UniversalAIGateway is the canonical provider-neutral authority", () => {
  const gateway = freshGateway();
  // 4 providers + offline fallback, single dispatch entry point.
  assert.equal(gateway.providers.length, 4);
  const names = gateway.providers.map(p => p.name).sort();
  assert.deepEqual(names, ["DEEPSEEK", "GEMINI", "GROQ", "QWEN"]);
  assert.equal(typeof gateway.dispatchPrompt, "function");
  // Provider invocation is routed internally; consumers call one entry point.
  assert.equal(typeof gateway.getProviderStatus, "function");
});

test("G20.B — provider selection is deterministic and config-gated", async () => {
  clearProviderEnv();
  // Only Gemini is configured.
  process.env.GEMINI_API_KEY = "test-key-gemini";
  const gateway = freshGateway();
  // Stub the transport to simulate a real (but mocked) successful Gemini
  // response. Only Gemini's URL matches, proving only the configured provider fires.
  gateway.fetchWithTimeout = async (url) => {
    if (url.includes("generativelanguage.googleapis.com")) {
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "[MOCK GEMINI RESPONSE]" }] } }] }) };
    }
    return { ok: false, status: 500 };
  };
  const result = await gateway.dispatchPrompt("analyze community intake");
  assert.equal(result.route, "GEMINI");
  assert.equal(result.status, "SUCCESS");
  restoreEnv();
});

test("G20.C — missing provider configuration is handled safely (no fake connectivity)", () => {
  clearProviderEnv();
  const gateway = freshGateway();
  const status = gateway.getProviderStatus();
  assert.equal(status.configuredProviderCount, 0);
  assert.equal(status.totalProviderCount, 4);
  // No provider is claimed to be live-connected without a real call.
  assert.ok(status.providers.every(p => p.liveConnected === false));
  assert.ok(status.providers.every(p => p.state === "UNCONFIGURED"));
  restoreEnv();
});

test("G20.D — provider failure is isolated and never crashes the caller", async () => {
  clearProviderEnv();
  // Configure ALL providers but make every remote call fail (network/HTTP).
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "DEEPSEEK_API_KEY", "QWEN_API_KEY"]) {
    process.env[k] = "test-key";
  }
  const gateway = freshGateway();
  let publishCount = 0;
  const originalPublish = gateway.eventBus.publish.bind(gateway.eventBus);
  gateway.eventBus.publish = async (...args) => { publishCount++; return originalPublish(...args); };
  // Every remote transport throws (simulated outage / bad key).
  gateway.fetchWithTimeout = async () => {
    const err = new Error("network-unreachable");
    err.res = { ok: false };
    throw err;
  };
  // The dispatch must resolve (not reject) and fall through to fallback.
  const result = await gateway.dispatchPrompt("intake analysis");
  assert.equal(result.route, "OFFLINE_LEXICAL_ENGINE");
  assert.equal(result.status, "SUCCESS");
  // AI_PROVIDER_ERROR events were emitted for the failed providers.
  assert.ok(publishCount >= 1);
  restoreEnv();
});

test("G20.E — offline fallback is honest: deterministic, not live AI", async () => {
  clearProviderEnv();
  const gateway = freshGateway();
  const result = await gateway.dispatchPrompt("community boot analysis");
  assert.equal(result.route, "OFFLINE_LEXICAL_ENGINE");
  // The fallback response is explicitly labelled as the ADE offline engine,
  // it never claims to be a successful Gemini/Groq/DeepSeek/Qwen response.
  assert.match(result.response, /OFFLINE|LEXICAL/i);
  assert.doesNotMatch(result.response, /GEMINI LIVE|GROQ LIVE|SUCCESS via GEMINI/i);
  assert.doesNotMatch(result.route, /GEMINI|GROQ|DEEPSEEK|QWEN$/);
  restoreEnv();
});

test("G20.F — no fake external-provider success is produced when unconfigured", async () => {
  clearProviderEnv();
  const gateway = freshGateway();
  const result = await gateway.dispatchPrompt("deepseek-only request");
  // No configured provider => never routed to a live provider.
  assert.notEqual(result.route, "DEEPSEEK");
  assert.notEqual(result.route, "GEMINI");
  assert.notEqual(result.route, "GROQ");
  assert.notEqual(result.route, "QWEN");
  restoreEnv();
});
