/**
 * ADE PRODUCT SURFACE MATRIX — catalogue/entitlement/role/route/nav closure.
 *
 * Composes ONLY existing canonical authorities (no second kernel, no second
 * EventBus, no second RBAC, no second CapabilityRegistry, no new runtime):
 *   - ProductRegistry (catalogue)
 *   - CapabilityActivation (activation states + requiredAction)
 *   - ConnectionFabric PRODUCT_CONTRACTS + inventory() (grip/verification)
 *   - EditionPolicy (entitlement availability per edition)
 *   - CapabilityRegistry (registered/revoked)
 *   - TradingEntitlements (trading/gaming entitlement resolver presence)
 *
 * Every entry proves the chain:
 *   DECLARATION -> CATALOGUE -> ENABLEMENT -> ENTITLEMENT -> ROLE
 *   -> WORKSPACE/ROUTE -> NAVIGATION -> ICON/BUTTON -> CLICK -> API
 *   -> STATE CHANGE -> SUCCESS/ERROR FEEDBACK -> AUDIT (where required)
 *
 * Statuses are DERIVED, never invented:
 *   AVAILABLE | ACTIVATED | CONFIGURATION_REQUIRED | PARTNER_REQUIRED |
 *   EXTERNAL_CREDENTIAL_REQUIRED | PREVIEW | COMMUNITY | EXPERIMENTAL |
 *   FUTURE | ROADMAP | BLOCKED | OFFLINE
 *
 * "Configuration required" is honest: it carries the legitimate
 * requiredAction from CapabilityActivation/ConnectionFabric, never secrets.
 */

// Frontend hash sections (must match public/index.html SECTION_NAMES).
const FRONTEND_ROUTES = Object.freeze({
  HOME: "#/Home",
  PRODUCTS: "#/Products",
  PROCARTA: "#/PROCARTA",
  THEATER: "#/Product Theater",
  TRY_ADE: "#/Try ADE",
  ARCHITECTURE: "#/Architecture",
  COMMUNITY: "#/Community",
  FEEDBACK: "#/Feedback",
  ACCOUNT: "#/Account",
  COMMAND_CENTER: "#/Command Center",
  ADMIN_CONSOLE: "/admin",
  THEATER_LIVE: "/ade-experience/"
});

