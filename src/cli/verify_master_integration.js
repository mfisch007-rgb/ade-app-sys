import KernelEventBus from "../core/EventBus.js";
import MultiAssetManager from "../trading/MultiAssetManager.js";
import BinaryBrokerConnector from "../trading/connectors/BinaryBrokerConnector.js";
import AffiliateLockGuard from "../security/AffiliateLockGuard.js";
import TelemetryGateway from "../telemetry/TelemetryGateway.js";

async function verifyMasterIntegration() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: MASTER ZERO-MOCK INTEGRATION PROOF (PHASE 5 & 6)");
  console.log("=========================================================================\n");

  const eventBus = KernelEventBus.getInstance();
  const multiAsset = MultiAssetManager.getInstance(5, 5, 2.0);
  const affiliateGuard = AffiliateLockGuard.getInstance();
  const brokerConnector = BinaryBrokerConnector.getInstance();
  const telemetry = TelemetryGateway.getInstance();

  // 1. Setup Affiliate & Session Lock
  affiliateGuard.registerValidAffiliate("AFFILIATE_MASTER_999");
  brokerConnector.connectSession("user_master", "AFFILIATE_MASTER_999");

  // Auto-Execute Hook
  eventBus.on("GHOSTBRAIN_SIGNAL_GENERATED", (evt) => {
    const signal = evt.payload || evt;
    brokerConnector.executeTradeOrder(signal);
  });

  // 2. Stream Multi-Asset Market Ticks with Non-Zero Variance on Target Asset
  const assets = ["EURUSD_OTC", "GBPUSD_OTC", "USDJPY_OTC", "AUDUSD_OTC", "BTCUSD"];
  assets.forEach(symbol => multiAsset.registerAsset(symbol));

  assets.forEach(symbol => {
    const baseline = symbol === "BTCUSD"
      ? [100.00, 100.01, 99.99, 100.00, 100.01]
      : [100.00, 100.00, 100.00, 100.00, 100.00];

    baseline.forEach(price => {
      multiAsset.processTick(symbol, price);
      telemetry.recordTick();
    });
  });

  // 3. Inject Volatility Spike on BTCUSD (Forces Z >= 2.0)
  multiAsset.processTick("BTCUSD", 105.00);
  telemetry.recordTick();

  // 4. Verify End-to-End Metrics & Logs
  const snapshot = telemetry.getSnapshot();

  const telemetryPass = snapshot.metrics.ticksProcessed === 26;
  const signalPass = snapshot.metrics.signalsGenerated >= 1;
  const tradePass = snapshot.metrics.tradesExecuted >= 1;
  const historyPass = brokerConnector.getExecutionHistory().length >= 1;

  console.log(` [1] Real-time Telemetry Gateway & Tick Metrics Tracking : ${telemetryPass ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [2] GhostBrain Mean-Reversion Signal Engine Trigger .... : ${signalPass ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [3] Internal Broker Execution Hook Pipeline ............ : ${tradePass ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [4] Master Ledger & Execution History Sync .............. : ${historyPass ? "PASS ✅" : "FAIL ❌"}`);

  if (!telemetryPass || !signalPass || !tradePass || !historyPass) {
    console.log("\n=========================================================================");
    console.log("   [MASTER VERDICT]: INTEGRATION VERIFICATION FAILED ❌");
    console.log("=========================================================================");
    process.exit(1);
  }

  console.log("\n=========================================================================");
  console.log("   [MASTER VERDICT]: FULL ADE ENGINE STACK ZERO-MOCK PROVEN ✅");
  console.log("=========================================================================");
}

verifyMasterIntegration().catch(err => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
