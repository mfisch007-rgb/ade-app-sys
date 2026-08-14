import MultiAssetManager from "../trading/MultiAssetManager.js";
import BinaryBrokerConnector from "../trading/connectors/BinaryBrokerConnector.js";
import AffiliateLockGuard from "../security/AffiliateLockGuard.js";
import KernelEventBus from "../core/EventBus.js";

async function verifyPhase4Batch4() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: PHASE 4.4 BINARY BROKER EXECUTION HOOKS PROOF");
  console.log("=========================================================================\n");

  const eventBus = KernelEventBus.getInstance();
  const multiAsset = MultiAssetManager.getInstance(5, 5, 2.0);
  const affiliateGuard = AffiliateLockGuard.getInstance();
  const brokerConnector = BinaryBrokerConnector.getInstance();

  let brokerExecutionCaptured = null;
  eventBus.on("BROKER_TRADE_EXECUTED", (eventRecord) => {
    brokerExecutionCaptured = eventRecord.payload || eventRecord;
  });

  // 1. Setup Valid Affiliate Whitelist & Broker Session
  affiliateGuard.registerValidAffiliate("AFFILIATE_OFFICIAL_1001");
  
  let unauthorizedBlocked = false;
  try {
    brokerConnector.connectSession("user_rogue", "INVALID_AFFILIATE");
  } catch (err) {
    unauthorizedBlocked = err.message.includes("EXECUTION_BLOCKED");
  }
  console.log(` [1] Broker Unauthorized Execution Guard Restriction : ${unauthorizedBlocked ? "PASS ✅" : "FAIL ❌"}`);

  // Connect valid session
  const connection = brokerConnector.connectSession("user_authorized", "AFFILIATE_OFFICIAL_1001");
  const sessionValid = connection.status === "CONNECTED";
  console.log(` [2] Broker Authorized Affiliate Session Lock Connection: ${sessionValid ? "PASS ✅" : "FAIL ❌"}`);

  // 3. Register GhostBrain Signal Auto-Execution Hook
  eventBus.on("GHOSTBRAIN_SIGNAL_GENERATED", (eventRecord) => {
    const signal = eventRecord.payload || eventRecord;
    brokerConnector.executeTradeOrder(signal);
  });

  // 4. Register Asset and Trigger Signal Spike
  multiAsset.registerAsset("USDJPY_OTC");
  const baseline = [150.00, 150.01, 149.99, 150.00, 150.01];
  baseline.forEach(p => multiAsset.processTick("USDJPY_OTC", p));

  // Trigger high spike to generate PUT signal
  multiAsset.processTick("USDJPY_OTC", 151.50);

  const executionCheck = brokerExecutionCaptured !== null &&
    brokerExecutionCaptured.symbol === "USDJPY_OTC" &&
    brokerExecutionCaptured.status === "EXECUTED" &&
    brokerExecutionCaptured.affiliateId === "AFFILIATE_OFFICIAL_1001";

  console.log(` [3] GhostBrain Signal -> Broker Auto-Execution Pipeline: ${executionCheck ? "PASS ✅" : "FAIL ❌"}`);

  if (!unauthorizedBlocked || !sessionValid || !executionCheck) {
    console.log("\n=========================================================================");
    console.log("   [PHASE 4 BATCH 4.4 VERDICT]: VERIFICATION FAILED ❌");
    console.log("=========================================================================");
    process.exit(1);
  }

  console.log("\n=========================================================================");
  console.log("   [PHASE 4 BATCH 4.4 VERDICT]: BROKER EXECUTION HOOKS PROVEN ✅");
  console.log("=========================================================================");
}

verifyPhase4Batch4().catch(err => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