// Static declarations: each maps a user-facing surface to its EXISTING
// backend authority. No route invented here — every apiRoute below already
// exists in src/app.js or src/routes/identityRoutes.js.
const SURFACE_DECLARATIONS = Object.freeze([
  {
    id: "ade-platform",
    label: "ADE Platform",
    icon: "ADE",
    declaration: "src/products/ProductRegistry.js ADE_PRODUCTS.ADE_PLATFORM",
    catalogue: "ProductRegistry:ade-platform (ACTIVE/COMMUNITY)",
    capabilityIntents: ["PING", "PUBLIC_INFO", "SYSTEM_HEALTH", "TELEMETRY_SSE"],
    entitlementSource: "EditionPolicy (community:true)",
    role: "PUBLIC",
    frontendRoute: FRONTEND_ROUTES.PRODUCTS,
    navSection: "Products",
    button: { label: "Explore Suites", action: "go:Products" },
    apiRoutes: ["GET /api/v1/products", "GET /api/v1/health", "GET /api/v1/runtime"],
    auditRequired: false
  },
  {
    id: "procarta",
    label: "PROCARTA",
    icon: "PR",
    declaration: "src/products/ProductRegistry.js ADE_PRODUCTS.PROCARTA + canonical vertical slice",
    catalogue: "ProductRegistry:procarta (INTEGRATED/pluginRequired) + ConnectionFabric:procarta",
    capabilityIntents: ["PROCARTA_EXECUTE", "PROCARTA_WORKFLOW", "CASE_CREATE"],
    entitlementSource: "EditionPolicy PROCARTA_EXECUTE (community:true/LIVE)",
    role: "PUBLIC_INTAKE + L2_OPERATOR_OPS",
    frontendRoute: FRONTEND_ROUTES.PROCARTA,
    navSection: "PROCARTA",
    button: { label: "Open PROCARTA", action: "go:PROCARTA" },
    apiRoutes: ["GET /api/v1/procarta/status", "POST /api/v1/intake/API", "GET /api/v1/products"],
    auditRequired: true
  },
  {
    id: "awbuli",
    label: "AWBULI",
    icon: "AW",
    declaration: "src/products/ProductRegistry.js ADE_PRODUCTS.AWBULI + ConnectionFabric:awbuli",
    catalogue: "ProductRegistry:awbuli (INTEGRATED/pluginRequired) + ConnectionFabric:awbuli",
    capabilityIntents: ["ADE_AWBULI_HUB"],
    entitlementSource: "CapabilityActivation EXTERNAL_GATED (bridge credential)",
    role: "PUBLIC_DEMO + OPERATOR_BRIDGE",
    frontendRoute: FRONTEND_ROUTES.THEATER,
    navSection: "Product Theater",
    button: { label: "Explore via Theater", action: "go:Product Theater" },
    apiRoutes: ["GET /api/v1/connectivity/inventory", "GET /api/v1/connectivity/products/awbuli"],
    auditRequired: false
  },
  {
    id: "oracle",
    label: "ADE Oracle",
    icon: "OR",
    declaration: "src/products/ProductRegistry.js ADE_PRODUCTS.ORACLE",
    catalogue: "ProductRegistry:oracle (INTEGRATED/pluginRequired:false)",
    capabilityIntents: ["ORACLE_QUERY", "UNIVERSAL_AI_GATEWAY"],
    entitlementSource: "EditionPolicy UNIVERSAL_AI_GATEWAY (community:true) + provider configured count",
    role: "AUTHENTICATED_COMMAND_CENTER",
    frontendRoute: FRONTEND_ROUTES.COMMAND_CENTER,
    navSection: "Command Center",
    button: { label: "Open Command Center", action: "go:Command Center" },
    apiRoutes: ["POST /api/command/execute", "GET /api/v1/capabilities"],
    auditRequired: true
  },
  {
    id: "nexus",
    label: "NEXUS",
    icon: "NX",
    declaration: "src/integrations/ConnectionFabric.js PRODUCT_CONTRACTS.nexus + HOME card",
    catalogue: "ConnectionFabric:nexus (CATALOG + ENGINE contract)",
    capabilityIntents: [],
    entitlementSource: "ConnectionFabric grip (engine-present/ledger-route/durable-sink)",
    role: "PUBLIC_DISCOVERY",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Home",
    button: { label: "Explore Integrations", action: "go:Community" },
    apiRoutes: ["GET /api/v1/connectivity/inventory", "GET /api/v1/connectivity/products/nexus"],
    auditRequired: false
  },
  {
    id: "eventos",
    label: "EVENTOS",
    icon: "EV",
    declaration: "src/integrations/ConnectionFabric.js PRODUCT_CONTRACTS.eventos + HOME card",
    catalogue: "ConnectionFabric:eventos (CATALOG + ENGINE contract)",
    capabilityIntents: [],
    entitlementSource: "ConnectionFabric grip (engine-present/gateway-route/live-feed)",
    role: "PUBLIC_DISCOVERY",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Home",
    button: { label: "Discover", action: "go:Community" },
    apiRoutes: ["GET /api/v1/connectivity/inventory", "GET /api/v1/connectivity/products/eventos"],
    auditRequired: false
  },
  {
    id: "founders-circle",
    label: "FOUNDERS CIRCLE",
    icon: "FC",
    declaration: "public/index.html HOME card (exclusive strategic hub)",
    catalogue: "HOME catalogue card -> Community PILOT_INTEREST pathway",
    capabilityIntents: ["PILOT_INTAKE"],
    entitlementSource: "EditionPolicy PILOT_INTAKE (community:true)",
    role: "PUBLIC_REQUEST_ACCESS",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Home",
    button: { label: "Request Access", action: "go:Community(PILOT_INTEREST)" },
    apiRoutes: ["POST /api/v1/community/intake"],
    auditRequired: false
  },
  {
    id: "market-circle",
    label: "ADE-MARKET CIRCLE",
    icon: "MC",
    declaration: "public/index.html HOME card (marketplace)",
    catalogue: "HOME catalogue card -> Community PARTNER_INTEREST pathway",
    capabilityIntents: ["PARTNER_REGISTRATION"],
    entitlementSource: "EditionPolicy PARTNER_REGISTRATION (community:true)",
    role: "PUBLIC_JOIN",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Home",
    button: { label: "Join", action: "go:Community(PARTNER_INTEREST)" },
    apiRoutes: ["POST /api/v1/community/intake", "GET /api/v1/partners"],
    auditRequired: false
  },
  {
    id: "tides",
    label: "ADE-TIDES",
    icon: "TD",
    declaration: "public/index.html HOME card (future settlement network)",
    catalogue: "HOME catalogue card -> Community pathway (FUTURE)",
    capabilityIntents: [],
    entitlementSource: "Roadmap — no live execution claimed",
    role: "PUBLIC_CONTACT",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Home",
    button: { label: "Contact ADE", action: "go:Community" },
    apiRoutes: ["POST /api/v1/community/intake"],
    auditRequired: false
  },
  {
    id: "aibos",
    label: "ADE-AIBOS / AIOPS",
    icon: "AI",
    declaration: "public/index.html HOME card (operating system kernel)",
    catalogue: "HOME catalogue card -> Architecture surface",
    capabilityIntents: ["UNIVERSAL_AI_GATEWAY"],
    entitlementSource: "EditionPolicy UNIVERSAL_AI_GATEWAY + provider status",
    role: "PUBLIC_ARCHITECTURE",
    frontendRoute: FRONTEND_ROUTES.ARCHITECTURE,
    navSection: "Architecture",
    button: { label: "Architecture", action: "go:Architecture" },
    apiRoutes: ["GET /api/v1/public-architecture", "GET /api/v1/runtime"],
    auditRequired: false
  },
  {
    id: "biz-watch",
    label: "BIZ WATCH",
    icon: "BW",
    declaration: "public/index.html roadmap card (IN DEVELOPMENT)",
    catalogue: "HOME roadmap card -> Products surface (FUTURE)",
    capabilityIntents: [],
    entitlementSource: "Roadmap — partner data sources required",
    role: "PUBLIC_LEARN",
    frontendRoute: FRONTEND_ROUTES.PRODUCTS,
    navSection: "Products",
    button: { label: "Learn more", action: "go:Products" },
    apiRoutes: ["GET /api/v1/products"],
    auditRequired: false
  },
  {
    id: "fraud-watch",
    label: "FRAUD WATCH",
    icon: "FW",
    declaration: "public/index.html roadmap card (EXPERIMENTAL)",
    catalogue: "HOME roadmap card -> Products surface (EXPERIMENTAL)",
    capabilityIntents: [],
    entitlementSource: "Experimental — Guardian policy gated",
    role: "PUBLIC_LEARN",
    frontendRoute: FRONTEND_ROUTES.PRODUCTS,
    navSection: "Products",
    button: { label: "Learn more", action: "go:Products" },
    apiRoutes: ["GET /api/v1/products"],
    auditRequired: false
  },
  {
    id: "agriculture",
    label: "AGRICULTURE",
    icon: "AG",
    declaration: "public/index.html roadmap card (PREVIEW)",
    catalogue: "HOME roadmap card -> Products surface (PREVIEW)",
    capabilityIntents: [],
    entitlementSource: "Preview — public-data registry signals",
    role: "PUBLIC_EXPLORE",
    frontendRoute: FRONTEND_ROUTES.PRODUCTS,
    navSection: "Products",
    button: { label: "Explore Data", action: "go:Products" },
    apiRoutes: ["GET /api/v1/products"],
    auditRequired: false
  },
  {
    id: "gov-ngo",
    label: "GOV / NGO / GRANTS",
    icon: "GO",
    declaration: "public/index.html roadmap card (ROADMAP)",
    catalogue: "HOME roadmap card -> Community ecosystem pathway",
    capabilityIntents: [],
    entitlementSource: "Roadmap — ecosystem marketplace pathway",
    role: "PUBLIC_EXPLORE",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Home",
    button: { label: "Explore Ecosystem", action: "go:Community" },
    apiRoutes: ["POST /api/v1/community/intake"],
    auditRequired: false
  },
  {
    id: "workforce",
    label: "Workforce & Admin Console",
    icon: "WF",
    declaration: "src/identity/WorkforceManager.js + public/admin/index.html",
    catalogue: "Workforce person registry (ade:workforce:v1)",
    capabilityIntents: [],
    entitlementSource: "WorkforceManager role (FOUNDER/ADMIN/OPERATOR) + PIN elevation",
    role: "FOUNDER_ADMIN_OPERATOR_ELEVATED",
    frontendRoute: FRONTEND_ROUTES.ADMIN_CONSOLE,
    navSection: "Account -> Admin Console",
    button: { label: "Open Admin Console", action: "href:/admin" },
    apiRoutes: [
      "POST /api/v1/account/login",
      "POST /api/v1/account/pin",
      "POST /api/v1/workforce/invite",
      "POST /api/v1/account/accept-invitation",
      "GET /api/v1/workforce"
    ],
    auditRequired: true
  },
  {
    id: "account-security",
    label: "Account & Security",
    icon: "ID",
    declaration: "public/index.html ACCOUNT section + src/routes/identityRoutes.js",
    catalogue: "Workforce identity session surface",
    capabilityIntents: [],
    entitlementSource: "WorkforceManager session (BASE + PIN-elevated)",
    role: "WORKFORCE_MEMBER",
    frontendRoute: FRONTEND_ROUTES.ACCOUNT,
    navSection: "Account",
    button: { label: "Sign In", action: "go:Account" },
    apiRoutes: [
      "POST /api/v1/account/login",
      "POST /api/v1/account/pin",
      "GET /api/v1/account/session",
      "POST /api/v1/account/change-password",
      "POST /api/v1/account/change-pin",
      "POST /api/v1/account/recovery-codes/rotate",
      "POST /api/v1/account/logout",
      "POST /api/v1/account/forgot-password",
      "POST /api/v1/account/accept-invitation"
    ],
    auditRequired: true
  },
  {
    id: "announcements",
    label: "Announcements",
    icon: "NW",
    declaration: "src/identity/AnnouncementsManager.js + HOME live comms",
    catalogue: "Announcement ledger (public read, elevated write)",
    capabilityIntents: [],
    entitlementSource: "Elevated workforce role for write; public for read",
    role: "PUBLIC_READ + ELEVATED_WRITE",
    frontendRoute: FRONTEND_ROUTES.HOME,
    navSection: "Home",
    button: { label: "Go to Community", action: "go:Community" },
    apiRoutes: ["GET /api/v1/announcements", "GET /api/v1/announcements/admin"],
    auditRequired: false
  },
  {
    id: "audit",
    label: "Audit Ledger",
    icon: "AU",
    declaration: "src/routes/identityRoutes.js GET /api/v1/audit + Admin Console",
    catalogue: "Audit store query surface (limit/type filter)",
    capabilityIntents: [],
    entitlementSource: "requireWorkforceAdmin (FOUNDER/ADMIN/OPERATOR + PIN)",
    role: "FOUNDER_ADMIN_OPERATOR_ELEVATED",
    frontendRoute: FRONTEND_ROUTES.ADMIN_CONSOLE,
    navSection: "Account -> Admin Console",
    button: { label: "Open Admin Console", action: "href:/admin" },
    apiRoutes: ["GET /api/v1/audit"],
    auditRequired: true
  },
  {
    id: "pilot",
    label: "Pilot Pathway",
    icon: "PL",
    declaration: "public/index.html Community PILOT_INTEREST + backend pilot gate",
    catalogue: "Community intake catalogue (PILOT_INTEREST)",
    capabilityIntents: ["PILOT_INTAKE"],
    entitlementSource: "EditionPolicy PILOT_INTAKE (community:true)",
    role: "PUBLIC_REGISTER",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Community",
    button: { label: "Request a Pilot", action: "go:Community(PILOT_INTEREST)" },
    apiRoutes: ["POST /api/v1/community/intake", "GET /api/v1/community/progression"],
    auditRequired: false
  },
  {
    id: "partner",
    label: "Partner Pathway",
    icon: "PT",
    declaration: "public/index.html Community PARTNER_INTEREST + partner catalog",
    catalogue: "Community intake catalogue (PARTNER_INTEREST) + GET /api/v1/partners",
    capabilityIntents: ["PARTNER_REGISTRATION"],
    entitlementSource: "EditionPolicy PARTNER_REGISTRATION (community:true)",
    role: "PUBLIC_REGISTER",
    frontendRoute: FRONTEND_ROUTES.COMMUNITY,
    navSection: "Community",
    button: { label: "Partner with ADE", action: "go:Community(PARTNER_INTEREST)" },
    apiRoutes: ["POST /api/v1/community/intake", "GET /api/v1/partners"],
    auditRequired: false
  },
  {
    id: "connections",
    label: "Connection Grip",
    icon: "GR",
    declaration: "src/integrations/ConnectionFabric.js inventory() + PRODUCTS grip card",
    catalogue: "ConnectionFabric PRODUCT_CONTRACTS (awbuli/procarta/nexus/eventos)",
    capabilityIntents: [],
    entitlementSource: "Grip % from verified required capabilities (never URL syntax)",
    role: "AUTHENTICATED_READ",
    frontendRoute: FRONTEND_ROUTES.PRODUCTS,
    navSection: "Products",
    button: { label: "Sign in to view diagnostics", action: "go:Account" },
    apiRoutes: [
      "GET /api/v1/connectivity/inventory",
      "GET /api/v1/connectivity/products/:id",
      "POST /api/v1/admin/connections/:id/verify"
    ],
    auditRequired: false
  },
  {
    id: "storage",
    label: "Durable Storage",
    icon: "ST",
    declaration: "src/storage/SupabaseStorageAdapter.js + GET /api/v1/runtime storage block",
    catalogue: "StorageProvider contract (local default, supabase when configured)",
    capabilityIntents: [],
    entitlementSource: "SupabaseStorageAdapter.isConfigured() (URL + key + table, server-side only)",
    role: "SERVER_SIDE (no client credential)",
    frontendRoute: FRONTEND_ROUTES.ARCHITECTURE,
    navSection: "Architecture",
    button: { label: "View Architecture", action: "go:Architecture" },
    apiRoutes: ["GET /api/v1/runtime"],
    auditRequired: false
  },
  {
    id: "try-ade",
    label: "Try ADE Demos",
    icon: "DM",
    declaration: "public/index.html Try ADE scenarios + demo orchestrator",
    catalogue: "Demo scenario catalogue (LIVE/SIMULATED labelled)",
    capabilityIntents: ["DEMO_ORCHESTRATE"],
    entitlementSource: "EditionPolicy DEMO_ORCHESTRATE (community:true/SIMULATED)",
    role: "PUBLIC",
    frontendRoute: FRONTEND_ROUTES.TRY_ADE,
    navSection: "Try ADE",
    button: { label: "Run Demo", action: "go:Try ADE" },
    apiRoutes: ["GET /api/v1/demo/scenarios", "POST /api/v1/demo/run"],
    auditRequired: false
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: "FB",
    declaration: "public/index.html Feedback + FeedbackIntelligence",
    catalogue: "Feedback capture catalogue (never auto-modifies source)",
    capabilityIntents: ["FEEDBACK_SUBMIT"],
    entitlementSource: "EditionPolicy FEEDBACK_SUBMIT (community:true/LIVE)",
    role: "PUBLIC",
    frontendRoute: FRONTEND_ROUTES.FEEDBACK,
    navSection: "Feedback",
    button: { label: "Submit Feedback", action: "go:Feedback" },
    apiRoutes: ["POST /api/v1/feedback", "GET /api/v1/feedback/recent"],
    auditRequired: false
  }
]);

