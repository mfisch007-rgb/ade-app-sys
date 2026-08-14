import EnterpriseKernelMaster from "../core/EnterpriseKernelMaster.js";
import CapabilityRegistry from "../core/CapabilityRegistry.js";
import ExtensionSandboxGuard from "../security/ExtensionSandboxGuard.js";
import TelemetrySSEGateway from "../telemetry/TelemetrySSEGateway.js";
import fs from "fs";

async function verifyPhase3() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: PHASE 3 BLOCK PROOF (BATCH 3.1 & BATCH 3.2)");
  console.log("=========================================================================\n");

  const kernel = EnterpriseKernelMaster.getInstance();
  const capabilityRegistry = CapabilityRegistry.getInstance();
  const sandboxGuard = ExtensionSandboxGuard.getInstance();
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

  // 1. Verify Spatial Command Center Component File (Gate E)
  const uiExists = fs.existsSync("src/ui/SpatialCommandCenter.jsx");
  console.log(` [1] Batch 3.1: Spatial Command UI Component Generated . : ${uiExists ? "PASS ✅" : "FAIL ❌"}`);

  // 2. Register Authorized Extension Capability with valid handler signature
  capabilityRegistry.registerCapability("EXTENSION_A", "EXECUTE_MARKET_TRADE", (payload) => payload);
  const capabilityVerified = capabilityRegistry.verifyCapability("EXTENSION_A", "EXECUTE_MARKET_TRADE");
  console.log(` [2] Batch 3.2: Extension Capability Registry ........ : ${capabilityVerified ? "PASS ✅" : "FAIL ❌"}`);

  // 3. Extension Sandbox Execution Check
  let sandboxSuccess = false;
  try {
    const result = sandboxGuard.executeInSandbox(
      "EXTENSION_A",
      "EXECUTE_MARKET_TRADE",
      { pair: "EURUSD", amount: 100 },
      (payload) => `Executed trade for ${payload.pair}`
    );
    sandboxSuccess = result === "Executed trade for EURUSD";
  } catch (e) {
    sandboxSuccess = false;
  }
  console.log(` [3] Batch 3.2: Extension Security Sandbox Execution .. : ${sandboxSuccess ? "PASS ✅" : "FAIL ❌"}`);

  // 4. Extension Sandbox Unauthorized Rejection Check
  let violationCaught = false;
  try {
    sandboxGuard.executeInSandbox(
      "UNAUTHORIZED_EXT",
      "ROOT_ACCESS",
      {},
      () => "Hacked"
    );
  } catch (e) {
    violationCaught = e.message.includes("[SANDBOX VIOLATION]");
  }
  console.log(` [4] Batch 3.2: Unauthorized Intent Rejection ......... : ${violationCaught ? "PASS ✅" : "FAIL ❌"}`);

  // 5. Verify Telemetry Broadcast for Sandbox Operations
  const telemetryVerified = capturedSseEvents.some(e => e.eventName === "SANDBOX_EXECUTION_SUCCESS") &&
                            capturedSseEvents.some(e => e.eventName === "SANDBOX_VIOLATION");
  console.log(` [5] Phase 3 Telemetry Stream Verification ............. : ${telemetryVerified ? "PASS ✅" : "FAIL ❌"}`);

  const allPassed = uiExists && capabilityVerified && sandboxSuccess && violationCaught && telemetryVerified;

  console.log("\n=========================================================================");
  if (allPassed) {
    console.log("   [PHASE 3 VERDICT]: SPATIAL COMMAND UI & SANDBOX GUARD PROVEN ✅");
  } else {
    console.log("   [PHASE 3 VERDICT]: PHASE 3 INTEGRATION REQUIRES REVIEW ❌");
    process.exit(1);
  }
  console.log("=========================================================================");
}

verifyPhase3().catch((err) => {
  console.error("\n[FATAL PHASE 3 ERROR]:", err.message);
  process.exit(1);
});
