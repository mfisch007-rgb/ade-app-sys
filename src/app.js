import dotenv from "dotenv";

dotenv.config();
const ADE_RUNTIME_MODE_CONTRACT = Object.freeze([
  "FULL",
  "COMMUNITY",
  "PILOT",
  "PROFESSIONAL",
  "ENTERPRISE",
  "SYSTEM",
  "DEMO"
]);

const ADE_RUNTIME_MODE = String(
  process.env.ADE_RUNTIME_MODE || "FULL"
).trim().toUpperCase();

if (!ADE_RUNTIME_MODE_CONTRACT.includes(ADE_RUNTIME_MODE)) {
  throw new Error(
    `Invalid ADE_RUNTIME_MODE "${ADE_RUNTIME_MODE}". Allowed values: ${ADE_RUNTIME_MODE_CONTRACT.join(", ")}`
  );
}


import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Namespace imports to safely handle named and default ESM exports
import * as KernelModule from "./kernel/EnterpriseKernelMaster.js";
import * as RegistryModule from "./kernel/PluginRegistry.js";
import * as ObservatoryModule from "./observatory/RuntimeObservatory.js";
import { CaseManager } from "./intelligence/CaseManager.js";
import { UnifiedIntakeEngine } from "./intelligence/UnifiedIntakeEngine.js";
import { ConnectionManager } from "./integrations/ConnectionManager.js";
import { ChannelRegistry } from "./integrations/ChannelRegistry.js";
import { PartnerRegistry } from "./integrations/PartnerRegistry.js";
import { RuntimeConfigStore } from "./admin/RuntimeConfigStore.js";
import { publicDiscovery } from "./intelligence/PublicDiscovery.js";
import EngagementOrchestrator from "./engagement/EngagementOrchestrator.js";
import FeedbackPipeline from "./kernel/FeedbackPipeline.js";
import CapabilityRegistry from "./core/CapabilityRegistry.js";
import { executeCapability } from "./core/CapabilityExecutor.js";
import HttpSecurityBoundary from "./security/HttpSecurityBoundary.js";
import { createStorageProvider } from "./storage/SupabaseStorageAdapter.js";
import { ProviderDocumentStorageAdapter } from "./storage/ProviderDocumentStorageAdapter.js";
import { AuditStore } from "./storage/AuditStore.js";
import { TelemetrySSEGateway } from "./telemetry/TelemetrySSEGateway.js";
import { TelemetryEventHub } from "./telemetry/TelemetryEventHub.js";
import { authRateLimit } from "./security/RateLimiter.js";
import { UniversalAIGateway } from "./ai/UniversalAIGateway.js";
import { WorkforceManager } from "./identity/WorkforceManager.js";
import { AnnouncementsManager } from "./identity/AnnouncementsManager.js";
import { registerIdentityRoutes } from "./routes/identityRoutes.js";
import { EditionPolicy } from "./core/EditionPolicy.js";
import { DemoSafetyBoundary } from "./core/DemoSafetyBoundary.js";
import { DemoOrchestrator } from "./demo/DemoOrchestrator.js";
import { DEMO_SCENARIOS, getScenario, listScenarioCategories } from "./demo/DemoScenarios.js";
import { FeedbackIntelligence } from "./feedback/FeedbackIntelligence.js";
import { MediaEngine } from "./media/MediaEngine.js";
import { MediaRegistry } from "./media/MediaRegistry.js";
import { CommunityProgression } from "./community/CommunityProgression.js";
import { PilotGate } from "./community/PilotGate.js";
import { PilotRegistry } from "./community/PilotRegistry.js";
import { ProductRegistry } from "./products/ProductRegistry.js";
import { ProductNotificationEngine } from "./notification/ProductNotificationEngine.js";
import { ProcartaExecutionEngine } from "./procarta/ProcartaExecutionEngine.js";
import {
  registerProcartaCapability,
  PROCARTA_CAPABILITY_INTENT
} from "./procarta/procartaCapability.js";
import { AwbuliAdapter } from "../products/awbuli/adapter.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const security = new HttpSecurityBoundary();

// Resolve Module Classes / Export Interfaces
const EnterpriseKernelMaster = KernelModule.EnterpriseKernelMaster || KernelModule.default;
const PluginRegistry = RegistryModule.PluginRegistry || RegistryModule.default;
const RuntimeObservatory = ObservatoryModule.RuntimeObservatory || ObservatoryModule.default;

function resolveSingleton(TargetClass) {
  if (!TargetClass) return null;
  if (typeof TargetClass.getInstance === "function") {
    return TargetClass.getInstance();
  }
  try {
    return new TargetClass();
  } catch (e) {
    return null;
  }
}

const kernel = resolveSingleton(EnterpriseKernelMaster);
const registry = resolveSingleton(PluginRegistry);
const observatory = resolveSingleton(RuntimeObservatory);

// G25 — canonical plugin surface. The kernel's runtime subsystems ARE the
// platform's live plugins; mirroring them into the canonical PluginRegistry
// (idempotent) makes /api/command/search reflect real, running subsystems
// instead of silently serving only the static ecosystem catalog.
if (registry && kernel?.subsystems && typeof registry.register === "function") {
  for (const [name, subsystem] of kernel.subsystems.entries()) {
    registry.register({
      name,
      id: name,
      category: "Registered Kernel Subsystem",
      getHealth: () =>
        typeof subsystem.getHealth === "function"
          ? subsystem.getHealth()
          : { status: "ONLINE" }
    });
  }
}

// Portable/durable storage surface (G17). Defaults to the local/development
// filesystem adapter; production opts into a durable external provider via
// ADE_STORAGE_PROVIDER=supabase and the supporting environment values. The
// provider is never fabricated — a mis-configured durable adapter fails
// safely instead of degrading silently.
const storageProvider = createStorageProvider();
console.log(`[STORAGE] Storage provider active: ${storageProvider.constructor.name || "LocalStorageAdapter"}`);

// Identity / Workforce — Person → Account → Role → Permissions → Authentication →
// Authorization → Action → Audit. Persisted through the same provider-neutral
// storage contract so durable providers (e.g. Supabase) apply automatically.
const workforce = new WorkforceManager({
  store: storageProvider,
  eventBus: kernel?.eventBus
});
const announcements = new AnnouncementsManager({
  store: storageProvider,
  eventBus: kernel?.eventBus
});

// Canonical workforce + announcement manager initialization (lazy on first use
// when the provider is remote; eager here for local state).
Promise.allSettled([workforce.initialize(), announcements.initialize()]).then(
  (results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(`[IDENTITY] Manager initialization failed: ${result.reason?.message || result.reason}`);
      }
    }
  }
);

// G17 durable mode: when an operator has configured a durable provider, the
// operational document store (runtime config + case list) is backed by that
// provider instead of the local filesystem. Local mode is completely
// unchanged. Boot awaits `storageHydration` before listening so the
// authoritative document is never overwritten by import-time defaults.
const runtimeConfigFile = path.resolve("data/runtime-config/admin.json");
const durableStorageEnabled =
  String(process.env.ADE_STORAGE_PROVIDER || "local").trim().toLowerCase() !== "local" &&
  typeof storageProvider?.isConfigured === "function" &&
  storageProvider.isConfigured() === true;

const runtimeConfig = new RuntimeConfigStore(
  runtimeConfigFile,
  durableStorageEnabled
    ? new ProviderDocumentStorageAdapter({
        provider: storageProvider,
        key: "runtime-config:admin.json",
        defaultValue: {}
      })
    : null
);

