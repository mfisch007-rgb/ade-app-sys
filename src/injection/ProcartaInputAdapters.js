/**
 * ADE PROCARTA INPUT ADAPTERS L1–L4 (NEXT enablement — additive).
 *
 * One PROCARTA ingestion framework with progressively richer adapters.
 * No second process engine: L4 translates supported process representations
 * into step lists consumable by the EXISTING WorkflowEngine/DAG engine.
 * L2 never fakes OCR/semantics: without an extraction provider it stores
 * the document record + manifest + caller-supplied text (if any) and marks
 * extraction as PENDING_MANUAL_OR_PROVIDER.
 */

import crypto from "node:crypto";
import { nowIso } from "../capabilities/CapabilityRecord.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}
function str(v, max = 2000) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

const ASSESSMENT_AREAS = Object.freeze([
  "ORDER_PROCESS", "PROCUREMENT", "INVENTORY", "CUSTOMER_SERVICE",
  "COMMUNICATIONS", "APPROVALS", "REPORTING", "PAYMENT_COLLECTION", "GENERAL"
]);

// ---------- L1: structured operational assessment forms ----------
export function buildAssessmentEvidence(form = {}, { tenantScope = "default", actor = "SYSTEM" } = {}) {
  const scope = String(tenantScope || "default");
  if (!form.organization && !form.industry && !form.assessment) {
    throw fail("ASSESSMENT_EMPTY", "organization/industry/assessment context is required.");
  }
  const answers = form.answers && typeof form.answers === "object" ? form.answers : {};
  const findings = [];
  for (const [k, v] of Object.entries(answers).slice(0, 100)) {
    const s = String(v ?? "").slice(0, 500);
    if (/delay|manual|duplicat|bottleneck|risk|problem|slow|paper|whatsapp only|no system/i.test(s)) {
      findings.push(`possible friction in '${String(k).slice(0, 80)}': ${s.slice(0, 200)}`);
    }
  }
  const evidence = {
    schemaVersion: 1,
    kind: "OPERATIONAL_ASSESSMENT",
    organization: str(form.organization, 200),
    industry: str(form.industry, 120),
    branches: Number.isFinite(Number(form.branches)) ? Number(form.branches) : null,
    employees: Number.isFinite(Number(form.employees)) ? Number(form.employees) : null,
    departments: Array.isArray(form.departments) ? form.departments.map((d) => String(d).slice(0, 80)).slice(0, 50) : [],
    area: ASSESSMENT_AREAS.includes(String(form.area || "").toUpperCase()) ? String(form.area).toUpperCase() : "GENERAL",
    answers,
    recurringProblems: str(form.recurringProblems, 2000),
    processDelays: str(form.processDelays, 2000),
    manualWork: str(form.manualWork, 2000),
    operationalRisks: str(form.operationalRisks, 2000),
    findings: findings.slice(0, 20),
    evidence: findings.slice(0, 20),
    confidence: findings.length ? 0.6 : 0.3,
    tenantScope: scope,
    submittedBy: String(actor).slice(0, 120),
    submittedAt: nowIso()
  };
  return evidence;
}

export function assessmentToIntakeText(evidence) {
  const parts = [
    `Operational assessment for ${evidence.organization || "unknown organization"}.`,
    `Industry: ${evidence.industry || "unspecified"}. Area: ${evidence.area}.`,
    evidence.recurringProblems ? `Recurring problems: ${evidence.recurringProblems}` : null,
    evidence.processDelays ? `Delays: ${evidence.processDelays}` : null,
    evidence.manualWork ? `Manual work: ${evidence.manualWork}` : null,
    evidence.operationalRisks ? `Risks: ${evidence.operationalRisks}` : null,
    ...(evidence.findings || []).slice(0, 10)
  ].filter(Boolean);
  return parts.join(" ").slice(0, 5000);
}

