import crypto from "crypto";
import { assertTransition, allowedTransitions } from "../engagement/CaseStateMachine.js";
import EngagementEvents from "../engagement/EngagementEvents.js";

export class CaseManager {
  constructor({ eventBus, store } = {}) {
    this.eventBus = eventBus;
    this.store = store;
    this.cases = new Map();
    try {
      const loaded =
        typeof store?.readSection === "function"
          ? store.readSection("cases")
          : store?.read?.().cases;

      if (Array.isArray(loaded)) {
        for (const c of loaded) {
          if (c?.id) this.cases.set(c.id, c);
        }
      }
    } catch (_) {}
  }

  createCase(input = {}) {
    const id = `CASE-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const now = new Date().toISOString();

    const record = {
      id,
      status: input.status || "DISCOVERY_REQUIRED",
      source: input.source || "UNKNOWN",
      channel: input.channel || "UNKNOWN",
      organization: input.organization || null,
      contact: input.contact || null,
      request: input.request || {},
      confidence: Number(input.confidence ?? 0),
      authorization: input.authorization || {
        publicAnalysis: false,
        connectedSystems: false
      },
      nextAction: input.nextAction || "DISCOVERY",
      requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [],
      partnerRecommendations: [],
      discovery: null,
      decision: null,
      workflow: null,
      feedback: [],
      history: [{
        from: null,
        to: input.status || "DISCOVERY_REQUIRED",
        reason: "CASE_CREATED",
        at: now
      }],
      createdAt: now,
      updatedAt: now
    };

    this.cases.set(id, record);
    this.persist();
    this.publish("case.created", record);
    this.publish(EngagementEvents.CASE_CREATED, record);
    return record;
  }

  list() {
    return Array.from(this.cases.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  get(id) {
    return this.cases.get(id) || null;
  }

  transition(id, targetStatus, context = {}) {
    const current = this.get(id);
    if (!current) return null;

    assertTransition(current.status, targetStatus);

    const now = new Date().toISOString();
    const next = {
      ...current,
      ...context.patch,
      status: targetStatus,
      nextAction: context.nextAction ?? current.nextAction,
      updatedAt: now,
      history: [
        ...(Array.isArray(current.history) ? current.history : []),
        {
          from: current.status,
          to: targetStatus,
          reason: context.reason || "STATE_TRANSITION",
          actor: context.actor || "SYSTEM",
          at: now
        }
      ]
    };

    this.cases.set(id, next);
    this.persist();

    this.publish("case.updated", next);
    this.publish(EngagementEvents.CASE_UPDATED, next);
    this.publish(EngagementEvents.CASE_TRANSITIONED, {
      caseId: id,
      from: current.status,
      to: targetStatus,
      case: next
    });

    return next;
  }

  update(id, patch = {}) {
    const current = this.get(id);
    if (!current) return null;

    if (patch.status && patch.status !== current.status) {
      throw new Error("Direct status updates are forbidden. Use transition().");
    }

    const forbidden = ["id", "createdAt", "history"];
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !forbidden.includes(key))
    );

    const next = {
      ...current,
      ...safePatch,
      updatedAt: new Date().toISOString()
    };

    this.cases.set(id, next);
    this.persist();
    this.publish("case.updated", next);
    this.publish(EngagementEvents.CASE_UPDATED, next);
    return next;
  }

  getAllowedTransitions(id) {
    const current = this.get(id);
    return current ? allowedTransitions(current.status) : [];
  }

  reload() {
    try {
      const loaded =
        typeof this.store?.readSection === "function"
          ? this.store.readSection("cases")
          : this.store?.read?.().cases;

      if (Array.isArray(loaded)) {
        this.cases.clear();
        for (const c of loaded) {
          if (c?.id) this.cases.set(c.id, c);
        }
      }
    } catch (_) {}
    return this.cases.size;
  }

  persist() {
    try {
      if (typeof this.store?.writeSection === "function") {
        this.store.writeSection("cases", this.list());
      } else if (this.store?.write) {
        this.store.write("cases", this.list());
      }
    } catch (_) {}
  }

  publish(type, payload) {
    try {
      const result = this.eventBus?.publish?.(type, payload);
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  }
}

export default CaseManager;
