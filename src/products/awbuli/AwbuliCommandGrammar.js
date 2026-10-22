/**
 * AWBULI COMMAND GRAMMAR (recovered legacy intent, provider-neutral).
 *
 * The original LedgerFlow/AWBULI lineage accepted short, noisy WhatsApp
 * commands ("sold rice 5k", "john owes me 3k", "CLOSE-DAY", "BALANCE").
 * That intent is recovered here as a deterministic parser. It does not
 * execute, write, send, or claim a live provider; callers decide what to do
 * with the parsed intent through authorized paths.
 *
 * Canonical formula provenance: Z-Maths / Smart Logic is NOT present in this
 * repository or its Git history. This parser does not invent it.
 */

export const AWBULI_COMMAND_VERSION = "AWBULI-COMMAND-v1";

const INTENTS = Object.freeze([
  { intent: "SALE", label: "Record a sale", mutatesLedger: true, required: ["amount"] },
  { intent: "EXPENSE", label: "Record an expense", mutatesLedger: true, required: ["amount"] },
  { intent: "DEBT", label: "Record credit owed by a customer", mutatesLedger: true, required: ["amount", "party"] },
  { intent: "PAYMENT", label: "Record a payment received", mutatesLedger: true, required: ["amount", "party"] },
  { intent: "STOCK", label: "Add stock / inventory", mutatesLedger: true, required: ["item", "quantity"] },
  { intent: "STOCK_SALE", label: "Sell from stock", mutatesLedger: true, required: ["amount"] },
  { intent: "CAPITAL", label: "Record capital introduced", mutatesLedger: true, required: ["amount"] },
  { intent: "WITHDRAW", label: "Record an owner withdrawal", mutatesLedger: true, required: ["amount"] },
  { intent: "TRANSFER", label: "Record a transfer", mutatesLedger: true, required: ["amount"] },
  { intent: "CONTRIB", label: "Record a contribution", mutatesLedger: true, required: ["amount"] },
  { intent: "CLOSE_DAY", label: "Close the business day", mutatesLedger: false, required: [] },
  { intent: "BALANCE", label: "Show the current balance", mutatesLedger: false, required: [] },
  { intent: "REPORT", label: "Generate a period report", mutatesLedger: false, required: [] },
  { intent: "HISTORY", label: "Show recent history", mutatesLedger: false, required: [] },
  { intent: "TOP", label: "Show top items", mutatesLedger: false, required: [] },
  { intent: "HELP", label: "Show available commands", mutatesLedger: false, required: [] },
  { intent: "START", label: "Start / onboard", mutatesLedger: false, required: [] },
  { intent: "SUBSTATUS", label: "Show subscription status", mutatesLedger: false, required: [] },
  { intent: "CONTACT", label: "Contact support", mutatesLedger: false, required: [] },
  { intent: "UNKNOWN", label: "Unrecognised command", mutatesLedger: false, required: [] }
]);

const BY_INTENT = new Map(INTENTS.map((i) => [i.intent, i]));

const READ_PATTERNS = Object.freeze([
  { intent: "CLOSE_DAY", re: /^(?:close[\s-]*(?:of\s+)?(?:the\s+)?(?:business\s+)?day|close[\s-]*business|closeday|day[\s-]*close|end[\s-]*of[\s-]*day)\b/i },
  { intent: "BALANCE", re: /^(?:balance|bal|balans|how\s+much\s+remain|what\s+remain|remaining\s+balance)\b/i },
  { intent: "REPORT", re: /^(?:report|summary|today|total\s+for\s+today|week|weekly|month|monthly)\b/i },
  { intent: "HISTORY", re: /^(?:history|recent|transactions)\b/i },
  { intent: "TOP", re: /^(?:top|best|top\s+sales|best\s+sellers)\b/i },
  { intent: "HELP", re: /^(?:help|menu|commands)\b/i },
  { intent: "START", re: /^(?:start|star|register|onboard)\b/i },
  { intent: "SUBSTATUS", re: /^(?:substatus|subscription|my\s+plan|status)\b/i },
  { intent: "CONTACT", re: /^(?:contact|support|talk\s+to\s+(?:ade|us))\b/i }
]);

