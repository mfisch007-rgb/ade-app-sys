/**
 * ADE OPERATIONAL GRAPH — universal capability/route/product/RBAC/state index.
 *
 * ADAPTER ONLY. Creates no registry, bus, gate, engine, store or auth path.
 * Composes the existing canonical authorities and exposes one navigable
 * operational spine for every product, module, role and future product:
 *   - ProductSurfaceMatrix / ProductRegistry (product graph + truthful states)
 *   - CapabilityActivation + CapabilityRegistry (capability graph + RBAC levels)
 *   - ConnectPlatformsBoard + ChannelRegistry (connect/channel/provider state)
 *   - EditionPolicy + CommercialEntitlement (entitlement graph)
 *   - CaseManager / WorkforceManager / ProductNotificationEngine (live counts)
 *   - ADE_ICX_Engine via kernel (ICX truth)
 *
 * Every node resolves: id, product, module, parent, children, route/deep-link,
 * actions, required capability, minimum RBAC, current state, provider
 * dependency, tenant scope, audit requirement, next actions and related
 * workflow/case/event/connector entry points.
 *
 * FUTURE-PRODUCT AUTO-FIT: a future product that registers a
 * SURFACE_DECLARATIONS entry (ProductSurfaceMatrix) automatically appears in
 * the product graph with drill children (open + API routes) — global
 * navigation, deep-linking, breadcrumbs, role-aware visibility and audit
 * annotation with no custom dashboard build. Declaring a MODULE_DECLARATIONS
 * entry upgrades it to a full drill-down tree.
 */

const FRONT = Object.freeze({
  HOME: "#/Home",
  PRODUCTS: "#/Products",
  PROCARTA: "#/PROCARTA",
  COMMUNITY: "#/Community",
  ACCOUNT: "#/Account",
  WORKSPACE: "#/Workspace",
  COMMAND_CENTER: "#/Command Center",
  ADMIN: "/admin",
  FOUNDER: "/founder"
});

