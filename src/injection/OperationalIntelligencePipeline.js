/**
 * ADE CANONICAL OPERATIONAL-INFORMATION PIPELINE (NEXT enablement — additive).
 *
 * One canonical path, no per-source logic forks:
 *   INPUT -> INGESTION -> EXTRACTION -> STRUCTURING -> VALIDATION
 *   -> TENANT/ORG CONTEXT -> CLASSIFICATION -> CAPABILITY DISCOVERY
 *   -> RULE/CONFIDENCE EVALUATION -> DECISION -> AUTHORIZED EXECUTION
 *   -> RESULT -> AUDIT -> EXPERIENCE/LEARNING -> REUSE
 *
 * Reuses existing authorities only: InjectionAdapter family for ingestion,
 * NormalizedEventEnvelope for structuring/validation, BusinessMeaningExtractor
 * for extraction, InjectionToCaseMapper + UnifiedIntakeEngine for capability/
 * case routing, canonical EventBus for audit/telemetry. No new bus, engine,
 * registry, or isolation mechanism is created here.
 */

import { validateEventEnvelope } from "../ingestion/NormalizedEventEnvelope.js";
import { extractBusinessMeaning } from "../ingestion/BusinessMeaningExtractor.js";
import { nowIso } from "../capabilities/CapabilityRecord.js";

const STAGES = Object.freeze([
  "INPUT", "INGESTION", "EXTRACTION", "STRUCTURING", "VALIDATION",
  "TENANT_CONTEXT", "CLASSIFICATION", "CAPABILITY_DISCOVERY",
  "RULE_CONFIDENCE", "DECISION", "AUTHORIZED_EXECUTION",
  "RESULT", "AUDIT", "EXPERIENCE", "REUSE"
]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export const PIPELINE_STAGES = STAGES;

export class OperationalIntelligencePipeline {
  constructor({
    adapters = {},
    caseMapper = null,
    capabilityDiscovery = null,
    procarta = null,
    governance = null,
    eventBus = null
  } = {}) {
    this.adapters = { ...(adapters || {}) };
    this.caseMapper = caseMapper || null;
    this.capabilityDiscovery = capabilityDiscovery || null;
    this.procarta = procarta || null;
    this.governance = governance || null;
    this.eventBus = eventBus || null;
  }

  registerAdapter(sourceKey, adapter) {
    if (!sourceKey || !adapter?.normalize) throw fail("PIPELINE_ADAPTER_INVALID");
    this.adapters[String(sourceKey).toUpperCase()] = adapter;
    return true;
  }

  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "OPERATIONAL_PIPELINE", action, at: nowIso(), ...fields }); } catch {}
  }

  _telemetry(stage, fields = {}) {
    try { this.eventBus?.publish?.("pipeline.stage.completed", { stage, at: nowIso(), ...fields }); } catch {}
  }

  async run({ source = "UNKNOWN", input = {}, tenantScope = "default", actor = "SYSTEM", purpose = null } = {}) {
    const startedAt = nowIso();
    const scope = String(tenantScope || "default");
    const key = String(source || "UNKNOWN").toUpperCase();
    const adapter = this.adapters[key];
    if (!adapter) throw fail("PIPELINE_UNKNOWN_SOURCE", `no adapter registered for '${source}'.`);
    if (purpose && this.governance?.checkPurpose && !this.governance.checkPurpose({ purpose, source: key, tenantScope: scope })) {
      throw fail("PIPELINE_PURPOSE_UNAUTHORIZED", `purpose '${purpose}' is not authorized for '${source}'.`);
    }

    // INGESTION + STRUCTURING + VALIDATION (adapter normalizes; envelope validates)
    const envelope = adapter.normalize({ ...input, tenantScope: input.tenantScope || scope });
    const validation = validateEventEnvelope(envelope);
    if (!validation.valid) throw fail("PIPELINE_ENVELOPE_INVALID", validation.errors.join(","));
    // TENANT CONTEXT — envelope tenant must be visible to caller scope
    if (envelope.tenantScope !== "default" && envelope.tenantScope !== scope) {
      throw fail("TENANT_MISMATCH", `event tenant '${envelope.tenantScope}' is not visible to '${scope}'.`);
    }
    this._telemetry("INGESTION", { eventId: envelope.eventId, source: key, tenantScope: envelope.tenantScope });

    // EXTRACTION + CLASSIFICATION (deterministic; never invents)
    const meaning = extractBusinessMeaning(envelope, input.assessment || null);
    this._telemetry("CLASSIFICATION", { eventId: envelope.eventId, category: meaning.category, confidence: meaning.confidence });

    // CAPABILITY DISCOVERY (best-effort hint; routing authority stays downstream)
    let capabilityHint = null;
    try {
      capabilityHint = await this.capabilityDiscovery?.discover?.({ text: envelope.payload.text, tenantScope: envelope.tenantScope }) || null;
    } catch { capabilityHint = null; }

    // AUTHORIZED EXECUTION — route to canonical case layer (existing intake path)
    let routing = null;
    if (this.caseMapper) {
      routing = this.caseMapper.map(envelope, { tenantScope: envelope.tenantScope, actor });
    }

    // PROCARTA context where applicable (existing engine; DEFAULT fallback preserved)
    let procartaRef = null;
    try {
      if (this.procarta && /PROCARTA|ASSESS|PROCESS|SUPPLY|INVENTORY|GENERAL/.test(String(meaning.category)) && purpose !== "NO_PROCARTA") {
        procartaRef = { engaged: true, via: "PROCARTA_EXECUTE", caseId: routing?.caseId || null };
        try { this.eventBus?.publish?.("procarta.evidence.received", { eventId: envelope.eventId, caseId: routing?.caseId || null, category: meaning.category }); } catch {}
      }
    } catch { procartaRef = null; }

    const result = {
      success: true,
      stages: STAGES,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      source: key,
      tenantScope: envelope.tenantScope,
      executionMode: envelope.executionMode,
      meaning,
      capabilityHint,
      caseId: routing?.caseId || null,
      intakeId: routing?.intakeId || null,
      duplicate: Boolean(routing?.duplicate),
      procartaRef,
      startedAt,
      completedAt: nowIso()
    };
    this._audit("PIPELINE_RUN_COMPLETED", {
      eventId: envelope.eventId, source: key, tenantScope: envelope.tenantScope,
      caseId: result.caseId, executionMode: envelope.executionMode, actor: String(actor).slice(0, 120)
    });
    this._telemetry("RESULT", { eventId: envelope.eventId, caseId: result.caseId });
    return result;
  }
}

export default OperationalIntelligencePipeline;
