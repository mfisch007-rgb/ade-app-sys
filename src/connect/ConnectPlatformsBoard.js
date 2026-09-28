/**
 * ADE CONNECT & PLATFORMS BOARD AGGREGATOR (NEXT enablement — additive).
 *
 * Read-only aggregate over EXISTING authorities (ConnectionManager,
 * ProviderGate, WhatsAppNumberRegistry, ExternalConnectorModel,
 * PaymentService, channels). Reports per row:
 * CHANNEL/PROVIDER, STATUS, PURPOSE, TENANT, ENVIRONMENT, VERIFICATION,
 * CREDENTIAL PRESENCE, LAST CHECK, USAGE, ENTITLEMENT, AUDIT.
 * Progressive disclosure: summary by default, detail on demand.
 */

export class ConnectPlatformsBoard {
  constructor({
    connectionManager = null,
    providerGate = null,
    whatsappNumbers = null,
    externalConnectors = null,
    paymentService = null,
    channels = null,
    editionPolicy = null
  } = {}) {
    this.connectionManager = connectionManager;
    this.providerGate = providerGate;
    this.whatsappNumbers = whatsappNumbers;
    this.externalConnectors = externalConnectors;
    this.paymentService = paymentService;
    this.channels = channels;
    this.editionPolicy = editionPolicy;
  }

  board({ tenantScope = null, detail = false } = {}) {
    const scope = tenantScope ? String(tenantScope) : null;
    const rows = [];
    // Channel/provider rows from provider gates (canonical lifecycle states)
    try {
      for (const g of this.providerGate?.list?.({ tenantScope: scope }) || []) {
        rows.push({
          channel: g.providerId,
          kind: "PROVIDER",
          status: g.state,
          purpose: (g.purposes || []).join(", ") || null,
          tenant: g.tenantScope,
          environment: g.environment || "N/A",
          verification: g.state === "VERIFIED" || g.state === "ENABLED" ? "VERIFIED" : g.state === "VERIFICATION_FAILED" ? "FAILED" : "NOT_VERIFIED",
          credentialPresence: Boolean(g.configPresent?.credentials),
          lastCheck: g.lastCheckedAt || null,
          usage: g.usage || null,
          entitlement: g.state === "ENABLED" ? "ACTIVE" : "GATED",
          audit: (g.history || []).length
        });
      }
    } catch {}
    // Connection rows (syntactic shape checks; never liveness claims)
    try {
      for (const c of this.connectionManager?.list?.() || []) {
        rows.push({
          channel: `${c.provider} (${c.id})`,
          kind: "CONNECTION",
          status: c.status || "CONFIGURED",
          purpose: c.type || "REST_API",
          tenant: scope || "default",
          environment: "N/A",
          verification: c.status === "READY" ? "READY_SHAPE_ONLY" : "NOT_VERIFIED",
          credentialPresence: Boolean(c.secretConfigured),
          lastCheck: c.updatedAt || null,
          usage: null,
          entitlement: "N/A",
          audit: null
        });
      }
    } catch {}
    // AWBULI sender identities
    try {
      for (const n of this.whatsappNumbers?.list?.({ tenantScope: scope }) || []) {
        rows.push({
          channel: `AWBULI ${n.masked || n.id}`,
          kind: "CHANNEL_IDENTITY",
          status: n.state,
          purpose: n.purpose || null,
          tenant: n.tenantScope,
          environment: "N/A",
          verification: n.verified ? "VERIFIED" : "NOT_VERIFIED",
          credentialPresence: false,
          lastCheck: n.updatedAt || null,
          usage: n.usage || null,
          entitlement: "N/A",
          audit: (n.history || []).length
        });
      }
    } catch {}
    // External ERP/CRM connectors
    try {
      for (const x of this.externalConnectors?.status?.({ tenantScope: scope }) || []) {
        rows.push({
          channel: `${x.label} [${x.systemClass}]`,
          kind: "EXTERNAL_SYSTEM",
          status: x.state,
          purpose: (x.capabilities || []).join(", ") || x.systemClass,
          tenant: x.tenantScope,
          environment: "N/A",
          verification: x.live ? "VERIFIED" : "NOT_VERIFIED",
          credentialPresence: false,
          lastCheck: x.registeredAt || null,
          usage: null,
          entitlement: x.live ? "ACTIVE" : "GATED",
          audit: null
        });
      }
    } catch {}
    // Payments row (masked; never leaks secrets)
    try {
      const pay = this.paymentService?.status?.({ tenantScope: scope || "default" });
      if (pay) {
        rows.push({
          channel: "Paystack",
          kind: "PAYMENT_PROVIDER",
          status: pay.state,
          purpose: "Commercial entitlement",
          tenant: pay.tenantScope,
          environment: pay.environment,
          verification: pay.verified ? "VERIFIED" : "NOT_VERIFIED",
          credentialPresence: Boolean(pay.configured),
          lastCheck: pay.lastVerifiedAt || null,
          usage: null,
          entitlement: pay.entitlement?.plan || "COMMUNITY",
          audit: null
        });
      }
    } catch {}
    const summary = {
      total: rows.length,
      live: rows.filter((r) => r.status === "ENABLED" || r.status === "LIVE").length,
      configured: rows.filter((r) => r.status === "CONFIGURED" || r.status === "VERIFIED").length,
      pending: rows.filter((r) => /NOT_CONFIGURED|PROVIDER_REQUIRED|INCOMPLETE|PENDING/i.test(String(r.status))).length
    };
    if (!detail) return { success: true, summary, rows: rows.map((r) => ({ channel: r.channel, status: r.status, tenant: r.tenant, verification: r.verification })) };
    return { success: true, summary, rows };
  }
}

export default ConnectPlatformsBoard;
