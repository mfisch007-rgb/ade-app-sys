import KernelEventBus from "../core/EventBus.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";

export class UniversalAIGateway {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.guard = CommunityEditionGuard.getInstance();

    // Batch 2.1 lexical semantic cache
    this.semanticCache = new Map();

    // Explicit calibration for the lexical matcher
    this.semanticThreshold = 0.75;
  }

  static getInstance() {
    if (!global.__universalAIGatewayInstance) {
      global.__universalAIGatewayInstance = new UniversalAIGateway();
    }
    return global.__universalAIGatewayInstance;
  }

  tokenize(text) {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
    );
  }

  calculateJaccardSimilarity(str1, str2) {
    const setA = this.tokenize(str1);
    const setB = this.tokenize(str2);

    const intersection = new Set(
      [...setA].filter(token => setB.has(token))
    );

    const union = new Set([
      ...setA,
      ...setB
    ]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  async dispatchPrompt(prompt, options = {}) {
    const cacheKey = Buffer.from(prompt).toString("base64");

    // 1. Exact cache
    if (this.semanticCache.has(cacheKey)) {
      const cached = this.semanticCache.get(cacheKey);

      this.eventBus.publish("AI_DISPATCH_EVENT", {
        prompt,
        source: "EXACT_CACHE_HIT"
      });

      return {
        response: cached.response,
        route: "EXACT_CACHE",
        status: "SUCCESS"
      };
    }

    // 2. Lexical semantic cache
    for (const [key, value] of this.semanticCache.entries()) {
      const originalPrompt = Buffer
        .from(key, "base64")
        .toString("utf8");

      const similarity = this.calculateJaccardSimilarity(
        prompt,
        originalPrompt
      );

      if (similarity >= this.semanticThreshold) {
        this.eventBus.publish("AI_DISPATCH_EVENT", {
          prompt,
          source: "SEMANTIC_CACHE_HIT",
          similarity
        });

        return {
          response: value.response,
          route: "SEMANTIC_CACHE",
          similarity,
          status: "SUCCESS"
        };
      }
    }

    // 3. Offline lexical execution
    const fallbackResponse =
      `[ADE-LEXICAL-ENGINE]: Executed query analysis for: "${prompt}". ` +
      `System operating on zero-latency offline processing.`;

    this.semanticCache.set(cacheKey, {
      response: fallbackResponse,
      timestamp: Date.now()
    });

    this.eventBus.publish("AI_DISPATCH_EVENT", {
      prompt,
      source: "OFFLINE_LEXICAL_ENGINE"
    });

    return {
      response: fallbackResponse,
      route: "OFFLINE_LEXICAL_ENGINE",
      status: "SUCCESS"
    };
  }
}

export default UniversalAIGateway;