const UNIT_RE = /(\d+(?:\.\d+)?)\s*(cartons?|boxes?|crates?|bags?|units?|pieces?|packs?|bottles?|sachets?|kg|kilos?|grams?|litres?|liters?|tonnes?|tons?|dozens?|pcs?)\b/i;
const AMOUNT_RE = /(?:₦|ngn|naira)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?\b/i;
const ANY_AMOUNT_RE = /\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion)?/i;

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[₦#]/g, " ")
    .replace(/[^\p{L}\p{N}\s.,:/+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function parseAmountToken(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase().replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?$/.exec(s);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] === "k" || m[2] === "thousand" ? 1e3
    : m[2] === "m" || m[2] === "million" ? 1e6
      : m[2] === "b" || m[2] === "billion" ? 1e9 : 1;
  return Math.round(base * mult * 100) / 100;
}

function amountsIn(text) {
  const out = [];
  const re = new RegExp(AMOUNT_RE.source, "gi");
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const v = parseAmountToken(`${m[1]}${m[2] ? ` ${m[2]}` : ""}`);
    if (v !== null) out.push({ value: v, raw: m[0].trim(), index: m.index });
    if (re.lastIndex === m.index) re.lastIndex += 1;
  }
  return out;
}

function lastAmount(text) {
  const all = amountsIn(text);
  return all.length ? all[all.length - 1].value : null;
}

function amountAfter(text, markerRe) {
  const s = String(text || "");
  const marker = markerRe.exec(s);
  if (!marker) return null;
  const tail = s.slice(marker.index + marker[0].length);
  const a = amountsIn(tail);
  return a.length ? a[0].value : null;
}

function cleanName(value, max = 80) {
  const s = String(value || "")
    .replace(/\b(?:for|the|a|an|of|me|my|from|to|on|at|please|abeg|na|is|was|has|have|had|sell|sold|buy|bought)\b/gi, " ")
    .replace(ANY_AMOUNT_RE, " ")
    .replace(/[^\p{L}\p{N}\s&'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

function quantityIn(text) {
  const m = UNIT_RE.exec(String(text || ""));
  if (!m) return { quantity: null, unit: null };
  const q = Number(m[1]);
  return { quantity: Number.isFinite(q) ? q : null, unit: String(m[2]).toLowerCase() };
}

function baseResult({ intent, confidence, fields = {}, missingFields = [], rawText, normalizedText, parsedBy = "pattern" }) {
  const meta = BY_INTENT.get(intent) || BY_INTENT.get("UNKNOWN");
  const required = meta.required || [];
  const missing = required.filter((f) => {
    if (f === "amount") return fields.amount === null || fields.amount === undefined || !(Number(fields.amount) > 0);
    if (f === "quantity") return !(Number(fields.quantity) > 0);
    return !fields[f];
  });
  const mergedMissing = [...new Set([...missingFields, ...missing])];
  const highValue = Number.isFinite(Number(fields.amount)) && Number(fields.amount) > 10_000_000;
  const humanReviewRequired = intent === "UNKNOWN" || mergedMissing.length > 0 || confidence < 0.7 || highValue;
  return {
    version: AWBULI_COMMAND_VERSION,
    intent,
    label: meta.label,
    confidence: Math.round(confidence * 100) / 100,
    humanReviewRequired,
    fields,
    missingFields: mergedMissing,
    mutatesLedger: Boolean(meta.mutatesLedger),
    execution: "NOT_EXECUTED",
    simulated: true,
    parsedBy,
    normalizedText,
    rawText: String(rawText || ""),
    note: "Deterministic interpretation only. Execution requires an authorized AWBULI operator path; no provider or ledger write happens here."
  };
}

export function parseAwbuliCommand(text, { now = null } = {}) {
  if (text === null || text === undefined || !String(text).trim()) throw fail("AWBULI_COMMAND_REQUIRED");
  const rawText = String(text).slice(0, 2000);
  const normalized = normalizeText(rawText);
  if (!normalized) throw fail("AWBULI_COMMAND_EMPTY");

  for (const p of READ_PATTERNS) {
    if (p.re.test(normalized)) {
      const period = /week/.test(normalized) ? "WEEK" : /month/.test(normalized) ? "MONTH" : /history|recent/.test(normalized) ? "ALL" : "TODAY";
      return baseResult({
        intent: p.intent, confidence: 0.99, rawText, normalizedText: normalized,
        fields: { amount: null, quantity: null, unit: null, item: null, party: null, period, frequency: null, bank: null, supplier: null },
        parsedBy: "exact_command"
      });
    }
  }

  // SALE: "sold rice 5000", "sale 5k", "I sold 5 bags of rice for 5k"
  if (/(?:^|\b)(?:sale|sales|sold|sell|selling)\b/.test(normalized)) {
    const { quantity, unit } = quantityIn(normalized);
    const amount = amountAfter(normalized, /\b(?:for|at)\b/) ?? lastAmount(normalized);
    let item = normalized
      .replace(/\b(?:sale|sales|sold|sell|selling|for|at|i|we|have|has|had)\b/g, " ")
      .replace(UNIT_RE, " ")
      .replace(ANY_AMOUNT_RE, " ");
    item = cleanName(item);
    return baseResult({
      intent: "SALE", confidence: amount !== null ? 0.9 : 0.6, rawText, normalizedText: normalized,
      fields: { amount, quantity, unit, item, party: null, period: "TODAY", frequency: null, bank: null, supplier: null }
    });
  }

  // EXPENSE: "spent 2k on fuel", "expense 1200", "paid for transport 500"
  if (/(?:^|\b)(?:expense|expenses|spent|spend|cost|paid\s+for)\b/.test(normalized)) {
    const amount = amountAfter(normalized, /\b(?:on|for)\b/) ?? lastAmount(normalized);
    const item = cleanName(normalized.replace(/\b(?:expense|expenses|spent|spend|cost|paid|for|on|i|we)\b/g, " ").replace(ANY_AMOUNT_RE, " "));
    return baseResult({
      intent: "EXPENSE", confidence: amount !== null ? 0.9 : 0.6, rawText, normalizedText: normalized,
      fields: { amount, quantity: null, unit: null, item, party: null, period: "TODAY", frequency: null, bank: null, supplier: null }
    });
  }

  // DEBT: "credit john 3k", "john owes me 3k", "debt john 3000"
  if (/(?:^|\b)(?:debt|credit|owes?|owing|borrowed?)\b/.test(normalized)) {
    let party = null;
    let m = /^([a-z0-9][a-z0-9 &'-]{1,60}?)\s+(?:owes?|is\s+owing)\s+(?:me\s+)?/i.exec(normalized);
    if (m) party = cleanName(m[1]);
    if (!party) {
      m = /\b(?:debt|credit)\s+(?:to\s+|for\s+)?([a-z0-9][a-z0-9 &'-]{1,60}?)\s+(?:₦|ngn|naira)?\s*\d/i.exec(normalized);
      if (m) party = cleanName(m[1]);
    }
    if (!party) {
      m = /\b(?:owes?|owing|borrowed?)\s+(?:me\s+)?(?:₦|ngn|naira)?\s*\d/i.exec(normalized);
      if (m) party = "UNSPECIFIED_CUSTOMER";
    }
    const amount = lastAmount(normalized);
    return baseResult({
      intent: "DEBT", confidence: amount !== null && party ? 0.88 : 0.55, rawText, normalizedText: normalized,
      fields: { amount, quantity: null, unit: null, item: null, party, period: "TODAY", frequency: null, bank: null, supplier: null }
    });
  }

  // PAYMENT: "paid john 1k", "payment from john 2000", "john paid 1k"
  if (/(?:^|\b)(?:paid|payment|received|collection)\b/.test(normalized)) {
    let party = null;
    let m = /\b(?:payment|paid|received|collection)\s+(?:from\s+|by\s+)?([a-z0-9][a-z0-9 &'-]{1,60}?)\s+(?:₦|ngn|naira)?\s*\d/i.exec(normalized);
    if (m) party = cleanName(m[1]);
    if (!party) {
      m = /^([a-z0-9][a-z0-9 &'-]{1,60}?)\s+paid\b/i.exec(normalized);
      if (m) party = cleanName(m[1]);
    }
    const amount = lastAmount(normalized);
    return baseResult({
      intent: "PAYMENT", confidence: amount !== null && party ? 0.88 : 0.55, rawText, normalizedText: normalized,
      fields: { amount, quantity: null, unit: null, item: null, party, period: "TODAY", frequency: null, bank: null, supplier: null }
    });
  }

  // Strict legacy form: "STOCK rice 10 500" / "DRUGSTOCK panadol 2 500".
  {
    const strict = /^(?:drug\s*stock|drugstock|stock|restock)\s+([a-z0-9][a-z0-9 &'-]{1,50}?)\s+(\d+(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)\s*$/i.exec(normalized);
    if (strict) {
      return baseResult({
        intent: "STOCK", confidence: 0.94, rawText, normalizedText: normalized, parsedBy: "strict_command",
        fields: {
          amount: parseAmountToken(strict[3]), quantity: Number(strict[2]), unit: null,
          item: cleanName(strict[1]), party: null, period: "TODAY", frequency: null, bank: null, supplier: null
        }
      });
    }
  }

  // STOCK: "restock 10 cartons milk 25000", "bought 10 bags rice for 5000"
  if (/(?:^|\b)(?:stock|restock|inventory|bought|buy|purchased|received|delivered|supplier)\b/.test(normalized)) {
    const { quantity, unit } = quantityIn(normalized);
    const amount = amountAfter(normalized, /\b(?:for|at|cost|worth)\b/) ?? (quantity !== null ? lastAmount(normalized) : null);
    const item = cleanName(
      normalized
        .replace(/\b(?:stock|restock|inventory|bought|buy|purchased|received|delivered|supplier|from|for|at|cost|worth|of)\b/g, " ")
        .replace(UNIT_RE, " ")
        .replace(ANY_AMOUNT_RE, " ")
    );
    const supplierMatch = /\b(?:from|by)\s+supplier\s+([a-z0-9][^.,;]{0,60})/i.exec(normalized);
    return baseResult({
      intent: "STOCK", confidence: quantity !== null && item ? 0.86 : 0.55, rawText, normalizedText: normalized,
      fields: { amount, quantity, unit, item, party: null, period: "TODAY", frequency: null, bank: null, supplier: supplierMatch ? cleanName(supplierMatch[1]) : null }
    });
  }

  // STOCK_SALE: "drugsale panadol 2 500", "sold 2 panadol for 500"
  {
    const strict = /^(?:drugsale|drug\s*sale)\s+([a-z0-9][a-z0-9 &'-]{1,50}?)\s+(\d+(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)\s*$/i.exec(normalized);
    if (strict) {
      return baseResult({
        intent: "STOCK_SALE", confidence: 0.94, rawText, normalizedText: normalized, parsedBy: "strict_command",
        fields: {
          amount: parseAmountToken(strict[3]), quantity: Number(strict[2]), unit: null,
          item: cleanName(strict[1]), party: null, period: "TODAY", frequency: null, bank: null, supplier: null
        }
      });
    }
  }
  if (/(?:^|\b)(?:drugsale|drug\s*sale|sold\s+drug)\b/.test(normalized)) {
    const { quantity, unit } = quantityIn(normalized);
    const amount = amountAfter(normalized, /\b(?:for|at)\b/) ?? lastAmount(normalized);
    const item = cleanName(normalized.replace(/\b(?:drugsale|drug|sale|sold|for|at)\b/g, " ").replace(UNIT_RE, " ").replace(ANY_AMOUNT_RE, " "));
    return baseResult({
      intent: "STOCK_SALE", confidence: amount !== null ? 0.86 : 0.55, rawText, normalizedText: normalized,
      fields: { amount, quantity, unit, item, party: null, period: "TODAY", frequency: null, bank: null, supplier: null }
    });
  }

  // CAPITAL / WITHDRAW / TRANSFER / CONTRIB
  if (/(?:^|\b)(?:capital|invest|investment|float|opening\s+float)\b/.test(normalized)) {
    return baseResult({ intent: "CAPITAL", confidence: 0.9, rawText, normalizedText: normalized, fields: { amount: lastAmount(normalized), quantity: null, unit: null, item: null, party: null, period: "TODAY", frequency: null, bank: null, supplier: null } });
  }
  if (/(?:^|\b)(?:withdraw|withdrew|withdrawal|cash\s*out|pull\s*out)\b/.test(normalized)) {
    return baseResult({ intent: "WITHDRAW", confidence: 0.9, rawText, normalizedText: normalized, fields: { amount: lastAmount(normalized), quantity: null, unit: null, item: null, party: null, period: "TODAY", frequency: null, bank: null, supplier: null } });
  }
  if (/(?:^|\b)(?:transfer|transferred|send|sent)\b/.test(normalized)) {
    const bank = cleanName(normalized.replace(/\b(?:transfer|transferred|send|sent|to|into|from)\b/g, " ").replace(ANY_AMOUNT_RE, " "));
    return baseResult({ intent: "TRANSFER", confidence: lastAmount(normalized) !== null ? 0.85 : 0.55, rawText, normalizedText: normalized, fields: { amount: lastAmount(normalized), quantity: null, unit: null, item: null, party: null, period: "TODAY", frequency: null, bank, supplier: null } });
  }
  if (/(?:^|\b)(?:contrib|contribution|ajo|esusu|savings)\b/.test(normalized)) {
    const frequency = /\bdaily\b/.test(normalized) ? "DAILY" : /\bweekly\b/.test(normalized) ? "WEEKLY" : /\bmonthly\b/.test(normalized) ? "MONTHLY" : null;
    return baseResult({ intent: "CONTRIB", confidence: 0.85, rawText, normalizedText: normalized, fields: { amount: lastAmount(normalized), quantity: null, unit: null, item: null, party: null, period: "TODAY", frequency, bank: null, supplier: null } });
  }

  return baseResult({
    intent: "UNKNOWN", confidence: 0.2, rawText, normalizedText: normalized,
    fields: { amount: lastAmount(normalized), quantity: null, unit: null, item: null, party: null, period: "TODAY", frequency: null, bank: null, supplier: null },
    parsedBy: "unmatched"
  });
}

export function describeAwbuliCommands() {
  return INTENTS.map((i) => ({ ...i }));
}

export const AWBULI_COMMANDS = INTENTS;
export default { AWBULI_COMMAND_VERSION, AWBULI_COMMANDS, parseAwbuliCommand, describeAwbuliCommands };