// Static module contract declarations. Each mirrors a real frontend module id
// (public/index.html WS_MODULES) or a real product surface. Children reference
// ONLY routes/endpoints/sections that exist in src/app.js, identityRoutes.js
// or public/ sections. `kind`: overview|list|action|config|form|external.
const MODULE_DECLARATIONS = Object.freeze([
  {
    id: "overview", label: "Overview", icon: "OV", group: "COMMAND",
    description: "Health, counts and primary actions across the workspace.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "ov-health", label: "Platform health", kind: "overview", api: "GET /api/v1/health", minLevel: 0, audit: false, note: "Kernel, edition, build SHA." },
      { id: "ov-cases", label: "Case count", kind: "list", module: "workflows", api: "GET /api/v1/cases", minLevel: 1, audit: false, note: "Canonical CaseManager source." },
      { id: "ov-people", label: "People & invites", kind: "list", module: "workforce", api: "GET /api/v1/workforce", minLevel: 2, elevated: true, audit: false, note: "Workforce registry truth." },
      { id: "ov-actions", label: "Primary actions", kind: "action", route: FRONT.WORKSPACE, minLevel: 1, audit: false, note: "Invite Person, Review Cases, View Audit." }
    ]
  },
  {
    id: "operations", label: "Operations", icon: "OP", group: "COMMAND",
    description: "Live system activity: transport, telemetry, kernel and diagnostics.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "ops-stream", label: "Live event stream (SSE)", kind: "overview", api: "GET /api/v1/events/stream", minLevel: 0, audit: false, note: "Transport only — never a substitute for business cases." },
      { id: "ops-metrics", label: "Metrics & kernel", kind: "overview", api: "GET /api/v1/metrics", minLevel: 0, audit: false, note: "Events received, intents dispatched, uptime." },
      { id: "ops-diagnostics", label: "System diagnostics", kind: "overview", api: "GET /api/v1/system/diagnostics", minLevel: 2, audit: true, note: "L2 operator surface." },
      { id: "ops-live", label: "Open Live Operations", kind: "action", route: FRONT.COMMAND_CENTER, minLevel: 1, audit: false, note: "Command Center surface." }
    ]
  },
  {
    id: "workflows", label: "Workflows", icon: "WO", group: "COMMAND",
    description: "Cases and execution: intake creates cases, processing runs the decision engine.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null, aliases: ["work"],
    children: [
      { id: "wf-cases", label: "Active cases", kind: "list", api: "GET /api/v1/cases", minLevel: 1, audit: false, note: "Human cases; demos excluded unless requested." },
      { id: "wf-detail", label: "Case detail & transitions", kind: "overview", api: "GET /api/v1/cases/:id", minLevel: 1, audit: false, note: "Status, allowed transitions, assessment." },
      { id: "wf-process", label: "Process case (decision engine)", kind: "action", api: "POST /api/v1/cases/:id/process", minLevel: 1, elevated: true, audit: true, note: "Founder/Admin or elevated Operator." },
      { id: "wf-execute", label: "Execute workflow", kind: "action", api: "POST /api/v1/cases/:id/execute", minLevel: 1, elevated: true, audit: true, note: "Bounded execution." },
      { id: "wf-feedback", label: "Record case feedback", kind: "form", api: "POST /api/v1/cases/:id/feedback", minLevel: 1, audit: true, note: "Outcome, correction or follow-up." }
    ]
  },
  {
    id: "decisions", label: "Decisions", icon: "DE", group: "COMMAND",
    description: "Runnable capabilities: what can execute now, and what each requires.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "dec-runnable", label: "Runnable capabilities", kind: "list", api: "GET /api/v1/capabilities", minLevel: 0, audit: false, note: "RBAC-filtered by identity." },
      { id: "dec-execute", label: "Execute capability", kind: "action", api: "POST /api/command/execute", minLevel: 1, audit: true, note: "RBAC + edition enforced server-side." },
      { id: "dec-activation", label: "Activation matrix", kind: "overview", module: "access", api: "GET /api/v1/capabilities/activation", minLevel: 1, audit: false, note: "Truthful states + required actions." }
    ]
  },
  {
    id: "products", label: "Products", icon: "PR", group: "BUSINESS",
    description: "Entitled surfaces and states from the server-reported catalogue.",
    route: FRONT.PRODUCTS, minLevel: 0, roles: null,
    children: [
      { id: "pr-catalogue", label: "Product catalogue", kind: "list", api: "GET /api/v1/product-surface", minLevel: 0, audit: false, note: "Every item opens its canonical surface." },
      { id: "pr-procarta", label: "PROCARTA surface", kind: "overview", route: FRONT.PROCARTA, minLevel: 0, audit: false, note: "Business process intelligence & automation." },
      { id: "pr-awbuli", label: "AWBULI surface", kind: "overview", product: "awbuli", minLevel: 0, audit: false, note: "Messaging automation; provider-gated transport." },
      { id: "pr-registry", label: "Registry truth", kind: "overview", api: "GET /api/v1/products", minLevel: 0, audit: false, note: "ProductRegistry declarations." }
    ]
  },
  {
    id: "connections", label: "Connect / Platforms", icon: "CP", group: "BUSINESS",
    description: "Universal integration hub: venues, channels, providers and modes.",
    route: FRONT.WORKSPACE, minLevel: 2, roles: null,
    children: [
      { id: "cx-board", label: "Platforms board", kind: "overview", api: "GET /api/v1/connect/platforms", minLevel: 2, audit: false, note: "Aggregate provider/channel truth." },
      { id: "cx-channels", label: "Channel inventory", kind: "list", api: "GET /api/v1/connectivity/inventory", minLevel: 0, audit: false, note: "Grip derives from verified capabilities only." },
      { id: "cx-connections", label: "Connections", kind: "list", api: "GET /api/v1/admin/connections", minLevel: 2, audit: true, note: "REST / WEBHOOK / OAUTH2 shapes; secrets never returned." },
      { id: "cx-test", label: "Test connection", kind: "action", api: "POST /api/v1/admin/connections/:id/test", minLevel: 2, audit: true, note: "Syntactic check, never liveness." },
      { id: "cx-awbuli", label: "AWBULI channels", kind: "overview", product: "awbuli", minLevel: 0, audit: false, note: "WhatsApp / Email / Telegram / API / Webhook states." },
      { id: "cx-payments", label: "Payments", kind: "config", api: "GET /api/v1/admin/payments/status", minLevel: 2, audit: true, note: "TEST/LIVE are separate states; disabled until configured." },
      { id: "cx-ai", label: "AI providers", kind: "overview", api: "GET /api/v1/ai/providers", minLevel: 1, audit: false, note: "Live only where genuinely configured." }
    ]
  },
  {
    id: "inbox", label: "Inbox", icon: "IB", group: "BUSINESS",
    description: "Internal messaging within the same tenant.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "ib-list", label: "Messages", kind: "list", api: "GET /api/v1/inbox", minLevel: 1, audit: false, note: "Tenant-scoped threads." },
      { id: "ib-send", label: "Send message", kind: "form", api: "POST /api/v1/inbox/send", minLevel: 1, audit: true, note: "Recipient + body; cross-tenant blocked." },
      { id: "ib-unread", label: "Unread count", kind: "overview", api: "GET /api/v1/inbox/unread-count", minLevel: 1, audit: false, note: "Badge truth." }
    ]
  },
  {
    id: "workforce", label: "Workforce", icon: "WF", group: "PEOPLE",
    description: "People, roles, status and the human+AI operational surface.",
    route: FRONT.WORKSPACE, minLevel: 2, elevated: true, roles: ["FOUNDER", "ADMIN", "OPERATOR"],
    children: [
      { id: "wf-people", label: "People & roles", kind: "list", api: "GET /api/v1/workforce", minLevel: 2, elevated: true, audit: false, note: "Human identities; AI identities stay distinct." },
      { id: "wf-invite", label: "Invite person", kind: "form", api: "POST /api/v1/workforce/invite", minLevel: 2, elevated: true, audit: true, note: "Code shown once; Founder role never granted by invite." },
      { id: "wf-agents", label: "AI Workers / agents", kind: "overview", module: "agents", api: "GET /api/v1/workforce/agents", minLevel: 2, elevated: true, audit: false, note: "Identity layer; execution binds through AgentRegistry." },
      { id: "wf-tasks", label: "Field tasks (work queues)", kind: "list", api: "GET /api/v1/field/tasks", minLevel: 1, audit: false, note: "Operational queues with transitions." },
      { id: "wf-customers", label: "Customers & org units", kind: "list", api: "GET /api/v1/customers", minLevel: 1, audit: false, note: "Community operations truth." },
      { id: "wf-manage", label: "Promote / suspend / reset", kind: "action", api: "POST /api/v1/workforce/:id/{promote,demote,suspend,revoke,activate}", minLevel: 2, elevated: true, audit: true, note: "Server-authorized; password/PIN resets live in /admin." }
    ]
  },
  {
    id: "invitations", label: "Invitations", icon: "IN", group: "PEOPLE",
    description: "Pending and new invites; onboarding entry state.",
    route: FRONT.WORKSPACE, minLevel: 2, elevated: true, roles: ["FOUNDER", "ADMIN", "OPERATOR"],
    children: [
      { id: "in-pending", label: "Pending invitations", kind: "list", api: "GET /api/v1/workforce", minLevel: 2, elevated: true, audit: false, note: "INVITED persons with expiry." },
      { id: "in-issue", label: "Issue invitation", kind: "form", api: "POST /api/v1/workforce/invite", minLevel: 2, elevated: true, audit: true, note: "Name, role, expiry window." },
      { id: "in-accept", label: "Accept invitation (public)", kind: "form", api: "POST /api/v1/account/accept-invitation", minLevel: 0, audit: true, note: "Code + identity + password + PIN → ACTIVE." }
    ]
  },
  {
    id: "agents", label: "AI Workers", icon: "AW", group: "PEOPLE",
    description: "Agent identities, capability bindings, ICX truth and execution.",
    route: FRONT.WORKSPACE, minLevel: 2, elevated: true, roles: ["FOUNDER", "ADMIN", "OPERATOR"],
    children: [
      { id: "ag-identities", label: "Agent identities", kind: "list", api: "GET /api/v1/workforce/agents", minLevel: 2, elevated: true, audit: false, note: "Scoped programmatic actors; never human authority." },
      { id: "ag-create", label: "Create agent", kind: "form", api: "POST /api/v1/workforce/agents", minLevel: 2, elevated: true, audit: true, note: "Name + purpose; status lifecycle." },
      { id: "ag-bind", label: "Bind capability", kind: "action", api: "POST /api/v1/agents/bind", minLevel: 2, audit: true, note: "Identity must pre-exist+ACTIVE; entitlement-checked." },
      { id: "ag-run", label: "Run capability", kind: "action", api: "POST /api/v1/agents/:id/run", minLevel: 1, audit: true, note: "Delegates only through CapabilityRegistry; daily limits." },
      { id: "ag-icx", label: "ICX / Internal Comms truth", kind: "overview", api: "GET /api/v1/icx/status", minLevel: 2, audit: false, note: "Internal Communication eXperience: kernel-internal, no HTTP execution surface." }
    ]
  },
  {
    id: "knowledge", label: "Knowledge", icon: "KN", group: "INTELLIGENCE",
    description: "Providers, media and the experience/knowledge substrate.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "kn-providers", label: "AI providers", kind: "list", api: "GET /api/v1/ai/providers", minLevel: 1, audit: false, note: "Available vs unconfigured, honestly." },
      { id: "kn-media", label: "Published media", kind: "list", api: "GET /api/v1/media/registry/stats", minLevel: 0, audit: false, note: "Asset counts, not fabricated content." },
      { id: "kn-experience", label: "Experience records", kind: "list", api: "GET /api/v1/experience", minLevel: 1, audit: false, note: "Situation→action→result→lesson." }
    ]
  },
  {
    id: "audit", label: "Audit", icon: "AU", group: "INTELLIGENCE",
    description: "Action ledger: identity and security-relevant history.",
    route: FRONT.WORKSPACE, minLevel: 2, elevated: true, roles: ["FOUNDER", "ADMIN", "OPERATOR"],
    children: [
      { id: "au-ledger", label: "Audit entries", kind: "list", api: "GET /api/v1/audit", minLevel: 2, elevated: true, audit: false, note: "Filterable by type; server-enforced." }
    ]
  },
  {
    id: "notifications", label: "Notifications", icon: "NO", group: "INTELLIGENCE",
    description: "Recent platform events: review tasks, business and system notices.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "nt-recent", label: "Recent events", kind: "list", api: "GET /api/v1/notifications/recent", minLevel: 0, audit: false, note: "Durable feed; case review events carry REVIEW action." },
      { id: "nt-attention", label: "Attention aggregate", kind: "overview", api: "GET /api/v1/attention", minLevel: 2, audit: false, note: "Intakes, candidates, pilots, cases, notifications." },
      { id: "nt-announce", label: "Announcements", kind: "list", api: "GET /api/v1/announcements", minLevel: 0, audit: false, note: "Published platform news." }
    ]
  },
  {
    id: "announcements", label: "Announcements", icon: "AN", group: "INTELLIGENCE",
    description: "Publish and manage platform news, bulletins and adverts.",
    route: FRONT.WORKSPACE, minLevel: 2, elevated: true, roles: ["FOUNDER", "ADMIN", "OPERATOR"],
    children: [
      { id: "an-list", label: "Published items", kind: "list", api: "GET /api/v1/announcements/admin", minLevel: 2, elevated: true, audit: false, note: "Draft vs active states." },
      { id: "an-publish", label: "Publish", kind: "form", api: "POST /api/v1/announcements", minLevel: 2, elevated: true, audit: true, note: "Kind + title + body." }
    ]
  },
  {
    id: "access", label: "Access & Entitlements", icon: "AE", group: "PLATFORM",
    description: "Capabilities, activation, edition, authorization and entitlement state.",
    route: FRONT.WORKSPACE, minLevel: 2, roles: null,
    children: [
      { id: "ac-activation", label: "Capability activation", kind: "list", api: "GET /api/v1/capabilities/activation", minLevel: 1, audit: false, note: "Truthful states + required actions." },
      { id: "ac-entitlements", label: "Trading entitlements", kind: "list", api: "GET /api/v1/admin/trading/entitlements", minLevel: 2, audit: true, note: "Paper-mode grants; live needs verified venue + approval." },
      { id: "ac-availability", label: "Edition availability", kind: "overview", api: "GET /api/v1/commerce/availability", minLevel: 1, audit: false, note: "What the current edition permits." }
    ]
  },
  {
    id: "settings", label: "Settings", icon: "SE", group: "PLATFORM",
    description: "Edition and storage truth; read-only probes.",
    route: FRONT.WORKSPACE, minLevel: 1, roles: null,
    children: [
      { id: "st-edition", label: "Edition & runtime", kind: "overview", api: "GET /api/v1/edition", minLevel: 0, audit: false, note: "COMMUNITY baseline; upgrades explicit." },
      { id: "st-storage", label: "Storage verify", kind: "action", api: "GET /api/v1/admin/storage/verify", minLevel: 2, audit: true, note: "Read-only probe; distinguishes unconfigured vs unreachable." }
    ]
  },
  {
    id: "account", label: "Account & Elevation", icon: "ID", group: "PLATFORM",
    description: "Identity, password, authorization PIN, recovery and step-up elevation.",
    route: FRONT.ACCOUNT, minLevel: 0, roles: null,
    children: [
      { id: "ac-session", label: "Session truth", kind: "overview", api: "GET /api/v1/account/session", minLevel: 1, audit: false, note: "Server-validated role, level, elevation." },
      { id: "ac-elevate", label: "Elevate session (PIN)", kind: "form", api: "POST /api/v1/account/pin", minLevel: 1, audit: true, note: "Per-user PIN; never the bootstrap Admin PIN." },
      { id: "ac-password", label: "Change password", kind: "form", api: "POST /api/v1/account/change-password", minLevel: 1, audit: true, note: "Current password required." },
      { id: "ac-pin", label: "Change authorization PIN", kind: "form", api: "POST /api/v1/account/change-pin", minLevel: 1, audit: true, note: "Password-authorized self-service." },
      { id: "ac-recovery", label: "Recovery codes", kind: "action", api: "POST /api/v1/account/recovery-codes/rotate", minLevel: 1, elevated: true, audit: true, note: "Single-use; rotation invalidates prior sets." },
      { id: "ac-accept", label: "Accept invitation", kind: "form", api: "POST /api/v1/account/accept-invitation", minLevel: 0, audit: true, note: "Public onboarding entry." },
      { id: "ac-logout", label: "Sign out", kind: "action", api: "POST /api/v1/account/logout", minLevel: 1, audit: true, note: "Destroys base + elevated authorization." }
    ]
  }
]);

