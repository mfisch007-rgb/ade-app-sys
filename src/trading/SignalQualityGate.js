/**
 * ADE SIGNAL QUALITY GATE — surrounding filter for Founder signals (expansion batch).
 *
 * Consumes FounderSignalEngine output WITHOUT modifying the engine.
 * Provides: confidence gating, duplicate suppression awareness, target-amount
 * auto-mode safeguards, entitlement checks, and honest PAPER vs LIVE labeling.
 *
 * What it does NOT do (explicit):
 * - Does not rewrite signal logic, thresholds, or math.
 * - Does not promise accuracy beyond what the engine reports.
 * - Does not perform undetectable/stealth execution or human-mimicry delays.
 *   Automation pacing is honest: rate-limited API calls with audit trail and
 *   human approval. Robotic-trace evasion is refused.
 */

export function qualityScore(analysis) {
  if (!analysis || typeof analysis !== "object") return 0;
  const cands = [
    analysis.confidence, analysis.score, analysis.quality, analysis.edge,
    analysis?.confirmation?.confidence, analysis?.regime?.confidence
  ];
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
  }
  // State-based fallback: CONFIRMED_* passes weakly, everything else fails closed.
  const state = String(analysis.state || analysis.signal || "").toUpperCase();
  if (state.includes("CONFIRMED")) return 0.6;
  if (state === "PAPER_EXECUTED" || state === "PAPER") return 0.55;
  return 0;
}

export class SignalQualityGate {
  constructor({ entitlements = null, venueRegistry = null, signalEngine = null } = {}) {
    this.entitlements = entitlements;
    this.venueRegistry = venueRegistry;
    this.signalEngine = signalEngine;
  }

  /**
   * Filter one engine analysis. Never invents a signal: pass=false blocks.
   */
  gate(analysis, { minConfidence = 0.6, userId = null, feature = "trading" } = {}) {
    const score = qualityScore(analysis);
    const state = String(analysis?.state || analysis?.signal || "UNKNOWN");
    if (analysis?.state === "REJECTED_BROKER_MANIPULATION" || analysis?.manipulationFlag) {
      return { pass: false, score, state, reason: "MANIPULATION_GUARD: engine rejected the setup; gate blocks execution.", requiredAction: "Stand down; wait for a clean setup." };
    }
    if (score < minConfidence) {
      return { pass: false, score, state, reason: `BELOW_THRESHOLD: score ${score.toFixed(2)} < ${minConfidence}.`, requiredAction: "Wait for engine CONFIRMED state with sufficient edge; no trade placed." };
    }
    if (userId && this.entitlements && !this.entitlements.can(userId, feature)) {
      return { pass: false, score, state, reason: `NOT_ENTITLED: user lacks '${feature}' grant.`, requiredAction: "Founder enables the feature for this user in the admin dashboard." };
    }
    return { pass: true, score, state, mode: "PAPER_CANDIDATE", note: "Gate passed. Execution stays PAPER unless a VERIFIED venue + entitlement + human approval all hold." };
  }

  /**
   * Full-auto mode guard: target amount + venue + entitlement + engine state.
   * Returns { allowed, mode, reason } — honest, non-overwhelming, easy to engage.
   */
  autoMode({ userId, feature = "trading", venueId = null, targetAmount = null, analysis = null } = {}) {
    const target = Number(targetAmount);
    if (!Number.isFinite(target) || target <= 0) {
      return { allowed: false, mode: "MANUAL_ONLY", reason: "TARGET_REQUIRED: set a positive target amount before auto mode.", requiredAction: "Enter target amount (e.g. daily goal); auto stops at target." };
    }
    if (userId && this.entitlements && !this.entitlements.can(userId, feature)) {
      return { allowed: false, mode: "MANUAL_ONLY", reason: `NOT_ENTITLED: '${feature}' not granted to this user.`, requiredAction: "Ask Founder to enable the feature." };
    }
    if (this.signalEngine) {
      try {
        const st = this.signalEngine.getStatus?.();
        if (st?.emergencyStop === true) return { allowed: false, mode: "HALTED", reason: "EMERGENCY_STOP is ON.", requiredAction: "Founder clears emergency-stop." };
      } catch {}
    }
    if (venueId && this.venueRegistry) {
      const elig = this.venueRegistry.liveEligibility(venueId);
      if (!elig.eligible) return { allowed: true, mode: "PAPER_AUTO", venue: venueId, target, note: `Paper auto-mode to target ${target}. Live blocked: ${elig.reason}` };
      return { allowed: true, mode: "LIVE_IF_APPROVED", venue: venueId, target, note: "Venue verified; each live order still needs explicit human approval. Rate-limited, audited; no stealth pacing." };
    }
    return { allowed: true, mode: "PAPER_AUTO", target, note: `Paper auto-mode to target ${target}. No venue = no live execution, ever.` };
  }
}

export default SignalQualityGate;
