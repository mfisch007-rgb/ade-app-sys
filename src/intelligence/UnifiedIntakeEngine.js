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
    const baseText = payload.text || payload.message || payload.body || payload.request || payload.description || '';
    const bizType = String(payload.businessType || payload.business_type || payload.industry || '').trim();
    const outcome = String(payload.useCase || payload.use_case || payload.focus || '').trim();
    const lowerBase = String(baseText).toLowerCase();
    const bits = [baseText];
    if (bizType && !lowerBase.includes(bizType.toLowerCase())) bits.push('Business type: ' + bizType + '.');
    // The stated outcome is first-class evidence (e.g. "cut procurement
    // delays") — classifying without it silently drops the strongest signal.
    if (outcome && !lowerBase.includes(outcome.toLowerCase().slice(0, 24))) bits.push('Stated outcome: ' + outcome + '.');
    const text = bits.filter(Boolean).join(' ');
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
    // Evidence-specific sequencing for goods-flow submissions: establish
    // inventory visibility first, then trace procurement → supplier →
    // fulfillment. No failure point is claimed until evidence confirms it.
    if (area === 'PROCUREMENT' || area === 'INVENTORY') {
      return `Start with ${area.toLowerCase()} visibility (counts, ownership, hand-offs), then trace inventory → procurement → supplier → fulfillment to isolate the failure point. Claim no failure point until evidence confirms it.`;
    }    if (area && integrationSignals) {
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
    const simulateRequest = /simulat|what-if|what if|scenario model|role-?play/.test(t);
    const enterpriseKeyword = /erp|integration|integrat|workflow|automation|automate|rpa/.test(t);
    const enterpriseEvidenced = systems.length > 0 || workflows.length > 0;
    const intent = simulateRequest ? 'GENERAL_INQUIRY' : (enterpriseKeyword && enterpriseEvidenced) ? 'ENTERPRISE_IMPLEMENTATION' : /assessment|diagnos|audit|scan|inefficien/.test(t) ? 'BUSINESS_ASSESSMENT' : 'GENERAL_INQUIRY';
    const confidence = intent === 'GENERAL_INQUIRY' ? 0.55 : Math.min(0.98, 0.70 + (systems.length * 0.08) + (workflows.length * 0.04));

    const hit = (...sig) => sig.some((s) => t.includes(s));
    const growthSignals = hit('grow', 'growth', 'scale', 'expansion', 'demand', 'hoping to');
    // Scored area detection: incidental mentions (e.g. "leads/customers" in a
    // stock complaint) must not outrank operational domains. Strong
    // service/complaint language still majors customer operations; otherwise
    // the highest-scoring domain wins and operational domains win ties.
    const strongCustomer = hit('customer service', 'customer support', 'customer complaint', 'complaint', 'support desk', 'crm', 'client issues', 'clients complain');
    const weakCustomer = !growthSignals && hit('customer', 'customers', 'client');
    const domainScores = [
      ['PROCUREMENT', ['procurement', 'purchasing', 'purchase order', 'supplier', 'vendor']],
      ['INVENTORY', ['inventory', 'stock', 'warehouse', 'restock']],
      ['PRODUCTION', ['production', 'manufacturing', 'assembly']],
      ['FINANCE', ['finance', 'accounting', 'invoice', 'payroll', 'reconcil', 'payments']],
      ['SALES', ['sales', 'orders', 'order management', 'lead', 'marketing']],
      ['WORKFORCE', ['hr', 'recruitment', 'staff', 'workforce']]
    ].map(([areaName, keywords]) => ({
      area: areaName,
      score: keywords.filter((k) => t.includes(k)).length
    })).filter((e) => e.score > 0);
    if (weakCustomer) domainScores.push({ area: 'CUSTOMER_OPERATIONS', score: 1, incidental: true });
    let area = null;
    let areaSignals = [];
    if (strongCustomer) {
      area = 'CUSTOMER_OPERATIONS';
      areaSignals = [{ area: 'CUSTOMER_OPERATIONS', score: 3, explicit: true }, ...domainScores];
    } else if (domainScores.length) {
      const ranked = [...domainScores].sort((a, b) => b.score - a.score);
      const top = ranked[0].score;
      const contenders = ranked.filter((e) => e.score === top);
      // Operational domains precede incidental customer mentions on ties.
      contenders.sort((a, b) => (b.incidental ? 0 : 1) - (a.incidental ? 0 : 1));
      area = contenders[0].area;
      areaSignals = ranked;
    }
    const manual = hit('manual', 'spreadsheet', 'excel', 'paper', 're-key', 'rekey', 'data entry', 'copy paste', 'double entry', 'handwritten');
    const delaySignals = hit('delay', 'slow', 'late', 'lag', 'behind', 'missed', 'waiting', 'bottleneck', 'queue', 'backlog');
    const wasteSignals = hit('waste', 'rework', 'duplicate', 'error', 'mistakes', 'lost', 'missing', 'repeated');
    const integrationSignals = hit('integration', 'integrat', 'system', 'software', 'erp', 'sync', 'disconnected', 'silo', 'odoo', 'sap', 'shopify');
    const communicationSignals = hit('communication', 'email', 'phone call', 'call', 'chase', 'unclear', 'misunderstanding', 'messages');

    const orgSize = this.extractOrgSize(payload);
    const evidence = [];
    if (area) evidence.push(`Business area identified: ${area.toLowerCase()}.`);
    const secondaryAreas = areaSignals.map((e) => e.area).filter((a) => a && a !== area);
    if (secondaryAreas.length) evidence.push(`Additional signals detected: ${[...new Set(secondaryAreas)].join(', ').toLowerCase()}.`);
    if (orgSize) evidence.push(`Stated scale: ${orgSize.toLowerCase()}.`);
    if (manual) evidence.push('Manual handling references detected in the request.');
    if (delaySignals) evidence.push('Delay and latency language detected in the request.');
    if (integrationSignals) evidence.push('Existing systems or integration language detected.');
    if (wasteSignals) evidence.push('Waste and rework language detected in the request.');
    if (simulateRequest) evidence.push('A simulation was requested; ADE captured the scenario as assessment input — no workflow simulation was executed.');
    if (!evidence.length) evidence.push('No explicit operational detail beyond the request text was supplied.');

    const observation =
      (area ? `The request centers on ${area.toLowerCase()} operations within the business. ` : 'The request describes an operational concern but does not name a specific business area. ') +
      (orgSize ? `Stated scale is ${orgSize.toLowerCase()}. ` : '') +
      (manual ? 'Work appears to be coordinated manually rather than through connected systems. ' : 'No manual-handling evidence was described in the submission.') +
      (integrationSignals ? 'System connectivity is explicitly part of the concern.' : '');

    const bottleneck =
      delaySignals && manual
        ? 'Manual handling co-occurs with delay language in this submission — a likely friction point. The exact constrained step, owner and mechanism are not established by the evidence; treat as a hypothesis for discovery.'
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

    const wasteHits = ['rework', 'duplicat', 'error', 'mistake', 'lost', 'missing', 'repeat'].filter((s) => t.includes(s));
    const wasteReasoning = wasteSignals
      ? `Waste language was detected (${wasteHits.join(', ') || 'general waste terms'}) — only the matched terms above are evidenced; treat the rest as discovery questions, not findings.`
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
    const humanReviewRequired = simulateRequest || !area || signalCount < 4 || !friction;
    const assessmentConfidence = humanReviewRequired
      ? Math.min(0.55, 0.35 + signalCount * 0.06)
      : Math.min(0.9, 0.55 + signalCount * 0.07);
    // Confidence semantics: this number measures SIGNAL strength (how much
    // evidenced language was detected), never root-cause proof. The
    // deterministic engine cannot establish a root cause — that status is
    // explicit so no percentage can be misread as causal certainty.
    const assessment = {
      observation: observation,
      bottleneck: bottleneck,
      digestionDelay: digestionDelay,
      wasteReasoning: wasteReasoning,
      risk: risk,
      improvement: improvement,
      recommendedNextStep: this._candidateNextStep({ area, integrationSignals, manual, orgSize }),
      confidence: Number(assessmentConfidence.toFixed(2)),
      signalConfidence: Number(assessmentConfidence.toFixed(2)),
      evidenceCompleteness: Number(Math.min(1, evidence.length / 6).toFixed(2)),
      rootCauseStatus: 'NOT_ESTABLISHED',
      rootCauseNote: 'The deterministic engine identifies signals, never root causes. An operator must confirm the failure point with evidence.',
      areas: areaSignals.map((e) => ({ area: e.area, score: e.score })),
      evidence,
      humanReviewRequired,
      generatedBy: 'DETERMINISTIC_LINGUISTIC_ANALYSIS',
      aiUsed: false
    };

    return { intent, systems, workflows, confidence, needsDiscovery: intent !== 'GENERAL_INQUIRY', assessment };
  }

  ingest(channel, payload, meta = {}) {
    const normalized = this.normalize(channel, payload, meta);
    const honestConfidence = Number(Math.min(normalized.request.confidence, normalized.request.assessment.confidence).toFixed(2));
    const record = this.caseManager.createCase({
      source: normalized.source,
      channel: normalized.channel,
      organization: normalized.organization,
      contact: normalized.contact,
      request: normalized.request,
      confidence: honestConfidence,
      authorization: normalized.authorization,
      nextAction: normalized.request.needsDiscovery ? 'DISCOVERY' : 'HUMAN_REVIEW'
    });
    const result = { success: true, intake: normalized, case: record };
    try { this.eventBus?.publish?.('intake.case.created', result); } catch (_) {}
    return result;
  }
}