// Role → visible module ids. Mirrors public/index.html WS_MODULES exactly so
// the graph and the UI can never disagree about what a role may see.
const ROLE_MODULES = Object.freeze({
  founder: ["overview", "products", "access", "connections", "inbox", "workforce", "invitations", "agents", "operations", "workflows", "knowledge", "decisions", "audit", "notifications", "settings", "account"],
  admin: ["overview", "products", "connections", "inbox", "workforce", "invitations", "agents", "announcements", "operations", "workflows", "access", "audit", "notifications", "account"],
  worker: ["overview", "products", "inbox", "work", "announcements", "notifications", "account"],
  pilot: ["poverview", "inbox", "request", "diagnostic", "evidence", "products", "implementation", "contact", "account"],
  partner: ["paroverview", "partnership", "integrations", "products", "implementation", "contact", "account"]
});

const GROUPS = Object.freeze([
  { id: "COMMAND", label: "Command", blurb: "Observe, decide, execute." },
  { id: "BUSINESS", label: "Business", blurb: "Products, channels, messages." },
  { id: "PEOPLE", label: "People", blurb: "Humans, invites, AI workers." },
  { id: "INTELLIGENCE", label: "Intelligence", blurb: "Knowledge, ledger, signals." },
  { id: "PLATFORM", label: "Platform", blurb: "Access, settings, identity." },
  { id: "JOURNEY", label: "Journey", blurb: "Pilot and partner onboarding." }
]);