// ---------- L2: controlled document ingestion (metadata + provenance) ----------
const ALLOWED_DOC_KINDS = Object.freeze(["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "TXT", "JSON", "OTHER"]);

export class DocumentIntakeService {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.docs = new Map();
    this._hydrate();
  }
  _hydrate() {
    try {
      const saved = this.store?.readSection?.("procartaDocuments");
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) if (r?.documentId) this.docs.set(r.documentId, r);
    } catch {}
  }
  _persist() { try { this.store?.writeSection?.("procartaDocuments", Object.fromEntries(this.docs)); } catch {} }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "DOCUMENT_INTAKE", action, at: nowIso(), ...fields }); } catch {}
  }
  ingest(meta = {}, { tenantScope = "default", actor = "SYSTEM" } = {}) {
    const scope = String(tenantScope || "default");
    const name = str(meta.name || meta.filename, 300);
    if (!name) throw fail("DOCUMENT_NAME_REQUIRED");
    const kind = String(meta.kind || meta.fileType || "OTHER").toUpperCase();
    if (!ALLOWED_DOC_KINDS.includes(kind)) throw fail("DOCUMENT_KIND_UNSUPPORTED", kind);
    if (meta.ref && /^data:/i.test(String(meta.ref))) throw fail("DOCUMENT_INLINE_BINARY_REJECTED", "supply a storage reference, not inline bytes.");
    const hasText = typeof meta.extractedText === "string" && meta.extractedText.trim().length > 0;
    const id = meta.documentId || `doc-${crypto.randomBytes(6).toString("hex")}`;
    const record = {
      documentId: String(id).slice(0, 80),
      name,
      kind,
      ref: meta.ref ? String(meta.ref).slice(0, 1000) : null,
      version: Number.isFinite(Number(meta.version)) ? Number(meta.version) : 1,
      source: str(meta.source, 200) || "MANUAL_UPLOAD",
      organization: str(meta.organization, 200),
      tenantScope: scope,
      uploadedBy: String(meta.uploadedBy || actor).slice(0, 120),
      uploadedAt: nowIso(),
      permissions: Array.isArray(meta.permissions) ? meta.permissions.map((p) => String(p).slice(0, 60)).slice(0, 20) : ["TENANT"],
      provenance: { channel: "DOCUMENT", evidence: [`uploaded by ${String(meta.uploadedBy || actor).slice(0, 80)}`, `source ${str(meta.source, 120) || "MANUAL_UPLOAD"}`] },
      extraction: hasText
        ? { state: "CALLER_SUPPLIED_TEXT", chars: meta.extractedText.length, trusted: false, note: "Caller-supplied text; validate before PROCARTA use." }
        : { state: "PENDING_MANUAL_OR_PROVIDER", chars: 0, trusted: false, note: "No extraction provider configured; text extraction pending." },
      extractedText: hasText ? String(meta.extractedText).slice(0, 20000) : null,
      validationState: "UNVALIDATED",
      processingState: "RECEIVED"
    };
    this.docs.set(record.documentId, record);
    this._persist();
    this._audit("DOCUMENT_INGESTED", { documentId: record.documentId, kind, tenantScope: scope, actor: String(actor).slice(0, 120) });
    return { ...record, extractedText: record.extractedText ? `[${record.extractedText.length} chars]` : null };
  }
  get(documentId, { tenantScope = "default" } = {}) {
    const r = this.docs.get(String(documentId));
    if (!r) return null;
    if (r.tenantScope !== "default" && r.tenantScope !== String(tenantScope)) throw fail("TENANT_MISMATCH", "document is not visible to this tenant.");
    return { ...r };
  }
  list({ tenantScope = null } = {}) {
    const out = [];
    for (const r of this.docs.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      const { extractedText: _t, ...safe } = r;
      out.push({ ...safe, textChars: _t ? _t.length : 0 });
    }
    return out.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  }
}

// ---------- L3: structured data (CSV/JSON rows -> envelope-ready rows) ----------
export function normalizeStructuredRows(input = {}, { tenantScope = "default" } = {}) {
  const scope = String(tenantScope || "default");
  let rows = [];
  if (Array.isArray(input.rows)) rows = input.rows;
  else if (typeof input.csv === "string") rows = parseCsv(input.csv);
  else if (typeof input.json === "string") {
    const parsed = JSON.parse(input.json);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } else throw fail("STRUCTURED_INPUT_REQUIRED", "provide rows[], csv, or json.");
  if (rows.length > 500) throw fail("STRUCTURED_TOO_LARGE", "at most 500 rows per batch.");
  return rows.map((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw fail("STRUCTURED_ROW_INVALID", `row[${i}] must be an object.`);
    const flat = {};
    for (const [k, v] of Object.entries(row).slice(0, 50)) {
      flat[String(k).slice(0, 120)] = typeof v === "string" ? v.slice(0, 2000) : v;
    }
    return { index: i, tenantScope: scope, data: flat, text: summarizeRow(flat) };
  });
}

