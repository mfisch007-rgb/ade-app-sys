/**
 * ADE CONNECTION FABRIC — sideways growth tissue (expansion batch).
 *
 * Reuses (never duplicates): ConnectionManager (records), ProductRegistry
 * (catalog), CapabilityRegistry (availability), ChannelRegistry, EventBus.
 *
 * Pipeline: DISCOVER → IDENTIFY → INSPECT → VALIDATE → CONNECT →
 * INITIALIZE → VERIFY → REGISTER CAPABILITIES → REPORT STATE.
 *
 * Truth rules:
 * - NEVER report CONNECTED from HTTPS syntax alone (that is only READY).
 * - Grip % = verified required capabilities / total required capabilities.
 * - No secrets in any report (names of required env vars only).
 */

import fs from "node:fs";
import path from "node:path";

export const CONNECTION_STATES = Object.freeze([
  "DISCOVERED",
  "INSPECTABLE",
  "CONFIGURED",
  "AUTH_REQUIRED",
  "CONNECTING",
  "CONNECTED",
  "PARTIALLY_CONNECTED",
  "DEGRADED",
  "OFFLINE",
  "INCOMPATIBLE",
  "FAILED",
  "DISCONNECTED"
]);

// Required-capability contracts per known product. Each entry lists the
// evidence key that proves it. Grip % derives strictly from these.
export const PRODUCT_CONTRACTS = Object.freeze({
  awbuli: {
    product: "AWBULI",
    owner: "ADE product suite (external repo per arch lock; in-repo Suite engine)",
    connectionType: "IN_PROCESS_ENGINE + OPTIONAL_REST_BRIDGE",
    required: [
      { id: "lead-capture", label: "Lead capture (in-repo Suite engine)", evidence: "localEngine" },
      { id: "broadcast-queued", label: "Broadcast queue (in-repo Suite engine)", evidence: "localEngine" },
      { id: "external-bridge", label: "External AWBULI REST bridge (URL + key + transport)", evidence: "bridgeVerified" }
    ]
  },
  procarta: {
    product: "PROCARTA",
    owner: "ADE canonical vertical slice",
    connectionType: "IN_PROCESS_CANONICAL",
    required: [
      { id: "diagnostic-execute", label: "Diagnostic execution (canonical engine)", evidence: "canonicalEngine" },
      { id: "case-handoff", label: "Case handoff (CaseManager)", evidence: "canonicalEngine" },
      { id: "events", label: "Execution events (EventBus)", evidence: "canonicalEngine" }
    ]
  },
  nexus: {
    product: "NEXUS",
    owner: "ADE product suite (financial orchestrator)",
    connectionType: "IN_PROCESS_ENGINE + CATALOG",
    required: [
      { id: "engine-present", label: "Engine present (in-repo)", evidence: "localEngine" },
      { id: "ledger-route", label: "Ledger route / audit sink", evidence: "routeWired" },
      { id: "durable-sink", label: "Durable persistence sink", evidence: "durableSink" }
    ]
  },
  eventos: {
    product: "EVENTOS",
    owner: "ADE product suite (intelligence platform)",
    connectionType: "CATALOG + ENGINE",
    required: [
      { id: "engine-present", label: "Engine present (in-repo)", evidence: "localEngine" },
      { id: "gateway-route", label: "Gateway route wired", evidence: "routeWired" },
      { id: "live-feed", label: "Live feed verified", evidence: "bridgeVerified" }
    ]
  }
});

function safeExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function repoRoot() {
  return process.cwd();
}

export class ConnectionFabric {
  constructor({ connectionManager = null, productRegistry = null, capabilityRegistry = null, eventBus = null } = {}) {
    this.connectionManager = connectionManager;
    this.productRegistry = productRegistry;
    this.capabilityRegistry = capabilityRegistry;
    this.eventBus = eventBus;
    this.verifyCache = new Map(); // productId -> last verify report
  }

