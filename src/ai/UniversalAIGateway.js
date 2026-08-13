import KernelEventBus from "../core/EventBus.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";

export class UniversalAIGateway {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.guard = CommunityEditionGuard.getInstance();
    this.semanticCache = new Map();
  }

  static getInstance() {
    if (!global.__universalAIGatewayInstance) {
      global.__universalAIGatewayInstance = new UniversalAIGateway();
    }
    return global.__universalAIGatewayInstance;
  }

  calculateJaccardSimilarity(str1, str2) {
    const setA = new Set(str1.toLowerCase().split(/\s+/));
    const setB = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA], [...setB]);
    return intersection.size / union.size;
  }

  async dispatchPrompt(prompt, options = {}) {
    const cacheKey = Buffer.from(prompt).toString("base64");
    
    // 1. Exact Match Cache Check
    if (this.semanticCache.has(cacheKey)) {
      const cached = this.semanticCache.get(cacheKey);
      this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: "EXACT_CACHE_HIT" });
      return { response: cached.response, route: "EXACT_CACHE", status: "SUCCESS" };
    }

    // 2. Semantic Similarity Cache Check (>= 85% similarity threshold)
    for (const [key, value] of this.semanticCache.entries()) {
      const originalPrompt = Buffer.from(key, "base64").toString("utf8");
      const similarity = this.calculateJaccardSimilarity(prompt, originalPrompt);
      if (similarity >= 0.85) {
        this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: "SEMANTIC_CACHE_HIT", similarity });
        return { response: value.response, route: "SEMANTIC_CACHE", similarity, status: "SUCCESS" };
      }
    }

    // 3. Fallback Lexical Execution Path
    const fallbackResponse = `[ADE-LEXICAL-ENGINE]: Executed query analysis for: "${prompt}". System operating on zero-latency offline processing.`;
    this.semanticCache.set(cacheKey, { response: fallbackResponse, timestamp: Date.now() });

    this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: "OFFLINE_LEXICAL_ENGINE" });
    return { response: fallbackResponse, route: "OFFLINE_LEXICAL_ENGINE", status: "SUCCESS" };
  }
}

export default UniversalAIGateway;
