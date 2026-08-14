import KernelEventBus from "../core/EventBus.js";
import MultiAssetManager from "../trading/MultiAssetManager.js";
import BinaryBrokerConnector from "../trading/connectors/BinaryBrokerConnector.js";
import AffiliateLockGuard from "../security/AffiliateLockGuard.js";
import MasterAdminLicenseControl from "../security/MasterAdminLicenseControl.js";
import TelemetryGateway from "../telemetry/TelemetryGateway.js";

async function runIndustrialE2ETest() {
  console.log("=========================================================================");
  console.log("   ADE SYSTEM ENGINE: INDUSTRIAL ENTERPRISE-GRADE E2E SYSTEM PROOF");
  console.log("=========================================================================\n");

  const eventBus = KernelEventBus.getInstance();
  const licenseControl = MasterAdminLicenseControl.getInstance();
  const affiliateGuard = AffiliateLockGuard.getInstance();
  const multiAsset = MultiAssetManager.getInstance(5, 5, 2.0);
  const brokerConnector = BinaryBrokerConnector.getInstance();
  const telemetry = TelemetryGateway.getInstance();

  // STAGE 1: Enterprise Security & Licensing Lockdown
  const license = licenseControl.issueLicense("ENTERPRISE_USER_001", "30d");
  const licenseValid = licenseControl.validateLicense(license.licenseKey).active;
  console.log(` [1] Security Containment & Enterprise License Handshake : ${licenseValid ? "PASS ✅" : "FAIL ❌"}`);

  // STAGE 2: Affiliate Restriction Guard & Active Broker Session
  affiliateGuard.registerValidAffiliate("AFFILIATE_PROD_555");
  const session = brokerConnector.connectSession("ENTERPRISE_USER_001", "AFFILIATE_PROD_555");
  const sessionEstablished = session.status === "CONNECTED";
  console.log(` [2] Affiliate Guard & Binary Broker Session Interlock .. : ${sessionEstablished ? "PASS ✅" : "FAIL ❌"}`);

  // STAGE 3: Auto-Execution Pipeline Subscription
  eventBus.on("GHOSTBRAIN_SIGNAL_GENERATED", (evt) => {
    const signal = evt.payload || evt;
    brokerConnector.executeTradeOrder(signal);
  });

  // STAGE 4: Multi-Asset Stream Ingestion (5 Parallel Channels)
  const symbols = ["EURUSD_OTC", "GBPUSD_OTC", "USDJPY_OTC", "AUDUSD_OTC", "BTCUSD"];
  symbols.forEach(symbol => multiAsset.registerAsset(symbol));

  // Stream baseline price action with natural market variance
  symbols.forEach(symbol => {
    const ticks = [150.00, 150.02, 149.98, 150.01, 150.00];
    ticks.forEach(price => {
      multiAsset.processTick(symbol, price);
      telemetry.recordTick();
    });
  });

  // STAGE 5: Live Market Volatility Trigger (Z-Score Mean Reversion Spike)
  const triggerTick = 153.50; // Significant volatility shift
  multiAsset.processTick("USDJPY_OTC", triggerTick);
  telemetry.recordTick();

  // STAGE 6: E2E Telemetry & Master History Synchronization
  const snapshot = telemetry.getSnapshot();
  const history = brokerConnector.getExecutionHistory();

  const signalsLogged = snapshot.metrics.signalsGenerated >= 1;
  const tradesExecuted = snapshot.metrics.tradesExecuted >= 1;
  const historySynced = history.some(t => t.symbol === "USDJPY_OTC" && t.status === "EXECUTED");

  console.log(` [3] Multi-Asset GhostBrain Z-Score Signal Generation ... : ${signalsLogged ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [4] End-to-End Real-Time Broker Execution Pipeline ..... : ${tradesExecuted ? "PASS ✅" : "FAIL ❌"}`);
  console.log(` [5] Enterprise Ledger Synchronization & Telemetry Stream : ${historySynced ? "PASS ✅" : "FAIL ❌"}`);

  const e2ePassed = licenseValid && sessionEstablished && signalsLogged && tradesExecuted && historySynced;

  if (!e2ePassed) {
    console.log("\n=========================================================================");
    console.log("   [ENTERPRISE E2E VERDICT]: INDUSTRIAL TEST FAILED ❌");
    console.log("=========================================================================");
    process.exit(1);
  }

  console.log("\n=========================================================================");
  console.log("   [ENTERPRISE E2E VERDICT]: SYSTEM CONTAINERS FULLY LOCKED & PROVEN ✅");
  console.log("=========================================================================");
}

runIndustrialE2ETest().catch(err => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
