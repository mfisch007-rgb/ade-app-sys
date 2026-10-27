import crypto from "crypto";
import { assertTransition, allowedTransitions } from "../engagement/CaseStateMachine.js";
import EngagementEvents from "../engagement/EngagementEvents.js";

export class CaseManager {
  constructor({ eventBus, store } = {}) {
    this.eventBus = eventBus;
    this.store = store;
    this.cases = new Map();
    this.lastPersistError = null;
    this._mutationQueue = Promise.resolve();
    this._mergeStored(this._readStored());
  }

  #enqueueMutation(task) {
    const run = this._mutationQueue.then(task);
    this._mutationQueue = run.then(() => {}, () => {});
    return run;
  }

  async #refreshForMutation() {
    let loaded;
    if (typeof this.store?.readSectionStrictAsync === "function") {
      loaded = await this.store.readSectionStrictAsync("cases");
    } else if (typeof this.store?.readSectionAsync === "function") {
      loaded = await this.store.readSectionAsync("cases");
    } else if (typeof this.store?.readSection === "function") {
      loaded = this.store.readSection("cases");
    } else if (this.store?.read) {
      loaded = this.store.read().cases;
    }
    if (loaded !== undefined && loaded !== null && !Array.isArray(loaded)) {
      throw new Error("CASE_STORE_CORRUPT");
    }
    if (Array.isArray(loaded)) this._mergeStored(loaded);
  }

  _readStored() {
    try {
      const loaded =
        typeof this.store?.readSection === "function"
          ? this.store.readSection("cases")
          : this.store?.read?.().cases;
      return Array.isArray(loaded) ? loaded : null;
    } catch (_) {
      return null;
    }
  }

  _mergeStored(loaded) {
    if (!Array.isArray(loaded)) return this.cases;
    const merged = new Map();
    for (const c of loaded) {
      if (c?.id) merged.set(c.id, c);
    }
    for (const [id, current] of this.cases) {
      const stored = merged.get(id);
      if (!stored) {
        merged.set(id, current);
        continue;
      }
      const currentAt = Date.parse(current.updatedAt || current.createdAt || 0) || 0;
      const storedAt = Date.parse(stored.updatedAt || stored.createdAt || 0) || 0;
      if (currentAt >= storedAt) merged.set(id, current);
    }
    this.cases = merged;
    return this.cases;
  }

  #newRecord(input = {}) {
    const id = `CASE-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const now = new Date().toISOString();

    return {
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
  }

  #publishCreated(record) {
    this.publish("case.created", record);
    this.publish(EngagementEvents.CASE_CREATED, record);
  }

  #publishUpdated(next) {
    this.publish("case.updated", next);
    this.publish(EngagementEvents.CASE_UPDATED, next);
  }

  createCase(input = {}) {
    const record = this.#newRecord(input);
    this.cases.set(record.id, record);
    this.persist();
    this.#publishCreated(record);
    return record;
  }

  async createCaseAsync(input = {}) {
    return this.#enqueueMutation(async () => {
      await this.#refreshForMutation();
      const record = this.#newRecord(input);
      this.cases.set(record.id, record);
      try {
        await this.persistAsync({ merge: false });
      } catch (error) {
        this.cases.delete(record.id);
        throw error;
      }
      this.#publishCreated(record);
      return record;
    });
  }

  list() {
    return Array.from(this.cases.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  get(id) {
    return this.cases.get(id) || null;
  }

  #nextTransition(id, targetStatus, context = {}) {
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

    return { current, next };
  }

  #publishTransition(id, targetStatus, current, next) {
    this.publish(EngagementEvents.CASE_TRANSITIONED, {
      caseId: id,
      from: current.status,
      to: targetStatus,
      case: next
    });
  }

  transition(id, targetStatus, context = {}) {
    const result = this.#nextTransition(id, targetStatus, context);
    if (!result) return null;

    this.cases.set(id, result.next);
    this.persist();

    this.#publishUpdated(result.next);
    this.#publishTransition(id, targetStatus, result.current, result.next);

    return result.next;
  }

  async transitionAsync(id, targetStatus, context = {}) {
    return this.#enqueueMutation(async () => {
      await this.#refreshForMutation();
      const result = this.#nextTransition(id, targetStatus, context);
      if (!result) return null;

      this.cases.set(id, result.next);
      try {
        await this.persistAsync({ merge: false });
      } catch (error) {
        this.cases.set(id, result.current);
        throw error;
      }

      this.#publishUpdated(result.next);
      this.#publishTransition(id, targetStatus, result.current, result.next);

      return result.next;
    });
  }

  #nextUpdate(id, patch = {}) {
    const current = this.get(id);
    if (!current) return null;

    if (patch.status && patch.status !== current.status) {
      throw new Error("Direct status updates are forbidden. Use transition().");
    }

    const forbidden = ["id", "createdAt", "history"];
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !forbidden.includes(key))
    );

    return {
      current,
      next: {
        ...current,
        ...safePatch,
        updatedAt: new Date().toISOString()
      }
    };
  }

  #publishNativeUpdate(next) {
    this.publish("case.updated", next);
    this.publish(EngagementEvents.CASE_UPDATED, next);
  }

  update(id, patch = {}) {
    const result = this.#nextUpdate(id, patch);
    if (!result) return null;

    this.cases.set(id, result.next);
    this.persist();
    this.#publishNativeUpdate(result.next);
    return result.next;
  }

  async updateAsync(id, patch = {}) {
    return this.#enqueueMutation(async () => {
      await this.#refreshForMutation();
      const result = this.#nextUpdate(id, patch);
      if (!result) return null;

      this.cases.set(id, result.next);
      try {
        await this.persistAsync({ merge: false });
      } catch (error) {
        this.cases.set(id, result.current);
        throw error;
      }
      this.#publishNativeUpdate(result.next);
      return result.next;
    });
  }

  getAllowedTransitions(id) {
    const current = this.get(id);
    return current ? allowedTransitions(current.status) : [];
  }

  // Canonical case-to-account linkage. Binds a (possibly public/anonymous)
  // intake case to the authenticated account that claimed it. The accountId
  // MUST be derived server-side from the verified session — never accepted
  // from the client. Idempotent for the owning account; refuses to steal a
  // case already attached to a different account. Status is untouched.
  #nextAttach(caseId, accountId, sessionContext = {}) {
    if (!caseId || typeof caseId !== "string") throw new Error("CASE_ID_REQUIRED");
    if (!accountId || typeof accountId !== "string") throw new Error("ACCOUNT_ID_REQUIRED");
    const current = this.get(caseId);
    if (!current) throw new Error("CASE_NOT_FOUND");
    if (current.accountId && current.accountId !== accountId) {
      throw new Error("CASE_ALREADY_ATTACHED");
    }
    if (current.accountId === accountId) return { current, next: current, changed: false };
    const now = new Date().toISOString();
    const actor = sessionContext.actor || sessionContext.username || "ACCOUNT_HOLDER";
    const next = {
      ...current,
      accountId,
      updatedAt: now,
      history: [
        ...(Array.isArray(current.history) ? current.history : []),
        { from: current.status, to: current.status, reason: "CASE_ATTACHED_TO_ACCOUNT", actor, at: now }
      ]
    };
    return { current, next, changed: true };
  }

  attachCaseToAccount(caseId, accountId, sessionContext = {}) {
    const result = this.#nextAttach(caseId, accountId, sessionContext);
    if (!result.changed) return result.current;
    this.cases.set(caseId, result.next);
    this.persist();
    this.#publishNativeUpdate(result.next);
    return result.next;
  }

  async attachCaseToAccountAsync(caseId, accountId, sessionContext = {}) {
    return this.#enqueueMutation(async () => {
      await this.#refreshForMutation();
      const result = this.#nextAttach(caseId, accountId, sessionContext);
      if (!result.changed) return result.current;
      this.cases.set(caseId, result.next);
      try {
        await this.persistAsync({ merge: false });
      } catch (error) {
        this.cases.set(caseId, result.current);
        throw error;
      }
      this.#publishNativeUpdate(result.next);
      return result.next;
    });
  }

  reload() {
    const loaded = this._readStored();
    if (Array.isArray(loaded)) {
      this.cases.clear();
      for (const c of loaded) {
        if (c?.id) this.cases.set(c.id, c);
      }
    }
    return this.cases.size;
  }

  // Canonical cross-instance refresh. Re-pulls the authoritative case
  // collection (durable store where configured) before reads/mutations so
  // every serverless instance serves the same case truth. Never throws —
  // callers fall back to the in-memory snapshot.
  async refresh() {
    try {
      const loaded =
        this.store && typeof this.store.readSectionAsync === "function"
          ? await this.store.readSectionAsync("cases")
          : this.store?.readSection?.("cases");
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
      this._mergeStored(this._readStored());
      if (typeof this.store?.writeSection === "function") {
        this.store.writeSection("cases", this.list());
      } else if (this.store?.write) {
        this.store.write("cases", this.list());
      }
      this.lastPersistError = null;
    } catch (error) {
      this.lastPersistError = error;
    }
  }

  async persistAsync({ merge = true } = {}) {
    try {
      if (merge) {
        if (typeof this.store?.readSectionAsync === "function") {
          const loaded = await this.store.readSectionAsync("cases");
          this._mergeStored(loaded);
        } else {
          this._mergeStored(this._readStored());
        }
      }
      if (typeof this.store?.writeSectionAsync === "function") {
        await this.store.writeSectionAsync("cases", this.list());
      } else if (typeof this.store?.writeSection === "function") {
        this.store.writeSection("cases", this.list());
      } else if (this.store?.write) {
        this.store.write("cases", this.list());
      }
      this.lastPersistError = null;
    } catch (error) {
      this.lastPersistError = error;
      throw error;
    }
  }

  publish(type, payload) {
    try {
      const result = this.eventBus?.publish?.(type, payload);
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  }
}

export default CaseManager;
