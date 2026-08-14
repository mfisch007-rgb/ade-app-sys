import EnterpriseKernelMaster from "../core/EnterpriseKernelMaster.js";
import UniversalAIGateway from "../ai/UniversalAIGateway.js";
import TelemetrySSEGateway from "../telemetry/TelemetrySSEGateway.js";

async function verifyBatch22() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: BATCH 2.2 (MULTI-PROVIDER AI GATEWAY PROOF)");
  console.log("=========================================================================\n");

  const kernel = EnterpriseKernelMaster.getInstance();
  const aiGateway = UniversalAIGateway.getInstance();
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

  // 1. Test Offline Fallback Path (No API Keys Configured)
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.QWEN_API_KEY;

  const resOffline = await aiGateway.dispatchPrompt("Execute liquidity mapping for BTCUSD");
  const test1 = resOffline.route === "OFFLINE_LEXICAL_ENGINE";
  console.log(` [1] Zero-Key Offline Lexical Cascade Fallback ....... : ${test1 ? "PASS ✅" : "FAIL ❌"}`);

  // 2. Test Dynamic Provider Execution (Simulated API Key Injection)
  process.env.GROQ_API_KEY = "mock_groq_key_12345";
  const resGroq = await aiGateway.dispatchPrompt("Calculate high-frequency volatility spread");
  const test2 = resGroq.route === "GROQ";
  console.log(` [2] Live Provider Routing Cascade (Groq Priority) ..... : ${test2 ? "PASS ✅" : "FAIL ❌"}`);

  // 3. Test Provider Cascade Switching (Simulating Gemini Key)
  process.env.GEMINI_API_KEY = "mock_gemini_key_67890";
  const resGemini = await aiGateway.dispatchPrompt("Evaluate market regime switch");
  const test3 = resGemini.route === "GEMINI";
  console.log(` [3] Primary Provider Override (Gemini Priority) ....... : ${test3 ? "PASS ✅" : "FAIL ❌"}`);

  // 4. Verify Telemetry Broadcast
  const test4 = capturedSseEvents.some(e => e.eventName === "AI_DISPATCH_EVENT");
  console.log(` [4] Telemetry Stream Verification .................... : ${test4 ? "PASS ✅" : "FAIL ❌"}`);

  const allPassed = test1 && test2 && test3 && test4;

  console.log("\n=========================================================================");
  if (allPassed) {
    console.log("   [BATCH 2.2 VERDICT]: MULTI-PROVIDER AI GATEWAY PROVEN ✅");
  } else {
    console.log("   [BATCH 2.2 VERDICT]: MULTI-PROVIDER GATEWAY REQUIRES REVIEW ❌");
    process.exit(1);
  }
  console.log("=========================================================================");
}

verifyBatch22().catch((err) => {
  console.error("\n[FATAL BATCH 2.2 ERROR]:", err.message);
  process.exit(1);
});
