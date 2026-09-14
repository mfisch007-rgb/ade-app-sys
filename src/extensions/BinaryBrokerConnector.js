import KernelEventBus from "../core/EventBus.js";
import ExtensionSandboxGuard from "../security/ExtensionSandboxGuard.js";

/**
 * Binary broker connector — HONEST PAPER/SANDBOX ADAPTER BOUNDARY.
 *
 * Truthfulness contract (release gate):
 *  - This connector has NO live broker handshake and receives NO
 *    authoritative venue/API execution confirmations.
 *  - It therefore NEVER claims WIN, LOSS, PAYOUT, EXECUTED,
 *    ORDER_PLACED, BROKER ACCEPTED, or CONNECTED.
 *  - Trade requests are recorded as PAPER/SANDBOX intents only, with an
 *    explicit PENDING outcome noting that no broker confirmed anything.
 *  - Raw credentials (ws tokens, cookies) are NEVER stored — only a
 *    boolean presence flag is retained.
 *  - No timers fabricate expirations. No stealth, evasion, fingerprint
 *    spoofing, CAPTCHA bypass, or hidden execution exists here.
 */
const TRUTHFUL_SESSION_STATUS = "SANDBOX_SESSION";
const TRUTHFUL_TRADE_STATUS = "PAPER_RECORDED";

export class BinaryBrokerConnector {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.sandbox = ExtensionSandboxGuard.getInstance();
    this.activeConnections = new Map();
  }

  static getInstance() {
    if (!global.__binaryBrokerConnectorInstance) {
      global.__binaryBrokerConnectorInstance = new BinaryBrokerConnector();
    }
    return global.__binaryBrokerConnectorInstance;
  }

  connectBroker(brokerId, connectionConfig = {}) {
    if (!brokerId || typeof brokerId !== "string") {
      throw new Error("BROKER_ID_REQUIRED");
    }
    const record = {
      brokerId,
      // Presence only — raw tokens/cookies are never retained.
      hasCredential: Boolean(connectionConfig.wsToken || connectionConfig.cookieHeader),
      connectedAt: new Date().toISOString(),
      status: TRUTHFUL_SESSION_STATUS,
      executionMode: "SANDBOX",
      note: "Sandbox session only. No live broker handshake was performed."
    };

    this.activeConnections.set(brokerId, record);
    this.eventBus.publish("BROKER_SANDBOX_SESSION", { brokerId, status: TRUTHFUL_SESSION_STATUS });
    return record;
  }

  executeBinaryTrade(brokerId, tradeDetails = {}) {
    const conn = this.activeConnections.get(brokerId);
    if (!conn) {
      throw new Error(`Broker ${brokerId} has no sandbox session.`);
    }
    if (!tradeDetails.asset || !tradeDetails.direction || !Number.isFinite(Number(tradeDetails.amount))) {
      throw new Error("PAPER_TRADE_DETAILS_REQUIRED: asset, direction and numeric amount are required.");
    }

    const payload = {
      brokerId,
      asset: tradeDetails.asset,
      direction: tradeDetails.direction,
      amount: Number(tradeDetails.amount),
      durationSeconds: tradeDetails.durationSeconds || 60,
      timestamp: Date.now()
    };

    return this.sandbox.executeInSandbox(
      `BROKER_EXT_${brokerId}`,
      "RECORD_PAPER_TRADE",
      payload,
      (data) => {
        const record = {
          status: TRUTHFUL_TRADE_STATUS,
          executionMode: "SANDBOX",
          outcome: "PENDING_NO_BROKER_CONFIRMATION",
          tradeId: `PAPER-${Date.now()}`,
          data
        };
        this.eventBus.publish("BINARY_TRADE_SANDBOX_RECORDED", record);
        return record;
      }
    );
  }
}

export default BinaryBrokerConnector;
