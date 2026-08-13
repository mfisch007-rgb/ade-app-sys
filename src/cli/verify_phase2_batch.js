import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";
import TelemetrySSEGateway from "../telemetry/TelemetrySSEGateway.js";

async function verifyPhase2Batch() {
  console.log("=======================================================");
  console.log("   ADE SYSTEM ENGINE: PHASE 2 INTEGRATION VERIFICATION ");
  console.log("=======================================================");

  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();

  console.log("\n--- [STEP 1: LAUNCHING LIVE SSE TELEMETRY HUB] ---");
  const sseGateway = new TelemetrySSEGateway(4000);
  await sseGateway.start();

  console.log("\n--- [STEP 2: CONNECTING REAL SSE CLIENT & PARSER] ---");
  const capturedEvents = [];
  const controller = new AbortController();
  
  const response = await fetch("http://localhost:4000/api/telemetry/stream", { signal: controller.signal });
  if (!response.ok) throw new Error(`SSE Connection failed: ${response.statusText}`);

  console.log("[OK] SSE Socket Connected.");

  // Stream Reader & Event Frame Splitter
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop(); // Keep unfinished chunk in buffer

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const lines = chunk.split("\n");
          let eventType = "message";
          let eventData = null;

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.replace("event: ", "").trim();
            if (line.startsWith("data: ")) eventData = JSON.parse(line.replace("data: ", "").trim());
          }

          if (eventData) {
            capturedEvents.push({ type: eventType, data: eventData });
          }
        }
      }
    } catch (e) {
      // Stream aborted on completion
    }
  })();

  console.log("\n--- [STEP 3: EXECUTING MULTI-PROVIDER AI GATEWAY PROBES] ---");
  const prompt1 = "Calculate optimal risk percentage for EURUSD trade given Z-Score = 2.1";
  const res1 = await kernel.aiGateway.complete(prompt1, { model: "fast" });
  console.log(` -> Executed Mode : ${res1.mode}`);
  console.log(` -> Provider Used : ${res1.provider}`);

  const res2 = await kernel.aiGateway.complete(prompt1, { model: "fast" });
  console.log(` -> Cache Hit Type: ${res2.cacheType}`);

  console.log("\n--- [STEP 4: DISPATCHING CENTRAL KERNEL INTENT] ---");
  kernel.dispatchIntent("RISK_MANAGEMENT_TRIGGERED", { symbol: "EURUSD", risk: "2.5%" });

  // Allow socket buffer tick
  await new Promise((r) => setTimeout(r, 1200));

  console.log("\n--- [STEP 5: STRICT PAYLOAD ASSERTION CHECKS] ---");
  
  const handshakeEvent = capturedEvents.find(e => e.type === "handshake");
  const aiCacheEvent = capturedEvents.find(e => e.type === "ai_cache_hit");
  const telemetryEvent = capturedEvents.find(e => 
    e.type === "telemetry_event" && 
    e.data.payload && 
    e.data.payload.action === "RISK_MANAGEMENT_TRIGGERED"
  );

  console.log(` [1] Handshake SSE Received .......... : ${handshakeEvent ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [2] AI Cache Event SSE Received ..... : ${aiCacheEvent ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [3] Central Kernel Telemetry SSE ..... : ${telemetryEvent ? "PASS ✅" : "FAIL ❌"}`);

  controller.abort();
  sseGateway.stop();

  if (!telemetryEvent || !aiCacheEvent || !handshakeEvent) {
    console.log("\n=======================================================");
    console.log("   [VERDICT]: SSE TRANSPORT VERIFIED — TELEMETRY BRIDGE BROKEN");
    console.log("=======================================================");
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log("   [VERDICT]: FULL END-TO-END TELEMETRY TO SSE PIPELINE VERIFIED");
  console.log("=======================================================");
}

verifyPhase2Batch().catch((err) => {
  console.error("\n[FATAL VERIFICATION ERROR]:", err.message);
  process.exit(1);
});
