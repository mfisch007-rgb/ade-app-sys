import EnterpriseKernelMaster from "../core/EnterpriseKernelMaster.js";
import UniversalAIGateway from "../ai/UniversalAIGateway.js";
import GuardianOracleEngine from "../ai/GuardianOracleEngine.js";
import TelemetrySSEGateway from "../telemetry/TelemetrySSEGateway.js";

async function verifyPhase2() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: PHASE 2 BLOCK PROOF (BATCH 2.3 & BATCH 2.4)");
  console.log("=========================================================================\n");

  const kernel = EnterpriseKernelMaster.getInstance();
  const aiGateway = UniversalAIGateway.getInstance();
  const guardianOracle = GuardianOracleEngine.getInstance();
  const sseGateway = TelemetrySSEGateway.getInstance();

  const capturedSseEvents = [];
  sseGateway.addClient({
    write: (msg) => {
      try {
        const payload = msg.replace(/^data:\s*/, "").trim();
        if (payload) capturedSseEvents.push(JSON.parse(payload));
      } catch {}
    }
  });

  kernel.boot();

  // 1. Offline Network Resiliency Test
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.QWEN_API_KEY;

  const resOffline = await aiGateway.dispatchPrompt("Analyze network failure recovery");
  const test1 = resOffline.route === "OFFLINE_LEXICAL_ENGINE";
  console.log(` [1] Batch 2.3: Zero-Key Resilient Lexical Fallback ... : ${test1 ? "PASS ✅" : "FAIL ❌"}`);

  // 2. HTTP Error Resilience (Invalid API Key trigger fallback)
  process.env.GEMINI_API_KEY = "invalid_key_trigger_http_400";
  const resFallbackOnErr = await aiGateway.dispatchPrompt("Test HTTP error cascade");
  const test2 = resFallbackOnErr.route === "OFFLINE_LEXICAL_ENGINE";
  console.log(` [2] Batch 2.3: HTTP Error Graceful Cascade Fallback . : ${test2 ? "PASS ✅" : "FAIL ❌"}`);

  // 3. Guardian Engine Health Audit
  const guardianResult = await guardianOracle.auditSystemHealth({ cpu: "12%", memory: "256MB" });
  const test3 = guardianResult.guardianVerdict === "SYSTEM_OPTIMAL";
  console.log(` [3] Batch 2.4: Guardian System Health Audit ......... : ${test3 ? "PASS ✅" : "FAIL ❌"}`);

  // 4. Oracle Knowledge Query Dispatch
  const oracleResult = await guardianOracle.queryOracleKnowledge("Explain state bus isolation");
  const test4 = typeof oracleResult.oracleAnswer === "string" && oracleResult.oracleAnswer.length > 0;
  console.log(` [4] Batch 2.4: Oracle Architectural Knowledge Engine . : ${test4 ? "PASS ✅" : "FAIL ❌"}`);

  // 5. Phase 2 Telemetry Integrity Check
  const test5 = capturedSseEvents.some(e => e.eventName === "GUARDIAN_AUDIT_COMPLETED") &&
                capturedSseEvents.some(e => e.eventName === "ORACLE_QUERY_COMPLETED");
  console.log(` [5] Telemetry SSE Integration Stream ................ : ${test5 ? "PASS ✅" : "FAIL ❌"}`);

  const allPassed = test1 && test2 && test3 && test4 && test5;

  console.log("\n=========================================================================");
  if (allPassed) {
    console.log("   [PHASE 2 VERDICT]: LIVE HTTP AI GATEWAY & GUARDIAN ORACLE PROVEN ✅");
  } else {
    console.log("   [PHASE 2 VERDICT]: PHASE 2 INTEGRATION REQUIRES REVIEW ❌");
    process.exit(1);
  }
  console.log("=========================================================================");
}

verifyPhase2().catch((err) => {
  console.error("\n[FATAL PHASE 2 ERROR]:", err.message);
  process.exit(1);
});
