// PROCARTA Enterprise Product Suite Core
const LeadProcessor = require("./LeadProcessor");
const DocumentGenerator = require("./DocumentGenerator");
class ProcartaSuite {
  constructor(eventBus) { this.leads = new LeadProcessor(); this.docs = new DocumentGenerator(); this.eventBus = eventBus; }
  async handleIncomingLead(leadData) { const result = this.leads.processLead(leadData); if (this.eventBus) this.eventBus.publish("procarta.lead.ingested", result); return result; }
}
module.exports = ProcartaSuite;
