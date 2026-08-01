// ADE Oracle Guardian Supervisory Service
const HealthSupervisor = require("./HealthSupervisor");
const ConfidenceEngine = require("./ConfidenceEngine");
class OracleGuardian {
  constructor(eventBus) { this.health = new HealthSupervisor(); this.confidence = new ConfidenceEngine(); if (eventBus) eventBus.subscribe("system.*", (evt) => this.supervise(evt)); }
  supervise(event) { console.log("[ORACLE GUARDIAN] Supervising event:", event.topic); }
}
module.exports = OracleGuardian;
