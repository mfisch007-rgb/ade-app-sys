/**
 * AWBULI BUSINESS LEDGER (operations layer over the canonical FinancialLedger).
 *
 * The legacy LedgerFlow/AWBULI lineage kept sales, expenses, stock, credit and
 * daily closes. The canonical repository already owns durable money records in
 * `FinancialLedger`; this service therefore reads and writes there instead of
 * creating a second ledger or a competing store.
 *
 * Honesty rules:
 *  - No live WhatsApp/provider claim. `live` is always false.
 *  - Recorded commands are human-confirmed operations, not provider events.
 *  - Z-Maths / Smart Logic formula provenance is MISSING_EVIDENCE. The only
 *    recovered legacy formula is `profit = sales - expenses`.
 *  - Anomalies are owner-only review signals, never fraud verdicts and never
 *    autonomous freezes.
 */
import crypto from "node:crypto";
import { buildTransactionIdentity } from "../../finance/FinancialEventModel.js";
import { AWBULI_COMMAND_VERSION } from "./AwbuliCommandGrammar.js";

export const AWBULI_OPS_VERSION = "AWBULI-OPS-v1";
export const AWBULI_LEDGER_PROVIDER = "AWBULI";
export const AWBULI_TIMEZONE = "Africa/Lagos";

const WRITABLE = new Set([
  "SALE", "EXPENSE", "DEBT", "PAYMENT", "STOCK", "STOCK_SALE",
  "CAPITAL", "WITHDRAW", "TRANSFER", "CONTRIB"
]);

const PERIODS = new Set(["TODAY", "WEEK", "MONTH", "ALL"]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

function dateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AWBULI_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
}

