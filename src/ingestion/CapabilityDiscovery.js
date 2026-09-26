/**
 * ADE CAPABILITY DISCOVERY SEAM (Batch 10A)
 *
 * Accepts SUPPORTED EXTERNAL EVIDENCE only and normalizes it into canonical
 * CapabilityRecord inputs (Batch 6D shape). Never executes foreign code.
 * Malformed evidence → coded errors. Unknown classes → explicit refusal.
 * Every emitted record preserves source/provenance and honest confidence.
 */

import crypto from "node:crypto";

export const EVIDENCE_CLASSES = Object.freeze([
  "MANIFEST",
  "PRODUCT_SPEC",
  "OPENAPI",
  "WEBHOOK_SPEC",
  "SDK_METADATA",
  "INTEGRATION_METADATA"
]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function str(v, max = 500) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

function toIntent(name, fallback = "UNKNOWN_CAPABILITY") {
  const s = str(name, 120);
  if (!s) return fallback;
  const split = s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
  const snake = split.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 120);
  return snake || fallback;
}

function sourceHashOf(fragment) {
  try {
    const canonical = JSON.stringify(sortKeys(fragment));
    return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
  } catch {
    return null;
  }
}

function sortKeys(node) {
  if (Array.isArray(node)) return node.map(sortKeys);
  if (node && typeof node === "object") {
    const out = {};
    for (const k of Object.keys(node).sort()) out[k] = sortKeys(node[k]);
    return out;
  }
  return node;
}

function completenessConfidence({ inputs, outputs, dependencies, description }) {
  const hasIO = inputs && Object.keys(inputs).length > 0 && outputs && Object.keys(outputs).length > 0;
  const hasDeps = Array.isArray(dependencies);
  if (hasIO && hasDeps && description) return 0.85;
  if (hasIO || description) return 0.6;
  return 0.35;
}

function baseInput(entry, ctx) {
  const inputs = entry.inputs && typeof entry.inputs === "object" && !Array.isArray(entry.inputs) ? entry.inputs : {};
  const outputs = entry.outputs && typeof entry.outputs === "object" && !Array.isArray(entry.outputs) ? entry.outputs : {};
  const dependencies = Array.isArray(entry.dependencies) ? entry.dependencies : Array.isArray(entry.requires) ? entry.requires : [];
  const description = str(entry.description || entry.summary, 2000) || "";
  return {
    intent: toIntent(entry.intent || entry.name || entry.operationId),
    name: str(entry.name || entry.intent || entry.operationId, 200) || "Unnamed capability",
    description,
    sourceSystem: ctx.sourceSystem,
    sourceVersion: ctx.sourceVersion,
    sourceReference: ctx.sourceReference,
    sourceHash: sourceHashOf(entry),
    discoveryMethod: ctx.evidenceClass,
    evidenceReferences: ctx.evidenceReferences,
    inputs,
    outputs,
    dependencies,
    permissions: entry.permissions || { minLevel: 1, roles: [] },
    tenantScope: ctx.tenantScope,
    executionMode: "UNKNOWN",
    providerRequirements: Array.isArray(entry.providerRequirements) ? entry.providerRequirements : [],
    sideEffects: Array.isArray(entry.sideEffects) ? entry.sideEffects : ["UNKNOWN"],
    integrationMethod: "UNKNOWN",
    confidence: completenessConfidence({ inputs, outputs, dependencies, description }),
    evidence: [`discovered via ${ctx.evidenceClass}`, `source: ${ctx.sourceSystem}@${ctx.sourceVersion}`],
    status: "DISCOVERED",
    owner: "OPERATOR"
  };
}

function entriesFromManifest(evidence) {
  if (Array.isArray(evidence.capabilities)) return evidence.capabilities;
  if (Array.isArray(evidence.operations)) return evidence.operations;
  if (Array.isArray(evidence.features)) return evidence.features.map((f) => (typeof f === "string" ? { name: f } : f));
  if (evidence.name) return [{ name: evidence.name, description: evidence.description, version: evidence.version }];
  return null;
}

