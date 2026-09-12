/**
 * ADE ORACLE FABRIC — provider-neutral intelligence composition (expansion batch).
 *
 *       ADE ORACLE
 *            │
 *   ┌────────┼────────┐        ┌────────────┼────────────┐
 *   ↓        ↓        ↓        ↓            ↓            ↓
 * REASONING KNOWLEDGE PERCEPTION  AI_MODELS  INTERNAL  PUBLIC
 *   (AI)     (AI)      (AI)     (models)    (data)    (data)
 *            └────────┼────────┘             └──────┼─────┘
 *                     ↓                            ↓
 *               ADE GUARDIAN (advisory gate — never bypassed)
 *                     ↓
 *               ADE DECISION / WORKFLOW (existing authorities)
 *
 * Source tags (never present opinion as fact):
 * MODEL_OPINION | INTERNAL_KNOWLEDGE | EXTERNAL_PUBLIC_DATA |
 * OBSERVED_SYSTEM_DATA | DETERMINISTIC_RULE | HUMAN_INPUT
 */

export const ORACLE_SOURCES = Object.freeze([
  "MODEL_OPINION",
  "INTERNAL_KNOWLEDGE",
  "EXTERNAL_PUBLIC_DATA",
  "OBSERVED_SYSTEM_DATA",
  "DETERMINISTIC_RULE",
  "HUMAN_INPUT"
]);

const CAPABILITY_PREFERENCE = Object.freeze({
  reasoning: ["GEMINI", "GROQ", "DEEPSEEK", "QWEN"],
  knowledge: ["GROQ", "GEMINI", "DEEPSEEK", "QWEN"],
  perception: ["GEMINI", "GROQ", "QWEN", "DEEPSEEK"]
});

const COOLDOWN_MS = 60 * 1000;

export class OracleFabric {
  constructor({ gateway = null, knowledge = null, dataRegistry = null, healthSnapshot = null, eventBus = null } = {}) {
    this.gateway = gateway;
    this.knowledge = knowledge; // { search/query } accessor or null
    this.dataRegistry = dataRegistry;
    this.healthSnapshot = healthSnapshot; // () => object or null
    this.eventBus = eventBus;
    this.cooldownUntil = new Map(); // provider -> timestamp
  }

  status() {
    let providerStatus = null;
    try { providerStatus = this.gateway?.getProviderStatus?.() || null; } catch { providerStatus = null; }
    const configured = providerStatus?.providers?.filter((p) => p.configured).map((p) => p.name) || [];
    return {
      mode: "PROVIDER_NEUTRAL_FABRIC",
      reasoning: configured.length ? `PROVIDER_BACKED (${configured.join(",")})` : "DETERMINISTIC_LEXICAL",
      knowledge: this.knowledge ? "WIRED" : "UNWIRED",
      publicData: this.dataRegistry ? "WIRED" : "UNWIRED",
      perception: configured.includes("GEMINI") ? "AVAILABLE" : "DEGRADED_TO_TEXT",
      configuredProviders: configured,
      cooledDown: [...this.cooldownUntil.entries()].filter(([, until]) => Date.now() < until).map(([k]) => k),
      advisoryOnly: true,
      fallback: "OFFLINE_LEXICAL_ENGINE"
    };
  }

  _pickOrder(capability, privacy) {
    const base = [...(CAPABILITY_PREFERENCE[capability] || CAPABILITY_PREFERENCE.reasoning)];
    const now = Date.now();
    // Privacy: sensitive queries skip external providers entirely.
    if (privacy === "sensitive") return [];
    // Cool-down: recently errored providers sink to the end.
    base.sort((a, b) => {
      const ca = (this.cooldownUntil.get(a) || 0) > now ? 1 : 0;
      const cb = (this.cooldownUntil.get(b) || 0) > now ? 1 : 0;
      return ca - cb;
    });
    // Keep only configured providers (gateway enforces keys too).
    try {
      const st = this.gateway?.getProviderStatus?.();
      const ok = new Set((st?.providers || []).filter((p) => p.configured).map((p) => p.name));
      return base.filter((n) => ok.has(n));
    } catch { return []; }
  }