// Journey-only modules (pilot/partner roles) not covered above; minimal honest
// declarations so they participate in the graph without inventing backends.
const JOURNEY_MODULES = Object.freeze([
  { id: "work", label: "Assigned Work", icon: "WO", group: "COMMAND", description: "Cases assigned to this worker.", route: FRONT.WORKSPACE, minLevel: 1, roles: ["OPERATOR", "ANALYST", "USER"], children: [
    { id: "wk-cases", label: "Assigned cases", kind: "list", api: "GET /api/v1/cases", minLevel: 1, audit: false, note: "Same canonical case source." },
    { id: "wk-feedback", label: "Record feedback", kind: "form", api: "POST /api/v1/cases/:id/feedback", minLevel: 1, audit: true, note: "Worker outcome reports." }
  ]},
  { id: "poverview", label: "Pilot Workspace", icon: "PL", group: "JOURNEY", description: "Pilot journey at a glance.", route: FRONT.WORKSPACE, minLevel: 1, roles: ["VIEWER", "PILOT"], children: [
    { id: "pj-request", label: "Request a pilot", kind: "form", api: "POST /api/v1/community/intake", minLevel: 0, audit: false, note: "PILOT_INTEREST intake." },
    { id: "pj-diagnostic", label: "Business diagnostic", kind: "overview", route: FRONT.PROCARTA, minLevel: 0, audit: false, note: "Deterministic PROCARTA assessment." }
  ]},
  { id: "paroverview", label: "Partner Workspace", icon: "PT", group: "JOURNEY", description: "Partnership at a glance.", route: FRONT.WORKSPACE, minLevel: 1, roles: ["PARTNER"], children: [
    { id: "pt-manage", label: "Manage partnership", kind: "list", api: "GET /api/v1/admin/partners", minLevel: 2, audit: false, note: "Evaluated registry." },
    { id: "pt-integrations", label: "Connection grip", kind: "overview", api: "GET /api/v1/connectivity/inventory", minLevel: 0, audit: false, note: "Verified capabilities only." }
  ]},
  { id: "request", label: "Pilot Request", icon: "RQ", group: "JOURNEY", description: "Register pilot interest.", route: FRONT.COMMUNITY, minLevel: 0, roles: null, children: [
    { id: "rq-submit", label: "Submit interest", kind: "form", api: "POST /api/v1/community/intake", minLevel: 0, audit: false, note: "Creates progression record + case." }
  ]},
  { id: "diagnostic", label: "Business Diagnostic", icon: "DG", group: "JOURNEY", description: "Assess a process with PROCARTA.", route: FRONT.PROCARTA, minLevel: 0, roles: null, children: [
    { id: "dg-start", label: "Start assessment", kind: "form", api: "POST /api/v1/intake/API", minLevel: 0, audit: false, note: "kind BUSINESS_PROCESS → case + review notification." }
  ]},
  { id: "evidence", label: "Evidence & Results", icon: "EV", group: "JOURNEY", description: "Measured progression — never fabricated.", route: FRONT.WORKSPACE, minLevel: 1, roles: null, children: [
    { id: "ev-prog", label: "Progression", kind: "overview", api: "GET /api/v1/community/progression", minLevel: 0, audit: false, note: "Stage truth for this tenant." }
  ]},
  { id: "partnership", label: "Partnership", icon: "PS", group: "JOURNEY", description: "Register and manage interest.", route: FRONT.COMMUNITY, minLevel: 0, roles: null, children: [
    { id: "ps-register", label: "Register interest", kind: "form", api: "POST /api/v1/community/intake", minLevel: 0, audit: false, note: "PARTNER_INTEREST intake." }
  ]},
  { id: "integrations", label: "Integrations", icon: "IN", group: "JOURNEY", description: "Connection grip status.", route: FRONT.WORKSPACE, minLevel: 1, roles: ["PARTNER"], children: [
    { id: "ig-grip", label: "Grip board", kind: "overview", api: "GET /api/v1/connectivity/inventory", minLevel: 0, audit: false, note: "Verification runs L2 in Admin Console." }
  ]},
  { id: "implementation", label: "Implementation", icon: "IM", group: "JOURNEY", description: "Delivery pathway.", route: FRONT.COMMUNITY, minLevel: 0, roles: null, children: [
    { id: "im-request", label: "Request implementation", kind: "form", api: "POST /api/v1/community/intake", minLevel: 0, audit: false, note: "No fabricated pricing — request a quote." }
  ]},
  { id: "contact", label: "Contact ADE", icon: "CT", group: "JOURNEY", description: "Direct lines to the ADE team.", route: FRONT.COMMUNITY, minLevel: 0, roles: null, children: [
    { id: "ct-email", label: "Email / phone", kind: "external", route: FRONT.COMMUNITY, minLevel: 0, audit: false, note: "Published contact channels." }
  ]}
]);

