/* ==========================================================================
   ADE-APEX canonical route registry  ·  v1.0.0
   Plain script: assigns window.ADE_ROUTES.
   Single source of truth for "which URL serves which surface, for which
   role, backed by which backend endpoint". Mirrors the canonical PATH_SECTION
   map in public/index.html — if that map gains an alias, add it here too.
   ========================================================================== */
(function (global) {
  "use strict";

  /* Canonical path -> section aliases (mirror of PATH_SECTION in index.html). */
  var PATH_SECTION = {
    "/home": "Home",
    "/products": "Products",
    "/procarta": "PROCARTA",
    "/product-theater": "Product Theater",
    "/try-ade": "Try ADE",
    "/how-it-works": "Architecture",
    "/architecture": "Architecture",
    "/community": "Community",
    "/pilot": "Community",
    "/join": "Community",
    "/partners": "Community",
    "/feedback": "Feedback",
    "/account": "Account",
    "/signin": "Account",
    "/workspace": "Workspace",
    "/workflows": "Workspace",
    "/workforce": "Workspace",
    "/invitations": "Workspace",
    "/ai-workers": "Workspace",
    "/knowledge": "Workspace",
    "/decisions": "Workspace",
    "/audit": "Workspace",
    "/notifications": "Workspace",
    "/settings": "Workspace",
    "/markets": "Workspace",
    "/markets/forex": "Workspace",
    "/markets/binary": "Workspace",
    "/markets/binary/regular": "Workspace",
    "/markets/binary/otc": "Workspace",
    "/gaming": "Workspace",
    "/gaming/aviator": "Workspace",
    "/sports": "Workspace",
    "/command-center": "Command Center",
    "/operations": "Command Center",
    "/operations/live": "Command Center",
    "/awbuli": "Products",
    "/eventos": "Community",
    "/connect": "Products",
    "/connect/platforms": "Products",
    "/payments": "Products",
    "/commerce": "Products",
    "/financial": "Products",
  };

  /* Static document routes served by Express (no auth to load the shell;
     data inside is role-gated per endpoint). */
  var DOCUMENTS = [
    { path: "/", file: "public/index.html", surface: "ADE public platform + workspaces", role: "public" },
    { path: "/admin", file: "public/admin/index.html", surface: "Admin control plane", role: "admin L2" },
    { path: "/founder", file: "public/founder.html", surface: "Founder control plane", role: "founder L2/L3" },
    { path: "/market-lab", file: "public/market-lab.html", surface: "Market & simulation lab", role: "public view, L2 actions" },
    { path: "/lab", file: "public/market-lab.html", surface: "Market & simulation lab (alias)", role: "public view, L2 actions" },
    { path: "/procarta-onboarding", file: "public/procarta-onboarding.html", surface: "PROCARTA onboarding", role: "public" },
  ];

  /* Frontend section -> backend source of truth (anonymous boot set first;
     role-gated rows require a session token). */
  var SECTION_SOURCES = [
    { section: "Home", endpoints: ["GET /api/v1/health", "GET /api/v1/capabilities", "GET /api/v1/products", "GET /api/v1/procarta/status", "GET /api/v1/announcements"], auth: "none" },
    { section: "Products", endpoints: ["GET /api/v1/products", "GET /api/v1/product-surface", "GET /api/v1/capabilities"], auth: "none" },
    { section: "PROCARTA", endpoints: ["POST /api/v1/intake/API", "GET /api/v1/procarta/status", "GET /api/v1/cases (auth)"], auth: "mixed" },
    { section: "Product Theater", endpoints: ["GET /api/v1/media/providers", "GET /api/v1/media/registry/stats", "POST /api/v1/media/request (auth)"], auth: "mixed" },
    { section: "Try ADE", endpoints: ["GET /api/v1/demo/scenarios", "POST /api/v1/demo/run"], auth: "none" },
    { section: "Architecture", endpoints: ["GET /api/v1/runtime", "GET /api/v1/edition", "GET /api/v1/metrics"], auth: "none" },
    { section: "Community", endpoints: ["POST /api/v1/community/intake", "GET /api/v1/community/progression", "POST /api/v1/account/accept-invitation"], auth: "mixed" },
    { section: "Feedback", endpoints: ["POST /api/v1/feedback", "GET /api/v1/feedback/stats"], auth: "none" },
    { section: "Account", endpoints: ["POST /api/v1/account/login", "POST /api/v1/account/pin", "GET /api/v1/account/session (auth)"], auth: "mixed" },
    { section: "Workspace", endpoints: ["GET /api/v1/ops/graph (auth)", "GET /api/v1/cases (auth)", "GET /api/v1/workforce (L2)", "GET /api/v1/inbox (auth)"], auth: "session" },
    { section: "Command Center", endpoints: ["GET /api/v1/events/stream (SSE)", "GET /api/v1/metrics", "GET /api/v1/admin/overview (L2)"], auth: "session" },
  ];

  /* Truthfulness boundary: provider-required vs live. The UI must render
     these states explicitly instead of inventing live results. */
  var TRUTH_STATES = {
    LIVE: "verified provider + observable result",
    PAPER: "deterministic paper path, labeled dataQuality PAPER",
    SIMULATED: "offline lexical/simulation engine, labeled",
    PROVIDER_REQUIRED: "gateway present, credentials missing — action explains how to configure",
    UNAVAILABLE: "capability absent — explicit unavailable state",
  };

  function sectionForPath(pathname) {
    var pk = String(pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
    if (PATH_SECTION[pk]) return PATH_SECTION[pk];
    if (pk.indexOf("/products/") === 0) return "Products";
    return null;
  }

  global.ADE_ROUTES = {
    version: "1.0.0",
    PATH_SECTION: PATH_SECTION,
    DOCUMENTS: DOCUMENTS,
    SECTION_SOURCES: SECTION_SOURCES,
    TRUTH_STATES: TRUTH_STATES,
    sectionForPath: sectionForPath,
  };
})(typeof window !== "undefined" ? window : globalThis);