  /**
   * Advisory query. Returns fragments with source tags + confidence.
   * Never executes consequential actions; Guardian/Decision own authority.
   */
  async query({ prompt, capability = "reasoning", privacy = "internal", includePublicData = null, humanInput = null } = {}) {
    const fragments = [];
    const text = String(prompt || "").slice(0, 4000);
    if (!text) return { ok: false, error: "prompt is required", advisoryOnly: true };

    // 1) Deterministic rule layer (always present).
    fragments.push({
      source: "DETERMINISTIC_RULE",
      confidence: 1.0,
      content: `Query classified for capability '${capability}' with privacy '${privacy}'. External calls apply only to non-sensitive fragments.`
    });

    // 2) Internal knowledge (lexical, if wired).
    if (this.knowledge) {
      try {
        const fn = this.knowledge.search || this.knowledge.query || this.knowledge.retrieve;
        const hits = fn ? await fn.call(this.knowledge, text, { limit: 5 }) : null;
        fragments.push({
          source: "INTERNAL_KNOWLEDGE",
          confidence: hits ? 0.7 : 0.3,
          content: hits || "No internal knowledge hits."
        });
      } catch (e) {
        fragments.push({ source: "INTERNAL_KNOWLEDGE", confidence: 0.1, content: `Knowledge lookup failed: ${e?.message || e}` });
      }
    }

    // 3) External public data (only explicit, no-key sources; each tagged).
    if (includePublicData && this.dataRegistry) {
      const { source: sourceId, params } = includePublicData;
      const res = await this.dataRegistry.retrieve(sourceId, params || {});
      fragments.push({
        source: "EXTERNAL_PUBLIC_DATA",
        confidence: res.ok ? (res.provenance?.confidence ?? 0.7) : 0,
        content: res.ok ? res.records : `Public data unavailable: ${res.error}`,
        provenance: res.provenance || null
      });
    }

    // 4) Observed system data (health snapshot, if provided).
    if (this.healthSnapshot) {
      try {
        fragments.push({ source: "OBSERVED_SYSTEM_DATA", confidence: 0.9, content: await this.healthSnapshot() });
      } catch (e) {
        fragments.push({ source: "OBSERVED_SYSTEM_DATA", confidence: 0.1, content: `Snapshot failed: ${e?.message || e}` });
      }
    }

    // 5) Model opinion (provider-neutral cascade; sensitive → skipped).
    if (this.gateway && privacy !== "sensitive") {
      const order = this._pickOrder(capability, privacy);
      let routed = null;
      // Temporarily bias gateway order by re-listing? Gateway cascades its own
      // declaration order; our preference is advisory here and recorded.
      try {
        const res = await this.gateway.dispatchPrompt(text, { capability });
        routed = res;
      } catch (e) {
        routed = { response: null, route: "FAILED", status: "FAILED", error: e?.message || String(e) };
      }
      if (routed?.route && routed.route !== "FAILED" && !["EXACT_CACHE", "SEMANTIC_CACHE", "OFFLINE_LEXICAL_ENGINE"].includes(routed.route)) {
        // success via live provider — nothing to cool down
      }
      if (routed?.status === "FAILED") {
        for (const name of order) this.cooldownUntil.set(name, Date.now() + COOLDOWN_MS);
      }
      fragments.push({
        source: "MODEL_OPINION",
        confidence: routed?.route === "OFFLINE_LEXICAL_ENGINE" ? 0.4 : routed?.route?.endsWith?.("_CACHE") ? 0.55 : 0.65,
        content: routed?.response ?? "No model response.",
        route: routed?.route || "UNKNOWN",
        preferredOrder: order
      });
    } else {
      fragments.push({
        source: "MODEL_OPINION",
        confidence: 0.2,
        content: privacy === "sensitive"
          ? "Withheld: sensitive query stays on deterministic/internal paths by policy."
          : "No gateway wired; deterministic path only.",
        route: "WITHHELD_OR_UNWIRED"
      });
    }

    // 6) Human input (echoed, tagged).
    if (humanInput !== null && humanInput !== undefined) {
      fragments.push({ source: "HUMAN_INPUT", confidence: 1.0, content: String(humanInput).slice(0, 2000) });
    }

    try { this.eventBus?.publish?.("oracle.fabric.queried", { capability, fragments: fragments.length }); } catch {}
    return {
      ok: true,
      advisoryOnly: true,
      authority: "Guardian/Decision retain execution authority; Oracle output is advisory.",
      fragments,
      requiresDecision: true
    };
  }
}

export default OracleFabric;
