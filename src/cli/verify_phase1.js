import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";

async function verifyPhase1() {
  console.log("=======================================================");
  console.log("   STRICT PHASE 1 AUDIT & VERIFICATION PROBE           ");
  console.log("=======================================================");

  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();

  // Test 1: Telemetry Hub & Intent Dispatch
  console.log("\n[TEST 1] Dispatching Test Intent through Telemetry Hub...");
  kernel.dispatchIntent("SYSTEM_TEST_INTENT", { target: "LaunchCenterUI" });
  
  const recentEvents = kernel.telemetry.getRecentEvents();
  if (recentEvents.length === 0) {
    throw new Error("[VERIFICATION FAILED]: Telemetry Hub recorded zero events.");
  }
  console.log(`  └─ SUCCESS: Telemetry Hub captured ${recentEvents.length} event(s).`);

  // Test 2: AI Gateway Call 1 (Uncached)
  console.log("\n[TEST 2] Universal AI Gateway Initial Call...");
  const prompt = "Analyze market volatility for EUR/USD under Z-Score = 2.5";
  const res1 = await kernel.aiGateway.complete(prompt, { model: "fast" });
  
  if (!res1 || !res1.text) {
    throw new Error("[VERIFICATION FAILED]: AI Gateway returned empty response.");
  }
  console.log(`  └─ Call 1 Output: Provider = ${res1.provider} | Mode = ${res1.mode} | Cached = ${res1.cached}`);

  // Test 3: AI Gateway Call 2 (Cache Assertion)
  console.log("\n[TEST 3] Universal AI Gateway Cache Validation...");
  const res2 = await kernel.aiGateway.complete(prompt, { model: "fast" });
  
  if (res2.cached !== true) {
    throw new Error("[VERIFICATION FAILED]: AI Gateway failed to retrieve response from cache on second call.");
  }
  console.log(`  └─ Call 2 Output: Provider = ${res2.provider} | Mode = ${res2.mode} | Cached = ${res2.cached}`);

  // Test 4: Metrics Inspection
  const metrics = kernel.aiGateway.getMetrics();
  console.log("\n[AI GATEWAY METRICS]:", JSON.stringify(metrics, null, 2));

  if (metrics.cacheHits !== 1) {
    throw new Error(`[VERIFICATION FAILED]: Expected cacheHits = 1, got ${metrics.cacheHits}`);
  }

  console.log("\n=======================================================");
  if (res1.mode === "OFFLINE_FALLBACK") {
    console.log("[PHASE 1 STATUS]: OFFLINE FALLBACK VERIFIED (PASS)");
    console.log("  └─ Kernel, Telemetry, Gateway, and Cache logic passed cleanly in offline mode.");
  } else {
    console.log("[PHASE 1 STATUS]: LIVE AI GATEWAY VERIFIED (PASS)");
    console.log("  └─ Live provider execution and semantic caching fully operational.");
  }
  console.log("=======================================================");
}

verifyPhase1().catch((err) => {
  console.error("\n[FATAL AUDIT FAILURE]:", err.message);
  process.exit(1);
});