export class OperationalGraph {
  constructor({
    productSurfaceMatrix = null,
    capabilityActivation = null,
    capabilityRegistry = null,
    connectBoard = null,
    channels = null,
    providerGate = null,
    whatsappNumbers = null,
    editionPolicy = null,
    caseManager = null,
    workforceManager = null,
    notificationEngine = null,
    icxEngine = null
  } = {}) {
    this.deps = {
      productSurfaceMatrix, capabilityActivation, capabilityRegistry,
      connectBoard, channels, providerGate, whatsappNumbers, editionPolicy,
      caseManager, workforceManager, notificationEngine, icxEngine
    };
    this.modules = new Map();
    for (const m of [...MODULE_DECLARATIONS, ...JOURNEY_MODULES]) this.modules.set(m.id, m);
  }

  // Register a future product's operational module at runtime. The ONLY new
  // structure allowed; everything it references must already exist.
  registerModule(decl) {
    if (!decl?.id || !decl?.label) throw new Error("OPERATIONAL_GRAPH_MODULE_INVALID");
    if (this.modules.has(decl.id)) throw new Error("OPERATIONAL_GRAPH_MODULE_EXISTS");
    this.modules.set(decl.id, { group: "BUSINESS", route: FRONT.PRODUCTS, minLevel: 1, roles: null, children: [], ...decl });
    return decl.id;
  }