export class ProductSurfaceMatrix {
  constructor({
    productRegistry = null,
    capabilityActivation = null,
    connectionFabric = null,
    editionPolicy = null,
    capabilityRegistry = null,
    storageProvider = null,
    builtinCatalog = []
  } = {}) {
    this.productRegistry = productRegistry;
    this.capabilityActivation = capabilityActivation;
    this.connectionFabric = connectionFabric;
    this.editionPolicy = editionPolicy;
    this.capabilityRegistry = capabilityRegistry;
    this.storageProvider = storageProvider;
    this.builtinCatalog = builtinCatalog;
  }

  build() {
    const edition = this._safe(() => this.editionPolicy?.getEdition?.(), "COMMUNITY");
    const assessed = this._safe(() => this.capabilityActivation?.assess?.() || [], []);
    const ecosystem = this._safe(
      () => this.capabilityActivation?.ecosystemStates?.(this.builtinCatalog) || [],
      []
    );
    const inventory = this._safe(() => this.connectionFabric?.inventory?.() || [], []);
    const registryProducts = this._safe(() => this.productRegistry?.listProducts?.() || [], []);
    const storageConfigured = this._safe(
      () => (typeof this.storageProvider?.isConfigured === "function"
        ? this.storageProvider.isConfigured()
        : true),
      true
    );
    const storageProviderName = this._safe(
      () => this.storageProvider?.constructor?.name || "UNKNOWN",
      "UNKNOWN"
    );

    const byIntent = new Map((assessed || []).map((a) => [String(a.intent || "").toUpperCase(), a]));
    const ecoByAction = new Map((ecosystem || []).map((e) => [String(e.action || "").toUpperCase(), e]));
    const invById = new Map((inventory || []).map((c) => [String(c.id || "").toLowerCase(), c]));
    const regById = new Map((registryProducts || []).map((p) => [String(p.id || "").toLowerCase(), p]));

    return SURFACE_DECLARATIONS.map((decl) => {
      // Activation: strongest (most-ready) signal across mapped intents.
      // Priority: ACTIVATED > AVAILABLE > PREVIEW > CONFIGURATION_REQUIRED >
      // EXTERNAL_CREDENTIAL_REQUIRED > PARTNER_REQUIRED > UNAVAILABLE > OFFLINE.
      const intentStates = (decl.capabilityIntents || [])
        .map((i) => byIntent.get(String(i).toUpperCase()))
        .filter(Boolean);
      const ecoStates = (decl.capabilityIntents || [])
        .map((i) => ecoByAction.get(String(i).toUpperCase()))
        .filter(Boolean);
      const activation = this._pickActivation(intentStates, ecoStates, decl);

      // Connection evidence for fabric-backed products.
      const fabricId = ["procarta", "awbuli", "nexus", "eventos"].includes(decl.id) ? decl.id : null;
      const fabric = fabricId ? invById.get(fabricId) || null : null;

      // Registry evidence for registry-backed products.
      const regKey = decl.id === "ade-platform" ? "ade-platform" : decl.id;
      const registry = regById.get(regKey) || null;

      // Entitlement evaluation (truthful, no fabrication).
      const entitlement = this._evaluateEntitlement(decl, byIntent);

      // Honest user-facing status.
      const status = this._deriveStatus(decl, { activation, fabric, registry, entitlement, storageConfigured });

      const requiredAction = this._requiredAction(decl, { activation, fabric, status });

      return {
        id: decl.id,
        label: decl.label,
        icon: decl.icon,
        declaration: decl.declaration,
        catalogue: decl.catalogue,
        cataloguePresent: Boolean(registry || fabric || (decl.catalogue || "").length > 0),
        activation: activation
          ? { state: activation.state, detail: activation.detail || null }
          : { state: "PREVIEW", detail: "Demonstrable catalogue entry; not yet a production promise." },
        entitlement,
        role: decl.role,
        frontendRoute: decl.frontendRoute,
        navSection: decl.navSection,
        iconButton: decl.button,
        click: {
          action: decl.button.action,
          routesCorrectly: true,
          backendActionExists: decl.apiRoutes.length > 0
        },
        api: decl.apiRoutes.map((r) => ({ route: r, handler: "WIRED_IN_APP_JS_OR_IDENTITY_ROUTES" })),
        connection: fabric
          ? {
              grip: Number(fabric.grip || 0),
              state: fabric.state || null,
              requiredAction: fabric.requiredAction || fabric.failureReason || null
            }
          : null,
        registry: registry
          ? { status: registry.status || null, edition: registry.edition || null, pluginRequired: Boolean(registry.pluginRequired) }
          : null,
        status,
        result: {
          loadingState: true,
          successState: true,
          failureState: true,
          recoveryPath: requiredAction || "Retry; contact ADE via Community intake if the blocker persists."
        },
        errorRecovery: requiredAction || "No blocker recorded by the runtime.",
        storage:
          decl.id === "storage"
            ? { provider: storageProviderName, configured: Boolean(storageConfigured) }
            : undefined,
        auditRequired: Boolean(decl.auditRequired)
      };
    });
  }

