/**
 * ADE CAPABILITY EXCHANGE — mutual-enhancement model (expansion batch).
 *
 * Reuses: ProductRegistry (catalog), CapabilityRegistry (ADE live set),
 * ConnectionFabric.inspect() (verified product evidence). No duplicates.
 *
 * Relationship is bidirectional: ADE ↕ PRODUCT (never ADE → PRODUCT only).
 * Output per product:
 *   PRODUCT CAPABILITIES + ADE CAPABILITIES + OVERLAP + MISSING +
 *   SAFE AUGMENTATIONS + REQUIRED HUMAN ACTION
 *
 * Truth rules:
 * - Product capabilities come from manifests + adapter/engine evidence only.
 * - ADE capabilities come from the live CapabilityRegistry only.
 * - SAFE AUGMENTATIONS never include credential bypass, vendor execution,
 *   or fabricated handlers. Each augmentation names its human action.
 */

import fs from "node:fs";
import path from "node:path";

function safeJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function listAdeCapabilities(capabilityRegistry) {
  try {
    const list = capabilityRegistry?.listCapabilities?.() || [];
    return list.filter((c) => !c?.revoked).map((c) => String(c.intent || c.id || "").toUpperCase()).filter(Boolean);
  } catch { return []; }
}

function productCapabilities(productId, root = process.cwd()) {
  const manifest = safeJson(path.join(root, "products", productId, "manifest.json"));
  const adapterPresent = (() => { try { return fs.existsSync(path.join(root, "products", productId, "adapter.js")); } catch { return false; } })();
  // Declared = manifest-declared + adapter/engine files actually present.
  const declared = [];
  if (manifest) declared.push(`MANIFEST:${manifest.name || productId}@${manifest.version || "0"}`);
  if (adapterPresent) declared.push("ADAPTER_PRESENT");
  const engineFiles = ["AwbuliEngine.js", "ProcartaEngine.js", "NexusLedgerEngine.js", "EventosEngine.js", "NexusGateway.js", "EventosGateway.js"];
  for (const f of engineFiles) {
    try { if (fs.existsSync(path.join(root, "products", productId, f))) declared.push(`ENGINE:${f}`); } catch {}
  }
  // Canonical in-process engines (src/) count as completed capabilities.
  if (productId === "procarta") {
    try { if (fs.existsSync(path.join(root, "src", "procarta", "ProcartaExecutionEngine.js"))) declared.push("CANONICAL:PROCARTA_EXECUTE"); } catch {}
  }
  return { manifest, adapterPresent, declared };
}

export class CapabilityExchange {
  constructor({ productRegistry = null, capabilityRegistry = null, connectionFabric = null } = {}) {
    this.productRegistry = productRegistry;
    this.capabilityRegistry = capabilityRegistry;
    this.connectionFabric = connectionFabric;
  }

  /**
   * Compare one product against ADE. All sets are evidence-derived.
   */
  compare(productId) {
    const id = String(productId || "").toLowerCase();
    const prod = productCapabilities(id);
    const ade = listAdeCapabilities(this.capabilityRegistry);
    const inspected = (() => { try { return this.connectionFabric?.inspect?.(id) || null; } catch { return null; } })();

    const productCaps = [...prod.declared];
    if (inspected?.connected?.length) for (const c of inspected.connected) productCaps.push(`VERIFIED:${c}`);
    const adeCaps = [...ade];

    // Overlap: lexical intent match between product verified items and ADE intents.
    const overlap = [];
    const missing = [];
    for (const pc of productCaps) {
      const hit = adeCaps.find((a) => pc.toUpperCase().includes(a) || a.includes(pc.split(":").pop().toUpperCase().slice(0, 12)));
      if (hit) overlap.push({ product: pc, ade: hit });
      else missing.push(pc);
    }

    // ADE capabilities the product could consume (selected, safe, local-only).
    const consumableByProduct = adeCaps.filter((a) => ["PING", "PUBLIC_INFO", "UNIVERSAL_AI_GATEWAY", "SYSTEM_HEALTH", "TELEMETRY_SSE", "PROCARTA_DIAGNOSTIC_EXECUTE", "CASE_CREATE"].includes(a)).slice(0, 12);

    // Safe augmentations: only non-credential, non-vendor, human-approved steps.
    const safeAugmentations = [];
    if (id === "awbuli") {
      safeAugmentations.push({ augmentation: "Use local Suite engine (lead capture + queued broadcast) with no external dependency.", humanAction: "None for local path; configure AWBULI_API_URL + AWBULI_API_KEY only if the external bridge is wanted." });
      if (!(process.env.AWBULI_API_URL && process.env.AWBULI_API_KEY)) {
        safeAugmentations.push({ augmentation: "Queue-first broadcast (no live send until bridge verified).", humanAction: "Founder verifies bridge via POST verify before enabling live send." });
      }
    }
    if (id === "procarta") {
      safeAugmentations.push({ augmentation: "Expose PROCARTA_DIAGNOSTIC_EXECUTE to the product intake path.", humanAction: "Confirm pilot scope; promotion stays operator-approved." });
    }
    if (!safeAugmentations.length && inspected && inspected.state !== "CONNECTED") {
      safeAugmentations.push({ augmentation: "Narrow scope to the verified subset; operate degraded honestly.", humanAction: inspected.requiredAction || "Resolve the listed blocker, then re-verify." });
    }

    const requiredHumanAction = inspected?.requiredAction
      || (inspected?.state === "CONNECTED" ? null : "Review the unavailable list and supply the named credential/adapter, then re-verify.");

    return {
      product: prod.manifest?.name || id,
      id,
      direction: "ADE↕PRODUCT",
      productCapabilities: productCaps,
      adeCapabilities: adeCaps.slice(0, 40),
      adeCapabilityCount: adeCaps.length,
      overlap,
      missingCapabilities: missing,
      consumableByProduct,
      safeAugmentations,
      requiredHumanAction,
      connectionState: inspected ? { state: inspected.state, grip: inspected.grip } : null,
      activated: false,
      note: "Comparison only. Activation requires a verified connection plus a real handler (never fabricated)."
    };
  }

  inventory() {
    const ids = ["awbuli", "procarta", "nexus", "eventos"];
    return ids.map((id) => this.compare(id));
  }
}

export default CapabilityExchange;