  _safe(fn, fallback = null) { try { const v = fn(); return v ?? fallback; } catch { return fallback; } }

  _identity(ctx = {}) {
    const role = String(ctx.role || "PUBLIC").toUpperCase();
    const level = Number(ctx.level ?? 0);
    const elevated = Boolean(ctx.elevated);
    const tenant = String(ctx.tenant || "default").slice(0, 80);
    return { role, level, elevated, tenant, authenticated: level >= 1 || Boolean(ctx.authenticated) };
  }

  _access(node, id) {
    if ((node.minLevel ?? 0) <= 0) return { access: "ALLOWED", reason: null };
    if (!id.authenticated) return { access: "AUTH_REQUIRED", reason: "Sign in to use this operation." };
    if (Array.isArray(node.roles) && !node.roles.includes(id.role)) {
      return { access: "ROLE_REQUIRED", reason: `Requires one of: ${node.roles.join(", ")}.` };
    }
    if (id.level < (node.minLevel ?? 1)) {
      return { access: "LEVEL_REQUIRED", reason: `Requires L${node.minLevel}; current authority L${id.level}.` };
    }
    if (node.elevated && !id.elevated) {
      return { access: "ELEVATION_REQUIRED", reason: "Elevate the session with the account authorization PIN." };
    }
    return { access: "ALLOWED", reason: null };
  }