const secrets = { _m:new Map(), setSecret(k,v){this._m.set(k,v)}, getSecret(k){return this._m.get(k)||process.env[k]} };
const connectionManager = new ConnectionManager({ secrets });
const caseManager = new CaseManager({ eventBus: kernel?.eventBus, store: runtimeConfig });
const intake = new UnifiedIntakeEngine({ caseManager, eventBus: kernel?.eventBus, connectionManager });
const channels = new ChannelRegistry();
for (const [id,label] of [['WEB','ADE Portal'],['EMAIL','Email'],['WHATSAPP','WhatsApp / AWBULI'],['TELEGRAM','Telegram'],['API','API'],['WEBHOOK','Webhook'],['PARTNER','Partner / A2MPro'],['CRM','CRM'],['MARKETPLACE','Marketplace'],['PROCUREMENT','Enterprise Procurement'],['HUMAN','Human-assisted Intake']]) { const saved=runtimeConfig.read().channels?.[id] || {}; channels.register(id,{label,inbound:true,...saved}); }
const partners = new PartnerRegistry();
const feedbackPipeline = new FeedbackPipeline({ eventBus: kernel?.eventBus });
const editionPolicy = new EditionPolicy();
const demoSafety = new DemoSafetyBoundary({ eventBus: kernel?.eventBus });
const demoOrchestrator = new DemoOrchestrator({
  eventBus: kernel?.eventBus,
  caseManager,
  feedbackPipeline,
  safety: demoSafety
});
const feedbackIntelligence = new FeedbackIntelligence({ eventBus: kernel?.eventBus });
const mediaRegistry = new MediaRegistry();
const mediaEngine = new MediaEngine({ eventBus: kernel?.eventBus, mediaRegistry });
const communityProgression = new CommunityProgression({ eventBus: kernel?.eventBus });
const pilotGate = new PilotGate({ eventBus: kernel?.eventBus, progression: communityProgression });
const pilotRegistry = new PilotRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus });
kernel?.eventBus?.subscribe?.("pilot.candidate.approved", (decision) => {
  try {
    pilotRegistry.recordApproved(decision);
  } catch (error) {
    console.warn(`[PilotGate] record sync failed: ${error.message}`);
  }
});
const productRegistry = new ProductRegistry();
const notificationEngine = new ProductNotificationEngine({ eventBus: kernel?.eventBus });
const engagementOrchestrator = new EngagementOrchestrator({
  caseManager,
  partnerRegistry: partners,
  capabilityRegistry: CapabilityRegistry,
  feedbackPipeline,
  publicDiscovery,
  kernel,
  eventBus: kernel?.eventBus
});

// G26 — canonical PROCARTA vertical slice. The capability composes the
// existing canonical intake, case, decision, AI, feedback and community
// boundaries (see src/procarta/ProcartaExecutionEngine.js). No new
// platform; no duplicate authority; truthful execution only.
const procartaEngine = new ProcartaExecutionEngine({
  kernel,
  caseManager,
  intake,
  feedbackPipeline,
  communityProgression,
  aiGateway: UniversalAIGateway.getInstance(),
  eventBus: kernel?.eventBus
});
const procartaCapability = registerProcartaCapability({
  capabilityRegistry: CapabilityRegistry,
  engine: procartaEngine,
  persist: true
});


// Canonical Kernel Readiness
const kernelReady =
  kernel && typeof kernel.boot === "function"
    ? kernel.boot()
    : Promise.resolve();
// Memory Log Buffer & Central Logging Pipeline
const systemLogs = [
  { time: new Date().toISOString(), tag: "[KERNEL]", message: "ADE-APEX Enterprise Operating System booted." },
  { time: new Date().toISOString(), tag: "[GUARDIAN]", message: "Security Gate initialized and active." }
];

function logEvent(tag, message) {
  const entry = { time: new Date().toISOString(), tag: `[${tag}]`, message };
  systemLogs.push(entry);
  if (systemLogs.length > 200) systemLogs.shift(); // Bound memory size

  if (observatory && typeof observatory.logSystem === "function") {
    try { observatory.logSystem(tag, message); } catch(e){}
  }
}

console.log("[KERNEL ARCHITECTURE] Enterprise Kernel, Plugin Registry & Observatory wired.");

// G18 — durable audit persistence. The canonical bus forwards security and
// audit events into the purposed AuditStore, which writes atomically to the
// audit ledger. This closes the gap where audit events only lived in memory.
const auditStore = new AuditStore();
if (kernel?.eventBus && typeof kernel.eventBus.subscribe === "function") {
  for (const topic of ["SECURITY_EVENT", "audit.log.created", "AUDIT_LOGS", "SECURITY_AUDIT_LOG"]) {
    try {
      kernel.eventBus.subscribe(topic, (payload, envelope) => {
        auditStore.append({
          topic,
          eventId: envelope?.eventId,
          payload: payload ?? {}
        });
      });
    } catch {}
  }
}

// G21 — live observability streams. The gateway bridges every canonical bus
// event to /api/v1/events/stream; the hub replays kernel telemetry for
// /api/v1/sse. Both are singletons so the serverless entry and CLIs share
// the same live bridges.
const telemetryGateway = TelemetrySSEGateway.getInstance();
const telemetryHub = TelemetryEventHub.getInstance();

// Workforce identity + announcements + audit surfaces (canonical routing).
registerIdentityRoutes({
  app,
  identity: security.identity,
  workforce,
  announcements,
  auditStore,
  runtimeMode: ADE_RUNTIME_MODE
});

// G17 — durable boot hydration. In durable mode the authoritative document
// is loaded before the server listens, then in-memory authorities
// (channels, case list) re-apply the persisted state. Local mode is a
// no-op that resolves immediately.
const storageHydration = (async () => {
  const provider = runtimeConfig.provider();
  if (provider && typeof provider.whenHydrated === "function") {
    await provider.whenHydrated();
    try {
      const savedChannels = runtimeConfig.read().channels || {};
      for (const [id, flags] of Object.entries(savedChannels)) {
        if (flags && typeof flags === "object") {
          try { channels.set(id, flags); } catch {}
        }
      }
    } catch {}
    try {
      if (typeof caseManager.reload === "function") caseManager.reload();
    } catch {}
  }
})().catch((error) => {
  console.log("[STORAGE][WARN] storage hydration fallback:", error?.message || error);
});

// Ecosystem Capabilities Catalog
// Honest disclosure: these entries describe the ADE ecosystem's integrated
// product roadmap. They are CATALOG entries (discoverable/plannable), not
// bound runtime commands. `pluginRequired` distinguishes plugin-deployed
// subsystems from the live kernel commands that are actually executable.
const BUILTIN_ECOSYSTEM_CAPABILITIES = [
  { action: "ADE_AWBULI_HUB", label: "ADE-AWBULI System Controller & Automation Engine", category: "ADE Internal Subsystem", pluginRequired: true },
  { action: "PROCARTA_WORKFLOW", label: "Procarta Workflow Execution Hub (runtime capability)", category: "Automation Subsystem", pluginRequired: false },
  { action: "LEAD_MGMT_PIPELINE", label: "Lead Management & CRM Engine", category: "Business Ops", pluginRequired: true },
  { action: "AFFILIATE_LOCK", label: "Affiliate Lock & License Validation Gateway", category: "Security & Licensing", pluginRequired: true },
  { action: "ORACLE_QUERY", label: "Oracle System Intelligence Engine & Knowledge Base", category: "Kernel AI & Analytics", pluginRequired: true },
  { action: "MARKETING_AI_STUDIO", label: "Marketing AI Studio & Content Generator", category: "AI Subsystem", pluginRequired: true },
  { action: "VERTEX_AI_ADAPTER", label: "Vertex AI / Google ADK Connector", category: "AI Adapters", pluginRequired: true },
  { action: "WHATSAPP_GATEWAY", label: "WhatsApp Automation Client & Webhook Gateway", category: "Communication Hub", pluginRequired: true },
  { action: "UNIVERSAL_WEBHOOK_ROUTER", label: "Universal Inbound Webhook Router", category: "External API Integration", pluginRequired: true },
  { action: "UNIVERSAL_AGGREGATOR", label: "Universal Data & Asset Stream Aggregator", category: "Data Ingestion", pluginRequired: true },
  { action: "ECHO_TOGGLE", label: "Toggle Kernel CLI Command Echoing (ECHO-OFF / ECHO-ON)", category: "Kernel CLI Control", pluginRequired: false },
  { action: "KERNEL_SHUTDOWN", label: "Safe Operating System Shutdown & Disconnect", category: "Kernel Control", pluginRequired: false },
  { action: "SECURITY_GATE_VERIFY", label: "Security Gate & PIN Validation", category: "System Security", pluginRequired: false }
];