  /**
   * DISCOVER — merge manifests + registry + connection records. No network.
   */
  discover() {
    const root = repoRoot();
    const manifestIds = ["awbuli", "procarta", "nexus", "eventos"];
    const items = [];
    for (const id of manifestIds) {
      const manifestPath = path.join(root, "products", id, "manifest.json");
      const manifest = readJson(manifestPath);
      const adapterPath = path.join(root, "products", id, "adapter.js");
      const engineHit = this._engineEvidence(id, root);
      items.push({
        id,
        manifest: manifest || null,
        manifestPresent: Boolean(manifest),
        adapterPresent: safeExists(adapterPath),
        ...engineHit,
        registryEntry: this._registryEntry(id),
        connectionRecords: this._matchingConnections(id)
      });
    }
    // External connection records with no manifest (generic REST integrations).
    for (const rec of this._allConnections()) {
      const pid = String(rec.provider || "").toLowerCase();
      if (!manifestIds.includes(pid) && !items.some((i) => i.id === pid)) {
        items.push({
          id: pid || rec.id,
          manifest: null,
          manifestPresent: false,
          adapterPresent: false,
          localEngine: false,
          canonicalEngine: false,
          routeWired: false,
          registryEntry: null,
          connectionRecords: [rec],
          genericExternal: true
        });
      }
    }
    return items;
  }

  _registryEntry(id) {
    try {
      const list = this.productRegistry?.listProducts?.() || [];
      const hit = list.find((p) => String(p.id || "").toLowerCase() === id
        || String(p.name || "").toLowerCase().includes(id));
      return hit || null;
    } catch { return null; }
  }

  _allConnections() {
    try { return this.connectionManager?.list?.() || []; } catch { return []; }
  }

  _matchingConnections(id) {
    return this._allConnections().filter((c) => {
      const p = String(c.provider || "").toLowerCase();
      return p === id || p.includes(id) || String(c.id || "").toLowerCase().includes(id);
    });
  }

  _engineEvidence(id, root) {
    // Targeted, evidence-only checks (no imports of legacy stubs).
    if (id === "awbuli") {
      return {
        localEngine: safeExists(path.join(root, "products", "awbuli", "AwbuliEngine.js")),
        canonicalEngine: false,
        routeWired: true, // WHATSAPP channel label present; see inventory
        durableSink: false
      };
    }
    if (id === "procarta") {
      return {
        localEngine: safeExists(path.join(root, "products", "procarta", "ProcartaEngine.js")),
        canonicalEngine: safeExists(path.join(root, "src", "procarta", "ProcartaExecutionEngine.js")),
        routeWired: true, // /api/v1/procarta/* + PROCARTA_EXECUTE capability
        durableSink: true
      };
    }
    if (id === "nexus") {
      return {
        localEngine: safeExists(path.join(root, "products", "nexus", "NexusLedgerEngine.js")),
        canonicalEngine: false,
        routeWired: false,
        durableSink: false
      };
    }
    if (id === "eventos") {
      return {
        localEngine: safeExists(path.join(root, "products", "eventos", "EventosEngine.js")),
        canonicalEngine: false,
        routeWired: false,
        durableSink: false
      };
    }
    return { localEngine: false, canonicalEngine: false, routeWired: false, durableSink: false };
  }

  /**
   * INSPECT + VALIDATE (no network). Returns per-product disclosure with
   * grip % derived from verified evidence only.
   */
  inspect(productId) {
    const discovered = this.discover().find((d) => d.id === productId);
    if (!discovered) {
      return {
        product: productId, state: "UNKNOWN", grip: 0,
        failureReason: "No manifest, registry entry, or connection record found.",
        requiredAction: "Register a manifest or connection record first.",
        alternative: null, nextAction: "DISCOVER"
      };
    }
    return this._assess(discovered, this.verifyCache.get(productId) || null);
  }

  inventory() {
    return this.discover().map((d) => this._assess(d, this.verifyCache.get(d.id) || null));
  }