  _live() {
    const d = this.deps;
    const cases = this._safe(() => (d.caseManager?.list?.() || []).filter((c) => c?.source !== "DEMO_ORCHESTRATOR"), []);
    const people = this._safe(() => d.workforceManager?.listPersons?.() || d.workforceManager?.list?.() || [], []);
    const invites = Array.isArray(people) ? people.filter((p) => p?.status === "INVITED").length : 0;
    const notifs = this._safe(() => d.notificationEngine?.getRecentEvents?.(100) || [], []);
    const reviewNotifs = Array.isArray(notifs) ? notifs.filter((n) => n?.payload?.recommendedAction === "REVIEW" || n?.type === "notification.request_status").length : 0;
    const channelRows = this._safe(() => d.channels?.list?.() || [], []);
    const board = this._safe(() => d.connectBoard?.board?.({}) || null, null);
    const edition = this._safe(() => d.editionPolicy?.getEdition?.(), "COMMUNITY");
    const activation = this._safe(() => d.capabilityActivation?.assess?.() || [], []);
    const capabilities = this._safe(() => d.capabilityRegistry?.listCapabilities?.() || [], []);
    const icx = this._safe(() => {
      const snap = d.icxEngine?.getSnapshot?.();
      if (!snap) return { present: false };
      return { present: true, staff: snap.staff?.length ?? 0, messages: snap.messages?.length ?? 0, escalations: snap.escalations?.length ?? 0 };
    }, { present: false });
    return { cases, people, invites, notifs, reviewNotifs, channelRows, board, edition, activation, capabilities, icx };
  }

  _stateFor(moduleId, live) {
    switch (moduleId) {
      case "workflows": case "work":
        return live.cases.length ? { state: "ACTIVE", detail: `${live.cases.length} human cases open in the canonical store.` } : { state: "EMPTY", detail: "No cases yet — intake creates them." };
      case "notifications":
        return live.notifs.length ? { state: "ACTIVE", detail: `${live.notifs.length} recent events (${live.reviewNotifs} review).` } : { state: "EMPTY", detail: "No notifications yet." };
      case "workforce": case "invitations":
        return { state: live.people.length ? "ACTIVE" : "EMPTY", detail: `${live.people.length} people, ${live.invites} pending invites.` };
      case "connections": {
        const rows = live.board?.rows || live.channelRows || [];
        return { state: rows.length ? "MIXED" : "UNCONFIGURED", detail: rows.length ? `${rows.length} channels/providers reported; transport only where verified.` : "No providers configured — WhatsApp/AWBULI transport unavailable." };
      }
      case "agents":
        return live.icx.present ? { state: "AVAILABLE", detail: `ICX kernel-internal (${live.icx.staff} staff, ${live.icx.messages} messages); agent execution binds through AgentRegistry.` } : { state: "PREVIEW", detail: "Agent identity layer available; ICX snapshot unavailable." };
      case "knowledge": case "decisions": case "operations": case "overview":
        return { state: "AVAILABLE", detail: "Live reads from canonical authorities." };
      case "access":
        return { state: "AVAILABLE", detail: `${live.activation.length} assessed capabilities with required actions.` };
      default:
        return { state: "AVAILABLE", detail: null };
    }
  }

  _node(n, id, parent) {
    const { access, reason } = this._access(n, id);
    const out = {
      id: n.id, label: n.label, kind: n.kind || "overview", parent,
      product: n.product || null, module: n.module || null,
      route: n.route || null, api: n.api || null,
      minLevel: n.minLevel ?? 0, roles: n.roles || null,
      elevatedRequired: Boolean(n.elevated),
      capability: n.intent || null,
      provider: n.provider || null,
      tenantScope: id.tenant,
      auditRequired: Boolean(n.audit),
      access, blockedReason: reason,
      note: n.note || null,
      next: n.next || null
    };
    if (Array.isArray(n.children)) out.children = n.children.map((c) => this._node(c, id, n.id));
    return out;
  }

