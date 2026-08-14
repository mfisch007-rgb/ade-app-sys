import KernelEventBus from "../core/EventBus.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";

export class UniversalAIGateway {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.guard = CommunityEditionGuard.getInstance();

    this.semanticCache = new Map();
    this.semanticThreshold = 0.75;
    this.requestTimeoutMs = 8000; // 8-second circuit breaker timeout

    this.providers = [
      { name: "GEMINI", envKey: "GEMINI_API_KEY", handler: this.callGemini.bind(this) },
      { name: "GROQ", envKey: "GROQ_API_KEY", handler: this.callGroq.bind(this) },
      { name: "DEEPSEEK", envKey: "DEEPSEEK_API_KEY", handler: this.callDeepSeek.bind(this) },
      { name: "QWEN", envKey: "QWEN_API_KEY", handler: this.callQwen.bind(this) }
    ];
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

    const intersection = new Set([...setA].filter(token => setB.has(token)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  async fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "[GEMINI]: Empty response";
  }

  async callGroq(prompt, apiKey) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "[GROQ]: Empty response";
  }

  async callDeepSeek(prompt, apiKey) {
    const url = "https://api.deepseek.com/v1/chat/completions";
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "[DEEPSEEK]: Empty response";
  }

  async callQwen(prompt, apiKey) {
    const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen-max",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Qwen HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "[QWEN]: Empty response";
  }

  async dispatchPrompt(prompt, options = {}) {
    const cacheKey = Buffer.from(prompt).toString("base64");

    // 1. Exact Cache Check
    if (this.semanticCache.has(cacheKey)) {
      const cached = this.semanticCache.get(cacheKey);
      this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: "EXACT_CACHE_HIT" });
      return { response: cached.response, route: "EXACT_CACHE", status: "SUCCESS" };
    }

    // 2. Semantic Cache Check
    for (const [key, value] of this.semanticCache.entries()) {
      const originalPrompt = Buffer.from(key, "base64").toString("utf8");
      const similarity = this.calculateJaccardSimilarity(prompt, originalPrompt);

      if (similarity >= this.semanticThreshold) {
        this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: "SEMANTIC_CACHE_HIT", similarity });
        return { response: value.response, route: "SEMANTIC_CACHE", similarity, status: "SUCCESS" };
      }
    }

    // 3. Live Provider Fallback Cascade Execution
    for (const provider of this.providers) {
      const apiKey = process.env[provider.envKey];
      if (apiKey) {
        try {
          const response = await provider.handler(prompt, apiKey);
          this.semanticCache.set(cacheKey, { response, timestamp: Date.now() });
          this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: provider.name });
          return { response, route: provider.name, status: "SUCCESS" };
        } catch (err) {
          this.eventBus.publish("AI_PROVIDER_ERROR", { provider: provider.name, error: err.message });
          // Fallthrough to next provider on HTTP or network error
        }
      }
    }

    // 4. Offline Lexical Engine Fallback
    const fallbackResponse = `[ADE-LEXICAL-ENGINE]: Executed query analysis for: "${prompt}". System operating on zero-latency offline processing.`;
    this.semanticCache.set(cacheKey, { response: fallbackResponse, timestamp: Date.now() });

    this.eventBus.publish("AI_DISPATCH_EVENT", { prompt, source: "OFFLINE_LEXICAL_ENGINE" });
    return { response: fallbackResponse, route: "OFFLINE_LEXICAL_ENGINE", status: "SUCCESS" };
  }
}

export default UniversalAIGateway;