function entriesFromOpenAPI(evidence) {
  if (typeof evidence !== "object" || !evidence.paths || typeof evidence.paths !== "object") return null;
  const out = [];
  for (const [p, methods] of Object.entries(evidence.paths)) {
    if (!methods || typeof methods !== "object") continue;
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== "object") continue;
      const params = Array.isArray(op.parameters) ? op.parameters.map((x) => x?.name || "param") : [];
      out.push({
        intent: `${method}_${p}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
        name: op.summary || `${method.toUpperCase()} ${p}`,
        description: op.description || op.summary || "",
        inputs: Object.fromEntries(params.map((n) => [String(n).slice(0, 80), "query/body parameter"])),
        outputs: op.responses && typeof op.responses === "object" ? { responses: Object.keys(op.responses).join(",") } : {},
        dependencies: evidence?.components?.securitySchemes ? ["auth:" + Object.keys(evidence.components.securitySchemes).join(",")] : []
      });
    }
  }
  return out;
}

function entriesFromWebhook(evidence) {
  const list = Array.isArray(evidence.events) ? evidence.events : Array.isArray(evidence.topics) ? evidence.topics : null;
  if (!list) return null;
  return list.map((e) => (typeof e === "string" ? { name: e } : e));
}

function entriesFromSdk(evidence) {
  const list = Array.isArray(evidence.exports) ? evidence.exports : Array.isArray(evidence.functions) ? evidence.functions : null;
  if (!list) return null;
  return list.map((e) => (typeof e === "string" ? { name: e } : e));
}

/**
 * Discover capabilities from supported evidence. Returns an ARRAY of
 * canonical-record inputs (possibly length 1). Throws on malformed or
 * unsupported evidence — never invents capabilities.
 */
export function discoverCapabilities({ evidenceClass = null, evidence = null, sourceSystem = "UNKNOWN", sourceVersion = "0", sourceReference = null, tenantScope = "default", evidenceReferences = [] } = {}) {
  const cls = str(evidenceClass, 40);
  if (!cls || !EVIDENCE_CLASSES.includes(cls.toUpperCase())) {
    throw fail("UNKNOWN_EVIDENCE_CLASS", `supported: ${EVIDENCE_CLASSES.join(",")}.`);
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw fail("MALFORMED_EVIDENCE", "evidence must be a non-null object.");
  }
  const upper = cls.toUpperCase();
  const ctx = {
    evidenceClass: upper,
    sourceSystem: str(sourceSystem, 160) || "UNKNOWN",
    sourceVersion: str(sourceVersion, 80) || "0",
    sourceReference: str(sourceReference, 500),
    tenantScope: str(tenantScope, 80) || "default",
    evidenceReferences: Array.isArray(evidenceReferences) ? evidenceReferences.map((x) => String(x).slice(0, 500)).slice(0, 20) : []
  };
  let entries = null;
  if (upper === "MANIFEST" || upper === "PRODUCT_SPEC" || upper === "INTEGRATION_METADATA") {
    entries = upper === "INTEGRATION_METADATA" && Array.isArray(evidence.capabilities)
      ? evidence.capabilities
      : entriesFromManifest(evidence);
  } else if (upper === "OPENAPI") {
    entries = entriesFromOpenAPI(evidence);
  } else if (upper === "WEBHOOK_SPEC") {
    entries = entriesFromWebhook(evidence);
  } else if (upper === "SDK_METADATA") {
    entries = entriesFromSdk(evidence);
  }
  if (!entries || !entries.length) throw fail("MALFORMED_EVIDENCE", `${upper} carries no recognizable capability entries.`);
  return entries.map((entry) => baseInput(typeof entry === "string" ? { name: entry } : entry || {}, ctx));
}
