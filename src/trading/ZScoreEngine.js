export class ZScoreEngine {
  constructor(windowSize = 20) {
    this.windowSize = windowSize;
    this.priceHistory = [];
  }

  addPrice(price) {
    this.priceHistory.push(price);
    if (this.priceHistory.length > this.windowSize) {
      this.priceHistory.shift();
    }
  }

  calculateMean() {
    if (this.priceHistory.length === 0) return 0;
    const sum = this.priceHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.priceHistory.length;
  }

  calculateStdDev(mean) {
    if (this.priceHistory.length < 2) return 0;
    const variance = this.priceHistory.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (this.priceHistory.length - 1);
    return Math.sqrt(variance);
  }

  getZScore(currentPrice) {
    if (this.priceHistory.length < this.windowSize) {
      return { zScore: 0, ready: false, sampleCount: this.priceHistory.length };
    }
    const mean = this.calculateMean();
    const stdDev = this.calculateStdDev(mean);

    if (stdDev === 0) {
      return { zScore: 0, ready: true, mean, stdDev: 0 };
    }

    const zScore = (currentPrice - mean) / stdDev;
    return { zScore, ready: true, mean, stdDev };
  }
}

export default ZScoreEngine;
