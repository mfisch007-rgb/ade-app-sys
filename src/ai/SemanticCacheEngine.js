import crypto from 'crypto';

export class SemanticCacheEngine {
  constructor(similarityThreshold = 0.85) {
    this.similarityThreshold = similarityThreshold;
    this.exactCache = new Map(); // Hash -> Response
    this.semanticEntries = [];  // Array of { prompt, tokens, response, timestamp }
  }

  generateHash(prompt) {
    return crypto.createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex');
  }

  tokenize(text) {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );
  }

  calculateJaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    
    let intersectionCount = 0;
    for (const item of setA) {
      if (setB.has(item)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...setA, ...setB]).size;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
  }

  getExact(prompt) {
    const hash = this.generateHash(prompt);
    if (this.exactCache.has(hash)) {
      return {
        hit: true,
        type: 'EXACT_BASE64',
        similarity: 1.0,
        data: this.exactCache.get(hash)
      };
    }
    return null;
  }

  getSemantic(prompt) {
    const exactMatch = this.getExact(prompt);
    if (exactMatch) return exactMatch;

    const inputTokens = this.tokenize(prompt);
    let bestMatch = null;
    let highestScore = 0;

    for (const entry of this.semanticEntries) {
      const score = this.calculateJaccardSimilarity(inputTokens, entry.tokens);
      if (score >= this.similarityThreshold && score > highestScore) {
        highestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      return {
        hit: true,
        type: 'SEMANTIC_JACCARD',
        similarity: parseFloat(highestScore.toFixed(4)),
        data: bestMatch.response
      };
    }

    return { hit: false, similarity: parseFloat(highestScore.toFixed(4)), data: null };
  }

  set(prompt, response) {
    const hash = this.generateHash(prompt);
    const entry = {
      prompt,
      tokens: this.tokenize(prompt),
      response,
      timestamp: Date.now()
    };

    this.exactCache.set(hash, response);
    this.semanticEntries.push(entry);

    return { cached: true, hash, tokenCount: entry.tokens.size };
  }
}

export default SemanticCacheEngine;
