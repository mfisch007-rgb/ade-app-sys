import https from "https";

export class UniversalAIGateway {
  constructor() {
    this.providers = {
      gemini: process.env.GEMINI_API_KEY || null,
      groq: process.env.GROQ_API_KEY || null,
      deepseek: process.env.DEEPSEEK_API_KEY || null,
      qwen: process.env.QWEN_API_KEY || null
    };
    this.state = "ONLINE";
    this.exactCache = new Map();
    this.semanticCache = []; // [{ tokens: Set, result: string, originalPrompt: string }]
    this.failureCounts = { gemini: 0, groq: 0, deepseek: 0, qwen: 0 };
  }

  static getInstance() {
    if (!global.__aiGatewayInstance) {
      global.__aiGatewayInstance = new UniversalAIGateway();
    }
    return global.__aiGatewayInstance;
  }

  validateKeys() {
    const status = {
      gemini: !!this.providers.gemini,
      groq: !!this.providers.groq,
      deepseek: !!this.providers.deepseek,
      qwen: !!this.providers.qwen
    };
    return {
      activeProviders: Object.keys(status).filter(p => status[p]),
      status
    };
  }

  tokenize(text) {
    return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  }

  calculateJaccardSimilarity(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  lookupCache(prompt) {
    const exactKey = Buffer.from(prompt).toString("base64");
    if (this.exactCache.has(exactKey)) {
      return { hit: true, type: "EXACT_CACHE", result: this.exactCache.get(exactKey) };
    }

    const queryTokens = this.tokenize(prompt);
    for (const entry of this.semanticCache) {
      const similarity = this.calculateJaccardSimilarity(queryTokens, entry.tokens);
      if (similarity >= 0.85) { // 85% Semantic similarity threshold
        return { hit: true, type: "SEMANTIC_CACHE", similarity: similarity.toFixed(2), result: entry.result };
      }
    }

    return { hit: false };
  }

  saveToCache(prompt, responseText) {
    const exactKey = Buffer.from(prompt).toString("base64");
    this.exactCache.set(exactKey, responseText);
    this.semanticCache.push({
      tokens: this.tokenize(prompt),
      result: responseText,
      originalPrompt: prompt
    });
  }

  async complete(prompt, options = {}) {
    const cacheLookup = this.lookupCache(prompt);
    if (cacheLookup.hit) {
      return {
        provider: "cache-hit",
        mode: cacheLookup.type,
        similarity: cacheLookup.similarity || "1.00",
        state: this.state,
        result: cacheLookup.result
      };
    }

    const { activeProviders } = this.validateKeys();

    if (activeProviders.length === 0) {
      return this.executeOfflineFallback(prompt, "No live API keys detected in environment variables.");
    }

    const providerOrder = options.preferredProvider 
      ? [options.preferredProvider, ...activeProviders.filter(p => p !== options.preferredProvider)]
      : activeProviders;

    for (const provider of providerOrder) {
      try {
        let responseText = "";
        if (provider === "gemini") responseText = await this.callGemini(prompt);
        else if (provider === "groq") responseText = await this.callGroq(prompt);
        else if (provider === "deepseek") responseText = await this.callDeepSeek(prompt);
        else if (provider === "qwen") responseText = await this.callQwen(prompt);
        else continue;

        this.saveToCache(prompt, responseText);
        this.state = "ONLINE";
        return {
          provider: provider,
          mode: "LIVE_API",
          state: this.state,
          result: responseText
        };
      } catch (err) {
        this.failureCounts[provider] = (this.failureCounts[provider] || 0) + 1;
      }
    }

    return this.executeOfflineFallback(prompt, "All configured live API providers failed or timed out.");
  }

  executeOfflineFallback(prompt, reason) {
    this.state = "DEGRADED";
    const offlineResult = `[OFFLINE LEXICAL ENGINE]: Processed execution request for: "${prompt.slice(0, 40)}"`;
    return {
      provider: "kernel-offline-fallback",
      mode: "OFFLINE_FALLBACK",
      state: this.state,
      reason: reason,
      result: offlineResult
    };
  }

  callGemini(prompt) {
    return new Promise((resolve, reject) => {
      const apiKey = this.providers.gemini;
      const data = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });

      const req = https.request({
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
        timeout: 8000
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.candidates[0].content.parts[0].text);
            } catch (e) { reject(new Error("Gemini response parse error")); }
          } else { reject(new Error(`Gemini HTTP status ${res.statusCode}`)); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Gemini timeout")); });
      req.write(data);
      req.end();
    });
  }

  callGroq(prompt) {
    return new Promise((resolve, reject) => {
      const apiKey = this.providers.groq;
      const data = JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }]
      });

      const req = https.request({
        hostname: "api.groq.com",
        path: `/openai/v1/chat/completions`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        },
        timeout: 8000
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.choices[0].message.content);
            } catch (e) { reject(new Error("Groq response parse error")); }
          } else { reject(new Error(`Groq HTTP status ${res.statusCode}`)); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Groq timeout")); });
      req.write(data);
      req.end();
    });
  }

  callDeepSeek(prompt) {
    return new Promise((resolve, reject) => {
      const apiKey = this.providers.deepseek;
      const data = JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }]
      });

      const req = https.request({
        hostname: "api.deepseek.com",
        path: `/chat/completions`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        },
        timeout: 8000
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.choices[0].message.content);
            } catch (e) { reject(new Error("DeepSeek response parse error")); }
          } else { reject(new Error(`DeepSeek HTTP status ${res.statusCode}`)); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("DeepSeek timeout")); });
      req.write(data);
      req.end();
    });
  }

  callQwen(prompt) {
    return new Promise((resolve, reject) => {
      const apiKey = this.providers.qwen;
      const data = JSON.stringify({
        model: "qwen-turbo",
        input: { messages: [{ role: "user", content: prompt }] }
      });

      const req = https.request({
        hostname: "dashscope.aliyuncs.com",
        path: `/api/v1/services/aigc/text-generation/generation`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        },
        timeout: 8000
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.output.text);
            } catch (e) { reject(new Error("Qwen response parse error")); }
          } else { reject(new Error(`Qwen HTTP status ${res.statusCode}`)); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Qwen timeout")); });
      req.write(data);
      req.end();
    });
  }
}

export default UniversalAIGateway;