  graph(ctx = {}) {
    const id = this._identity(ctx);
    const live = this._live();
    const roleKey = id.role === "FOUNDER" ? "founder" : id.role === "ADMIN" ? "admin" : id.role === "PARTNER" ? "partner" : (id.role === "VIEWER" || id.role === "PILOT") ? "pilot" : id.authenticated ? "worker" : "public";
    const visibleIds = new Set(ROLE_MODULES[roleKey] || []);
    // Public visitors see public entry modules (products/account/journey entries).
    if (roleKey === "public") {
      for (const [mid, m] of this.modules) {
        if ((m.minLevel ?? 0) <= 0) visibleIds.add(mid);
      }
    }

    const modules = [];
    for (const [mid, m] of this.modules) {
      if (!visibleIds.has(mid)) continue;
      const { access, reason } = this._access(m, id);
      const st = this._stateFor(mid, live);
      modules.push({
        id: m.id, label: m.label, icon: m.icon || mid.slice(0, 2).toUpperCase(),
        group: m.group || "BUSINESS", description: m.description || null,
        route: m.route || FRONT.WORKSPACE, aliases: m.aliases || [],
        minLevel: m.minLevel ?? 0, roles: m.roles || null,
        tenantScope: id.tenant, state: st.state, stateDetail: st.detail,
        access, blockedReason: reason,
        children: (m.children || []).map((c) => this._node(c, id, mid))
      });
    }

    // Product graph: derived from the surface matrix (truthful states), each
    // product annotated with its module entry and access for this identity.
    // FUTURE-PRODUCT AUTO-FIT: every surfaced product carries drill children
    // (open + API routes), so a product registered in SURFACE_DECLARATIONS
    // automatically receives navigation, deep-linking, breadcrumbs, role-aware
    // visibility and audit annotation with no custom dashboard build.
    let products = [];
    try {
      const surfaces = this.deps.productSurfaceMatrix?.build?.() || [];
      products = surfaces.map((s) => ({
        id: s.id, label: s.label, icon: s.icon, status: s.status,
        requiredAction: s.requiredAction || s.connection?.requiredAction || null,
        frontendRoute: s.frontendRoute, navSection: s.navSection,
        module: this.modules.has(s.id) ? s.id : (s.id === "procarta" ? "products" : s.id === "awbuli" ? "connections" : "products"),
        access: this._access({ minLevel: 0 }, id).access,
        children: [
          { id: `${s.id}-open`, label: `Open ${s.label}`, kind: "action", parent: s.id, product: s.id, module: null, route: s.frontendRoute || FRONT.PRODUCTS, api: null, minLevel: 0, roles: null, elevatedRequired: false, capability: null, provider: null, tenantScope: id.tenant, auditRequired: false, access: "ALLOWED", blockedReason: null, note: s.catalogue || null, next: null },
          ...((s.api || []).map((a, i) => { const aa = this._access({ minLevel: 1 }, id); return { id: `${s.id}-api-${i}`, label: String(a.route || a), kind: "overview", parent: s.id, product: s.id, module: null, route: null, api: String(a.route || a), minLevel: 1, roles: null, elevatedRequired: false, capability: null, provider: null, tenantScope: id.tenant, auditRequired: Boolean(s.auditRequired), access: aa.access, blockedReason: aa.reason, note: null, next: null }; }))
        ]
      }));
    } catch { products = []; }

    const groups = GROUPS.map((g) => ({
      ...g, modules: modules.filter((m) => m.group === g.id).map((m) => m.id)
    })).filter((g) => g.modules.length > 0);

    return {
      success: true, version: 1, generatedAt: new Date().toISOString(),
      edition: live.edition,
      identity: { role: id.role, level: id.level, elevated: id.elevated, tenant: id.tenant },
      counts: {
        cases: live.cases.length, people: Array.isArray(live.people) ? live.people.length : 0,
        pendingInvites: live.invites, notifications: Array.isArray(live.notifs) ? live.notifs.length : 0,
        reviewNotifications: live.reviewNotifs, channels: (live.board?.rows || live.channelRows || []).length,
        capabilities: live.capabilities.length, activation: live.activation.length
      },
      groups, modules, products,
      rbac: { levels: ["PUBLIC(0)", "AUTH(1)", "OPERATOR(2)", "ADMIN(3)", "SYSTEM(4)"], accessStates: ["ALLOWED", "AUTH_REQUIRED", "ROLE_REQUIRED", "LEVEL_REQUIRED", "ELEVATION_REQUIRED"] }
    };
  }
}

export default OperationalGraph;