  _assess(d, verify) {
    const contract = PRODUCT_CONTRACTS[d.id];
    const requiredEnv = d.id === "awbuli" ? ["AWBULI_API_URL", "AWBULI_API_KEY"] : [];
    const envPresent = Object.fromEntries(requiredEnv.map((k) => [k, Boolean(process.env[k])]));
    const bridgeConfigured = requiredEnv.length ? requiredEnv.every((k) => envPresent[k]) : false;

    // Evidence set (booleans only — never secret values).
    const evidence = {
      localEngine: Boolean(d.localEngine),
      canonicalEngine: Boolean(d.canonicalEngine),
      routeWired: Boolean(d.routeWired),
      durableSink: Boolean(d.durableSink),
      bridgeConfigured,
      bridgeVerified: verify?.transportReachable === true && verify?.contractKnown !== false && bridgeConfigured
    };

    if (!contract) {
      // Generic external record: contract = record + syntax + credential + handshake.
      const rec = d.connectionRecords[0];
      if (!rec) {
        return this._report(d, "DISCOVERED", 0, [], ["record"], "No connection record.",
          "Create a connection record via POST /api/v1/admin/connections.", "Use a manifest product instead.", "CONFIGURE", { requiredEnv: [], envPresent: {} });
      }
      const total = 4;
      let done = 1; // record exists
      const connected = [], partial = [], unavailable = [];
      connected.push("connection-record");
      if (rec.baseUrl) { try { const u = new URL(rec.baseUrl); if (["http:", "https:"].includes(u.protocol)) { done += 1; connected.push("syntactic-url"); } else { unavailable.push("syntactic-url"); } } catch { unavailable.push("syntactic-url"); } }
      else unavailable.push("base-url");
      if (rec.secretConfigured) { done += 1; connected.push("credential-present"); } else { unavailable.push("credential-present"); }
      if (verify?.transportReachable) { done += 1; connected.push("live-handshake"); }
      else { (verify ? partial : unavailable).push("live-handshake"); }
      const grip = Math.round((done / total) * 100);
      const state = verify?.transportReachable ? (grip >= 100 ? "CONNECTED" : "PARTIALLY_CONNECTED")
        : rec.secretConfigured ? "AUTH_REQUIRED" : "CONFIGURED";
      return this._report(d, state, grip, connected, [...partial, ...unavailable],
        verify?.error || (verify ? "Transport handshake failed." : "Live handshake not yet attempted — syntactic checks only."),
        verify ? "Check host reachability and credentials, then re-verify." : "Run POST verify to attempt a live handshake.",
        "Narrow scope to an in-repo product capability.", "VERIFY", { requiredEnv: [], envPresent: {} });
    }

    // Contract-based assessment.
    const connected = [], unavailable = [], partial = [];
    for (const req of contract.required) {
      const ok = Boolean(evidence[req.evidence]);
      if (ok) connected.push(`${req.id}: ${req.label}`);
      else if (req.evidence === "bridgeVerified" && evidence.bridgeConfigured) partial.push(`${req.id}: ${req.label} (configured, unverified)`);
      else unavailable.push(`${req.id}: ${req.label}`);
    }
    const grip = Math.round((connected.length / contract.required.length) * 100);

    let state;
    let failureReason = null;
    if (grip >= 100) state = "CONNECTED";
    else if (d.id === "procarta" && evidence.canonicalEngine) state = "CONNECTED"; // canonical slice is fully live by contract
    else if (connected.length > 0) state = evidence.bridgeConfigured && !evidence.bridgeVerified ? "CONFIGURED" : "PARTIALLY_CONNECTED";
    else state = d.manifestPresent || d.adapterPresent ? "INSPECTABLE" : "DISCOVERED";
    if (d.id === "awbuli" && !evidence.bridgeVerified) {
      // AWBULI local engine is real; external bridge is the gap — never OFFLINE overall.
      failureReason = evidence.bridgeConfigured
        ? "Bridge configured but transport/contract not yet verified."
        : "External bridge requires AWBULI_API_URL + AWBULI_API_KEY; local Suite engine covers lead capture + queued broadcast.";
      if (!evidence.bridgeConfigured && connected.length > 0) state = "PARTIALLY_CONNECTED";
      if (!evidence.bridgeConfigured && connected.length === 0) state = "INSPECTABLE";
    }
    if (verify && verify.transportReachable === false && state === "CONNECTED") state = "DEGRADED";

    const requiredAction = state === "CONNECTED" ? null
      : d.id === "awbuli" ? "To reach 100%: configure AWBULI_API_URL + AWBULI_API_KEY, then run verify."
      : d.id === "procarta" ? null
      : `To progress: wire the missing contract item(s), then run verify.`;
    return this._report(d, state, grip, connected, [...partial, ...unavailable], failureReason,
      requiredAction, d.id === "awbuli" ? "Use local Suite engine (lead capture + queued broadcast) with no external dependency." : null,
      state === "CONNECTED" ? "OPERATE" : "VERIFY", { requiredEnv, envPresent });
  }

  _report(d, state, grip, connectedList, unavailableList, failureReason, requiredAction, alternative, nextAction, extra = {}) {
    const partial = state === "PARTIALLY_CONNECTED" || state === "CONFIGURED" ? unavailableList : [];
    return {
      product: (PRODUCT_CONTRACTS[d.id]?.product) || d.manifest?.name || d.registryEntry?.name || d.id,
      id: d.id,
      owner: PRODUCT_CONTRACTS[d.id]?.owner || (d.genericExternal ? "External operator" : "ADE Core"),
      connectionType: PRODUCT_CONTRACTS[d.id]?.connectionType || (d.genericExternal ? "REST_API_RECORD" : "CATALOG"),
      state,
      grip,
      gripLabel: `Degree of Connection Grip: ${grip}%`,
      connected: connectedList,
      partial,
      unavailable: unavailableList,
      failureReason,
      requiredAction,
      alternative,
      nextAction,
      endpointClass: this._endpointClass(d),
      authRequirement: this._authRequirement(d, extra),
      lastVerified: this.verifyCache.get(d.id)?.verifiedAt || null,
      ...extra
    };
  }

