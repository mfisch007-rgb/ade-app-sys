import KernelEventBus from "../../core/EventBus.js";
import AffiliateLockGuard from "../../security/AffiliateLockGuard.js";

export class BinaryBrokerConnector {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.affiliateGuard = AffiliateLockGuard.getInstance();
    this.isConnected = false;
    this.activeSession = null;
    this.executedTrades = [];
  }

  static getInstance() {
    if (!global.__binaryBrokerConnectorInstance) {
      global.__binaryBrokerConnectorInstance = new BinaryBrokerConnector();
    }
    return global.__binaryBrokerConnectorInstance;
  }

  connectSession(userId, affiliateId) {
    const authCheck = this.affiliateGuard.validateUserAffiliate(userId, affiliateId);
    if (!authCheck.authorized) {
      throw new Error(`EXECUTION_BLOCKED: Affiliate lock validation failed for user ${userId}.`);
    }

    this.isConnected = true;
    this.activeSession = {
      userId,
      affiliateId,
      connectedAt: new Date().toISOString(),
      executionMode: "PAPER",
      note: "Affiliate-locked paper session only. No live venue handshake was performed."
    };

    return { status: "PAPER_SESSION", session: this.activeSession };
  }

  executeTradeOrder(signal) {
    if (!this.isConnected || !this.activeSession) {
      throw new Error("EXECUTION_BLOCKED: Broker connector is not connected or unauthorized.");
    }

    const tradeRecord = {
      orderId: `PAPER_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: signal.price,
      zScore: signal.zScore,
      userId: this.activeSession.userId,
      affiliateId: this.activeSession.affiliateId,
      status: "PAPER_RECORDED",
      executionMode: "PAPER",
      outcome: "PENDING_NO_VENUE_CONFIRMATION",
      executedAt: new Date().toISOString()
    };

    this.executedTrades.push(tradeRecord);
    this.eventBus.publish("BROKER_TRADE_PAPER_RECORDED", tradeRecord);

    return tradeRecord;
  }

  getExecutionHistory() {
    return [...this.executedTrades];
  }
}

export default BinaryBrokerConnector;
