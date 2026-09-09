import test from "node:test";
import assert from "node:assert/strict";
import { EnterpriseKernelMaster } from "../../src/kernel/EnterpriseKernelMaster.js";

test("concurrent boot callers share exactly one in-flight Promise", async () => {
  const kernel = new EnterpriseKernelMaster();

  const p1 = kernel.boot();
  const p2 = kernel.boot();
  const p3 = kernel.boot();

  assert.equal(p1, p2);
  assert.equal(p2, p3);

  assert.equal(kernel.status, "BOOTING");
  assert.equal(kernel.isBooted, false);

  const results = await Promise.all([p1, p2, p3]);

  assert.equal(results.length, 3);
  assert.equal(results[0].status, "ONLINE");
  assert.equal(results[1].status, "ONLINE");
  assert.equal(results[2].status, "ONLINE");

  assert.equal(kernel.status, "ONLINE");
  assert.equal(kernel.isBooted, true);
  assert.equal(kernel.metrics.bootCount, 1);
  assert.equal(kernel.metrics.restartCount, 0);
});

test("post-boot calls remain idempotent", async () => {
  const kernel = new EnterpriseKernelMaster();

  const first = await kernel.boot();

  const bootCountBefore = kernel.metrics.bootCount;
  const restartCountBefore = kernel.metrics.restartCount;

  const second = await kernel.boot();

  assert.equal(first.status, "ONLINE");
  assert.equal(second.status, "ALREADY_RUNNING");

  assert.equal(kernel.metrics.bootCount, bootCountBefore);
  assert.equal(kernel.metrics.restartCount, restartCountBefore);
});

test("clean shutdown still permits one subsequent boot", async () => {
  const kernel = new EnterpriseKernelMaster();

  await kernel.boot();
  await kernel.shutdown();

  assert.equal(kernel.isBooted, false);
  assert.equal(kernel.status, "OFFLINE");

  const restarted = await kernel.boot();

  assert.equal(restarted.status, "ONLINE");
  assert.equal(kernel.isBooted, true);
  assert.equal(kernel.metrics.bootCount, 2);
  assert.equal(kernel.metrics.restartCount, 1);
});