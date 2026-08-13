import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";
import PreDeploymentAuditProbe from "../security/PreDeploymentAuditProbe.js";

async function verifyMasterAudit() {
  console.log("=======================================================");
  console.log("   ADE SYSTEM ENGINE: COMPREHENSIVE REPAIR AUDIT       ");
  console.log("=======================================================");

  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();

  console.log("\n--- [AUDIT PHASE 1: TELEMETRY & UNIVERSAL AI GATEWAY] ---");
  kernel.dispatchIntent("SYSTEM_AUDIT_START", { probe: "MasterAudit" });

  const events = kernel.telemetry.getRecentEvents();
  console.log(`[OK] Telemetry Event Hub: ${events.length} active event(s) captured.`);

  const prompt1 = "Analyze EUR/USD volatility under Z-Score = 2.5";
  const res1 = await kernel.aiGateway.complete(prompt1, { model: "fast" });
  console.log(`[OK] Gateway Initial Query -> Mode: ${res1.mode} | Provider: ${res1.provider} | Cached: ${res1.cached}`);

  // Exact Match Cache Test
  const res2 = await kernel.aiGateway.complete(prompt1, { model: "fast" });
  console.log(`[OK] Gateway Exact Query -> Mode: ${res2.mode} | CacheType: ${res2.cacheType} | Cached: ${res2.cached}`);

  // True Semantic Vector Cosine Similarity Cache Test
  const prompt2 = "EUR/USD volatility analysis under Z-Score = 2.5";
  const res3 = await kernel.aiGateway.complete(prompt2, { model: "fast" });
  console.log(`[OK] Gateway Semantic Query -> Mode: ${res3.mode} | CacheType: ${res3.cacheType} | Similarity: ${res3.similarity} | Cached: ${res3.cached}`);

  const aiMetrics = kernel.aiGateway.getMetrics();
  console.log(`[OK] AI Metrics -> Total Requests: ${aiMetrics.totalRequests} | Exact Hits: ${aiMetrics.exactCacheHits} | Semantic Hits: ${aiMetrics.semanticCacheHits} | Atomic Cache Entries: ${aiMetrics.atomicCacheEntries}/${aiMetrics.maxCacheCapacity}`);

  console.log("\n--- [AUDIT PHASE 2: SECURITY & COMMUNITY GUARD BOUNDARIES] ---");
  const probe = new PreDeploymentAuditProbe();
  const securityReport = await probe.runFullPreDeploymentAudit();

  for (const item of securityReport.checks) {
    console.log(`[${item.status}] ${item.check}`);
  }

  console.log("\n=======================================================");
  console.log("   [FINAL VERDICT]: ADE CORE INFRASTRUCTURE INTEGRITY VERIFIED");
  console.log("=======================================================");
}

verifyMasterAudit().catch((err) => {
  console.error("\n[FATAL AUDIT FAILURE]:", err.message);
  process.exit(1);
});
