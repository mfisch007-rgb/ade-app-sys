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
      useCase: this.extractUseCase(payload),
      orgSize: this.extractOrgSize(payload),
      contact,
      raw: payload,
      text,
      request,
      authorization: payload.authorization || { publicAnalysis: false, connectedSystems: false }
    };
  }

  extractOrgSize(payload = {}) {
    const raw = String(payload.orgSize || payload.org_size || payload.companySize || payload.company_size || '').trim();
    if (!raw) return null;
    const k = raw.toLowerCase();
    if (/1000|enterprise|corporate|group/.test(k)) return 'ENTERPRISE (1000+)';
    if (/250|large/.test(k)) return 'LARGE (250-999)';
    if (/50|medium|mid/.test(k)) return 'MEDIUM (50-249)';
    if (/10|small|sme|under 50/.test(k)) return 'SMALL (10-49)';
    if (/1-9|1 to 9|micro|under 10/.test(k)) return 'MICRO (1-9)';
    if (/solo|freelanc|individ/.test(k)) return 'SOLO / FREELANCER';
    return raw.toUpperCase();
  }

  extractUseCase(payload = {}) {
    const raw = String(payload.useCase || payload.use_case || payload.focus || payload.businessArea || payload.business_area || payload.department || payload.area || '').trim();
    return raw || null;
  }

  _candidateNextStep({ area, integrationSignals, manual, orgSize }) {
    if (area && integrationSignals) {
      return `Connect ${area.toLowerCase()} operations to a single tracked pipeline (ADE operational integration) and assign a named owner.`;
    }
    if (area && manual) {
      return `Move ${area.toLowerCase()} intake and hand-offs out of spreadsheets into a tracked queue, then measure turnaround time per step.`;
    }
    if (area) {
      return `Run a structured discovery on ${area.toLowerCase()} operations to confirm the constraint point and quantify its cost.`;
    }
    if (orgSize) {
      return 'A human operator should contact the submitter to structure the discovery and confirm scope for their stated scale.';
    }
    return 'A human operator should contact the submitter to structure the discovery and confirm scope.';
  }

  classify(text, payload = {}) {
    const t = String(text).toLowerCase();
    const systems = ['odoo','sap','erpnext','shopify','salesforce','oracle','dynamics'].filter(x => t.includes(x) || String(payload.systems || '').toLowerCase().includes(x));
    const workflows = ['procurement','inventory','production','finance','sales','crm','hr','warehouse','order management'].filter(x => t.includes(x));
    const intent = /erp|integration|integrat|workflow|automation|automate|rpa/.test(t) ? 'ENTERPRISE_IMPLEMENTATION' : /assessment|diagnos|audit|scan|inefficien/.test(t) ? 'BUSINESS_ASSESSMENT' : 'GENERAL_INQUIRY';
    const confidence = intent === 'GENERAL_INQUIRY' ? 0.55 : Math.min(0.98, 0.70 + (systems.length * 0.08) + (workflows.length * 0.04));

    const hit = (...sig) => sig.some((s) => t.includes(s));
    const growthSignals = hit('grow', 'growth', 'scale', 'expansion', 'demand', 'hoping to');
    const area =
      hit('customer service', 'customer support', 'customer complaint', 'complaint', 'support desk', 'crm', 'client issues', 'clients complain')
        ? 'CUSTOMER_OPERATIONS'
      : (hit('customer', 'customers', 'client') && !growthSignals)
        ? 'CUSTOMER_OPERATIONS'
      : hit('finance', 'accounting', 'invoice', 'payroll', 'reconcil', 'payments') ? 'FINANCE'
      : hit('procurement', 'purchasing', 'purchase order', 'supplier', 'vendor') ? 'PROCUREMENT'
      : hit('inventory', 'stock', 'warehouse', 'restock') ? 'INVENTORY'
      : hit('sales', 'orders', 'order management', 'lead', 'marketing') ? 'SALES'
      : hit('hr', 'recruitment', 'staff', 'workforce') ? 'WORKFORCE'
      : hit('production', 'manufacturing', 'assembly') ? 'PRODUCTION'
      : null;
    const manual = hit('manual', 'spreadsheet', 'excel', 'paper', 're-key', 'rekey', 'data entry', 'copy paste', 'double entry', 'handwritten');
    const delaySignals = hit('delay', 'slow', 'late', 'lag', 'behind', 'missed', 'waiting', 'bottleneck', 'queue', 'backlog');
    const wasteSignals = hit('waste', 'rework', 'duplicate', 'error', 'mistakes', 'lost', 'missing', 'repeated');
    const integrationSignals = hit('integration', 'integrat', 'system', 'software', 'erp', 'sync', 'disconnected', 'silo', 'odoo', 'sap', 'shopify');
    const communicationSignals = hit('communication', 'email', 'phone call', 'call', 'chase', 'unclear', 'misunderstanding', 'messages');

    const orgSize = this.extractOrgSize(payload);
    const evidence = [];
    if (area) evidence.push(`Business area identified: ${area.toLowerCase()}.`);
    if (orgSize) evidence.push(`Stated scale: ${orgSize.toLowerCase()}.`);
    if (manual) evidence.push('Manual handling references detected in the request.');
    if (delaySignals) evidence.push('Delay and latency language detected in the request.');
    if (integrationSignals) evidence.push('Existing systems or integration language detected.');
    if (wasteSignals) evidence.push('Waste and rework language detected in the request.');
    if (!evidence.length) evidence.push('No explicit operational detail beyond the request text was supplied.');

    const observation =
      (area ? `The request centers on ${area.toLowerCase()} operations within the business. ` : 'The request describes an operational concern but does not name a specific business area. ') +
      (orgSize ? `Stated scale is ${orgSize.toLowerCase()}. ` : '') +
      (manual ? 'Work appears to be coordinated manually rather than through connected systems. ' : 'No manual-handling evidence was described in the submission.') +
      (integrationSignals ? 'System connectivity is explicitly part of the concern.' : '');

    const bottleneck =
      delaySignals && manual
        ? 'Manual data handling compounds response delays in the stated workflow — every hand-off introduces re-entry and waiting.'
        : delaySignals
          ? 'Latency signals are present in the workflow, but the specific constraint point (which step, which owner) is not yet isolated.'
          : manual
            ? 'Manual coordination is the most probable friction point, though the exact constrained step was not described.'
            : area
              ? 'The primary constraint is not clearly specified in the submission — this is the first discovery question for the operator.'
              : 'The bottleneck cannot be derived honestly from the text provided.';

    const digestionDelay = delaySignals
      ? `Delay language was detected (${['delay', 'slow', 'late', 'behind', 'bottleneck'].filter((s) => t.includes(s)).join(', ') || 'multiple signals'}). The operator should confirm the time impact in days or weeks.`
      : growthSignals
        ? 'No explicit delay was stated, but growth intent implies operations will need to absorb more volume.'
        : 'No quantitative delay was stated in the submission.';

    const wasteReasoning = wasteSignals
      ? 'Waste signals (rework, duplication, errors, lost records) were detected — these are the highest-value targets for automation.'
      : manual
        ? 'Manual re-entry is a structural waste risk even where losses were not yet observed.'
        : 'No explicit waste or loss language was provided in the submission.';

    const risk =
      communicationSignals && !integrationSignals
        ? 'Communication gaps between teams or steps can cause delay and duplicated effort without a tracking layer.'
        : integrationSignals
          ? 'Disconnected systems create reconciliation risk: records diverge until manually fixed.'
          : 'The submission did not state a specific process risk; the review should probe for it.';

    const improvement =
      area
        ? `Prioritize ${area.toLowerCase()} visibility first: reliable intake, clear ownership, and a tracked hand-off for that area.`
        : integrationSignals
          ? 'Connecting the described steps into a single visible pipeline is the first credible improvement.'
          : 'Structuring how the described work is captured and tracked is the first credible improvement.';

    const signalCount = [area, orgSize, manual, delaySignals, wasteSignals, integrationSignals, communicationSignals, growthSignals].filter(Boolean).length;
    const friction = manual || delaySignals || wasteSignals || integrationSignals;
    const humanReviewRequired = !area || signalCount < 4 || !friction;
    const assessmentConfidence = humanReviewRequired
      ? Math.min(0.55, 0.35 + signalCount * 0.06)
      : Math.min(0.9, 0.55 + signalCount * 0.07);

    const assessment = {
      observation: observation,
      bottleneck: bottleneck,
      digestionDelay: digestionDelay,
      wasteReasoning: wasteReasoning,
      risk: risk,
      improvement: improvement,
      recommendedNextStep: this._candidateNextStep({ area, integrationSignals, manual, orgSize }),
      confidence: Number(assessmentConfidence.toFixed(2)),
      evidence,
      humanReviewRequired,
      generatedBy: 'DETERMINISTIC_LINGUISTIC_ANALYSIS',
      aiUsed: false
    };

    return { intent, systems, workflows, confidence, needsDiscovery: intent !== 'GENERAL_INQUIRY', assessment };
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
