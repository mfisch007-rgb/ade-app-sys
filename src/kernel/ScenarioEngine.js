import { assertSafeExecution, evaluateDemoPolicy } from "../../lib/core/demoGuard.js";
import EnterpriseEventBus from "./EnterpriseEventBus.js";

export class ScenarioEngine {
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.active = new Map();
  }

  start(id, { mode = "SIMULATED", steps = [] } = {}) {
    if (!id) throw new Error("Scenario id is required.");
    if (this.active.has(id)) throw new Error(`Scenario '${id}' is already active.`);
    const state = { id, mode, startedAt: new Date().toISOString(), mutations: [], steps: [...steps], status: "RUNNING" };
    this.active.set(id, state);
    this.eventBus.publish("SCENARIO_STARTED", { id, mode });
    return state;
  }

  recordMutation(id, mutation) {
    const state = this.active.get(id);
    if (!state) throw new Error(`Scenario '${id}' is not active.`);
    state.mutations.push({ ...mutation, recordedAt: new Date().toISOString() });
    return state.mutations.at(-1);
  }

  executeSideEffect(id, sideEffect, operation) {
    const state = this.active.get(id);
    if (!state) throw new Error(`Scenario '${id}' is not active.`);
    if (state.mode !== "LIVE") return { status: "SIMULATED", policy: evaluateDemoPolicy(sideEffect) };
    assertSafeExecution(sideEffect);
    return operation();
  }

  finish(id, status = "COMPLETED") {
    const state = this.active.get(id);
    if (!state) return false;
    state.status = status;
    state.finishedAt = new Date().toISOString();
    state.mutations = [];
    this.active.delete(id);
    this.eventBus.publish("SCENARIO_FINISHED", { id, status });
    return true;
  }

  rollback(id) { return this.finish(id, "ROLLED_BACK"); }
  listActive() { return [...this.active.values()].map(s => ({ ...s, mutations: s.mutations.length })); }
}
export default ScenarioEngine;