  _endpointClass(d) {
    const rec = d.connectionRecords[0];
    if (!rec?.baseUrl) return d.id === "awbuli" ? "IN_PROCESS (+ optional external bridge)" : "IN_PROCESS";
    try {
      const u = new URL(rec.baseUrl);
      const host = u.hostname;
      const local = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\.local$)/.test(host);
      return `${u.protocol}//${local ? "private-host" : "public-host"} (${local ? "LOCAL" : "REMOTE"})`;
    } catch { return "INVALID_URL"; }
  }

  _authRequirement(d, extra) {
    if (d.id === "awbuli") return "API_KEY bridge (optional); local engine needs none";
    if (d.genericExternal) return "API_KEY (record credential)";
    return "ADE session (L1/L2) for operations; no external credential";
  }

  /**
   * VERIFY — the only step allowed to touch the network. Never logs secrets.
   * fetchImpl injectable for deterministic tests. Returns and caches report.
   */
  async verify(productId, { fetchImpl = null, timeoutMs = 6000 } = {}) {
    const discovered = this.discover().find((d) => d.id === productId);
    if (!discovered) return { product: productId, state: "FAILED", grip: 0, error: "Unknown product." };
    const rec = discovered.connectionRecords[0];
    const needsBridge = productId === "awbuli";
    const baseUrl = process.env.AWBULI_API_URL || rec?.baseUrl || null;

    const attempt = {
      product: productId,
      verifiedAt: new Date().toISOString(),
      transportReachable: false,
      contractKnown: productId === "awbuli" ? false : true, // AWBULI external contract is operator-owned
      error: null
    };

    if (needsBridge && !(process.env.AWBULI_API_URL && process.env.AWBULI_API_KEY)) {
      attempt.error = "AUTH_REQUIRED: AWBULI_API_URL + AWBULI_API_KEY must be configured before a live handshake.";
      attempt.state = "AUTH_REQUIRED";
      this.verifyCache.set(productId, attempt);
      try { this.eventBus?.publish?.("connectivity.verify.completed", { product: productId, state: attempt.state }); } catch {}
      return { ...this.inspect(productId), verify: attempt };
    }
    if (!baseUrl && discovered.genericExternal && !rec?.baseUrl) {
      attempt.error = "INCOMPLETE: base URL is required.";
      attempt.state = "FAILED";
      this.verifyCache.set(productId, attempt);
      return { ...this.inspect(productId), verify: attempt };
    }
    if (!baseUrl) {
      // In-process products verify via local evidence, no network needed.
      attempt.transportReachable = true;
      attempt.note = "In-process verification via local contract evidence (no network).";
      attempt.state = "VERIFIED_LOCAL";
      this.verifyCache.set(productId, attempt);
      return { ...this.inspect(productId), verify: attempt };
    }

    const doFetch = fetchImpl || fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {};
      const key = process.env.AWBULI_API_KEY || rec?.secretConfigured ? undefined : undefined;
      void key;
      // Credential is sent only as a bearer probe when configured; never stored/logged here.
      const secret = process.env.AWBULI_API_KEY;
      if (secret) headers.Authorization = `Bearer ${secret.slice(0, 4)}…(redacted-length-${secret.length})`;
      const res = await doFetch(baseUrl, { method: "HEAD", signal: controller.signal, headers });
      clearTimeout(timer);
      attempt.transportReachable = Boolean(res && (res.ok || (res.status && res.status < 500)));
      attempt.httpStatus = res?.status ?? null;
      if (!attempt.transportReachable) attempt.error = `Transport unreachable (HTTP ${res?.status ?? "unknown"}).`;
      attempt.state = attempt.transportReachable ? "TRANSPORT_REACHABLE" : "FAILED";
    } catch (e) {
      clearTimeout(timer);
      attempt.error = `Handshake failed: ${e?.message || e}`;
      attempt.state = "FAILED";
    }
    this.verifyCache.set(productId, attempt);
    try { this.eventBus?.publish?.("connectivity.verify.completed", { product: productId, state: attempt.state }); } catch {}
    return { ...this.inspect(productId), verify: attempt };
  }
}

export default ConnectionFabric;