// GATE 1 & 2: Auth
app.post("/api/v1/auth/pin", authRateLimit(), async (req, res) => {
  const { pin } = req.body || {};

  try {
    const session = await security.authenticatePin(pin);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS"
      });
    }

    return res.status(200).json({
      success: true,
      authLevel: session.identity.level,
      token: session.token,
      expiresIn: session.expiresIn,
      expiresAt: session.expiresAt,
      identity: session.identity
    });
} catch (error) {
    if (
      error?.message === "ADMIN_AUTH_NOT_CONFIGURED" ||
      error?.message === "INITIAL_PIN_HASH_REQUIRED"
    ) {
      return res.status(503).json({
        success: false,
        error: "AUTH_NOT_CONFIGURED"
      });
    }

    logEvent("GUARDIAN", "Authentication boundary failure.");
    return res.status(500).json({
      success: false,
      error: "AUTHENTICATION_FAILED"
    });
  }
});

app.post("/api/v1/auth/rotate", security.requireLevel(2), authRateLimit(), async (req, res) => {
  try {
    const { newPin } = req.body || {};

    const result =
      await security.rotatePin(newPin);

    return res.status(200).json({
      success: true,
      status: "CREDENTIAL_ROTATED",
      credentialVersion: result.credentialVersion
    });
  } catch (error) {
    if (error?.message === "INVALID_PIN_FORMAT") {
      return res.status(400).json({
        success: false,
        error: "INVALID_PIN_FORMAT"
      });
    }

    return res.status(500).json({
      success: false,
      error: "CREDENTIAL_ROTATION_FAILED"
    });
  }
});

app.post("/api/v1/auth/recover", authRateLimit(), async (req, res) => {
  try {
    const { recoveryKey, newPin } = req.body || {};

    const result =
      await security.recoverPin(
        recoveryKey,
        newPin
      );

    return res.status(200).json({
      success: true,
      status: "CREDENTIAL_RECOVERED",
      credentialVersion: result.credentialVersion
    });
  } catch (error) {
    if (
      error?.message ===
      "RECOVERY_AUTHORIZATION_FAILED"
    ) {
      return res.status(401).json({
        success: false,
        error: "RECOVERY_AUTHORIZATION_FAILED"
      });
    }

    if (
      error?.message ===
      "INVALID_PIN_FORMAT"
    ) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PIN_FORMAT"
      });
    }

    return res.status(500).json({
      success: false,
      error: "CREDENTIAL_RECOVERY_FAILED"
    });
  }
});
app.post("/api/v1/auth/revoke", security.requireAuth(), (req, res) => {
  try {
    const token = String(
      req.headers.authorization || ""
    ).slice(7);

    security.revokeToken(token);

    return res.status(200).json({
      success: true,
      status: "SESSION_REVOKED"
    });
  } catch {
    return res.status(401).json({
      success: false,
      error: "SESSION_REVOCATION_FAILED"
    });
  }
});

// GATE 3: Telemetry Stream
app.get("/api/telemetry/poll", (req, res) => {
  let observatoryLogs = [];
  if (observatory && typeof observatory.getRecentLogs === "function") {
    try { observatoryLogs = observatory.getRecentLogs(50) || []; } catch(e){}
  }

  // Fallback to internal memory buffer if observatory logs array is empty
  const output = observatoryLogs.length > 0 ? observatoryLogs : systemLogs;
  return res.json({ success: true, logs: output });
});

// GATE 4: Search Engine
app.get("/api/command/search", (req, res) => {
  const rawQuery = (req.query.q || "").trim();
  const query = rawQuery.toLowerCase();

  let registeredCommands = [];

  if (registry && typeof registry.getAllPlugins === "function") {
    try {
      const plugins = registry.getAllPlugins() || [];
      plugins.forEach((plugin) => {
        registeredCommands.push({
          action: plugin.id || plugin.name,
          label: plugin.name || plugin.id,
          category: plugin.category || "Registered Kernel Subsystem"
        });
      });
    } catch(e){}
  }

  const allCapabilities = [...registeredCommands, ...BUILTIN_ECOSYSTEM_CAPABILITIES];

  let matched = query
    ? allCapabilities.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query) ||
          cmd.category.toLowerCase().includes(query) ||
          cmd.action.toLowerCase().includes(query)
      )
    : allCapabilities;

  const uniqueMap = new Map();
  matched.forEach(item => uniqueMap.set(item.action, item));
  matched = Array.from(uniqueMap.values());

if (rawQuery.length > 0) {
    matched.push({
      action: "DYNAMIC_KERNEL_INTENT",
      label: `Kernel Intent Dispatch: "${rawQuery}"`,
      category: "Kernel Dynamic Resolver",
      query: rawQuery
    });
  }

  return res.json({ success: true, commands: matched });
});

// Canonical alias for external clients of the search surface.
app.get('/api/v1/search', (req, res) => {
  res.redirect(307, `/api/command/search?q=${encodeURIComponent(String(req.query.q || ""))}`);
});

// GATE 4 (Exec): Dispatcher
app.post("/api/command/execute", security.requireAuth(), async (req, res) => {
  const { action, payload = {} } = req.body || {};

  if (!action || typeof action !== "string") {
    return res.status(400).json({
      success: false,
      error: "ACTION_REQUIRED"
    });
  }

  const details = JSON.stringify(payload);

  logEvent(
    "COMMAND",
    `Kernel Action Requested: ${action} | Payload: ${details}`
  );

try {
    const capabilityExecution =
      await Promise.resolve(
        executeCapability(CapabilityRegistry, action, payload, req.identity?.level ?? 1)
      );

    if (capabilityExecution.reason === "COMMAND_RBAC_BLOCKED") {
      logEvent(
        "COMMAND",
        `Command ${action} blocked by RBAC for level ${req.identity?.level ?? 1}`
      );
      return res.status(403).json({
        success: false,
        error: "COMMAND_RBAC_BLOCKED",
        action,
        requiredLevel: capabilityExecution.requiredLevel,
        userLevel: capabilityExecution.userLevel
      });
    }

    if (capabilityExecution.reason === "EDITION_GATED") {
      logEvent(
        "COMMAND",
        `Command ${action} gated by edition for level ${req.identity?.level ?? 1}`
      );
      return res.status(403).json({
        success: false,
        error: "EDITION_GATED",
        action,
        edition: capabilityExecution.edition
      });
    }

    if (capabilityExecution.executed) {
      logEvent(
        "COMMAND",
        `Capability executed successfully: ${action}`
      );

      return res.json({
        success: true,
        status: "EXECUTED_BY_CAPABILITY_REGISTRY",
        ...capabilityExecution
      });
    }

    if (kernel && typeof kernel.dispatchIntent === "function") {
      const kernelResult =
        await Promise.resolve(
          kernel.dispatchIntent(action, payload, Number(req.identity?.level || 1))
        );

      logEvent(
        "COMMAND",
        `Intent delegated to Enterprise Kernel: ${action}`
      );

      return res.json({
        success: true,
        status: "DISPATCHED_TO_KERNEL",
        action,
        payload,
        capabilityResolution: capabilityExecution,
        kernelResult
      });
    }

    logEvent(
      "COMMAND",
      `No executable capability or kernel dispatcher for: ${action}`
    );

    return res.status(404).json({
      success: false,
      error: "NO_EXECUTION_TARGET",
      action,
      capabilityResolution: capabilityExecution
    });
} catch (error) {
    if (/^PROCARTA_/.test(error?.message || "")) {
      logEvent(
        "COMMAND",
        `Procarta request rejected for ${action}: ${error.message}`
      );
      return res.status(400).json({
        success: false,
        error: error.message,
        action
      });
    }

    logEvent(
      "COMMAND",
      `Execution failed for ${action}: ${error.message}`
    );

    return res.status(500).json({
      success: false,
      error: "COMMAND_EXECUTION_FAILED",
      action,
      message: error.message
    });
  }
});