function addDays(key, days) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromKey, toKey) {
  return Math.floor((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86_400_000);
}

function median(values) {
  const a = values.map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function pct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : null;
  return round(((c - p) / p) * 100, 1);
}

function hashId(...parts) {
  return crypto.createHash("sha256").update(parts.map(String).join("|")).digest("hex").slice(0, 24);
}

function txAmount(tx) {
  const n = Number(tx?.amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function txType(tx) {
  return String(tx?.metadata?.businessType || "UNKNOWN").toUpperCase();
}

function txItem(tx) {
  return tx?.metadata?.item || null;
}

function txParty(tx) {
  return tx?.metadata?.party || tx?.customerReference || null;
}

function txQuantity(tx) {
  const n = Number(tx?.metadata?.quantity);
  return Number.isFinite(n) ? n : null;
}

export class AwbuliBusinessLedger {
  constructor({ ledger = null, eventBus = null } = {}) {
    if (!ledger || typeof ledger.upsertTransaction !== "function" || typeof ledger.listTransactions !== "function") {
      throw fail("AWBULI_LEDGER_REQUIRED", "canonical FinancialLedger is required.");
    }
    this.ledger = ledger;
    this.eventBus = eventBus;
  }

  _publish(topic, payload, context = {}) {
    if (!this.eventBus || typeof this.eventBus.publish !== "function") return;
    try {
      const p = this.eventBus.publish(topic, payload, context);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  _rows({ tenantScope = "default" } = {}) {
    const scope = String(tenantScope || "default").slice(0, 80);
    return this.ledger
      .listTransactions({ tenantScope: null, provider: AWBULI_LEDGER_PROVIDER, limit: 10_000 })
      .filter((r) => String(r.tenantScope || "default") === scope)
      .sort((a, b) => {
        const ao = String(a.occurredAt || a.receivedAt || "");
        const bo = String(b.occurredAt || b.receivedAt || "");
        if (ao !== bo) return ao.localeCompare(bo);
        return String(a.receivedAt || "").localeCompare(String(b.receivedAt || ""));
      });
  }

  _range(period, now = new Date()) {
    const key = dateKey(now);
    const p = String(period || "TODAY").toUpperCase();
    if (!PERIODS.has(p)) throw fail("AWBULI_PERIOD_INVALID", p);
    if (p === "ALL") return { period: p, start: null, end: key, previous: null };
    if (p === "TODAY") {
      return { period: p, start: key, end: key, previous: { start: addDays(key, -1), end: addDays(key, -1) } };
    }
    if (p === "WEEK") {
      const d = new Date(`${key}T12:00:00Z`);
      const mondayOffset = (d.getUTCDay() + 6) % 7;
      const start = addDays(key, -mondayOffset);
      return { period: p, start, end: key, previous: { start: addDays(start, -7), end: addDays(start, -1) } };
    }
    const monthStart = `${key.slice(0, 7)}-01`;
    const prevMonthEnd = addDays(monthStart, -1);
    const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
    return { period: p, start: monthStart, end: key, previous: { start: prevMonthStart, end: prevMonthEnd } };
  }

  _within(rows, start, end) {
    if (!start) return rows;
    return rows.filter((r) => {
      const d = dateKey(r.occurredAt || r.receivedAt);
      return d && d >= start && d <= end;
    });
  }

  _aggregate(rows) {
    const totals = {
      sales: 0, expenses: 0, stockPurchases: 0, capital: 0, withdrawals: 0,
      transfers: 0, creditGiven: 0, paymentsReceived: 0, contributions: 0
    };
    const items = new Map();
    const parties = new Map();
    const expenseValues = [];

    for (const r of rows) {
      const type = txType(r);
      const amount = txAmount(r);
      if (type === "SALE" || type === "STOCK_SALE") {
        totals.sales += amount;
        const key = txItem(r) || "UNSPECIFIED";
        const cur = items.get(key) || { item: key, revenue: 0, quantity: 0 };
        cur.revenue += amount;
        cur.quantity += Number(txQuantity(r)) || 0;
        items.set(key, cur);
      } else if (type === "EXPENSE") {
        totals.expenses += amount;
        expenseValues.push(amount);
      } else if (type === "STOCK") {
        totals.stockPurchases += amount;
      } else if (type === "CAPITAL") {
        totals.capital += amount;
      } else if (type === "WITHDRAW") {
        totals.withdrawals += amount;
      } else if (type === "TRANSFER") {
        totals.transfers += amount;
      } else if (type === "CONTRIB") {
        totals.contributions += amount;
      }

      if (type === "DEBT" || type === "PAYMENT") {
        const party = txParty(r) || "UNSPECIFIED_CUSTOMER";
        const cur = parties.get(party) || {
          party, credit: 0, paid: 0, lastCreditAt: null, lastPaymentAt: null
        };
        if (type === "DEBT") {
          totals.creditGiven += amount;
          cur.credit += amount;
          cur.lastCreditAt = r.occurredAt || r.receivedAt || null;
        } else {
          totals.paymentsReceived += amount;
          cur.paid += amount;
          cur.lastPaymentAt = r.occurredAt || r.receivedAt || null;
        }
        parties.set(party, cur);
      }
    }

    const netProfit = totals.sales - totals.expenses;
    const margin = totals.sales > 0 ? (netProfit / totals.sales) * 100 : null;
    const grade = totals.sales <= 0 ? "N/A"
      : margin >= 50 ? "A+"
        : margin >= 40 ? "A"
          : margin >= 30 ? "B"
            : margin >= 20 ? "C"
              : margin >= 5 ? "D" : "F";

    const receivables = [...parties.values()]
      .map((p) => ({
        party: p.party,
        outstanding: round(p.credit - p.paid, 2),
        lastCreditAt: p.lastCreditAt,
        lastPaymentAt: p.lastPaymentAt
      }))
      .filter((p) => p.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    return {
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round(v, 2)])),
      netProfit: round(netProfit, 2),
      margin: margin === null ? null : round(margin, 1),
      healthGrade: grade,
      transactionCount: rows.length,
      topItems: [...items.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        .map((i) => ({ item: i.item, revenue: round(i.revenue, 2), quantity: round(i.quantity, 2) })),
      receivables,
      outstandingCredit: round(receivables.reduce((s, p) => s + p.outstanding, 0), 2),
      averageExpense: expenseValues.length ? round(expenseValues.reduce((s, v) => s + v, 0) / expenseValues.length, 2) : 0
    };
  }

  record(parsed, { tenantScope = "default", organization = null, unitId = null, actor = "SYSTEM", occurredAt = null, idempotencyKey = null, source = "AWBULI_OPERATOR", channel = "AWBULI", confirmed = true } = {}) {
    if (!parsed || typeof parsed !== "object") throw fail("AWBULI_INTERPRETATION_REQUIRED");
    const intent = String(parsed.intent || "UNKNOWN").toUpperCase();
    if (!WRITABLE.has(intent)) throw fail("AWBULI_INTENT_NOT_WRITABLE", intent);
    if (Array.isArray(parsed.missingFields) && parsed.missingFields.length) {
      throw fail("AWBULI_COMMAND_INCOMPLETE", parsed.missingFields.join(","));
    }

    const amount = Number(parsed.fields?.amount);
    if (intent !== "STOCK" && !(Number.isFinite(amount) && amount > 0)) {
      throw fail("AWBULI_AMOUNT_REQUIRED", intent);
    }
    if (intent === "STOCK" && !(Number(parsed.fields?.quantity) > 0)) {
      throw fail("AWBULI_QUANTITY_REQUIRED", intent);
    }

    const scope = String(tenantScope || "default").slice(0, 80);
    const at = occurredAt && !Number.isNaN(new Date(occurredAt).getTime()) ? new Date(occurredAt).toISOString() : nowIso();
    const providerTxId = idempotencyKey
      ? `awb-${hashId(scope, intent, idempotencyKey)}`
      : `awb-${crypto.randomUUID()}`;

    const tx = buildTransactionIdentity({
      provider: AWBULI_LEDGER_PROVIDER,
      environment: "OPERATIONS",
      providerTxId,
      tenantScope: scope,
      organization: organization ? String(organization).slice(0, 200) : null,
      currency: "NGN",
      amount: Number.isFinite(Number(parsed.fields?.amount)) ? Number(parsed.fields.amount) : 0,
      status: "SUCCESS",
      channel,
      source,
      customerReference: parsed.fields?.party || null,
      occurredAt: at,
      evidenceGrade: confirmed ? "HUMAN_CONFIRMED" : "INFERENCE",
      provenanceAdapter: "AWBULI_COMMAND_GRAMMAR",
      metadata: {
        businessType: intent,
        commandVersion: parsed.version || AWBULI_COMMAND_VERSION,
        commandIntent: intent,
        commandText: String(parsed.normalizedText || "").slice(0, 500),
        commandConfidence: Number(parsed.confidence) || 0,
        humanReviewRequired: Boolean(parsed.humanReviewRequired),
        item: parsed.fields?.item || null,
        quantity: parsed.fields?.quantity === null || parsed.fields?.quantity === undefined || parsed.fields?.quantity === ""
          ? null
          : (Number.isFinite(Number(parsed.fields.quantity)) ? Number(parsed.fields.quantity) : null),
        unit: parsed.fields?.unit || null,
        party: parsed.fields?.party || null,
        unitId: unitId ? String(unitId).slice(0, 100) : null,
        source: "AWBULI_COMMAND",
        live: false
      }
    });

    const saved = this.ledger.upsertTransaction(tx, { actor });
    const record = saved.record;
    this._publish("awbuli.command.recorded", {
      tenantScope: scope,
      intent,
      duplicate: saved.created === false,
      transactionId: record.adeTransactionId,
      amount: txAmount(record),
      currency: record.currency,
      sensitivity: "OWNER_ONLY",
      live: false
    }, { traceId: record.correlationId || providerTxId });

    return {
      accepted: true,
      duplicate: saved.created === false,
      transaction: {
        adeTransactionId: record.adeTransactionId,
        provider: record.provider,
        businessType: intent,
        amount: txAmount(record),
        currency: record.currency,
        occurredAt: record.occurredAt,
        status: record.status,
        item: record.metadata?.item || null,
        quantity: record.metadata?.quantity ?? null,
        party: record.metadata?.party || null
      },
      provenance: {
        commandVersion: parsed.version || AWBULI_COMMAND_VERSION,
        evidenceGrade: record.provenance?.grade || null,
        live: false
      }
    };
  }

  summary({ tenantScope = "default", period = "TODAY", now = new Date() } = {}) {
    const scope = String(tenantScope || "default").slice(0, 80);
    const range = this._range(period, now);
    const rows = this._rows({ tenantScope: scope });
    const currentRows = this._within(rows, range.start, range.end);
    const previousRows = range.previous ? this._within(rows, range.previous.start, range.previous.end) : [];
    const current = this._aggregate(currentRows);
    const previous = this._aggregate(previousRows);
    const inventory = this.inventory({ tenantScope: scope, rows });

    const insights = [];
    const revenueChange = pct(current.totals.sales, previous.totals.sales);
    if (range.previous) {
      if (revenueChange === null) insights.push("No prior-period sales baseline; comparison starts next period.");
      else if (revenueChange > 0) insights.push(`Sales are up ${Math.abs(revenueChange)}% versus the previous ${range.period.toLowerCase()} period.`);
      else if (revenueChange < 0) insights.push(`Sales are down ${Math.abs(revenueChange)}% versus the previous ${range.period.toLowerCase()} period.`);
    }
    if (current.totals.sales > 0 && current.totals.expenses > current.totals.sales) {
      insights.push("Expenses exceed sales in this period; review the largest expense entries.");
    }
    if (current.outstandingCredit > 0 && current.totals.sales > 0 && current.outstandingCredit > current.totals.sales * 0.3) {
      insights.push(`Outstanding credit is ${round((current.outstandingCredit / current.totals.sales) * 100, 1)}% of period sales.`);
    }
    if (inventory.lowStock.length) {
      insights.push(`${inventory.lowStock.length} inventory item(s) are at or below the low-stock threshold.`);
    }

    return {
      version: AWBULI_OPS_VERSION,
      provider: AWBULI_LEDGER_PROVIDER,
      source: "FINANCIAL_LEDGER",
      live: false,
      tenantScope: scope,
      period: range.period,
      range: { start: range.start, end: range.end, timezone: AWBULI_TIMEZONE },
      currency: "NGN",
      generatedAt: nowIso(),
      totals: current.totals,
      netProfit: current.netProfit,
      margin: current.margin,
      healthGrade: current.healthGrade,
      transactionCount: current.transactionCount,
      topItems: current.topItems,
      receivables: current.receivables.slice(0, 50),
      outstandingCredit: current.outstandingCredit,
      changes: {
        salesPercent: pct(current.totals.sales, previous.totals.sales),
        profitPercent: pct(current.netProfit, previous.netProfit),
        expensesPercent: pct(current.totals.expenses, previous.totals.expenses)
      },
      inventory: {
        stockValue: inventory.stockValue,
        lowStockCount: inventory.lowStock.length
      },
      insights,
      provenance: {
        zMaths: "MISSING_EVIDENCE",
        smartLogic: "LEGACY_INTENT_RECOVERED",
        profitFormula: "sales - expenses",
        evidenceGrade: "HUMAN_CONFIRMED",
        note: "No live provider feed. Figures come only from authorized AWBULI command records."
      }
    };
  }

  inventory({ tenantScope = "default", rows = null } = {}) {
    const all = rows || this._rows({ tenantScope });
    const byItem = new Map();
    for (const r of all) {
      const type = txType(r);
      if (type !== "STOCK" && type !== "STOCK_SALE" && type !== "SALE") continue;
      const item = txItem(r);
      if (!item) continue;
      const unit = r.metadata?.unit || "unit";
      let mapKey = `${String(item).toLowerCase()}::${unit}`;
      let state = byItem.get(mapKey);
      if (!state && type === "SALE") {
        const existingKey = [...byItem.keys()].find((k) => k.startsWith(`${String(item).toLowerCase()}::`));
        if (existingKey) { mapKey = existingKey; state = byItem.get(existingKey); }
      }
      if (!state) {
        if (type === "SALE") continue; // unknown outflow is not projected as stock
        state = { item, unit, quantity: 0, value: 0, lastUnitCost: 0, lastMovementAt: null };
      }
      const qty = type === "STOCK" ? Number(txQuantity(r)) : (Number(txQuantity(r)) || (type === "STOCK_SALE" ? 1 : 0));
      if (!(Number.isFinite(qty) && qty > 0)) continue;
      if (type === "STOCK") {
        const cost = txAmount(r);
        state.quantity += qty;
        state.value += cost;
        if (cost > 0) state.lastUnitCost = cost / qty;
      } else {
        state.quantity -= qty;
        const unitCost = state.lastUnitCost || (state.quantity > 0 ? state.value / state.quantity : 0);
        state.value = Math.max(0, state.value - (unitCost * qty));
      }
      state.lastMovementAt = r.occurredAt || r.receivedAt || null;
      byItem.set(mapKey, state);
    }

    const items = [...byItem.values()].map((s) => ({
      item: s.item,
      unit: s.unit,
      quantity: round(s.quantity, 2),
      averageCost: round(s.quantity > 0 ? s.value / s.quantity : s.lastUnitCost || 0, 2),
      value: round(Math.max(0, s.value), 2),
      lowStock: s.quantity <= 5,
      negative: s.quantity < 0,
      lastMovementAt: s.lastMovementAt
    })).sort((a, b) => a.item.localeCompare(b.item));

    return {
      version: AWBULI_OPS_VERSION,
      source: "FINANCIAL_LEDGER",
      live: false,
      items,
      lowStock: items.filter((i) => i.lowStock),
      stockValue: round(items.reduce((s, i) => s + Math.max(0, i.value), 0), 2),
      lowStockThreshold: 5,
      generatedAt: nowIso()
    };
  }

  alerts({ tenantScope = "default", now = new Date() } = {}) {
    const scope = String(tenantScope || "default").slice(0, 80);
    const rows = this._rows({ tenantScope: scope });
    const anomalies = [];
    const seen = new Set();
    const today = dateKey(now);

    const add = (type, severity, confidence, evidence, recommendedAction) => {
      const id = `awbalert-${hashId(scope, type, JSON.stringify(evidence))}`;
      if (seen.has(id)) return;
      seen.add(id);
      anomalies.push({
        id, type, severity, confidence,
        ownerOnly: true, visibility: "OWNER_ONLY",
        requiresReview: true,
        notFraudConfirmation: true,
        evidence, recommendedAction
      });
    };

    // Price/amount outliers need at least five comparable historical records.
    const comparable = rows.filter((r) => txItem(r) && txAmount(r) > 0 && ["SALE", "STOCK_SALE", "STOCK", "EXPENSE"].includes(txType(r)));
    for (const r of comparable) {
      const type = txType(r);
      const item = String(txItem(r)).toLowerCase();
      const history = comparable
        .filter((h) => h.fingerprint !== r.fingerprint && txType(h) === type && String(txItem(h)).toLowerCase() === item)
        .map((h) => txAmount(h));
      if (history.length < 5) continue;
      const med = median(history);
      if (!(med > 0)) continue;
      const amount = txAmount(r);
      const deviation = (amount - med) / med;
      if (Math.abs(deviation) <= 0.7) continue;
      add(
        "AMOUNT_OUTLIER",
        Math.abs(deviation) >= 1.5 ? "HIGH" : "MEDIUM",
        0.75,
        { item: txItem(r), amount: round(amount, 2), median: round(med, 2), deviationPercent: round(deviation * 100, 1), transactionId: r.adeTransactionId },
        "Confirm the amount with the customer or operator before relying on this entry."
      );
    }

    // Duplicate submissions within ten minutes, same tenant and normalized text.
    const groups = new Map();
    for (const r of rows) {
      const text = String(r.metadata?.commandText || "").trim();
      if (!text) continue;
      const key = `${txType(r)}::${text}`;
      const list = groups.get(key) || [];
      list.push(r);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => String(a.occurredAt || "").localeCompare(String(b.occurredAt || "")));
      for (let i = 1; i < list.length; i += 1) {
        const prev = list[i - 1];
        const cur = list[i];
        if (prev.fingerprint === cur.fingerprint) continue;
        const delta = Math.abs(new Date(cur.occurredAt || cur.receivedAt).getTime() - new Date(prev.occurredAt || prev.receivedAt).getTime());
        if (!(delta <= 10 * 60_000)) continue;
        add(
          "POSSIBLE_DUPLICATE",
          "MEDIUM",
          0.8,
          { intent: txType(cur), amount: txAmount(cur), firstTransactionId: prev.adeTransactionId, secondTransactionId: cur.adeTransactionId, secondsApart: Math.round(delta / 1000) },
          "Check whether this was one submission recorded twice; reverse the duplicate through the authorized ledger path if confirmed."
        );
      }
    }

    const inv = this.inventory({ tenantScope: scope, rows });
    for (const item of inv.items.filter((i) => i.negative)) {
      add(
        "NEGATIVE_STOCK", "HIGH", 0.95,
        { item: item.item, quantity: item.quantity, unit: item.unit },
        "Verify the last stock movement before accepting more sales of this item."
      );
    }

    const expenses = rows.filter((r) => txType(r) === "EXPENSE" && txAmount(r) > 0);
    if (expenses.length >= 3) {
      const med = median(expenses.map(txAmount));
      for (const r of expenses) {
        const amount = txAmount(r);
        if (med > 0 && amount >= med * 5 && amount >= 1000) {
          add(
            "LARGE_EXPENSE", "MEDIUM", 0.7,
            { amount: round(amount, 2), median: round(med, 2), transactionId: r.adeTransactionId },
            "Confirm this expense is genuine and not a mistyped amount."
          );
        }
      }
    }

    // Credit older than 14 days with no later payment.
    const credit = new Map();
    for (const r of rows) {
      if (!["DEBT", "PAYMENT"].includes(txType(r))) continue;
      const party = txParty(r) || "UNSPECIFIED_CUSTOMER";
      const cur = credit.get(party) || { party, credit: 0, paid: 0, lastCreditAt: null, lastPaymentAt: null };
      if (txType(r) === "DEBT") {
        cur.credit += txAmount(r);
        cur.lastCreditAt = r.occurredAt || r.receivedAt;
      } else {
        cur.paid += txAmount(r);
        cur.lastPaymentAt = r.occurredAt || r.receivedAt;
      }
      credit.set(party, cur);
    }
    for (const p of credit.values()) {
      const outstanding = p.credit - p.paid;
      if (!(outstanding > 0) || !p.lastCreditAt) continue;
      const age = daysBetween(dateKey(p.lastCreditAt), today);
      if (age <= 14) continue;
      if (p.lastPaymentAt && dateKey(p.lastPaymentAt) >= dateKey(p.lastCreditAt)) continue;
      add(
        "STALE_CREDIT", "MEDIUM", 0.7,
        { party: p.party, outstanding: round(outstanding, 2), daysSinceCredit: age, lastCreditAt: p.lastCreditAt },
        "Follow up with the customer; this is a review reminder, not a fraud finding."
      );
    }

    const weights = {
      AMOUNT_OUTLIER: 25, POSSIBLE_DUPLICATE: 20, NEGATIVE_STOCK: 30,
      LARGE_EXPENSE: 15, STALE_CREDIT: 10
    };
    const score = Math.min(100, anomalies.reduce((s, a) => s + (weights[a.type] || 10), 0));
    const band = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : score > 0 ? "LOW" : "NONE";

    if (anomalies.length) {
      this._publish("awbuli.anomaly.detected", {
        tenantScope: scope,
        count: anomalies.length,
        types: [...new Set(anomalies.map((a) => a.type))],
        score,
        band,
        sensitivity: "OWNER_ONLY",
        live: false
      });
    }

    return {
      version: AWBULI_OPS_VERSION,
      source: "FINANCIAL_LEDGER",
      live: false,
      ownerOnly: true,
      visibility: "OWNER_ONLY",
      score,
      band,
      items: anomalies.sort((a, b) => b.confidence - a.confidence || a.type.localeCompare(b.type)),
      generatedAt: nowIso(),
      note: "Review signals only. No fraud verdict, no autonomous freeze, no external disclosure."
    };
  }

  closeDay({ tenantScope = "default", date = null, now = new Date() } = {}) {
    const scope = String(tenantScope || "default").slice(0, 80);
    const businessDate = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : dateKey(now);
    const rows = this._rows({ tenantScope: scope });
    const current = this._aggregate(this._within(rows, businessDate, businessDate));
    const previousDate = addDays(businessDate, -1);
    const previous = this._aggregate(this._within(rows, previousDate, previousDate));
    const inventory = this.inventory({ tenantScope: scope, rows });
    const alerts = this.alerts({ tenantScope: scope, now });

    this._publish("awbuli.day.closed", {
      tenantScope: scope,
      businessDate,
      sales: current.totals.sales,
      expenses: current.totals.expenses,
      netProfit: current.netProfit,
      transactionCount: current.transactionCount,
      alertCount: alerts.items.length,
      sensitivity: "OWNER_ONLY",
      live: false
    });

    return {
      version: AWBULI_OPS_VERSION,
      source: "FINANCIAL_LEDGER",
      live: false,
      tenantScope: scope,
      businessDate,
      closedAt: nowIso(),
      currency: "NGN",
      status: "RECORDED",
      totals: current.totals,
      netProfit: current.netProfit,
      margin: current.margin,
      healthGrade: current.healthGrade,
      transactionCount: current.transactionCount,
      topItems: current.topItems,
      receivables: current.receivables.slice(0, 50),
      outstandingCredit: current.outstandingCredit,
      changes: {
        salesPercent: pct(current.totals.sales, previous.totals.sales),
        profitPercent: pct(current.netProfit, previous.netProfit),
        expensesPercent: pct(current.totals.expenses, previous.totals.expenses)
      },
      lowStock: inventory.lowStock,
      alerts: { score: alerts.score, band: alerts.band, count: alerts.items.length },
      provenance: {
        zMaths: "MISSING_EVIDENCE",
        smartLogic: "LEGACY_INTENT_RECOVERED",
        profitFormula: "sales - expenses",
        note: "Close is a recorded daily summary, not a live provider settlement."
      }
    };
  }

  status() {
    return {
      version: AWBULI_OPS_VERSION,
      provider: AWBULI_LEDGER_PROVIDER,
      storage: "FINANCIAL_LEDGER",
      live: false,
      timezone: AWBULI_TIMEZONE,
      writableIntents: [...WRITABLE],
      capabilities: {
        sales: true, expenses: true, credit: true, payments: true,
        inventory: true, dailyClose: true, summaries: true,
        anomalyReview: true, autonomousFreeze: false, liveTransport: false
      },
      provenance: {
        zMaths: "MISSING_EVIDENCE",
        smartLogic: "LEGACY_INTENT_RECOVERED",
        profitFormula: "sales - expenses",
        note: "Z-Maths/Smart Logic formula is not present in this repository or its Git history."
      }
    };
  }
}

export default AwbuliBusinessLedger;
