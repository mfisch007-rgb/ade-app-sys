import crypto from 'crypto';

const CHANNELS = ['WEB', 'EMAIL', 'WHATSAPP', 'TELEGRAM', 'API', 'WEBHOOK', 'PARTNER', 'CRM', 'MARKETPLACE', 'PROCUREMENT', 'HUMAN'];

export class UnifiedIntakeEngine {
  constructor({ caseManager, eventBus, connectionManager } = {}) {
    this.caseManager = caseManager;
    this.eventBus = eventBus;
    this.connectionManager = connectionManager;
  }

  normalize(channel, payload = {}, meta = {}) {
    const normalizedChannel = String(channel || 'API').toUpperCase();
    if (!CHANNELS.includes(normalizedChannel)) throw new Error(`Unsupported intake channel: ${normalizedChannel}`);
    const text = payload.text || payload.message || payload.body || payload.request || payload.description || '';
    const organization = payload.organization || payload.company || payload.businessName || null;
    const contact = payload.contact || { email: payload.email || null, phone: payload.phone || payload.sender || null, name: payload.name || null };
    const request = this.classify(text, payload);
    return {
      intakeId: `INT-${crypto.randomBytes(5).toString('hex')}`,
      channel: normalizedChannel,
      source: meta.source || normalizedChannel,
      receivedAt: new Date().toISOString(),
      authenticated: Boolean(meta.authenticated),
      tenantId: meta.tenantId || null,
      organization,
      contact,
      raw: payload,
      text,
      request,
      authorization: payload.authorization || { publicAnalysis: false, connectedSystems: false }
    };
  }

  classify(text, payload = {}) {
    const t = String(text).toLowerCase();
    const systems = ['odoo','sap','erpnext','shopify','salesforce','oracle','dynamics'].filter(x => t.includes(x) || String(payload.systems || '').toLowerCase().includes(x));
    const workflows = ['procurement','inventory','production','finance','sales','crm','hr','warehouse','order management'].filter(x => t.includes(x));
    const intent = /erp|integration|integrat|workflow|automation|automate|rpa/.test(t) ? 'ENTERPRISE_IMPLEMENTATION' : /assessment|diagnos|audit|scan|inefficien/.test(t) ? 'BUSINESS_ASSESSMENT' : 'GENERAL_INQUIRY';
    const confidence = intent === 'GENERAL_INQUIRY' ? 0.55 : Math.min(0.98, 0.70 + (systems.length * 0.08) + (workflows.length * 0.04));
    return { intent, systems, workflows, confidence, needsDiscovery: intent !== 'GENERAL_INQUIRY' };
  }

  ingest(channel, payload, meta = {}) {
    const normalized = this.normalize(channel, payload, meta);
    const record = this.caseManager.createCase({
      source: normalized.source,
      channel: normalized.channel,
      organization: normalized.organization,
      contact: normalized.contact,
      request: normalized.request,
      confidence: normalized.request.confidence,
      authorization: normalized.authorization,
      nextAction: normalized.request.needsDiscovery ? 'DISCOVERY' : 'HUMAN_REVIEW'
    });
    const result = { success: true, intake: normalized, case: record };
    try { this.eventBus?.publish?.('intake.case.created', result); } catch (_) {}
    return result;
  }
}