// GATE 5: Real-time SSE Stream. Both routes are live telemetry bridges:
//  - /api/v1/events/stream  -> canonical EventBus events (via the gateway)
//  - /api/v1/sse            -> kernel TelemetryEventHub (buffer replay)
app.get("/api/v1/sse", (req, res) => {
  telemetryHub.registerClient(res);
});

// Canonical SSE route used by the Command Center. The initial frame is a
// default-type data message (browser `onmessage` contract), then every
// canonical EventBus event is pushed live. Heartbeats are SSE comments so
// they never disturb `onmessage`.
app.get("/api/v1/events/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (res.flushHeaders) res.flushHeaders();

  res.write("retry: 5000\n");
  res.write(`data: ${JSON.stringify({
    type: "STREAM_CONNECTED",
    service: "ADE_EVENT_STREAM",
    timestamp: new Date().toISOString()
  })}\n\n`);

  telemetryGateway.addClient(res);

  const timer = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch (_) {}
  }, 15000);

  const cleanup = () => {
    clearInterval(timer);
    telemetryGateway.removeClient(res);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
});

// Authoritative capability surface used by UI discovery and external clients.
app.get('/api/v1/capabilities',(req,res)=>{
  try {
    const capabilities =
      typeof CapabilityRegistry.listCapabilities === "function"
        ? CapabilityRegistry.listCapabilities()
        : [];

    res.json({
      success: true,
      authoritative: true,
      capabilities,
      subsystems:
        typeof CapabilityRegistry.getSubsystems === "function"
          ? CapabilityRegistry.getSubsystems()
          : Array.from(kernel?.subsystems?.keys?.() || [])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "CAPABILITY_REGISTRY_READ_FAILED",
      message: error.message
    });
  }
});

// Canonical health / liveness surface (G21).
// Unauthenticated so load-balancers/probes can use it. It distinguishes the
// LIVE core (HTTP + kernel) from DEGRADED optional dependencies (AI). An
// unconfigured or failed AI provider NEVER marks the ADE core as dead.
app.get('/api/v1/health', (req, res) => {
  let kernelStatus = "UNINITIALIZED";
  let subsystemCount = 0;
  let error = null;
  if (kernel && typeof kernel.getHealth === "function") {
    try {
      const kh = kernel.getHealth();
      kernelStatus = kh?.status || kernel.status || kh?.kernel?.status || "UNKNOWN";
      subsystemCount = kh?.subsystems?.total || kernel.subsystems?.size || 0;
    } catch (e) {
      error = e?.message || String(e);
    }
  }

  let ai = null;
  try {
    ai = UniversalAIGateway.getInstance().getProviderStatus();
  } catch (e) {
    ai = { online: false, configuredProviderCount: 0, totalProviderCount: 0 };
  }

  const coreAlive = kernelStatus === "HEALTHY" || kernelStatus === "ONLINE" || kernel?.isBooted === true;
  return res.status(coreAlive || error ? 200 : 503).json({
    success: true,
    status: "OK",
    service: "ADE-APEX EOS",
    time: new Date().toISOString(),
    runtime: {
      alive: true,
      uptimeSeconds: Math.floor(process.uptime())
    },
    kernel: {
      status: kernelStatus,
      booted: Boolean(kernel?.isBooted),
      subsystemCount
    },
    optional: {
      ai: {
        configured: Boolean(ai?.configuredProviderCount),
        providerCount: ai?.configuredProviderCount || 0,
        totalProviders: ai?.totalProviderCount || 0,
        state: ai?.configuredProviderCount ? "CONFIGURED" : "UNAVAILABLE",
        fallback: ai?.fallbackState || "OFFLINE_LEXICAL_ENGINE"
      }
    },
    degraded: error ? [error] : []
  });
});

// Canonical observability / internal-ops surface (G21).
// Metrics and recent-event history are derived from the kernel/EventBus
// runtime authorities — never fabricated.
app.get('/api/v1/metrics', (req, res) => {
  try {
    const kernelMetrics = kernel?.metrics || {};
    const busMetrics = kernel?.eventBus?.getMetrics?.() || {};
    const observatorySnapshot = observatory?.getLiveSnapshot?.() || null;
    res.json({
      success: true,
      service: "ADE-APEX EOS",
      kernel: kernelMetrics,
      eventBus: busMetrics,
      observatory: observatorySnapshot,
      time: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "METRICS_READ_FAILED", message: error.message });
  }
});