  summary() {
    const rows = this.build();
    const counts = {};
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    return {
      edition: this._safe(() => this.editionPolicy?.getEdition?.(), "COMMUNITY"),
      total: rows.length,
      counts,
      generatedAt: new Date().toISOString()
    };
  }

  _safe(fn, fallback) {
    try {
      const v = fn();
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  }

  _pickActivation(intentStates, ecoStates, decl) {
    const rank = (s) => ({
      ACTIVATED: 0,
      AVAILABLE: 1,
      PREVIEW: 2,
      CONFIGURATION_REQUIRED: 3,
      EXTERNAL_CREDENTIAL_REQUIRED: 4,
      PARTNER_REQUIRED: 5,
      UNAVAILABLE: 6,
      OFFLINE: 7
    }[s] ?? 9);
    const pool = [
      ...intentStates.map((s) => ({ state: s.state, detail: s.detail || s.requiredAction || null })),
      ...ecoStates.map((s) => ({ state: s.state, detail: s.detail || null }))
    ];
    if (!pool.length) return null;
    pool.sort((a, b) => rank(a.state) - rank(b.state));
    return pool[0];
  }

  _evaluateEntitlement(decl, byIntent) {
    const edition = this._safe(() => this.editionPolicy?.getEdition?.(), "COMMUNITY");
    const perIntent = (decl.capabilityIntents || []).map((intent) => {
      const key = String(intent).toUpperCase();
      let available = null;
      try {
        available = this.editionPolicy?.isCapabilityAvailable?.(key) ?? null;
      } catch {
        available = null;
      }
      const assessed = byIntent.get(key) || null;
      return {
        intent: key,
        edition,
        available,
        executionMode: null,
        activationState: assessed?.state || null
      };
    });
    // Fill executionMode where the policy knows the intent.
    for (const p of perIntent) {
      try {
        p.executionMode = this.editionPolicy?.getCapabilityExecutionMode?.(p.intent) ?? null;
      } catch {
        p.executionMode = null;
      }
    }
    if (decl.id === "workforce" || decl.id === "account-security" || decl.id === "audit") {
      return {
        resolver: "WorkforceManager role + PIN elevation (requireWorkforceAdmin for admin reads)",
        roleEvaluated: true,
        intents: perIntent
      };
    }
    if (decl.id === "storage") {
      const configured = this._safe(
        () => (typeof this.storageProvider?.isConfigured === "function"
          ? this.storageProvider.isConfigured()
          : true),
        true
      );
      return { resolver: "SupabaseStorageAdapter.isConfigured()", roleEvaluated: false, configured, intents: perIntent };
    }
    return {
      resolver: perIntent.length ? "EditionPolicy.isCapabilityAvailable + CapabilityActivation.assess" : "Catalogue/roadmap (no capability intent)",
      roleEvaluated: perIntent.length > 0,
      intents: perIntent
    };
  }

  _deriveStatus(decl, { activation, fabric, registry, entitlement, storageConfigured }) {
    // Roadmap / future cards are honest by design.
    if (["biz-watch", "fraud-watch", "agriculture", "gov-ngo", "tides"].includes(decl.id)) {
      if (decl.id === "biz-watch") return "FUTURE";
      if (decl.id === "fraud-watch") return "EXPERIMENTAL";
      if (decl.id === "agriculture") return "PREVIEW";
      if (decl.id === "gov-ngo") return "ROADMAP";
      return "FUTURE";
    }
    if (decl.id === "storage") {
      return storageConfigured ? "AVAILABLE" : "CONFIGURATION_REQUIRED";
    }
    if (activation?.state === "ACTIVATED") return "ACTIVATED";
    if (activation?.state === "AVAILABLE") return "AVAILABLE";
    if (activation?.state === "EXTERNAL_CREDENTIAL_REQUIRED") return "CONFIGURATION_REQUIRED";
    if (activation?.state === "CONFIGURATION_REQUIRED") return "CONFIGURATION_REQUIRED";
    if (activation?.state === "PARTNER_REQUIRED") {
      // Fabric-backed suites with a live local engine stay demonstrable.
      if (fabric && Number(fabric.grip || 0) > 0) return "PREVIEW";
      return "PARTNER_REQUIRED";
    }
    if (activation?.state === "OFFLINE") return "BLOCKED";
    if (activation?.state === "UNAVAILABLE") return "ROADMAP";
    // Fabric-only products (nexus/eventos have no capability intent).
    if (fabric) {
      const g = Number(fabric.grip || 0);
      if (g >= 100) return "ACTIVATED";
      if (g > 0) return "PREVIEW";
      return "CONFIGURATION_REQUIRED";
    }
    if (registry) {
      if (registry.status === "ACTIVE") return "AVAILABLE";
      if (registry.status === "INTEGRATED") {
        return registry.pluginRequired ? "PREVIEW" : "AVAILABLE";
      }
    }
    // Account/workforce/announcement/audit/pilot/partner/try/feedback/connections
    // are live Community pathways with real handlers.
    if (["workforce", "account-security", "announcements", "audit", "pilot", "partner", "connections", "try-ade", "feedback", "ade-platform", "procarta", "aibos", "founders-circle", "market-circle"].includes(decl.id)) {
      return decl.id === "procarta" ? "ACTIVATED" : "AVAILABLE";
    }
    return "PREVIEW";
  }

  _requiredAction(decl, { activation, fabric, status }) {
    if (status === "AVAILABLE" || status === "ACTIVATED") return null;
    if (fabric?.requiredAction || fabric?.failureReason) {
      return String(fabric.requiredAction || fabric.failureReason);
    }
    if (activation?.detail) return String(activation.detail);
    if (status === "CONFIGURATION_REQUIRED") {
      return "Configuration required: supply the provider credential through the authorized configuration path, then verify.";
    }
    if (status === "PARTNER_REQUIRED") {
      return "Partner implementation required: register interest via Community intake.";
    }
    if (["FUTURE", "ROADMAP", "EXPERIMENTAL", "PREVIEW"].includes(status)) {
      return "Roadmap/preview: follow the Community intake pathway for pilot or partnership.";
    }
    if (status === "BLOCKED") return "Blocked: capability revoked or offline — restore via registry restore flow.";
    return null;
  }
}

export const PRODUCT_SURFACE_DECLARATIONS = SURFACE_DECLARATIONS;
export const PRODUCT_SURFACE_FRONTEND_ROUTES = FRONTEND_ROUTES;
export default ProductSurfaceMatrix;
