/**
 * ADE COMMUNITY → PILOT EVOLUTION PATH
 *
 * The conceptual product evolution is:
 * ADE Demo → ADE Community Edition → Qualified Use Case
 * → Pilot → Measured Evidence → Case Study
 * → Repeatable Deployment → Professional → Enterprise
 *
 * This module captures and classifies legitimate progression signals
 * without building a full CRM. It uses the existing intake/feedback
 * and case architecture.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

const INTAKE_TYPES = Object.freeze({
  USE_CASE: "USE_CASE",
  PILOT_INTEREST: "PILOT_INTEREST",
  ENTERPRISE_INTEREST: "ENTERPRISE_INTEREST",
  PARTNER_INTEREST: "PARTNER_INTEREST",
  IMPLEMENTATION_NEED: "IMPLEMENTATION_NEED"
});

export class CommunityProgression {
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.intakes = [];
    this.maxIntakes = 2000;
  }

  captureIntake(payload = {}) {
    const intake = {
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      type: this._validateType(payload.type),
      organization: String(payload.organization || "").slice(0, 200),
      contactHint: String(payload.contactHint || "").slice(0, 200),
      useCaseDescription: String(payload.useCaseDescription || "").slice(0, 5000),
      currentEdition: payload.currentEdition || "COMMUNITY",
      targetEdition: payload.targetEdition || null,
      urgency: payload.urgency || "NORMAL",
      status: "CAPTURED",
      metadata: payload.metadata || {}
    };

    this.intakes.push(intake);
    this._trimIntakes();

    this.eventBus.publish("PROGRESSION_INTAKE_CAPTURED", {
      intakeId: intake.id,
      type: intake.type,
      organization: intake.organization
    });

    return {
      intakeId: intake.id,
      status: "CAPTURED",
      message: "Your interest has been recorded. ADE will follow up through the appropriate channel."
    };
  }

  listIntakes(filter = {}) {
    let results = [...this.intakes];
    if (filter.type) results = results.filter(i => i.type === filter.type);
    if (filter.status) results = results.filter(i => i.status === filter.status);
    return results;
  }

  getProgressionStats() {
    const counts = {};
    for (const intake of this.intakes) {
      counts[intake.type] = (counts[intake.type] || 0) + 1;
    }
    return {
      totalIntakes: this.intakes.length,
      byType: counts,
      recentIntakes: this.intakes.slice(-10).map(i => ({
        id: i.id,
        type: i.type,
        organization: i.organization,
        receivedAt: i.receivedAt
      }))
    };
  }

  _validateType(type) {
    const t = String(type || "").toUpperCase().replace(/\s+/g, "_");
    if (INTAKE_TYPES[t]) return t;
    return "USE_CASE";
  }

  _trimIntakes() {
    if (this.intakes.length > this.maxIntakes) {
      this.intakes = this.intakes.slice(-this.maxIntakes);
    }
  }
}

export { INTAKE_TYPES };
export default CommunityProgression;
