import ZScoreEngine from "./ZScoreEngine.js";
import KernelEventBus from "../core/EventBus.js";

export class MultiAssetManager {
  constructor(maxAssets = 5, windowSize = 20, zThreshold = 2.0) {
    this.maxAssets = maxAssets;
    this.windowSize = windowSize;
    this.zThreshold = zThreshold;
    this.assets = new Map();
    this.eventBus = KernelEventBus.getInstance();
  }

  static getInstance(maxAssets = 5, windowSize = 20, zThreshold = 2.0) {
    if (!global.__multiAssetManagerInstance) {
      global.__multiAssetManagerInstance = new MultiAssetManager(
        maxAssets,
        windowSize,
        zThreshold
      );
    }
    return global.__multiAssetManagerInstance;
  }

  registerAsset(symbol) {
    if (this.assets.size >= this.maxAssets && !this.assets.has(symbol)) {
      throw new Error(
        `Maximum asset capacity reached (${this.maxAssets}). Cannot register ${symbol}.`
      );
    }

    if (!this.assets.has(symbol)) {
      this.assets.set(symbol, {
        symbol,
        engine: new ZScoreEngine(this.windowSize),
        lastTick: null,
        lastZScore: 0
      });
    }

    return {
      status: "REGISTERED",
      symbol,
      activeAssets: this.assets.size
    };
  }

  processTick(symbol, tickPrice) {
    const asset = this.assets.get(symbol);

    if (!asset) {
      throw new Error(
        `Asset ${symbol} is not registered in MultiAssetManager.`
      );
    }

    // Evaluate the incoming price against historical observations
    // BEFORE inserting the new observation into the rolling window.
    const stats = asset.engine.getZScore(tickPrice);

    // Now advance the rolling history with the new observation.
    asset.engine.addPrice(tickPrice);

    asset.lastTick = tickPrice;
    asset.lastZScore = stats.zScore;

    if (stats.ready) {
      if (stats.zScore >= this.zThreshold) {
        const signal = {
          symbol,
          direction: "PUT",
          zScore: stats.zScore,
          price: tickPrice,
          timestamp: Date.now()
        };

        this.eventBus.publish("GHOSTBRAIN_SIGNAL_GENERATED", signal);

        return {
          signalTriggered: true,
          signal
        };
      }

      if (stats.zScore <= -this.zThreshold) {
        const signal = {
          symbol,
          direction: "CALL",
          zScore: stats.zScore,
          price: tickPrice,
          timestamp: Date.now()
        };

        this.eventBus.publish("GHOSTBRAIN_SIGNAL_GENERATED", signal);

        return {
          signalTriggered: true,
          signal
        };
      }
    }

    return {
      signalTriggered: false,
      stats
    };
  }

  getActiveAssetStates() {
    const states = {};

    for (const [symbol, data] of this.assets.entries()) {
      states[symbol] = {
        lastTick: data.lastTick,
        lastZScore: data.lastZScore
      };
    }

    return states;
  }
}

export default MultiAssetManager;
