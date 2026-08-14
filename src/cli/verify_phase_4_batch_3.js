import ZScoreEngine from "../trading/ZScoreEngine.js";
import MultiAssetManager from "../trading/MultiAssetManager.js";
import AffiliateLockGuard from "../security/AffiliateLockGuard.js";
import KernelEventBus from "../core/EventBus.js";

async function verifyPhase4Batch3() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: PHASE 4 BATCH 4.3 GHOSTBRAIN VERIFICATION PROOF");
  console.log("=========================================================================\n");

  const eventBus = KernelEventBus.getInstance();
  const multiAsset = MultiAssetManager.getInstance(5, 5, 2.0); // 5 assets, window size 5, threshold Z = 2.0
  const affiliateGuard = AffiliateLockGuard.getInstance();

  let signalCaptured = null;
  // Fix 1: Correct EventBus subscription method (EventEmitter uses .on)
  eventBus.on("GHOSTBRAIN_SIGNAL_GENERATED", (eventRecord) => {
    signalCaptured = eventRecord.payload || eventRecord;
  });

  // 1. Verify Affiliate Lock Verification
  affiliateGuard.registerValidAffiliate("REF_PARTNER_777");
  const authFail = affiliateGuard.validateUserAffiliate("user_01", "REF_INVALID");
  const authPass = affiliateGuard.validateUserAffiliate("user_02", "REF_PARTNER_777");
  const affiliateCheck = !authFail.authorized && authPass.authorized;
  console.log(` [1] Affiliate Lock Verification & Restriction Enforcement : ${affiliateCheck ? "PASS ✅" : "FAIL ❌"}`);

  // 2. Verify Multi-Asset Registration Capacity (Max 5)
  const assetsToRegister = ["EURUSD_OTC", "GBPUSD_OTC", "USDJPY_OTC", "AUDUSD_OTC", "BTCUSD"];
  assetsToRegister.forEach(a => multiAsset.registerAsset(a));
  
  let capacityBlocked = false;
  try {
    multiAsset.registerAsset("ETHUSD");
  } catch (err) {
    capacityBlocked = err.message.includes("Maximum asset capacity reached");
  }
  console.log(` [2] Multi-Asset Engine Parallel Stream Scaling (Max 5) .. : ${capacityBlocked ? "PASS ✅" : "FAIL ❌"}`);

  // 3. Verify Z-Score Math Engine & Trigger Precision
  // Fix 2: Provide price history with tiny variance so a clean spike triggers Z >= 2.0
  const baselineTicks = [1.0000, 1.0001, 0.9999, 1.0000, 1.0001];
  baselineTicks.forEach(p => multiAsset.processTick("GBPUSD_OTC", p));

  // Process a noticeable spike (e.g., 1.0100) relative to standard deviation (~0.000089)
  const spikeResult = multiAsset.processTick("GBPUSD_OTC", 1.0100);

  const zScoreCheck = spikeResult.signalTriggered && signalCaptured && signalCaptured.symbol === "GBPUSD_OTC";
  console.log(` [3] GhostBrain Z-Score Mean-Reversion Signal Math ..... : ${zScoreCheck ? "PASS ✅" : "FAIL ❌"}`);

  if (!affiliateCheck || !capacityBlocked || !zScoreCheck) {
    console.log("\n=========================================================================");
    console.log("   [PHASE 4 BATCH 4.3 VERDICT]: VERIFICATION FAILED ❌");
    console.log("=========================================================================");
    process.exit(1);
  }

  console.log("\n=========================================================================");
  console.log("   [PHASE 4 BATCH 4.3 VERDICT]: GHOSTBRAIN MATH & SCALING PROVEN ✅");
  console.log("=========================================================================");
}

verifyPhase4Batch3().catch(err => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
