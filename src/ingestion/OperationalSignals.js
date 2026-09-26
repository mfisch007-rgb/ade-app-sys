/**
 * ADE OPERATIONAL INTELLIGENCE SIGNALS (Batch 9C)
 *
 * Deterministic, evidence-backed signals over existing ADE records.
 * Every signal carries the evidence that produced it. Levels:
 * OBSERVED (directly counted) / INFERRED (heuristic combination).
 * PREDICTIVE is explicitly unavailable: predict() always throws
 * PREDICTIVE_UNAVAILABLE — no predictive claims without an implementation.
 */

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

let signalCounter = 0;
function signalId() {
  signalCounter += 1;
  return `SIG-${Date.now().toString(36).toUpperCase()}-${signalCounter}`;
}

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? ms / 86400000 : 0;
}

export function detectUnresolvedCases(cases = [], { olderThanDays = 7, now = null } = {}) {
  const at = now || new Date().toISOString();
  const open = cases.filter((c) => c && !["CLOSED", "COMPLETED"].includes(String(c.status || "").toUpperCase()));
  const stale = open.filter((c) => daysBetween(c.createdAt || c.updatedAt || at, at) >= olderThanDays);
  if (!stale.length) return null;
  return {
    signalId: signalId(),
    type: "UNRESOLVED_CASES",
    level: "OBSERVED",
    scope: "cases",
    count: stale.length,
    evidence: stale.slice(0, 10).map((c) => `${c.id} open since ${c.createdAt || c.updatedAt || "unknown"}`),
    confidence: 0.9,
    observedAt: at
  };
}

export function detectSupplierDelayRisk(cases = [], { olderThanDays = 3, now = null } = {}) {
  const at = now || new Date().toISOString();
  const hits = cases.filter((c) => {
    if (!c || ["CLOSED", "COMPLETED"].includes(String(c.status || "").toUpperCase())) return false;
    const text = JSON.stringify(c.request || c.description || "").toLowerCase();
    const supplier = /supplier|deliver|procurement|purchase/.test(text);
    const delay = /delay|late|waiting|backlog|queue|slow/.test(text);
    return supplier && delay && daysBetween(c.createdAt || c.updatedAt || at, at) >= olderThanDays;
  });
  if (!hits.length) return null;
  return {
    signalId: signalId(),
    type: "SUPPLIER_DELAY_RISK",
    level: "INFERRED",
    scope: "cases",
    count: hits.length,
    evidence: hits.slice(0, 10).map((c) => `${c.id}: supplier+delay language, open ${Math.round(daysBetween(c.createdAt || c.updatedAt || at, at))}d`),
    confidence: 0.6,
    observedAt: at
  };
}

export function detectCustomerComplaints(intakes = [], { now = null } = {}) {
  const hits = (intakes || []).filter((i) => {
    const t = JSON.stringify(i?.text || i?.description || i?.useCaseDescription || "").toLowerCase();
    return /complaint|support desk|customer.*(angry|upset|issue|problem)/.test(t);
  });
  if (!hits.length) return null;
  return {
    signalId: signalId(),
    type: "CUSTOMER_COMPLAINT",
    level: "OBSERVED",
    scope: "intakes",
    count: hits.length,
    evidence: hits.slice(0, 10).map((i) => `${i.intakeId || i.id || "intake"}: complaint language detected`),
    confidence: 0.8,
    observedAt: now || new Date().toISOString()
  };
}

export function detectBottleneckFlags(cases = [], { now = null } = {}) {
  const hits = (cases || []).filter((c) => {
    const a = c?.request?.assessment;
    return a && a.humanReviewRequired === true && typeof a.bottleneck === "string" && a.bottleneck.length > 0;
  });
  if (!hits.length) return null;
  return {
    signalId: signalId(),
    type: "BOTTLENECK_FLAG",
    level: "INFERRED",
    scope: "cases",
    count: hits.length,
    evidence: hits.slice(0, 10).map((c) => `${c.id}: ${String(c.request.assessment.bottleneck).slice(0, 140)}`),
    confidence: 0.55,
    observedAt: now || new Date().toISOString()
  };
}

export function detectEventFrequencySpike(events = [], { windowHours = 24, threshold = 10, now = null } = {}) {
  const at = new Date(now || new Date().toISOString()).getTime();
  const recent = (events || []).filter((e) => {
    const t = new Date(e?.receivedAt || e?.at || 0).getTime();
    return Number.isFinite(t) && at - t <= windowHours * 3600000;
  });
  if (recent.length < threshold) return null;
  return {
    signalId: signalId(),
    type: "EVENT_FREQUENCY_SPIKE",
    level: "OBSERVED",
    scope: "events",
    count: recent.length,
    evidence: [`${recent.length} events in the last ${windowHours}h (threshold ${threshold})`],
    confidence: 0.85,
    observedAt: new Date(at).toISOString()
  };
}

export function detectRepeatedExceptions(cases = [], { minRepeats = 3, now = null } = {}) {
  const byIntent = new Map();
  for (const c of cases || []) {
    const intent = String(c?.request?.intent || "UNKNOWN");
    if (!byIntent.has(intent)) byIntent.set(intent, []);
    byIntent.get(intent).push(c.id);
  }
  const repeated = [...byIntent.entries()].filter(([, ids]) => ids.length >= minRepeats);
  if (!repeated.length) return null;
  return {
    signalId: signalId(),
    type: "REPEATED_EXCEPTIONS",
    level: "OBSERVED",
    scope: "cases",
    count: repeated.length,
    evidence: repeated.slice(0, 10).map(([intent, ids]) => `${intent} ×${ids.length} (${ids.slice(0, 5).join(",")})`),
    confidence: 0.8,
    observedAt: now || new Date().toISOString()
  };
}

export function detectAll({ cases = [], intakes = [], events = [], options = {} } = {}) {
  return [
    detectUnresolvedCases(cases, options),
    detectSupplierDelayRisk(cases, options),
    detectCustomerComplaints(intakes, options),
    detectBottleneckFlags(cases, options),
    detectEventFrequencySpike(events, options),
    detectRepeatedExceptions(cases, options)
  ].filter(Boolean);
}

/** Predictive claims require an implementation that does not exist. */
export function predict() {
  throw fail("PREDICTIVE_UNAVAILABLE", "no predictive implementation or provider is configured; predictive claims are rejected.");
}
