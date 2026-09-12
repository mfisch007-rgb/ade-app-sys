import { test } from "node:test";
import assert from "node:assert/strict";
import { OracleFabric, ORACLE_SOURCES } from "../src/ai/OracleFabric.js";
import { PublicDataRegistry } from "../src/data/PublicDataRegistry.js";
import { LocalProvider } from "../src/ai/LocalProvider.js";
import { PROVIDER_CATALOG } from "../src/ai/ProviderCatalog.js";

function lexicalGateway() {
  return {
    getProviderStatus: () => ({ mode: "PROVIDER_NEUTRAL", providers: [], configuredProviderCount: 0, fallbackState: "OFFLINE_LEXICAL_ENGINE" }),
    dispatchPrompt: async (prompt) => ({ response: `[ADE-LEXICAL-ENGINE]: ${prompt.slice(0, 20)}`, route: "OFFLINE_LEXICAL_ENGINE", status: "SUCCESS" })
  };
}

test("oracle: zero-provider query stays deterministic and advisory", async () => {
  const oracle = new OracleFabric({ gateway: lexicalGateway() });
  const st = oracle.status();
  assert.equal(st.reasoning, "DETERMINISTIC_LEXICAL");
  const r = await oracle.query({ prompt: "assess procurement risk" });
  assert.equal(r.ok, true);
  assert.equal(r.advisoryOnly, true);
  assert.equal(r.requiresDecision, true);
  const sources = r.fragments.map((f) => f.source);
  assert.ok(sources.includes("DETERMINISTIC_RULE"));
  assert.ok(sources.includes("MODEL_OPINION"));
  assert.ok(r.fragments.every((f) => ORACLE_SOURCES.includes(f.source)));
  const opinion = r.fragments.find((f) => f.source === "MODEL_OPINION");
  assert.equal(opinion.route, "OFFLINE_LEXICAL_ENGINE");
  assert.ok(!JSON.stringify(r).includes("VERIFIED_FACT"));
});

test("oracle: sensitive privacy withholds external model calls", async () => {
  let calls = 0;
  const gw = lexicalGateway();
  gw.dispatchPrompt = async () => { calls += 1; return { response: "x", route: "GEMINI", status: "SUCCESS" }; };
  const oracle = new OracleFabric({ gateway: gw });
  const r = await oracle.query({ prompt: "customer PII review", privacy: "sensitive" });
  assert.equal(calls, 0);
  const opinion = r.fragments.find((f) => f.source === "MODEL_OPINION");
  assert.equal(opinion.route, "WITHHELD_OR_UNWIRED");
});

test("oracle: provider alternation cools down failed providers", async () => {
  const oracle = new OracleFabric({ gateway: lexicalGateway() });
  oracle.cooldownUntil.set("GEMINI", Date.now() + 60000);
  const order = oracle._pickOrder("reasoning", "internal");
  // GEMINI configured-set is empty here (stub reports 0), so order is empty;
  // with a configured stub it must sink GEMINI last.
  const gw2 = {
    getProviderStatus: () => ({ providers: [{ name: "GEMINI", configured: true }, { name: "GROQ", configured: true }], configuredProviderCount: 2 }),
    dispatchPrompt: async () => ({ response: "ok", route: "GROQ", status: "SUCCESS" })
  };
  const o2 = new OracleFabric({ gateway: gw2 });
  o2.cooldownUntil.set("GEMINI", Date.now() + 60000);
  assert.deepEqual(o2._pickOrder("reasoning", "internal"), ["GROQ", "GEMINI"]);
  assert.deepEqual(order, []);
});

test("oracle: public-data fragment carries provenance", async () => {
  const data = new PublicDataRegistry({
    fetchImpl: async () => ({ ok: true, json: async () => ({ name: { common: "Nigeria" }, region: "Africa", population: 1 }) })
  });
  const oracle = new OracleFabric({ gateway: lexicalGateway(), dataRegistry: data });
  const r = await oracle.query({ prompt: "country context", includePublicData: { source: "rest-countries", params: { code: "NGA" } } });
  const frag = r.fragments.find((f) => f.source === "EXTERNAL_PUBLIC_DATA");
  assert.ok(frag);
  assert.ok(frag.provenance);
  assert.equal(frag.provenance.source, "rest-countries");
  assert.ok(frag.provenance.retrievedAt);
  assert.equal(frag.provenance.classification, "EXTERNAL_PUBLIC_DATA");
});

test("oracle: transport failure degrades honestly, never throws", async () => {
  const data = new PublicDataRegistry({ fetchImpl: async () => { throw new Error("offline"); } });
  const oracle = new OracleFabric({ gateway: lexicalGateway(), dataRegistry: data });
  const r = await oracle.query({ prompt: "gdp context", includePublicData: { source: "world-bank", params: { country: "NG" } } });
  const frag = r.fragments.find((f) => f.source === "EXTERNAL_PUBLIC_DATA");
  assert.equal(frag.confidence, 0);
  assert.ok(String(frag.content).includes("unavailable"));
});

test("oracle: provider catalog is research metadata, never credentials", () => {
  assert.ok(PROVIDER_CATALOG.length >= 8);
  const ids = PROVIDER_CATALOG.map((p) => p.id);
  for (const id of ["gemini", "groq", "openrouter", "cerebras", "huggingface", "cloudflare-workers-ai"]) {
    assert.ok(ids.includes(id), id);
  }
  const dump = JSON.stringify(PROVIDER_CATALOG);
  assert.ok(!dump.includes("sk-") && !dump.includes("API_KEY="));
  assert.ok(PROVIDER_CATALOG.every((p) => p.freeTier && p.oracleUse && p.lockIn));
});

test("oracle: local provider never claims ONLINE on serverless or unconfigured", () => {
  const lp = new LocalProvider({ command: null });
  const st = lp.status();
  assert.ok(["NOT_CONFIGURED", "UNAVAILABLE_SERVERLESS"].includes(st.state));
  assert.notEqual(st.state, "ONLINE");
});