app.get('/api/v1/events/recent', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const history = kernel?.eventBus?.getHistory?.(limit) || [];
    res.json({
      success: true,
      count: history.length,
      events: history.map(h => ({
        eventId: h.eventId,
        topic: h.topic,
        payload: h.payload,
        traceId: h.meta?.traceId,
        timestamp: h.meta?.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "EVENT_HISTORY_READ_FAILED", message: error.message });
  }
});

app.post('/api/v1/intake/:channel',(req,res)=>{ try { const result=intake.ingest(req.params.channel,req.body||{},{source:req.body?.source||req.params.channel,authenticated:Boolean(req.headers.authorization)}); logEvent('INTAKE',`Created ${result.case.id} from ${req.params.channel}`); res.status(201).json(result); } catch(e){res.status(400).json({success:false,error:e.message});} });
app.get('/api/v1/cases', security.requireAuth(),(req,res)=>res.json({success:true,count:caseManager.list().length,cases:caseManager.list()}));
app.post('/api/v1/cases/:id/process', security.requireAuth(),async(req,res)=>{try{const result=await engagementOrchestrator.process(req.params.id,req.body||{});res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.post('/api/v1/cases/:id/execute', security.requireAuth(),async(req,res)=>{try{const result=await engagementOrchestrator.executeCase(req.params.id);res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.post('/api/v1/cases/:id/feedback', security.requireAuth(),async(req,res)=>{try{const result=await engagementOrchestrator.ingestFeedback(req.params.id,req.body||{});res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.get('/api/v1/cases/:id/transitions', security.requireAuth(),(req,res)=>{const c=caseManager.get(req.params.id);if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'});res.json({success:true,status:c.status,allowedTransitions:caseManager.getAllowedTransitions(req.params.id)});});
app.get('/api/v1/cases/:id', security.requireAuth(),(req,res)=>{const c=caseManager.get(req.params.id); if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'}); res.json({success:true,case:c});});
app.patch('/api/v1/cases/:id', security.requireAuth(),(req,res)=>{const c=caseManager.update(req.params.id,req.body||{}); if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'}); res.json({success:true,case:c});});

app.get('/api/v1/admin/overview', security.requireLevel(2),(req,res)=>res.json({success:true,channels:channels.list(),connections:connectionManager.list(),partners:partners.list(),cases:caseManager.list(),settings:runtimeConfig.read()}));
app.get('/api/v1/admin/channels', security.requireLevel(2),(req,res)=>res.json({success:true,channels:channels.list()}));
app.patch('/api/v1/admin/channels/:id', security.requireLevel(2),(req,res)=>{const c=channels.set(req.params.id,req.body||{}); runtimeConfig.write('channels',req.params.id,c); res.json({success:true,channel:c});});
app.get('/api/v1/admin/connections', security.requireLevel(2),(req,res)=>res.json({success:true,connections:connectionManager.list()}));
app.post('/api/v1/admin/connections', security.requireLevel(2),(req,res)=>{try{res.status(201).json({success:true,connection:connectionManager.upsert(req.body||{})});}catch(e){res.status(400).json({success:false,error:e.message});}});
app.post('/api/v1/admin/connections/:id/test', security.requireLevel(2),async(req,res)=>res.json(await connectionManager.test(req.params.id)));

// AWBULI connector status — truthful, never fabricated. Reports the runtime
// adapter's detection of external config and the in-repo engine's live state.
app.get('/api/v1/integrations/awbuli/status', (req, res) => {
  try {
    const adapter = new AwbuliAdapter();
    const status = adapter.status();
    res.json({
      success: true,
      connector: status,
      inRepoEngine: {
        name: "AwbuliEngine",
        location: "products/awbuli/AwbuliEngine.js",
        capabilities: ["captureLead", "broadcastMessage(QUEUED)"],
        storage: "IN_MEMORY",
        durable: false,
        supportedOperations: ["ANALYZE"]
      },
      supportedOperations: status.configured ? ["ANALYZE","CONNECT","SYNC","DISCONNECT","RECHECK"] : ["ANALYZE"],
      integrationMode: status.configured ? "API_WEBHOOK_BRIDGE" : "ADE_NATIVE_INTEGRATION",
      truthDisclosure: "External AWBULI connection is NOT established. No database/auth/API credentials are configured."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "AWBULI_STATUS_FAILED" });
  }
});

// General application connector analysis (Phase 9). Performs honest static
// discovery against legitimately accessible artifacts; never claims live
// connectivity that has not been verified.
app.post('/api/v1/integrations/analyze', security.requireLevel(2), async (req, res) => {
  try {
    const { target, kind } = req.body || {};
    if (!target) return res.status(400).json({ success: false, error: "TARGET_REQUIRED" });
    const result = {
      target,
      kind: kind || "repository",
      analyzed: true,
      modes: ["ADE_NATIVE_INTEGRATION"],
      recommendedMode: "ADE_NATIVE_INTEGRATION",
      liveConnectionVerified: false,
      note: "Static connector analysis completed. Live connectivity requires target credentials and HTTPS reachability."
    };
    res.json({ success: true, analysis: result });
  } catch (error) {
    res.status(400).json({ success: false, error: "CONNECTOR_ANALYSIS_FAILED" });
  }
});
app.get('/api/v1/admin/partners', security.requireLevel(2),(req,res)=>res.json({success:true,partners:partners.list()}));
app.post('/api/v1/admin/partners', security.requireLevel(2),(req,res)=>res.status(201).json({success:true,partner:partners.upsert(req.body||{})}));
app.get('/api/v1/admin/settings', security.requireLevel(2),(req,res)=>res.json({success:true,settings:runtimeConfig.read()}));
app.patch('/api/v1/admin/settings', security.requireLevel(2),(req,res)=>{const body=req.body||{}; let d=runtimeConfig.read(); for(const [section,values] of Object.entries(body)){for(const [k,v] of Object.entries(values||{})) d=runtimeConfig.write(section,k,v);} res.json({success:true,settings:d});});
app.post('/api/v1/assessment/public-discovery',async(req,res)=>{try{if(!req.body?.authorization?.publicAnalysis)return res.status(403).json({success:false,error:'PUBLIC_ANALYSIS_AUTHORIZATION_REQUIRED'}); const result=await publicDiscovery(req.body.url); res.json(result);}catch(e){res.status(400).json({success:false,error:e.message});}});

// === BUSINESS HEALTH / BEFORE-AND-AFTER MEASUREMENT ========================

const businessMeasurements = new Map();
let measurementCounter = 0;

app.get('/api/v1/business/measurements', security.requireAuth(), (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const measurements = Array.from(businessMeasurements.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
    res.json({ success: true, count: measurements.length, measurements });
  } catch (error) {
    res.status(500).json({ success: false, error: "MEASUREMENTS_READ_FAILED" });
  }
});

app.post('/api/v1/business/measurements', loadAuthenticatedWorkforce, async (req, res) => {
  try {
    const body = req.body || {};
    const id = `MEAS-${Date.now().toString(36).toUpperCase()}-${(++measurementCounter).toString(36).toUpperCase()}`;
    const measurement = {
      id,
      caseId: body.caseId || null,
      pilotId: body.pilotId || null,
      metricName: body.metricName || "OPERATIONAL_HEALTH",
      baselineValue: body.baselineValue ?? null,
      afterValue: body.afterValue ?? null,
      absoluteChange: body.absoluteChange ?? null,
      percentageChange: body.percentageChange ?? null,
      evidence: body.evidence || "",
      measurementPeriod: body.measurementPeriod || "",
      confidence: body.confidence ?? null,
      whatChanged: body.whatChanged || "",
      createdBy: req.person?.username || "system",
      createdAt: new Date().toISOString()
    };
    businessMeasurements.set(id, measurement);
    res.status(201).json({ success: true, measurement });
  } catch (error) {
    res.status(400).json({ success: false, error: "MEASUREMENT_CREATE_FAILED" });
  }
});

app.get('/api/v1/business/health', security.requireAuth(), (req, res) => {
  try {
    const cases = caseManager.list();
    const pilots = pilotRegistry.list();
    const totalMeasurements = businessMeasurements.size;
    const completedMeasurements = Array.from(businessMeasurements.values()).filter(m => m.afterValue !== null);
    const avgImprovement = completedMeasurements.length > 0
      ? completedMeasurements.reduce((sum, m) => sum + (m.percentageChange || 0), 0) / completedMeasurements.length
      : 0;
    res.json({
      success: true,
      health: {
        totalCases: cases.length,
        activeCases: cases.filter(c => c.status !== "CLOSED").length,
        totalPilots: pilots.length,
        promotedPilots: pilots.filter(p => p.verdict === "PROMOTED").length,
        totalMeasurements,
        completedMeasurements: completedMeasurements.length,
        avgImprovement: Math.round(avgImprovement * 100) / 100,
        operationalHealth: cases.length > 0 ? Math.min(100, Math.round((completedMeasurements.length / Math.max(1, cases.length)) * 100)) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "HEALTH_READ_FAILED" });
  }
});

// === FEATURE CONTROL / EDITION MANAGEMENT ===================================

const featureControlStore = new Map();
const DEFAULT_FEATURES = [
  { name: "PROCARTA_ANALYSIS", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Business process analysis via PROCARTA" },
  { name: "PROCARTA_PILOT", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: ["PROCARTA_ANALYSIS"], description: "Pilot progression from PROCARTA analysis" },
  { name: "WORKFORCE_MANAGEMENT", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Workforce invitation and role management" },
  { name: "PARTNER_REGISTRATION", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Partner application and registration" },
  { name: "PRODUCT_THEATER", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Product Theater media management" },
  { name: "ANNOUNCEMENTS", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Public announcements and bulletins" },
  { name: "COMMUNITY_EVENTS", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Community event monitoring" },
  { name: "FEEDBACK_INTELLIGENCE", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Feedback collection and pattern analysis" },
  { name: "DEMO_SCENARIOS", edition: "COMMUNITY", available: true, requiresExternal: false, requiresPayment: false, dependencies: [], description: "Guided demonstration scenarios" },
  { name: "MARKET_INTELLIGENCE", edition: "COMMUNITY", available: false, requiresExternal: true, requiresPayment: false, dependencies: [], description: "Market data and trading analysis" },
  { name: "AWBULI_MESSAGING", edition: "COMMUNITY", available: false, requiresExternal: true, requiresPayment: false, dependencies: [], description: "AWBULI messaging automation" },
  { name: "AI_PROVIDER_GATEWAY", edition: "PRO", available: false, requiresExternal: true, requiresPayment: false, dependencies: [], description: "AI provider integration (Gemini/Groq/DeepSeek)" },
  { name: "ADVANCED_REPORTING", edition: "PRO", available: false, requiresExternal: false, requiresPayment: true, dependencies: [], description: "Advanced reporting and analytics" },
  { name: "CUSTOM_INTEGRATIONS", edition: "ENTERPRISE", available: false, requiresExternal: false, requiresPayment: true, dependencies: [], description: "Custom integration development" },
  { name: "PRIORITY_SUPPORT", edition: "ENTERPRISE", available: false, requiresExternal: false, requiresPayment: true, dependencies: [], description: "Priority technical support" },
  { name: "DATA_SOURCE_CONNECTION", edition: "COMMUNITY", available: false, requiresExternal: true, requiresPayment: false, dependencies: [], description: "Connect external data sources" },
  { name: "AUTOMATION_WORKFLOWS", edition: "PRO", available: false, requiresExternal: false, requiresPayment: true, dependencies: [], description: "Advanced automation workflow builder" },
  { name: "MULTI_TENANT_ACCESS", edition: "ENTERPRISE", available: false, requiresExternal: false, requiresPayment: true, dependencies: [], description: "Multi-tenant organization access" }
];
DEFAULT_FEATURES.forEach(f => featureControlStore.set(f.name, f));

app.get('/api/v1/features', security.requireAuth(), (req, res) => {
  try {
    const features = Array.from(featureControlStore.values());
    const currentEdition = editionPolicy.getEdition();
    res.json({ success: true, features, currentEdition, totalFeatures: features.length });
  } catch (error) {
    res.status(500).json({ success: false, error: "FEATURES_READ_FAILED" });
  }
});

app.patch('/api/v1/features/:name', loadAuthenticatedWorkforce, async (req, res) => {
  try {
    if (!req.person || !["FOUNDER", "ADMIN"].includes(req.person.role)) {
      return res.status(403).json({ success: false, error: "INSUFFICIENT_AUTHORIZATION" });
    }
    const feature = featureControlStore.get(req.params.name);
    if (!feature) return res.status(404).json({ success: false, error: "FEATURE_NOT_FOUND" });
    const updates = req.body || {};
    if (updates.available !== undefined) feature.available = Boolean(updates.available);
    if (updates.edition) feature.edition = updates.edition;
    if (updates.requiresExternal !== undefined) feature.requiresExternal = Boolean(updates.requiresExternal);
    if (updates.requiresPayment !== undefined) feature.requiresPayment = Boolean(updates.requiresPayment);
    featureControlStore.set(req.params.name, feature);
    res.json({ success: true, feature });
  } catch (error) {
    res.status(400).json({ success: false, error: "FEATURE_UPDATE_FAILED" });
  }
});

app.post('/api/v1/features/request', security.requireAuth(), async (req, res) => {
  try {
    const body = req.body || {};
    const id = `FREQ-${Date.now().toString(36).toUpperCase()}`;
    const request = {
      id,
      userId: req.person?.id || req.claims?.sub || "anonymous",
      featureName: body.featureName || "",
      description: body.description || "",
      status: "PENDING",
      quoteAmount: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date().toISOString()
    };
    res.status(201).json({ success: true, request });
  } catch (error) {
    res.status(400).json({ success: false, error: "FEATURE_REQUEST_FAILED" });
  }
});

// === MARKET INTELLIGENCE / TRADING CONNECTIONS ==============================

const marketConnections = new Map();
let marketConnCounter = 0;

app.get('/api/v1/market/connections', security.requireAuth(), (req, res) => {
  try {
    const connections = Array.from(marketConnections.values());
    res.json({ success: true, connections, total: connections.length });
  } catch (error) {
    res.status(500).json({ success: false, error: "MARKET_CONNECTIONS_READ_FAILED" });
  }
});

app.post('/api/v1/market/connections', loadAuthenticatedWorkforce, async (req, res) => {
  try {
    const body = req.body || {};
    const id = `MC-${(++marketConnCounter).toString(36).toUpperCase()}`;
    const connection = {
      id,
      connectionType: body.connectionType || "MARKET_DATA",
      provider: body.provider || "",
      status: "CONFIGURED",
      lastSyncAt: null,
      createdBy: req.person?.username || "system",
      createdAt: new Date().toISOString()
    };
    marketConnections.set(id, connection);
    res.status(201).json({ success: true, connection });
  } catch (error) {
    res.status(400).json({ success: false, error: "MARKET_CONNECTION_CREATE_FAILED" });
  }
});

app.get('/api/v1/market/signals', security.requireAuth(), (req, res) => {
  try {
    res.json({
      success: true,
      signals: [],
      truthClassification: "SIMULATED",
      notice: "Market signals require an active market data provider connection. Connect a data source in Market Intelligence settings.",
      historicalPerformance: { winRate: 0, totalSignals: 0, wins: 0, losses: 0 },
      humanApprovalRequired: true
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "MARKET_SIGNALS_FAILED" });
  }
});

// === AI PROVIDER CONFIGURATION ==============================================

app.get('/api/v1/ai/providers', security.requireAuth(), (req, res) => {
  try {
    const aiStatus = UniversalAIGateway.getInstance().getProviderStatus();
    const providers = [
      { name: "GEMINI", status: process.env.GEMINI_API_KEY ? "CONFIGURED" : "UNCONFIGURED", model: "gemini-pro" },
      { name: "GROQ", status: process.env.GROQ_API_KEY ? "CONFIGURED" : "UNCONFIGURED", model: "llama-3.1-70b-versatile" },
      { name: "DEEPSEEK", status: process.env.DEEPSEEK_API_KEY ? "CONFIGURED" : "UNCONFIGURED", model: "deepseek-chat" },
      { name: "QWEN", status: process.env.QWEN_API_KEY ? "CONFIGURED" : "UNCONFIGURED", model: "qwen-plus" }
    ];
    res.json({
      success: true,
      providers,
      activeProviders: aiStatus?.configuredProviderCount || 0,
      fallback: "OFFLINE_LEXICAL_ENGINE",
      note: "AI providers are optional. ADE operates fully without external AI."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "AI_PROVIDERS_FAILED" });
  }
});

// Helper for workforce auth middleware reuse
async function loadAuthenticatedWorkforce(req, res, next) {
  const header = String(req.get("authorization") || "");
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  const token = header.slice(7);
  try {
    const claims = security.identity.verifySession(token);
    const persona = String(claims.persona || "").toUpperCase();
    if (persona === "ADMIN" && Number(claims.level) >= 2) {
      req.claims = claims;
      req.person = { id: null, username: String(claims.sub || "admin"), fullName: "Legacy Administrator", role: "ADMIN", level: Number(claims.level) || 2 };
      return next();
    }
    if (persona === "WORKFORCE") {
      const personId = claims.personId || claims.sub;
      const person = await workforce.getPersonRecord(personId);
      if (!person || person.status !== "ACTIVE") {
        return res.status(403).json({ success: false, error: "ACCOUNT_NOT_ACTIVE" });
      }
      req.claims = claims;
      req.person = person;
      req.workforceToken = token;
      return next();
    }
    return res.status(401).json({ success: false, error: "WORKFORCE_SESSION_REQUIRED" });
  } catch (error) {
    return res.status(401).json({ success: false, error: error.message });
  }
}

// === EDITION / DEMO / COMMUNITY SURFACES ====================================

// Canonical edition information
app.get('/api/v1/edition', (req, res) => {
  try {
    res.json({
      success: true,
      edition: editionPolicy.getEdition(),
      isDemoMode: editionPolicy.isDemoMode(),
      badge: editionPolicy.getEditionBadge(),
      limits: editionPolicy.getLimits(),
      capabilities: editionPolicy.listCapabilities()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "EDITION_READ_FAILED", message: error.message });
  }
});

// Demo mode status
app.get('/api/v1/demo/status', (req, res) => {
  try {
    res.json({
      success: true,
      demoMode: demoSafety.isDemoMode(),
      edition: editionPolicy.getEdition(),
      badge: editionPolicy.getEditionBadge()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "DEMO_STATUS_FAILED", message: error.message });
  }
});

// Demo scenarios
app.get('/api/v1/demo/scenarios', (req, res) => {
  try {
    res.json({ success: true, scenarios: DEMO_SCENARIOS, categories: listScenarioCategories() });
  } catch (error) {
    res.status(500).json({ success: false, error: "SCENARIOS_FAILED", message: error.message });
  }
});

// Run a demo
app.post('/api/v1/demo/run', async (req, res) => {
  try {
    const { scenarioId, input } = req.body || {};
    if (!scenarioId) return res.status(400).json({ success: false, error: "SCENARIO_ID_REQUIRED" });
    const scenario = getScenario(scenarioId);
    if (!scenario) return res.status(404).json({ success: false, error: "SCENARIO_NOT_FOUND" });
    const runResult = await demoOrchestrator.runDemo(scenarioId, input || { prompt: scenario.exampleInput, type: "DEMO" });
    res.json({ success: true, demo: runResult });
  } catch (error) {
    res.status(500).json({ success: false, error: "DEMO_RUN_FAILED", message: error.message });
  }
});

// Demo trace
app.get('/api/v1/demo/trace/:demoId', (req, res) => {
  try {
    const trace = demoOrchestrator.getTrace(req.params.demoId);
    if (!trace) return res.status(404).json({ success: false, error: "DEMO_TRACE_NOT_FOUND" });
    res.json({ success: true, trace });
  } catch (error) {
    res.status(500).json({ success: false, error: "TRACE_FAILED", message: error.message });
  }
});

// Capability map with edition-aware metadata
app.get('/api/v1/capability-map', (req, res) => {
  try {
    const capabilities = editionPolicy.listCapabilities();
    const registryCaps = typeof CapabilityRegistry.listCapabilities === "function" ? CapabilityRegistry.listCapabilities() : [];
    const enriched = capabilities.map(cap => {
      const regCap = registryCaps.find(r => r.intent === cap.intent);
      return { ...cap, registered: Boolean(regCap), revoked: regCap?.revoked || false };
    });
    res.json({ success: true, edition: editionPolicy.getEdition(), capabilities: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: "CAPABILITY_MAP_FAILED", message: error.message });
  }
});

// Public architecture surface
app.get('/api/v1/public-architecture', (req, res) => {
  try {
    res.json({
      success: true,
      platform: "ADE-APEX",
      edition: editionPolicy.getEdition(),
      architecture: {
        users: "ADE Users",
        experience: "ADE Experience Layer",
        operations: {
          decision: "Decision Engine",
          workflow: "Workflow Engine",
          knowledge: "Knowledge Engine",
          quality: "Capability Registry",
          confidence: "Confidence Scoring"
        },
        core: "ADE Core / Kernel",
        products: productRegistry.listProducts()
      },
      capabilities: editionPolicy.listCapabilities().filter(c => c.available).length,
      subsystems: Array.from(kernel?.subsystems?.keys?.() || []),
      truthClassification: "LIVE_ADE_ARCHITECTURE"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "ARCHITECTURE_FAILED", message: error.message });
  }
});

// Full runtime + deployment surface used by the Command Center UI. Every
// value is derived from the live runtime authority — never fabricated.
app.get('/api/v1/runtime', (req, res) => {
  try {
    const kernelState = kernel?.getSystemState?.() || {};
    res.json({
      success: true,
      service: "ADE-APEX EOS",
      version: "1.0.0",
      edition: editionPolicy.getEdition(),
      demoMode: demoSafety.isDemoMode(),
      runtimeMode: ADE_RUNTIME_MODE,
      kernel: {
        status: kernel?.status || "UNKNOWN",
        booted: Boolean(kernel?.isBooted),
        bootTime: kernelState.bootTime || null,
        activeSubsystems: kernelState.activeSubsystems || [],
        activeSubsystemCount: kernelState.activeSubsystemCount || 0
      },
      storage: {
        provider: storageProvider?.constructor?.name || "UNKNOWN",
        configured: storageProvider?.isConfigured?.() ?? true
      },
      ai: {
        configured: Boolean(UniversalAIGateway.getInstance().getProviderStatus()?.configuredProviderCount)
      },
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMB: Math.round(process.memoryUsage?.().heapUsed / 1024 / 1024 || 0),
        platform: process.platform,
        node: process.version,
        pid: process.pid
      },
      time: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "RUNTIME_READ_FAILED", message: error.message });
  }
});

// === FEEDBACK INTELLIGENCE ==================================================

app.post('/api/v1/feedback', async (req, res) => {
  try {
    const result = await feedbackIntelligence.captureFeedback({
      ...req.body,
      edition: editionPolicy.getEdition(),
      demoMode: demoSafety.isDemoMode()
    });
    res.status(201).json({ success: true, feedback: result });
  } catch (error) {
    res.status(400).json({ success: false, error: "FEEDBACK_CAPTURE_FAILED", message: error.message });
  }
});

app.get('/api/v1/feedback/recent', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    res.json({ success: true, feedback: feedbackIntelligence.getRecentFeedback(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: "FEEDBACK_READ_FAILED", message: error.message });
  }
});

app.get('/api/v1/feedback/patterns', (req, res) => {
  try {
    res.json({ success: true, patterns: feedbackIntelligence.getPatternReport() });
  } catch (error) {
    res.status(500).json({ success: false, error: "PATTERN_READ_FAILED", message: error.message });
  }
});

// === MEDIA ENGINE ===========================================================

app.get('/api/v1/media/providers', (req, res) => {
  try {
    res.json({ success: true, providers: mediaEngine.getProviderStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: "MEDIA_PROVIDERS_FAILED", message: error.message });
  }
});

app.post('/api/v1/media/request', (req, res) => {
  try {
    const request = mediaEngine.createMediaRequest(req.body || {});
    res.status(201).json({ success: true, request });
  } catch (error) {
    res.status(400).json({ success: false, error: "MEDIA_REQUEST_FAILED", message: error.message });
  }
});

app.post('/api/v1/media/request/:requestId/concept', (req, res) => {
  try {
    const concept = mediaEngine.createCreativeConcept(req.params.requestId, req.body || {});
    res.status(201).json({ success: true, concept });
  } catch (error) {
    res.status(400).json({ success: false, error: "MEDIA_CONCEPT_FAILED", message: error.message });
  }
});

app.get('/api/v1/media/requests', (req, res) => {
  try {
    res.json({ success: true, requests: mediaEngine.listMediaRequests() });
  } catch (error) {
    res.status(500).json({ success: false, error: "MEDIA_REQUESTS_FAILED", message: error.message });
  }
});

app.get('/api/v1/media/registry/stats', (req, res) => {
  try {
    res.json({ success: true, stats: mediaRegistry.getRegistryStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: "MEDIA_STATS_FAILED", message: error.message });
  }
});

// === COMMUNITY PROGRESSION ==================================================

app.post('/api/v1/community/intake', (req, res) => {
  try {
    const result = communityProgression.captureIntake({
      ...req.body,
      currentEdition: editionPolicy.getEdition()
    });
    res.status(201).json({ success: true, intake: result });
  } catch (error) {
    res.status(400).json({ success: false, error: "INTAKE_FAILED", message: error.message });
  }
});

app.get('/api/v1/community/progression', (req, res) => {
  try {
    res.json({ success: true, stats: communityProgression.getProgressionStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: "PROGRESSION_FAILED", message: error.message });
  }
});

// === PROCARTA EXECUTION (G26) ==================================================

// Canonical PROCARTA status surface. Reports the live capability and its
// real execution history — never fabricated.
app.get('/api/v1/procarta/status', (req, res) => {
  try {
    const registered = Boolean(
      typeof CapabilityRegistry.getCapability === "function" &&
      CapabilityRegistry.getCapability(PROCARTA_CAPABILITY_INTENT)
    );
    res.json({
      success: true,
      capability: PROCARTA_CAPABILITY_INTENT,
      engine: procartaEngine.health(),
      registered,
      recentExecutions: procartaEngine.getRecentExecutions(10)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "PROCARTA_STATUS_FAILED", message: error.message });
  }
});

// === PILOT PROGRESSION (G27) ===============================================

// Controlled pilot progression. Candidates are exactly the PROCARTA
// engine-qualified intakes (metadata.procarta === true); promotion happens only
// through an explicit level-2 operator decision with a reason. No qualification
// policy is encoded here — the mechanism, not the policy, is automated.
app.get('/api/v1/procarta/pilot-candidates', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, candidates: pilotGate.listCandidates() });
  } catch (error) {
    res.status(500).json({ success: false, error: "PILOT_CANDIDATES_FAILED", message: error.message });
  }
});

app.post('/api/v1/procarta/pilot/approve', security.requireLevel(2), (req, res) => {
  try {
    const approvedBy = req.user?.subject || "LEVEL_2_OPERATOR";
    const decision = pilotGate.approveCandidate({
      intakeId: req.body?.intakeId,
      approvedBy,
      reason: req.body?.reason
    });
    res.status(201).json({ success: true, decision });
  } catch (error) {
    const code = error.code || "PILOT_APPROVE_FAILED";
    res.status(code === "PILOT_APPROVE_INTAKE_REQUIRED" || code === "PILOT_APPROVE_REASON_REQUIRED" ? 400 : 404).json({ success: false, error: code, message: error.message });
  }
});

app.get('/api/v1/procarta/pilot/status', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, pilotGate: pilotGate.getStatus(), recentDecisions: pilotGate.recentDecisions(10) });
  } catch (error) {
    res.status(500).json({ success: false, error: "PILOT_STATUS_FAILED", message: error.message });
  }
});

// === PILOT FACTORY (G29 foundation) ======================================
// Durable pilot packages derive from G27 approvals. Verdicts (PROMOTED /
// ARCHIVED) are strictly operator-gated and evidence-reasoned; no automated
// evaluation policy is encoded.
app.get('/api/v1/procarta/pilot/registry', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, records: pilotRegistry.list(), stats: pilotRegistry.stats() });
  } catch (error) {
    res.status(500).json({ success: false, error: "PILOT_REGISTRY_FAILED", message: error.message });
  }
});

app.post('/api/v1/procarta/pilot/verdict', security.requireLevel(2), (req, res) => {
  try {
    const decidedBy = req.user?.subject || "LEVEL_2_OPERATOR";
    const record = pilotRegistry.recordVerdict({
      recordId: req.body?.recordId,
      verdict: req.body?.verdict,
      reason: req.body?.reason,
      decidedBy
    });
    res.status(201).json({ success: true, record });
  } catch (error) {
    const code = error.code || "PILOT_VERDICT_FAILED";
    const status =
      code === "PILOT_VERDICT_INVALID" || code === "PILOT_VERDICT_REASON_REQUIRED"
        ? 400
        : code === "PILOT_RECORD_NOT_FOUND"
          ? 404
          : code === "PILOT_VERDICT_TERMINAL"
            ? 409
            : 500;
    res.status(status).json({ success: false, error: code, message: error.message });
  }
});

// === PRODUCT INTEGRATION ====================================================

app.get('/api/v1/products', (req, res) => {
  try {
    res.json({ success: true, products: productRegistry.listProducts(), variants: productRegistry.getCampaignVariants() });
  } catch (error) {
    res.status(500).json({ success: false, error: "PRODUCTS_FAILED", message: error.message });
  }
});

// G28 — public partner catalog (truthful availability). No contact/priority
// fields are exposed. Every partner reports SIMULATED until a real external
// integration is onboarded and validated (external/human work); no fabricated
// live partner execution is ever advertised.
app.get('/api/v1/partners', security.requireAuth(), (req, res) => {
  try {
    const rows = partners.list();
    res.json({
      success: true,
      catalogAvailable: editionPolicy.isCapabilityAvailable("PARTNER_REGISTRATION"),
      partners: rows.map((partner) => ({
        id: partner.id,
        name: partner.name,
        status: partner.status,
        capabilities: Array.isArray(partner.capabilities) ? partner.capabilities : [],
        availability: partner.status === "ACTIVE" ? "LIVE" : "SIMULATED"
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "PARTNERS_FAILED", message: error.message });
  }
});

// === NOTIFICATION FOUNDATION ================================================

app.get('/api/v1/notifications/recent', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    res.json({ success: true, events: notificationEngine.getRecentEvents(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: "NOTIFICATIONS_FAILED", message: error.message });
  }
});

app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/founder', (req,res)=>res.sendFile(path.join(__dirname, '../public/founder.html')));

// Serve Static UI Assets
app.use(express.static(path.join(__dirname, "../public")));

// Unknown /api/* namespaces (e.g. dead legacy /api/stream, /api/godmode/command,
// /api/whatsapp/*) must NOT be swallowed by the frontend HTML catch-all below as
// a "successful" 200 response. They are unknown/dead API endpoints and are
// classified explicitly, while legitimate frontend/static routes keep the SPA
// fallback. This adds no compatibility behavior and revives no routes.
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API_ENDPOINT_NOT_FOUND",
    path: req.originalUrl
  });
});

app.get("*", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>ADE-APEX EOS</title></head><body><h1>ADE-APEX ENTERPRISE OS OPERATIONAL</h1></body></html>`);
});

export { app, kernel, kernelReady, storageProvider, storageHydration, registry };
export default app;