function parseCsv(csv) {
  const lines = String(csv).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw fail("STRUCTURED_CSV_EMPTY", "csv needs a header plus at least one row.");
  const headers = splitCsvLine(lines[0]).map((h) => h.trim()).filter(Boolean);
  if (!headers.length) throw fail("STRUCTURED_CSV_NO_HEADER");
  return lines.slice(1, 501).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}
function splitCsvLine(line) {
  const out = []; let cur = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function summarizeRow(flat) {
  return Object.entries(flat).slice(0, 12).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join("; ").slice(0, 2000);
}

// ---------- L4: process-model import translator (BPMN subset -> workflow steps) ----------
export function translateProcessModel(input = {}) {
  const format = String(input.format || "BPMN").toUpperCase();
  if (!["BPMN", "STEPS", "WORKFLOW_JSON"].includes(format)) throw fail("PROCESS_FORMAT_UNSUPPORTED", format);
  let steps = [];
  if (format === "STEPS" || format === "WORKFLOW_JSON") {
    const raw = Array.isArray(input.steps) ? input.steps : [];
    if (!raw.length) throw fail("PROCESS_STEPS_REQUIRED");
    steps = raw.map((s, i) => ({
      id: String(s.id || `step-${i + 1}`).slice(0, 80),
      name: String(s.name || s.id || `Step ${i + 1}`).slice(0, 200),
      kind: String(s.kind || s.type || "TASK").toUpperCase().slice(0, 40),
      assignee: s.assignee ? String(s.assignee).slice(0, 120) : null,
      next: Array.isArray(s.next) ? s.next.map((n) => String(n).slice(0, 80)).slice(0, 10) : []
    })).slice(0, 100);
  } else {
    const xml = String(input.bpmnXml || input.xml || "");
    if (!xml || !xml.trim()) throw fail("PROCESS_BPMN_REQUIRED", "bpmnXml is required for BPMN import.");
    if (xml.length > 500000) throw fail("PROCESS_BPMN_TOO_LARGE");
    steps = translateBpmnSubset(xml);
  }
  return {
    format,
    name: str(input.name, 200) || "Imported process",
    version: str(input.version, 40) || "1",
    steps,
    engine: "EXISTING_WORKFLOW_ENGINE",
    note: "Translated representation only; execution stays with the existing workflow engine."
  };
}

function translateBpmnSubset(xml) {
  const steps = [];
  const kinds = ["userTask", "serviceTask", "manualTask", "exclusiveGateway", "parallelGateway", "startEvent", "endEvent", "task"];
  const taskRe = new RegExp(`<(?:bpmn:)?(${kinds.join("|")})\\b[^>]*\\/?>`, "gi");
  let m; let i = 0;
  while ((m = taskRe.exec(xml)) && i < 100) {
    const tag = m[0];
    const kind = m[1].toUpperCase();
    const idM = /\bid="([^"]+)"/i.exec(tag);
    const nameM = /\bname="([^"]+)"/i.exec(tag);
    steps.push({
      id: ((idM && idM[1]) || `node-${i + 1}`).slice(0, 80),
      name: ((nameM && nameM[1]) || (idM && idM[1]) || `${kind} ${i + 1}`).slice(0, 200),
      kind,
      assignee: null,
      next: []
    });
    i++;
  }
  const flowRe = /<(?:bpmn:)?sequenceFlow[^>]*sourceRef="([^"]+)"[^>]*targetRef="([^"]+)"[^>]*\/?>|<(?:bpmn:)?sequenceFlow[^>]*targetRef="([^"]+)"[^>]*sourceRef="([^"]+)"[^>]*\/?>/gi;
  const edges = new Map();
  while ((m = flowRe.exec(xml))) {
    const from = (m[1] || m[4] || "").slice(0, 80);
    const to = (m[2] || m[3] || "").slice(0, 80);
    if (from && to) {
      if (!edges.has(from)) edges.set(from, []);
      edges.get(from).push(to);
    }
  }
  for (const s of steps) s.next = (edges.get(s.id) || []).slice(0, 10);
  if (!steps.length) throw fail("PROCESS_BPMN_NO_NODES", "no translatable BPMN nodes found.");
  return steps;
}

export default { buildAssessmentEvidence, assessmentToIntakeText, DocumentIntakeService, normalizeStructuredRows, translateProcessModel };
