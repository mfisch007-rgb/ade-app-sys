/**
 * ADE-APEX Level-3 Production Validator
 *
 * Tests behavior, not object existence.
 *
 * Gate:
 * canonical kernel -> real engines -> event bus -> workflow -> telemetry
 * -> runtime metrics -> failure injection -> shutdown -> restart.
 */
import assert from "node:assert/strict";
import { EnterpriseKernelMaster } from "../kernel/EnterpriseKernelMaster.js";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

const results = [];
const pass = (name, details = "") => {
  results.push({ name, ok: true, details });
  console.log(`PASS  ${name.padEnd(38, ".")} [PASS] ${details}`);
};
const fail = (name, error) => {
  results.push({ name, ok: false, details: error?.message || String(error) });
  console.error(`FAIL  ${name.padEnd(38, ".")} [FAIL] ${error?.message || error}`);
};

async function check(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" ADE-APEX LEVEL-3 BEHAVIORAL / FAILURE / RESTART VALIDATION");
  console.log("================================================================================");

  const bus = new EnterpriseEventBus();
  const kernel = new EnterpriseKernelMaster({ eventBus: bus });

  await check("Canonical Kernel Boot", async () => {
    const boot = await kernel.boot();
    assert.equal(boot.status, "ONLINE");
    assert.equal(kernel.isBooted, true);
    assert.equal(kernel.subsystems.size, 9);
    assert.ok(kernel.metrics.bootTimeMs >= 0);
  });

  await check("Memory store / retrieve / update / forget", async () => {
    const memory = kernel.resolve("memory");
    const created = memory.set("L3", { value: 42 }, { source: "validator" });
    assert.equal(created.value.value, 42);
    assert.equal(memory.retrieve("L3").value.value, 42);

    memory.set("L3", { value: 84 });
    assert.equal(memory.retrieve("L3").value.value, 84);
    assert.equal(memory.size(), 1);

    assert.equal(memory.forget("L3"), true);
    assert.equal(memory.retrieve("L3"), null);
    assert.equal(memory.stats().entries, 0);
  });

  await check("Knowledge ingest / query / replacement / explain", async () => {
    const knowledge = kernel.resolve("knowledge");
    knowledge.ingest("doc-1", "ADE enterprise kernel telemetry workflow");
    knowledge.ingest("doc-2", "ADE knowledge memory decision policy");

    assert.equal(knowledge.retrieve("doc-1").id, "doc-1");
    assert.ok(knowledge.query("enterprise telemetry").some(x => x.id === "doc-1"));

    knowledge.ingest("doc-1", "ADE replacement knowledge document");
    assert.equal(knowledge.query("enterprise telemetry").some(x => x.id === "doc-1"), false);
    assert.ok(knowledge.query("replacement knowledge").some(x => x.id === "doc-1"));

    const explanation = knowledge.explain("replacement knowledge");
    assert.equal(explanation.resultCount, 2);
    assert.ok(explanation.matches.some(x => x.id === "doc-1"));
  });

  await check("Decision policy / low confidence / validation", async () => {
    const decision = kernel.resolve("decision");

    const approved = await decision.evaluate({ confidence: 0.95 });
    const held = await decision.evaluate({ confidence: 0.65 });
    const rejected = await decision.evaluate({ confidence: 0.2 });

    assert.equal(approved.decision, "APPROVE");
    assert.equal(held.decision, "HOLD");
    assert.equal(rejected.decision, "REJECT");

    assert.equal(decision.validateDecision(approved), true);
    assert.equal(decision.validateDecision(held), true);
    assert.equal(decision.validateDecision(rejected), true);
    assert.equal(decision.stats().evaluations, 3);
  });

  await check("Canonical Event Bus delivery and metrics", async () => {
    let received = 0;
    bus.subscribe("l3.event", async payload => {
      assert.equal(payload.id, "E1");
      received++;
    });

    const result = await bus.publish("l3.event", { id: "E1" });
    assert.equal(result.deliveredCount, 1);
    assert.equal(received, 1);
    assert.equal(bus.getMetrics().published >= 1, true);
    assert.equal(bus.getMetrics().delivered >= 1, true);
  });

  await check("Event failure isolation + DLQ", async () => {
    const isolated = new EnterpriseEventBus();
    let healthyHandlerRan = false;

    isolated.subscribe("failure.test", async () => {
      throw new Error("intentional-failure");
    });
    isolated.subscribe("failure.test", async () => {
      healthyHandlerRan = true;
    });

    const result = await isolated.publish("failure.test", { test: true });
    assert.equal(healthyHandlerRan, true);
    assert.equal(result.failedCount, 1);
    assert.equal(isolated.dlq.length, 1);
    assert.equal(isolated.getMetrics().failed, 1);
  });

  await check("Workflow -> Event Bus -> Ledger -> Metrics", async () => {
    const workflow = kernel.resolve("workflowEngine");
    const ledger = kernel.resolve("ledger");
    let started = false;
    let completed = false;

    bus.subscribe("workflow.started", async () => { started = true; });
    bus.subscribe("workflow.completed", async () => { completed = true; });

    const before = kernel.metrics.workflowExecutions;
    const result = await workflow.execute({ id: "WF-L3", amount: 100 });

    assert.equal(result.status, "SUCCESS");
    assert.equal(started, true);
    assert.equal(completed, true);
    assert.equal(ledger.size(), 1);
    assert.equal(kernel.metrics.workflowExecutions, before + 1);
    assert.equal(kernel.metrics.workflowStarted >= 1, true);
    assert.equal(kernel.metrics.workflowCompleted >= 1, true);
  });

  await check("Telemetry receives real kernel events", async () => {
    const events = kernel.hub.getRecentEvents();
    assert.ok(Array.isArray(events));
    assert.ok(events.some(e => e.type === "KERNEL_BOOT_COMPLETE"));
  });

  await check("Runtime metrics reflect real operations", async () => {
    const m = kernel.metrics;
    assert.ok(m.memoryOperations > 0);
    assert.ok(m.knowledgeOperations > 0);
    assert.ok(m.decisionsEvaluated >= 3);
    assert.ok(m.workflowExecutions >= 1);
    assert.ok(m.eventsPublished > 0);
    assert.ok(m.eventsDelivered > 0);
    assert.ok(m.bootTimeMs !== null);
  });

  await check("Missing dependency fails deterministically", async () => {
    assert.throws(
      () => kernel.resolve("definitely-not-registered"),
      /Unregistered dependency/
    );
  });

  await check("Injected subsystem boot failure is surfaced", async () => {
    const failing = new EnterpriseKernelMaster({
      eventBus: new EnterpriseEventBus()
    });

    failing.registerSubsystem("intentionalFailure", {
      async initialize() {
        throw new Error("intentional-boot-failure");
      },
      async dispose() {}
    });

    await assert.rejects(
      () => failing.boot(),
      /intentional-boot-failure/
    );
    assert.equal(failing.status, "FAILED");
  });

  await check("Shutdown", async () => {
    const result = await kernel.shutdown();
    assert.equal(result.status, "OFFLINE");
    assert.equal(kernel.isBooted, false);
    assert.equal(kernel.status, "OFFLINE");
  });

  await check("Restart after clean shutdown", async () => {
    const before = kernel.metrics.bootCount;
    const result = await kernel.boot();

    assert.equal(result.status, "ONLINE");
    assert.equal(kernel.isBooted, true);
    assert.equal(kernel.metrics.bootCount, before + 1);
    assert.equal(kernel.metrics.restartCount, 1);
  });

  await kernel.shutdown();

  const passed = results.filter(x => x.ok).length;
  const failed = results.length - passed;
  const health = ((passed / results.length) * 100).toFixed(1);

  console.log("--------------------------------------------------------------------------------");
  console.log(` LEVEL-3 PLATFORM HEALTH: ${health}% (${passed}/${results.length})`);
  console.log("================================================================================");

  if (failed) {
    console.error(`LEVEL-3 VALIDATION FAILED: ${failed} gate(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("FULL GREEN: behavioral runtime, failure injection, shutdown and restart passed.");
  }
}

main().catch(error => {
  console.error("CRITICAL VALIDATION FAILURE:", error);
  process.exitCode = 1;
});
