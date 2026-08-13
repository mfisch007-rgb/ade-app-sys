import EnterpriseKernelMaster from "../core/EnterpriseKernelMaster.js";
import UniversalAIGateway from "../ai/UniversalAIGateway.js";
import TelemetrySSEGateway from "../telemetry/TelemetrySSEGateway.js";

async function verifyBatch21() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: BATCH 2.1 (KERNEL EXPANSION & AI GATEWAY PROOF)");
  console.log("=========================================================================\n");

  const kernel = EnterpriseKernelMaster.getInstance();
  const aiGateway = UniversalAIGateway.getInstance();
  const sseGateway = TelemetrySSEGateway.getInstance();

  const capturedSseEvents = [];

  sseGateway.addClient({
    write: (msg) => {
      try {
        const payload = msg
          .replace(/^data:\s*/, "")
          .trim();

        if (payload) {
          capturedSseEvents.push(JSON.parse(payload));
        }
      } catch {}
    }
  });

  // 1. Kernel + subsystem
  kernel.boot();

  kernel.registerSubsystemToKernel("ALPHA_AI_MODULE", [
    {
      intent: "AI_INFERENCE",
      rbacLevel: 1,
      handler: (p) => `Inference complete for ${p.model}`
    }
  ]);

  const state = kernel.getSystemState();

  const test1 =
    state.isBooted &&
    state.activeSubsystems.includes("ALPHA_AI_MODULE");

  console.log(
    ` [1] Kernel Expanded State & Subsystem Attachment ..... : ${test1 ? "PASS ✅" : "FAIL ❌"}`
  );

  // 2. Exact cache
  const prompt1 = "Analyze EURUSD market structure";
  const res1 = await aiGateway.dispatchPrompt(prompt1);
  const res2 = await aiGateway.dispatchPrompt(prompt1);

  const test2 =
    res1.route === "OFFLINE_LEXICAL_ENGINE" &&
    res2.route === "EXACT_CACHE";

  console.log(
    ` [2] AI Gateway Exact Cache Match .................... : ${test2 ? "PASS ✅" : "FAIL ❌"}`
  );

  // 3. Semantic cache (0.80 similarity triggers >= 0.75 threshold)
  const prompt2 = "Analyze EURUSD market structure setup";
  const res3 = await aiGateway.dispatchPrompt(prompt2);

  const test3 = res3.route === "SEMANTIC_CACHE";

  console.log(
    ` [3] AI Gateway Semantic Cache Match ................ : ${test3 ? "PASS ✅" : "FAIL ❌"}`
  );

  // 4. SSE event assertion uses the actual EventBus field: eventName
  const test4 = capturedSseEvents.some(
    (e) => e.eventName === "AI_DISPATCH_EVENT"
  );

  console.log(
    ` [4] AI Dispatch Telemetry Streamed to SSE Bridge ... : ${test4 ? "PASS ✅" : "FAIL ❌"}`
  );

  const allPassed = test1 && test2 && test3 && test4;

  console.log("\n=========================================================================");

  if (allPassed) {
    console.log(
      "   [BATCH 2.1 VERDICT]: KERNEL & AI GATEWAY INTEGRATION PROVEN ✅"
    );
  } else {
    console.log(
      "   [BATCH 2.1 VERDICT]: INTEGRATION REQUIRES REVIEW ❌"
    );
    process.exit(1);
  }

  console.log("=========================================================================");
}

verifyBatch21().catch((err) => {
  console.error("\n[FATAL BATCH 2.1 ERROR]:", err.message);
  process.exit(1);
});
