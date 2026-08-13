import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";

async function runGateDAudit() {
  console.log("=======================================================");
  console.log("   ADE SYSTEM ENGINE: GATE D (CAPABILITY CONTROL) AUDIT ");
  console.log("=======================================================");

  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();
  const guard = CommunityEditionGuard.getInstance();

  console.log("\n--- [AUDIT 1: CAPABILITY RESTRICTION (COMMUNITY)] ---");
  // Try to use a feature not in the unlockedFeatures list
  const restrictedIntent = kernel.dispatchIntent("DEEP_SEARCH_ORACLE", { query: "BTC Trends" }, "COMMUNITY");
  const passA = !restrictedIntent.success && restrictedIntent.reason.includes("requires an Enterprise License");
  console.log(` [1] Community Feature Lock ............ : ${passA ? "PASS ✅" : "FAIL ❌"}`);

  console.log("\n--- [AUDIT 2: ASSET LIMIT RESTRICTION (COMMUNITY)] ---");
  kernel.dispatchIntent("WATCH_ASSET", { symbol: "EURUSD" }, "COMMUNITY");
  kernel.dispatchIntent("WATCH_ASSET", { symbol: "GBPUSD" }, "COMMUNITY");
  const overLimitIntent = kernel.dispatchIntent("WATCH_ASSET", { symbol: "JPYUSD" }, "COMMUNITY");
  
  const passB = !overLimitIntent.success && overLimitIntent.reason.includes("Community Edition supports max 2 streams");
  console.log(` [1] Community Asset Throttle (Max 2) .. : ${passB ? "PASS ✅" : "FAIL ❌"}`);

  console.log("\n--- [AUDIT 3: ENTERPRISE CAPABILITY BYPASS] ---");
  const entFeatureIntent = kernel.dispatchIntent("DEEP_SEARCH_ORACLE", { query: "ETH Trends" }, "ENTERPRISE");
  const entAssetIntent = kernel.dispatchIntent("WATCH_ASSET", { symbol: "JPYUSD" }, "ENTERPRISE");

  const passC = entFeatureIntent.success && entAssetIntent.success;
  console.log(` [1] Enterprise Feature Unlock ......... : ${passC ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [2] Enterprise Asset Unlimited ........ : ${passC ? "PASS ✅" : "FAIL ❌"}`);

  const allPassed = passA && passB && passC;

  console.log("\n=======================================================");
  if (allPassed) {
    console.log("   [FINAL VERDICT]: GATE D AUDIT PASSED ✅");
  } else {
    console.log("   [FINAL VERDICT]: GATE D AUDIT FAILED ❌");
    process.exit(1);
  }
  console.log("=======================================================");
}

runGateDAudit().catch((err) => {
  console.error("\n[FATAL AUDIT FAILURE]:", err.message);
  process.exit(1);
});
