/**
 * ADE FEEDBACK INTELLIGENCE
 *
 * First-class feedback mechanism supporting:
 * - Capture with categories
 * - Sanitize (PII removal via existing FeedbackPipeline)
 * - Classify into categories
 * - Deduplicate similar feedback
 * - Prioritize by severity/impact
 * - Pattern detection
 * - Improvement proposal generation
 * - Human review queue
 *
 * CRITICAL: User feedback NEVER automatically modifies ADE source code.
 * Feedback informs engineering decisions, product prioritization,
 * and future improvement proposals.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

const FEEDBACK_CATEGORIES = Object.freeze([
  "SOMETHING_FAILED",
  "SOMETHING_CONFUSED_ME",
  "RESULT_LOOKED_WRONG",
  "FEATURE_DID_NOT_WORK",
  "I_EXPECTED_SOMETHING_ELSE",
  "I_FOUND_A_BUG",
  "IMPROVEMENT_IDEA",
  "NEW_USE_CASE",
  "POSITIVE_FEEDBACK",
  "OTHER"
]);

const PRIORITY_LEVELS = Object.freeze({
  CRITICAL: { weight: 10, label: "CRITICAL" },
  HIGH: { weight: 7, label: "HIGH" },
  MEDIUM: { weight: 4, label: "MEDIUM" },
  LOW: { weight: 1, label: "LOW" },
  INFO: { weight: 0, label: "INFO" }
});

const CATEGORY_PRIORITY_MAP = Object.freeze({
  SOMETHING_FAILED: "HIGH",
  SOMETHING_CONFUSED_ME: "MEDIUM",
  RESULT_LOOKED_WRONG: "MEDIUM",
  FEATURE_DID_NOT_WORK: "HIGH",
  I_EXPECTED_SOMETHING_ELSE: "MEDIUM",
  I_FOUND_A_BUG: "HIGH",
  IMPROVEMENT_IDEA: "LOW",
  NEW_USE_CASE: "LOW",
  POSITIVE_FEEDBACK: "INFO",
  OTHER: "MEDIUM"
});

export class FeedbackIntelligence {
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.feedbackStore = [];
    this.patterns = new Map();
    this.improvementProposals = [];
    this.maxStoreSize = 5000;
  }

  getCategories() {
    return [...FEEDBACK_CATEGORIES];
  }

  async captureFeedback(payload = {}) {
    const item = {
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      category: this._validateCategory(payload.category),
      feature: String(payload.feature || "").slice(0, 200),
      message: String(payload.message || "").slice(0, 5000),
      executionId: payload.executionId || null,
      scenarioId: payload.scenarioId || null,
      traceId: payload.traceId || null,
      edition: payload.edition || process.env.ADE_EDITION || "COMMUNITY",
      demoMode: String(process.env.ADE_DEMO_MODE).toLowerCase() === "true",
      version: payload.version || "1.0.0",
      browserHint: payload.browserHint || null,
      sessionRef: payload.sessionRef || null,
      priority: PRIORITY_LEVELS[CATEGORY_PRIORITY_MAP[this._validateCategory(payload.category)] || "MEDIUM"],
      status: "RECEIVED",
      sanitized: false,
      classified: true,
      deduplicated: false
    };

    const sanitized = this._sanitize(item);
    this.feedbackStore.push(sanitized);
    this._trimStore();

    this.eventBus.publish("FEEDBACK_CAPTURED", {
      feedbackId: sanitized.id,
      category: sanitized.category,
      priority: sanitized.priority.label,
      feature: sanitized.feature
    });

    const patterns = this._detectPatterns(sanitized);

    return {
      feedbackId: sanitized.id,
      status: "RECEIVED",
      category: sanitized.category,
      priority: sanitized.priority.label,
      patternsDetected: patterns.length > 0,
      message: "Thank you. Your feedback has been captured and will inform ADE improvements."
    };
  }

  getRecentFeedback(limit = 50) {
    return this.feedbackStore.slice(-Math.min(limit, 100));
  }

  getPatternReport() {
    const categoryCounts = {};
    const featureCounts = {};
    const priorityCounts = {};
    const serializedPatterns = [];

    for (const item of this.feedbackStore) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      if (item.feature) featureCounts[item.feature] = (featureCounts[item.feature] || 0) + 1;
      priorityCounts[item.priority.label] = (priorityCounts[item.priority.label] || 0) + 1;
    }

    for (const [key, pattern] of this.patterns) {
      const serialized = { ...pattern };
      if (serialized.affectedFeatures instanceof Set) {
        serialized.affectedFeatures = [...serialized.affectedFeatures];
      }
      if (serialized.categories instanceof Set) {
        serialized.categories = [...serialized.categories];
      }
      serializedPatterns.push(serialized);
    }

    return {
      totalFeedback: this.feedbackStore.length,
      byCategory: categoryCounts,
      byFeature: featureCounts,
      byPriority: priorityCounts,
      patterns: serializedPatterns,
      improvementProposals: this.improvementProposals.length
    };
  }

  _sanitize(item) {
    const sanitized = { ...item };
    if (typeof sanitized.message === "string") {
      sanitized.message = sanitized.message
        .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED]")
        .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[REDACTED]")
        .replace(/\b\d{10,19}\b/g, "[REDACTED]");
    }
    sanitized.sanitized = true;
    return sanitized;
  }

  _validateCategory(category) {
    const cat = String(category || "OTHER").toUpperCase().replace(/\s+/g, "_");
    if (FEEDBACK_CATEGORIES.includes(cat)) return cat;
    return "OTHER";
  }

  _detectPatterns(item) {
    const detected = [];
    const categoryKey = item.category;

    if (!this.patterns.has(categoryKey)) {
      this.patterns.set(categoryKey, {
        category: categoryKey,
        count: 0,
        firstSeen: item.receivedAt,
        lastSeen: item.receivedAt,
        affectedFeatures: new Set(),
        recentItems: []
      });
    }

    const pattern = this.patterns.get(categoryKey);
    pattern.count++;
    pattern.lastSeen = item.receivedAt;
    if (item.feature) pattern.affectedFeatures.add(item.feature);
    pattern.recentItems.push(item.id);
    if (pattern.recentItems.length > 20) pattern.recentItems.shift();

    if (pattern.count >= 5) {
      detected.push({
        type: "RECURRING_CATEGORY",
        category: categoryKey,
        count: pattern.count,
        severity: pattern.count >= 10 ? "HIGH" : "MEDIUM"
      });
    }

    if (item.feature) {
      const featureKey = `FEATURE:${item.feature}`;
      if (!this.patterns.has(featureKey)) {
        this.patterns.set(featureKey, { type: "FEATURE_PATTERN", feature: item.feature, count: 0, categories: new Set() });
      }
      const fp = this.patterns.get(featureKey);
      fp.count++;
      fp.categories.add(item.category);
      if (fp.count >= 3 && fp.categories.size >= 2) {
        detected.push({
          type: "MULTI_CATEGORY_FEATURE_ISSUE",
          feature: item.feature,
          categories: [...fp.categories],
          count: fp.count,
          severity: "HIGH"
        });
      }
    }

    if (detected.length > 0 && item.category !== "POSITIVE_FEEDBACK" && item.category !== "OTHER") {
      this._generateImprovementProposal(item, detected);
    }

    return detected;
  }

  _generateImprovementProposal(item, patterns) {
    const proposal = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceFeedbackId: item.id,
      title: `Address recurring ${item.category.replace(/_/g, " ").toLowerCase()} for ${item.feature || "general"}`,
      description: `Pattern detected: ${patterns.map(p => p.type).join(", ")}. Category: ${item.category}. Feature: ${item.feature || "general"}.`,
      priority: item.priority.label,
      status: "PENDING_REVIEW",
      linkedPatterns: patterns
    };
    this.improvementProposals.push(proposal);
    this.eventBus.publish("IMPROVEMENT_PROPOSAL_CREATED", {
      proposalId: proposal.id,
      priority: proposal.priority
    });
  }

  _trimStore() {
    if (this.feedbackStore.length > this.maxStoreSize) {
      this.feedbackStore = this.feedbackStore.slice(-this.maxStoreSize);
    }
  }
}

export { FEEDBACK_CATEGORIES, PRIORITY_LEVELS, CATEGORY_PRIORITY_MAP };
export default FeedbackIntelligence;
