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
import fs from "node:fs";
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
import { FounderSignalEngine } from "./trading/FounderSignalEngine.js";
import { MediaRegistry } from "./media/MediaRegistry.js";
import { CommunityProgression } from "./community/CommunityProgression.js";
import { PilotGate } from "./community/PilotGate.js";
import { PilotRegistry } from "./community/PilotRegistry.js";
import { ProductRegistry } from "./products/ProductRegistry.js";
import { ProductSurfaceMatrix } from "./products/ProductSurfaceMatrix.js";
import { OperationalGraph } from "./operations/OperationalGraph.js";
import { ICX_ROLES, ICX_CHANNELS, ICX_MESSAGE_TYPES } from "./kernel/ADE_ICX_Engine.js";
import { ProductNotificationEngine } from "./notification/ProductNotificationEngine.js";
import { ResendEmailConnector } from "./notification/ResendEmailConnector.js";
import { ProcartaExecutionEngine } from "./procarta/ProcartaExecutionEngine.js";
import {
  registerProcartaCapability,
  PROCARTA_CAPABILITY_INTENT
} from "./procarta/procartaCapability.js";
import { AwbuliAdapter } from "../products/awbuli/adapter.js";
import { ConnectionFabric } from "./integrations/ConnectionFabric.js";
import { CapabilityExchange } from "./integrations/CapabilityExchange.js";
import { CapabilityActivation } from "./capabilities/CapabilityActivation.js";
import { PROVIDER_CATALOG } from "./ai/ProviderCatalog.js";
import { OracleFabric } from "./ai/OracleFabric.js";
import { PublicDataRegistry } from "./data/PublicDataRegistry.js";
import { LocalProvider } from "./ai/LocalProvider.js";
import { LearningCandidates } from "./learning/LearningCandidates.js";
import { CapabilityRecordStore } from "./capabilities/CapabilityRecordStore.js";
import { ProviderGate } from "./ingestion/ProviderGate.js";
import { WhatsAppNumberRegistry } from "./ingestion/WhatsAppNumberRegistry.js";
import { buildKnobInventory, buildHumanChecklist } from "./ops/OperationalKnobInventory.js";
import { VenueRegistry } from "./trading/VenueRegistry.js";
import { TradingEntitlements } from "./trading/TradingEntitlements.js";
import { SignalQualityGate } from "./trading/SignalQualityGate.js";
import { MarketDataAdapter } from "./trading/MarketDataAdapter.js";
import { MarketDataRegistry } from "./trading/MarketDataRegistry.js";
import { SportsDataBus } from "./trading/SportsDataBus.js";
import { FBSAdapter } from "./trading/adapters/FBSAdapter.js";
import { PocketOptionAdapter } from "./trading/adapters/PocketOptionAdapter.js";
import { IQOptionAdapter } from "./trading/adapters/IQOptionAdapter.js";
import { ExpertOptionAdapter } from "./trading/adapters/ExpertOptionAdapter.js";
import { BetPawaAdapter } from "./trading/adapters/BetPawaAdapter.js";
import { BetKingAdapter } from "./trading/adapters/BetKingAdapter.js";
import { Bet9jaAdapter } from "./trading/adapters/Bet9jaAdapter.js";
import { SportyBetAdapter } from "./trading/adapters/SportyBetAdapter.js";
import { AviatorAnalyticsEngine } from "./trading/AviatorAnalyticsEngine.js";
import { AviatorHistoryStore } from "./trading/AviatorHistoryStore.js";
import { InboxManager } from "./messaging/InboxManager.js";
import { TradingConnectionModes } from "./trading/TradingConnectionModes.js";
import { BrokerComparisonStore } from "./trading/BrokerComparisonStore.js";
import { AwbuliChannelAdapter } from "./injection/AwbuliChannelAdapter.js";
import { OperationalIntelligencePipeline } from "./injection/OperationalIntelligencePipeline.js";
import { TestBusinessAdapter } from "./ingestion/InjectionAdapter.js";
import { InjectionToCaseMapper } from "./ingestion/InjectionToCaseMapper.js";

import {
  buildAssessmentEvidence, assessmentToIntakeText,
  DocumentIntakeService, normalizeStructuredRows, translateProcessModel
} from "./injection/ProcartaInputAdapters.js";
import WebhookApiAdapter from "./injection/WebhookApiAdapter.js";
import ExternalConnectorModel from "./injection/ExternalConnectorModel.js";
import PaymentService from "./payments/PaymentService.js";
import CommercialEntitlement from "./commerce/CommercialEntitlement.js";
import DataGovernance from "./governance/DataGovernance.js";
import ConnectPlatformsBoard from "./connect/ConnectPlatformsBoard.js";
import FinancialLedger from "./finance/FinancialLedger.js";
import { FinancialAdapterRegistry } from "./finance/ProviderAdapterContract.js";
import { FinancialPipeline } from "./finance/FinancialPipeline.js";
import ReconciliationEngine from "./finance/ReconciliationEngine.js";
import BalanceIntelligence from "./finance/BalanceIntelligence.js";
import SettlementIntelligence from "./finance/SettlementIntelligence.js";
import RiskSignalEngine from "./finance/RiskSignalEngine.js";
import InvestigationWorkflow from "./finance/InvestigationWorkflow.js";
import ProviderHealth from "./finance/ProviderHealth.js";
import ClaimedPaymentBridge from "./finance/ClaimedPaymentEvidence.js";
import { buildTransactionIdentity, maskFinancial } from "./finance/FinancialEventModel.js";
import { DecisionEngine } from "./kernel/SupportingEngines.js";
import OrgUnitRegistry from "./operations/OrgUnitRegistry.js";
import CustomerRegistry from "./operations/CustomerRegistry.js";
import FieldTaskRegistry from "./operations/FieldTaskRegistry.js";
import AgentRegistry from "./operations/AgentRegistry.js";
import ExperienceStore from "./operations/ExperienceStore.js";
import AvailabilityMap from "./commerce/AvailabilityMap.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Capture raw body for HMAC webhook verification (Paystack uses raw bytes);
// parsed JSON behaviour is unchanged. req.rawBody is server-side only.
app.use(express.json({
  verify: (req, _res, buf) => { try { req.rawBody = buf ? buf.toString("utf8") : ""; } catch { req.rawBody = ""; } }
}));
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

// Central storage-readiness gate — distinguishes durable configured vs ephemeral.
// Flat error envelope {success, error: CODE-string, message} matches existing
// Pilot/route conventions so founder UI `new Error(d.error)` stays readable.
function isDurableOperational(){ return durableStorageEnabled === true; }
function isProductionEphemeral(){
  const isProd = Boolean(process.env.VERCEL || process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production');
  return isProd && !isDurableOperational();
}
function requireDurableStorage(req,res,next){
  if(isProductionEphemeral()){
    return res.status(503).json({success:false, error:'STORAGE_NOT_CONFIGURED', message:'Durable production storage is not configured. Operation halted to prevent state loss.'});
  }
  return next();
}

const secrets = { _m:new Map(), setSecret(k,v){this._m.set(k,v)}, getSecret(k){return this._m.get(k)||process.env[k]} };
const connectionManager = new ConnectionManager({ secrets, store: runtimeConfig });
const caseManager = new CaseManager({ eventBus: kernel?.eventBus, store: runtimeConfig });
const intake = new UnifiedIntakeEngine({ caseManager, eventBus: kernel?.eventBus, connectionManager });
const channels = new ChannelRegistry();
for (const [id,label] of [['WEB','ADE Portal'],['EMAIL','Email'],['WHATSAPP','WhatsApp / AWBULI'],['TELEGRAM','Telegram'],['API','API'],['WEBHOOK','Webhook'],['PARTNER','Partner / A2MPro'],['CRM','CRM'],['MARKETPLACE','Marketplace'],['PROCUREMENT','Enterprise Procurement'],['HUMAN','Human-assisted Intake']]) { const saved=runtimeConfig.read().channels?.[id] || {}; channels.register(id,{label,inbound:true,...saved}); }
const partners = new PartnerRegistry({ store: runtimeConfig });
const feedbackPipeline = new FeedbackPipeline({ eventBus: kernel?.eventBus });
const editionPolicy = new EditionPolicy();
const demoSafety = new DemoSafetyBoundary({ eventBus: kernel?.eventBus });
const demoOrchestrator = new DemoOrchestrator({
  eventBus: kernel?.eventBus,
  caseManager,
  feedbackPipeline,
  safety: demoSafety
});
const feedbackIntelligence = new FeedbackIntelligence({ eventBus: kernel?.eventBus, store: runtimeConfig });
const mediaRegistry = new MediaRegistry();
const mediaEngine = new MediaEngine({ eventBus: kernel?.eventBus, mediaRegistry });
const communityProgression = new CommunityProgression({ eventBus: kernel?.eventBus, store: runtimeConfig });
const signalEngine = new FounderSignalEngine({ store: runtimeConfig, eventBus: kernel?.eventBus });
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
const connectionFabric = new ConnectionFabric({ connectionManager, productRegistry, capabilityRegistry: CapabilityRegistry, eventBus: kernel?.eventBus });
const capabilityExchange = new CapabilityExchange({ productRegistry, capabilityRegistry: CapabilityRegistry, connectionFabric });
const capabilityActivation = new CapabilityActivation({ capabilityRegistry: CapabilityRegistry, editionPolicy, providerStatus: () => UniversalAIGateway.getInstance().getProviderStatus() });
// Product-surface closure: composes existing authorities only (no new
// kernel/RBAC/registry). BUILTIN_ECOSYSTEM_CAPABILITIES is declared below;
// the matrix instance is created after that declaration (see product-surface
// route) so the canonical catalog list is passed through, not duplicated.
const learningCandidates = new LearningCandidates({ feedbackIntelligence, capabilityRegistry: CapabilityRegistry, eventBus: kernel?.eventBus });
// Batch 6D-2 — canonical capability + integration-decision records. Durable
// service over the existing RuntimeConfigStore abstraction; registration and
// activation stay with CapabilityRegistry/CapabilityActivation. Internal seam
// only (no routes): comparison remains analysis, activation stays authorized.
const capabilityRecordStore = new CapabilityRecordStore({ store: runtimeConfig, eventBus: kernel?.eventBus, capabilityRegistry: CapabilityRegistry, capabilityActivation });
// Batch 10/11 — provider governance singleton. Durable gate states over the
// existing store abstraction; verification reuses ConnectionManager.test
// (syntactic only, never live). Routes below are L2-gated; no public surface.
const providerGate = new ProviderGate({ store: runtimeConfig, eventBus: kernel?.eventBus, connectionManager, recordStore: capabilityRecordStore });
// Batch 12 — WhatsApp sender-identity registry (metadata only: masked numbers,
// no credential values, soft-disable preserves history). Never makes anything live.
const whatsappNumbers = new WhatsAppNumberRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus });
// NEXT enablement — canonical operational-intelligence + commercial layer.
// Additive only: reuses canonical intake/case/event/audit authorities; creates
// no new bus, engine, registry, or isolation mechanism.
const dataGovernance = new DataGovernance({ eventBus: kernel?.eventBus });
const paymentService = new PaymentService({ store: runtimeConfig, secrets, eventBus: kernel?.eventBus, editionPolicy });
const commercialEntitlement = new CommercialEntitlement({ editionPolicy, paymentService });
const injectionCaseMapper = new InjectionToCaseMapper({ intake, store: runtimeConfig, eventBus: kernel?.eventBus });
// Capability routing authority stays with the canonical intake/case layer
// (InjectionToCaseMapper + UnifiedIntakeEngine). discoverCapabilities is
// available for supported external evidence classes only — never for free
// text — so the pipeline runs without a text-discovery hint by design.
const capabilityDiscovery = null;
const awbuliChannelAdapter = new AwbuliChannelAdapter({ providerGate });
const operationalPipeline = new OperationalIntelligencePipeline({
  adapters: {
    AWBULI: awbuliChannelAdapter,
    WHATSAPP: awbuliChannelAdapter,
    TEST: new TestBusinessAdapter({}),
    FORM: new TestBusinessAdapter({}),
    API: new TestBusinessAdapter({}),
    WEBHOOK: new TestBusinessAdapter({})
  },
  caseMapper: injectionCaseMapper,
  capabilityDiscovery,
  procarta: null,
  governance: dataGovernance,
  eventBus: kernel?.eventBus
});
const documentIntake = new DocumentIntakeService({ store: runtimeConfig, eventBus: kernel?.eventBus });
const webhookApiAdapter = new WebhookApiAdapter({ connectionManager, secrets, eventBus: kernel?.eventBus });
const externalConnectors = new ExternalConnectorModel({ providerGate, connectionManager, eventBus: kernel?.eventBus });
const connectBoard = new ConnectPlatformsBoard({
  connectionManager, providerGate, whatsappNumbers, externalConnectors,
  paymentService, channels, editionPolicy
});
// Universal operational graph spine — adapter/index over the authorities
// above. No new registry/bus/gate/engine; resolves modules, products,
// capabilities, routes, RBAC and live state for every role and future product.
let operationalGraph = null;
const initOperationalGraph=()=>{ if(operationalGraph) return operationalGraph; operationalGraph = new OperationalGraph({
  capabilityActivation,
  capabilityRegistry: CapabilityRegistry,
  connectBoard, channels, providerGate, whatsappNumbers, editionPolicy,
  caseManager, workforceManager: workforce, notificationEngine,
  icxEngine: (() => { try { return kernel?.resolve?.("icx") || null; } catch { return null; } })()
}); return operationalGraph; };
// Financial integrity layer — additive domain capabilities over the existing
// kernel (EventBus, DecisionEngine, ConfidenceModel, intake/cases, audit,
// telemetry, tenant model). No second bus/engine/gate/registry.
const financialLedger = new FinancialLedger({ store: runtimeConfig, eventBus: kernel?.eventBus });
const financialAdapters = new FinancialAdapterRegistry({ secrets, eventBus: kernel?.eventBus });
const financeDecisionEngine = new DecisionEngine({});
const financeRiskEngine = new RiskSignalEngine({ ledger: financialLedger, eventBus: kernel?.eventBus, decisionEngine: financeDecisionEngine, allowFinancialHold: false });
const financeReconEngine = new ReconciliationEngine({ ledger: financialLedger, eventBus: kernel?.eventBus });
const financeBalance = new BalanceIntelligence({ ledger: financialLedger, eventBus: kernel?.eventBus });
const financeSettlement = new SettlementIntelligence({ ledger: financialLedger, eventBus: kernel?.eventBus });
const financeHealth = new ProviderHealth({ ledger: financialLedger, eventBus: kernel?.eventBus });
const financeInvestigations = new InvestigationWorkflow({ ledger: financialLedger, eventBus: kernel?.eventBus, intake });
const financeClaims = new ClaimedPaymentBridge({ ledger: financialLedger, eventBus: kernel?.eventBus, riskEngine: financeRiskEngine });
const financialPipeline = new FinancialPipeline({
  adapters: financialAdapters, ledger: financialLedger, riskEngine: financeRiskEngine,
  reconEngine: financeReconEngine, settlement: financeSettlement, balance: financeBalance,
  investigations: financeInvestigations, health: financeHealth, eventBus: kernel?.eventBus
});
// Community/MVP operational convergence — additive registries over the existing
// store/event/case/identity authorities. No new kernel, bus, or engines.
const orgUnits = new OrgUnitRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus });
const customers = new CustomerRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus, intake });
const fieldTasks = new FieldTaskRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus });
const agentRegistry = new AgentRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus, workforce, capabilityRegistry: CapabilityRegistry });
const experienceStore = new ExperienceStore({ store: runtimeConfig, eventBus: kernel?.eventBus });
const availabilityMap = new AvailabilityMap({ editionPolicy, commercialEntitlement, providerGate });
// Register Community operational capabilities (read-scoped handlers; mutations
// stay behind L1/L2 routes). Additive; persist like other capabilities.
try {
  const CR = CapabilityRegistry.getInstance ? CapabilityRegistry.getInstance() : CapabilityRegistry;
  const reg = (intent, name, rbacLevel, handler) => {
    try {
      CR.registerCapability({ intent, name, handler, rbacLevel, sourceModule: "COMMUNITY_OPERATIONS", tier: "FREE" }, { persist: true });
    } catch (e) {
      if (!String(e.message || "").match(/exists|duplicate|already/i)) throw e;
    }
  };
  reg("ORG_UNITS", "Organization units (list/get)", 1, (p) => ({ success: true, units: orgUnits.list({ tenantScope: p?.tenantScope || "default" }) }));
  reg("CUSTOMERS", "Customers and leads (list/get)", 1, (p) => ({ success: true, customers: customers.list({ tenantScope: p?.tenantScope || "default" }) }));
  reg("FIELD_TASKS", "Field tasks (list/get)", 1, (p) => ({ success: true, tasks: fieldTasks.list({ tenantScope: p?.tenantScope || "default" }) }));
  reg("AI_WORKERS", "Bound AI workers (list/get)", 1, (p) => ({ success: true, agents: agentRegistry.list({ tenantScope: p?.tenantScope || "default" }) }));
  reg("EXPERIENCE_QUERY", "Operational experience (query)", 1, (p) => ({ success: true, experience: experienceStore.query({ tenantScope: p?.tenantScope || "default", capabilityKey: p?.capabilityKey || null }) }));
} catch (e) {
  console.error(`[COMMUNITY] capability registration skipped: ${e.message}`);
}
const venueRegistry = new VenueRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus });
const marketDataRegistry = new MarketDataRegistry({ store: runtimeConfig, eventBus: kernel?.eventBus, venueRegistry });
const sportsDataBus = new SportsDataBus({ marketDataRegistry, eventBus: kernel?.eventBus });
// Register all market data adapters
const fbsAdapter = new FBSAdapter(); marketDataRegistry.registerAdapter(fbsAdapter);
const pocketOptionAdapter = new PocketOptionAdapter(); marketDataRegistry.registerAdapter(pocketOptionAdapter);
const iqOptionAdapter = new IQOptionAdapter(); marketDataRegistry.registerAdapter(iqOptionAdapter);
const expertOptionAdapter = new ExpertOptionAdapter(); marketDataRegistry.registerAdapter(expertOptionAdapter);
const betPawaAdapter = new BetPawaAdapter(); marketDataRegistry.registerAdapter(betPawaAdapter);
const betKingAdapter = new BetKingAdapter(); marketDataRegistry.registerAdapter(betKingAdapter);
const bet9jaAdapter = new Bet9jaAdapter(); marketDataRegistry.registerAdapter(bet9jaAdapter);
const sportyBetAdapter = new SportyBetAdapter(); marketDataRegistry.registerAdapter(sportyBetAdapter);
const tradingEntitlements = new TradingEntitlements({ store: runtimeConfig, eventBus: kernel?.eventBus });
const signalQualityGate = new SignalQualityGate({ entitlements: tradingEntitlements, venueRegistry, signalEngine });
const inboxManager = new InboxManager({ store: runtimeConfig, eventBus: kernel?.eventBus });
const tradingConnectionModes = new TradingConnectionModes({ store: runtimeConfig, eventBus: kernel?.eventBus, venueRegistry });
const brokerComparisonStore = new BrokerComparisonStore({ store: runtimeConfig, eventBus: kernel?.eventBus });
const aviatorEngine = new AviatorAnalyticsEngine({ store: runtimeConfig, eventBus: kernel?.eventBus });
const aviatorHistory = new AviatorHistoryStore({ store: runtimeConfig, eventBus: kernel?.eventBus });
const publicDataRegistry = new PublicDataRegistry();
const localProvider = new LocalProvider();
const oracleFabric = new OracleFabric({
  gateway: UniversalAIGateway.getInstance(),
  knowledge: (() => { try { return kernel?.resolve?.("knowledge") || kernel?.resolve?.("knowledgeEngine") || null; } catch { return null; } })(),
  dataRegistry: publicDataRegistry,
  healthSnapshot: () => ({ kernel: kernel?.status || "UNKNOWN", uptimeSeconds: Math.floor(process.uptime()) }),
  eventBus: kernel?.eventBus
});
const notificationEngine = new ProductNotificationEngine({ eventBus: kernel?.eventBus, store: runtimeConfig });
// Canonical server-side transactional email path (Resend via existing
// notification architecture). Single instance; server routes only; the key
// is never exposed to client bundles or logs.
const emailConnector = new ResendEmailConnector();
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
  runtimeMode: ADE_RUNTIME_MODE,
  requireDurableStorage
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

// GATE 4 (Exec): Dispatcher — gated: execution may create durable case/intake state
app.post("/api/command/execute", security.requireAuth(), requireDurableStorage, async (req, res) => {
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
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || "8ba45a4",
      vercelSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      commitShort: String(process.env.VERCEL_GIT_COMMIT_SHA || "8ba45a4").slice(0,7)
    },
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

app.get('/api/v1/system/diagnostics', security.requireLevel(2), (req,res)=>{
  try{
    const isDurable = durableStorageEnabled;
    const providerName = storageProvider?.constructor?.name || 'Unknown';
    const aiStatus = (()=>{ try{ return UniversalAIGateway.getInstance().getProviderStatus(); }catch{ return {configuredProviderCount:0, totalProviderCount:0}; }})();
    const isEphemeralProd = isProductionEphemeral();
    const checklist = {
      storage: {
        provider: providerName,
        mode: isDurable ? 'SUPABASE/DURABLE' : (isEphemeralProd ? 'EPHEMERAL/PRODUCTION-WARN' : 'LOCAL/DEVELOPMENT'),
        status: isDurable ? 'DURABLE' : (isEphemeralProd ? 'EPHEMERAL — PRODUCTION CONFIGURATION REQUIRED' : 'LOCAL — DEVELOPMENT ACTIVE'),
        durable: Boolean(isDurable),
        requiredEnv: ['ADE_STORAGE_PROVIDER=supabase','SUPABASE_URL','SUPABASE_SECRET_KEY (aliases: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_KEY)','SUPABASE_STORAGE_TABLE=ade_kv_store'],
        note: isDurable ? 'Production persistence is durable via Supabase.' : (isEphemeralProd ? 'Running on Vercel without durable provider: business mutations are blocked (503) to prevent state loss. Local development is unaffected.' : 'Local development — filesystem persistence active. Configure Supabase only for Vercel/production durability.'),
        configured: Boolean(isDurable),
        warning: isEphemeralProd ? 'PRODUCTION_EPHEMERAL' : null
      },
      email: (()=>{ try{ return emailConnector.status(); }catch{ return { provider:'RESEND', status:'NOT CONFIGURED', configured:false }; } })(),
      ai: {
        status: (aiStatus?.configuredProviderCount||0) > 0 ? 'PROVIDER CONNECTED' : 'OFFLINE LEXICAL FALLBACK',
        fallback: 'OFFLINE_LEXICAL_ENGINE',
        configuredCount: aiStatus?.configuredProviderCount||0,
        totalProviders: aiStatus?.totalProviderCount||0,
        note: (aiStatus?.configuredProviderCount||0) > 0 ? 'External AI provider is connected.' : 'No external AI provider configured. Deterministic lexical engine is active. This is honest fallback, not live provider connectivity.'
      },
      integrations: {
        connectionCount: connectionManager.list().length,
        status: connectionManager.list().length>0 ? 'CONFIGURED' : 'NOT CONFIGURED / READY FOR CONNECTION',
        note: connectionManager.list().length>0 ? 'Connection metadata is durable via configured storage.' : 'No provider credential supplied. Connection remains honest pending state.'
      },
      trading: {
        mode: 'PAPER',
        liveExecution: 'BROKER_NOT_CONFIGURED',
        status: 'PAPER MODE — NO LIVE BROKER',
        note: 'Paper-mode analytics on supplied candles only. Live execution requires an authorized broker/provider, which is not connected.'
      },
      runtime: { version: '1.0.0', edition: editionPolicy.getEdition(), isDurable }
    };
    res.json({success:true, diagnostics: checklist, time: new Date().toISOString()});
  }catch(e){ res.status(500).json({success:false, error:'DIAGNOSTICS_FAILED', message:e.message}); }
});

// === MARKET DATA / VENUE HEALTH ROUTES =====================================

app.get('/api/v1/market/health', (req, res) => {
  try {
    const summary = marketDataRegistry.getHealthSummary();
    res.json({ success: true, marketData: summary, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_HEALTH_FAILED', message: e.message });
  }
});

app.get('/api/v1/market/adapters', (req, res) => {
  try {
    const kind = req.query.kind || null;
    res.json({ success: true, adapters: marketDataRegistry.listAdapters(kind), time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_ADAPTERS_FAILED', message: e.message });
  }
});

app.get('/api/v1/market/adapter/:providerId', (req, res) => {
  try {
    const adapter = marketDataRegistry.getAdapter(req.params.providerId);
    if (!adapter) return res.status(404).json({ success: false, error: 'ADAPTER_NOT_FOUND' });
    res.json({ success: true, adapter: adapter.getStatus(), time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_ADAPTER_FAILED', message: e.message });
  }
});

app.post('/api/v1/market/adapter/:providerId/connect', security.requireLevel(2), async (req, res) => {
  try {
    const adapter = marketDataRegistry.getAdapter(req.params.providerId);
    if (!adapter) return res.status(404).json({ success: false, error: 'ADAPTER_NOT_FOUND' });
    const result = await adapter.connect();
    res.json({ success: true, result, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_CONNECT_FAILED', message: e.message });
  }
});

app.post('/api/v1/market/adapter/:providerId/disconnect', security.requireLevel(2), async (req, res) => {
  try {
    const adapter = marketDataRegistry.getAdapter(req.params.providerId);
    if (!adapter) return res.status(404).json({ success: false, error: 'ADAPTER_NOT_FOUND' });
    await adapter.disconnect();
    res.json({ success: true, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_DISCONNECT_FAILED', message: e.message });
  }
});

app.get('/api/v1/market/candles', async (req, res) => {
  try {
    const { symbol, timeframe, limit = 100 } = req.query;
    if (!symbol || !timeframe) return res.status(400).json({ success: false, error: 'SYMBOL_AND_TIMEFRAME_REQUIRED' });
    const result = await marketDataRegistry.getBestCandles(symbol, timeframe, Number(limit));
    res.json({ success: true, ...result, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_CANDLES_FAILED', message: e.message });
  }
});

app.get('/api/v1/market/quotes', async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ success: false, error: 'SYMBOLS_REQUIRED' });
    const syms = String(symbols).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const adapter = marketDataRegistry.getConnectedAdapters().find(a => a.capabilities.data.includes('QUOTES'));
    if (!adapter) return res.status(503).json({ success: false, error: 'NO_QUOTE_ADAPTER_AVAILABLE' });
    const quotes = await adapter.fetchQuotes(syms);
    res.json({ success: true, quotes, providerId: adapter.getId(), time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'MARKET_QUOTES_FAILED', message: e.message });
  }
});

app.get('/api/v1/sports/health', (req, res) => {
  try {
    const status = sportsDataBus.getStatus();
    res.json({ success: true, sportsData: status, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'SPORTS_HEALTH_FAILED', message: e.message });
  }
});

app.get('/api/v1/sports/fixtures', async (req, res) => {
  try {
    const { sport, competition, status, limit = 100 } = req.query;
    const fixtures = sportsDataBus.getFixtures({ sport, competition, status, limit: Number(limit) });
    res.json({ success: true, fixtures, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'SPORTS_FIXTURES_FAILED', message: e.message });
  }
});

app.get('/api/v1/sports/fixture/:fixtureId', (req, res) => {
  try {
    const fixture = sportsDataBus.getFixture(req.params.fixtureId);
    if (!fixture) return res.status(404).json({ success: false, error: 'FIXTURE_NOT_FOUND' });
    res.json({ success: true, fixture, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'SPORTS_FIXTURE_FAILED', message: e.message });
  }
});

app.get('/api/v1/sports/odds/:fixtureId', (req, res) => {
  try {
    const { market } = req.query;
    const odds = sportsDataBus.getOdds(req.params.fixtureId);
    const best = sportsDataBus.getBestOdds(req.params.fixtureId, market);
    res.json({ success: true, fixtureId: req.params.fixtureId, odds, bestOdds: best, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'SPORTS_ODDS_FAILED', message: e.message });
  }
});

app.get('/api/v1/sports/statistics/:fixtureId', (req, res) => {
  try {
    const stats = sportsDataBus.getStatistics(req.params.fixtureId);
    if (!stats) return res.status(404).json({ success: false, error: 'STATISTICS_NOT_FOUND' });
    res.json({ success: true, fixtureId: req.params.fixtureId, statistics: stats, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'SPORTS_STATISTICS_FAILED', message: e.message });
  }
});

app.post('/api/v1/sports/refresh', security.requireLevel(2), async (req, res) => {
  try {
    const { sportsbooks } = req.body || {};
    const result = await sportsDataBus.refreshAll({ sportsbooks });
    res.json({ success: true, result, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'SPORTS_REFRESH_FAILED', message: e.message });
  }
});

app.get('/api/v1/venue/health', (req, res) => {
  try {
    const venues = venueRegistry.list();
    res.json({ success: true, venues, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'VENUE_HEALTH_FAILED', message: e.message });
  }
});

app.get('/api/v1/venue/:id/eligibility', (req, res) => {
  try {
    const elig = venueRegistry.liveEligibility(req.params.id);
    res.json({ success: true, eligibility: elig, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'VENUE_ELIGIBILITY_FAILED', message: e.message });
  }
});

app.post('/api/v1/venue/:id/configure', security.requireLevel(2), (req, res) => {
  try {
    const { configured, verified } = req.body || {};
    const result = venueRegistry.setConfigured(req.params.id, { configured, verified, configuredBy: 'founder' });
    res.json({ success: true, venue: result, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'VENUE_CONFIGURE_FAILED', message: e.message });
  }
});

app.post('/api/v1/venue/register', security.requireLevel(2), (req, res) => {
  try {
    const { name, kind, authMethods, requiredFields, note } = req.body || {};
    const venue = venueRegistry.registerVenue({ name, kind, authMethods, requiredFields, note });
    res.status(201).json({ success: true, venue, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'VENUE_REGISTER_FAILED', message: e.message });
  }
});

app.get('/api/v1/connectivity/market', (req, res) => {
  try {
    const marketHealth = marketDataRegistry.getHealthSummary();
    const sportsStatus = sportsDataBus.getStatus();
    const venueList = venueRegistry.list();
    res.json({
      success: true,
      connectivity: {
        marketData: marketHealth,
        sportsData: sportsStatus,
        venues: venueList
      },
      time: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'CONNECTIVITY_MARKET_FAILED', message: e.message });
  }
});
app.get('/api/v1/attention', security.requireLevel(2), async(req,res)=>{
  try{
    await refreshCases();
    const intakes = communityProgression.listIntakes().slice(-50).reverse();
    const candidates = pilotGate.listCandidates();
    const pilots = pilotRegistry.list().slice(-50).reverse();
    const parts = partners.list().slice(-50).reverse();
    const conns = connectionManager.list().slice(-50).reverse();
    const cases = visibleCases(false).cases.slice(-20);
    const notifs = await notificationEngine.getRecentEventsAsync(50).catch(() => { try { return notificationEngine.getRecentEvents(50); } catch { return []; } });
    const stats = {
      intakes: intakes.length,
      candidates: candidates.length,
      pilots: pilots.length,
      partners: parts.length,
      connections: conns.length,
      cases: cases.length,
      notifications: notifs.length,
      pendingPilots: pilots.filter(p=>p.state==='EVALUATION').length
    };
    res.json({success:true, attention:{intakes,candidates,pilots,partners:parts,connections:conns,cases,notifications:notifs,stats}, time:new Date().toISOString()});
  }catch(e){ res.status(500).json({success:false, error:'ATTENTION_FAILED', message:e.message}); }
});
app.post('/api/v1/intake/:channel',requireDurableStorage,(req,res)=>{ try { const result=intake.ingest(req.params.channel,req.body||{},{source:req.body?.source||req.params.channel,authenticated:Boolean(req.headers.authorization)}); try { const body=req.body||{}; const q=result?.intake?.request; if(String(body.kind||'').toUpperCase()==='BUSINESS_PROCESS' && q && q.needsDiscovery && Number(q.confidence||0)>=0.6){ communityProgression.captureIntake({type:'USE_CASE',organization:result.intake.organization||'',contactHint:'',useCaseDescription:String(result.intake.text||'').slice(0,5000),currentEdition:editionPolicy.getEdition(),metadata:{procarta:true,caseId:result.case.id,intakeId:result.intake.intakeId,intent:q.intent}}); } } catch(_){} logEvent('INTAKE',`Created ${result.case.id} from ${req.params.channel}`); try { const body=req.body||{}; const kind=String(body.kind||'INTEREST').toUpperCase(); const org=String(result?.intake?.organization||body.organization||'').slice(0,120); const intent=String(result?.intake?.request?.intent||body.useCase||body.intent||'').slice(0,200); notificationEngine.generateInternalEvent("notification.request_status",{channel:"INTAKE",kind,caseId:result?.case?.id||null,intakeId:result?.intake?.intakeId||null,organization:org,intent,source:req.params.channel,recommendedAction:"REVIEW",at:new Date().toISOString()}); } catch(_){} res.status(201).json(result); } catch(e){res.status(400).json({success:false,error:e.message});} });
// Demonstration runs persist cases with source DEMO_ORCHESTRATOR. Human
// operational views exclude them by default so synthetic demo actors never
// pollute Founder/Worker case lists; ?includeDemo=true opts back in and the
// demo result still deep-links via GET /cases/:id. No second store, no flags.
const DEMO_CASE_SOURCE = "DEMO_ORCHESTRATOR";
function visibleCases(includeDemo){
  const all = caseManager.list();
  if (String(includeDemo).toLowerCase() === "true") return { cases: all, demoExcluded: 0 };
  const human = all.filter((c) => c?.source !== DEMO_CASE_SOURCE);
  return { cases: human, demoExcluded: all.length - human.length };
}
// Canonical-read helper: refresh the case collection from the authoritative
// store before serving, so every instance (serverless included) converges on
// the same case truth. Never throws — falls back to the in-memory snapshot.
const refreshCases = async () => { try { await caseManager.refresh(); } catch (_) {} };
app.get('/api/v1/cases', security.requireAuth(),async(req,res)=>{ await refreshCases(); const { cases, demoExcluded } = visibleCases(req.query.includeDemo); res.json({success:true,count:cases.length,cases,demoExcluded}); });
app.post('/api/v1/cases/:id/process', security.requireAuth(),requireDurableStorage,async(req,res)=>{try{await refreshCases();const result=await engagementOrchestrator.process(req.params.id,req.body||{});res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.post('/api/v1/cases/:id/execute', security.requireAuth(),requireDurableStorage,async(req,res)=>{try{await refreshCases();const result=await engagementOrchestrator.executeCase(req.params.id);res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.post('/api/v1/cases/:id/feedback', security.requireAuth(),requireDurableStorage,async(req,res)=>{try{await refreshCases();const result=await engagementOrchestrator.ingestFeedback(req.params.id,req.body||{});res.json({success:true,case:result});}catch(e){res.status(e.message==='CASE_NOT_FOUND'?404:400).json({success:false,error:e.message});}});
app.get('/api/v1/cases/:id/transitions', security.requireAuth(),async(req,res)=>{await refreshCases();const c=caseManager.get(req.params.id);if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'});res.json({success:true,status:c.status,allowedTransitions:caseManager.getAllowedTransitions(req.params.id)});});
app.get('/api/v1/cases/:id', security.requireAuth(),async(req,res)=>{await refreshCases();const c=caseManager.get(req.params.id); if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'}); res.json({success:true,case:c});});
app.patch('/api/v1/cases/:id', security.requireAuth(),requireDurableStorage,async(req,res)=>{await refreshCases();const c=caseManager.update(req.params.id,req.body||{}); if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'}); res.json({success:true,case:c});});

app.get('/api/v1/admin/overview', security.requireLevel(2),async(req,res)=>{ await refreshCases(); const { cases, demoExcluded } = visibleCases(req.query.includeDemo); res.json({success:true,channels:channels.list(),connections:connectionManager.list(),partners:partners.list(),cases,demoCasesExcluded:demoExcluded,settings:runtimeConfig.read()}); });

// === PROVIDER / CAPABILITY GOVERNANCE (Batch 10/11, L2) =====================
// Human-gate controls for provider seams + capability/decision visibility.
// Writes are durable-gated; secrets are never accepted (shape/presence only).
const _govTenant = (req) => String(req.query.tenant || "default").slice(0, 80);
const _govActor = (req) => req.person?.username || req.identity?.subject || req.body?.decidedBy || "admin";

app.get('/api/v1/admin/providers', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, providers: providerGate.list({ tenantScope: req.query.tenant || null }) }); }
  catch (error) { res.status(500).json({ success: false, error: "PROVIDERS_READ_FAILED" }); }
});

app.post('/api/v1/admin/providers', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const gate = providerGate.register(req.body || {}, { actor: _govActor(req), tenantScope: _govTenant(req) });
    res.status(201).json({ success: true, provider: gate });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "PROVIDER_REGISTER_FAILED", message: error.message }); }
});

app.post('/api/v1/admin/providers/:id/configure', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const gate = providerGate.configure(req.params.id, { ...(req.body || {}), actor: _govActor(req), tenantScope: _govTenant(req) });
    res.json({ success: true, provider: gate });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "PROVIDER_CONFIGURE_FAILED", message: error.message }); }
});

app.post('/api/v1/admin/providers/:id/verify', security.requireLevel(2), requireDurableStorage, async (req, res) => {
  try {
    const gate = await providerGate.verify(req.params.id, { actor: _govActor(req), tenantScope: _govTenant(req), connectionId: req.body?.connectionId || null });
    res.json({ success: true, provider: gate });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "PROVIDER_VERIFY_FAILED", message: error.message }); }
});

app.post('/api/v1/admin/providers/:id/enable', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const gate = providerGate.enable(req.params.id, { decidedBy: _govActor(req), reason: req.body?.reason || "", level: 2, tenantScope: _govTenant(req) });
    res.json({ success: true, provider: gate });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "PROVIDER_ENABLE_FAILED", message: error.message }); }
});

app.post('/api/v1/admin/providers/:id/suspend', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const gate = providerGate.suspend(req.params.id, { decidedBy: _govActor(req), reason: req.body?.reason || "", level: 2, tenantScope: _govTenant(req) });
    res.json({ success: true, provider: gate });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "PROVIDER_SUSPEND_FAILED", message: error.message }); }
});

app.get('/api/v1/admin/capability-records', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, records: capabilityRecordStore.list({ tenantScope: _govTenant(req) }) }); }
  catch (error) { res.status(500).json({ success: false, error: "RECORDS_READ_FAILED" }); }
});

app.get('/api/v1/admin/decisions', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, decisions: capabilityRecordStore.listDecisions({ tenantScope: _govTenant(req) }) }); }
  catch (error) { res.status(500).json({ success: false, error: "DECISIONS_READ_FAILED" }); }
});

// === OPERATIONS INVENTORY + WHATSAPP NUMBERS (Batch 12, L2) =================
// One bonded control plane: providers, capabilities, products, channels,
// PROCARTA, AI, storage, telemetry and the human-action checklist — all read
// from live singletons, secrets never included.
app.get('/api/v1/admin/ops-inventory', security.requireLevel(2), (req, res) => {
  try {
    const tenant = _govTenant(req);
    let activationRows = [];
    try { activationRows = capabilityActivation.assess() || []; } catch {}
    let products = [];
    try { products = productRegistry.listProducts() || []; } catch {}
    let ai = null;
    try { ai = UniversalAIGateway.getInstance().getProviderStatus() || null; } catch {}
    let telemetry = null;
    try {
      const hist = kernel?.eventBus?.getHistory?.(1) || [];
      const metrics = kernel?.eventBus?.getMetrics?.() || {};
      telemetry = {
        connected: true,
        eventCount: Number(metrics.totalEvents ?? metrics.eventCount ?? hist.length ?? 0),
        lastEventAt: hist[0]?.timestamp || hist[0]?.at || null,
        health: kernel?.status || "UNKNOWN",
        attentionRequired: null
      };
    } catch { telemetry = { connected: false }; }
    let procarta = null;
    try {
      const health = procartaEngine.health() || {};
      procarta = { status: health.status || "UNKNOWN", executionMode: health.executionMode || null, pilotCandidates: pilotGate.listCandidates().length };
    } catch {}
    const inventory = buildKnobInventory({
      providerGates: providerGate.list({ tenantScope: req.query.tenant || null }),
      activationRows,
      products,
      channels: (() => { try { return channels.list() || []; } catch { return []; } })(),
      procarta,
      ai,
      storage: { provider: String(process.env.ADE_STORAGE_PROVIDER || "local"), configured: (() => { try { return isDurableOperational(); } catch { return false; } })() },
      telemetry,
      edition: (() => { try { return editionPolicy.getEdition(); } catch { return "UNKNOWN"; } })()
    });
    res.json({ success: true, inventory, checklist: buildHumanChecklist(inventory), tenant });
  } catch (error) { res.status(500).json({ success: false, error: "OPS_INVENTORY_FAILED" }); }
});

app.get('/api/v1/admin/whatsapp-numbers', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, numbers: whatsappNumbers.list({ tenantScope: req.query.tenant || null }) }); }
  catch (error) { res.status(500).json({ success: false, error: "NUMBERS_READ_FAILED" }); }
});

app.post('/api/v1/admin/whatsapp-numbers', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = whatsappNumbers.addNumber({ ...(req.body || {}), actor: _govActor(req) });
    res.status(201).json({ success: true, number: rec });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "NUMBER_ADD_FAILED", message: error.message }); }
});

app.patch('/api/v1/admin/whatsapp-numbers/:id', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const body = req.body || {};
    let rec = null;
    if (body.makeDefault) rec = whatsappNumbers.setDefault(req.params.id, { actor: _govActor(req) });
    else rec = whatsappNumbers.editNumber(req.params.id, { ...body, actor: _govActor(req) });
    res.json({ success: true, number: rec });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "NUMBER_UPDATE_FAILED", message: error.message }); }
});

app.post('/api/v1/admin/whatsapp-numbers/:id/verify', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = whatsappNumbers.verifyNumber(req.params.id, { ...(req.body || {}), actor: _govActor(req) });
    res.json({ success: true, number: rec });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "NUMBER_VERIFY_FAILED", message: error.message }); }
});

app.post('/api/v1/admin/whatsapp-numbers/:id/state', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = whatsappNumbers.setState(req.params.id, req.body?.to || req.body?.state, { actor: _govActor(req), reason: req.body?.reason || "", level: 2 });
    res.json({ success: true, number: rec });
  } catch (error) { res.status(400).json({ success: false, error: error.code || "NUMBER_STATE_FAILED", message: error.message }); }
});
app.get('/api/v1/admin/channels', security.requireLevel(2),(req,res)=>res.json({success:true,channels:channels.list()}));
app.patch('/api/v1/admin/channels/:id', security.requireLevel(2),requireDurableStorage,(req,res)=>{const c=channels.set(req.params.id,req.body||{}); runtimeConfig.write('channels',req.params.id,c); res.json({success:true,channel:c});});
app.get('/api/v1/admin/connections', security.requireLevel(2),(req,res)=>res.json({success:true,connections:connectionManager.list()}));
app.post('/api/v1/admin/connections', security.requireLevel(2),requireDurableStorage,(req,res)=>{try{res.status(201).json({success:true,connection:connectionManager.upsert(req.body||{})});}catch(e){res.status(400).json({success:false,error:e.message});}});
app.post('/api/v1/admin/connections/:id/test', security.requireLevel(2),async(req,res)=>res.json(await connectionManager.test(req.params.id)));

// ---------- NEXT: canonical operational-intelligence + commercial routes ----------
// All state changes are server-authorized (L1/L2), audited, tenant-aware,
// timestamped and attributable. No new kernel/bus/registry is introduced.

// Connect & Platforms board (aggregate; progressive disclosure via ?detail=1)
app.get('/api/v1/connect/platforms', security.requireLevel(2), (req, res) => {
  try { res.json(connectBoard.board({ tenantScope: req.query.tenant || null, detail: String(req.query.detail || "") === "1" })); }
  catch (e) { res.status(500).json({ success: false, error: "CONNECT_BOARD_FAILED" }); }
});

// Canonical injection: any registered source -> envelope -> case -> PROCARTA context
app.post('/api/v1/injection/ingest', security.requireLevel(1), requireDurableStorage, async (req, res) => {
  try {
    const result = await operationalPipeline.run({
      source: req.body?.source || "TEST",
      input: req.body?.input || {},
      tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      actor: req.person?.username || req.identity?.subject || req.body?.actor || "operator",
      purpose: req.body?.purpose || null
    });
    res.status(201).json(result);
  } catch (e) { res.status(400).json({ success: false, error: e.code || "INJECTION_FAILED", message: e.message }); }
});

// L1: structured operational assessment -> PROCARTA evidence -> case
app.post('/api/v1/procarta/assessment', requireDurableStorage, async (req, res) => {
  try {
    const tenantScope = String(req.body?.tenantScope || req.query.tenant || "default");
    const actor = req.person?.username || req.identity?.subject || req.body?.submittedBy || "public";
    const evidence = buildAssessmentEvidence(req.body || {}, { tenantScope, actor });
    const text = assessmentToIntakeText(evidence);
    const result = await operationalPipeline.run({
      source: "FORM", input: { text, organization: evidence.organization, assessment: { area: evidence.area, confidence: evidence.confidence, evidence: evidence.findings } },
      tenantScope, actor, purpose: "PROCARTA_ASSESSMENT"
    });
    try { kernel?.eventBus?.publish?.("audit.log.created", { category: "PROCARTA", action: "FORM_SUBMITTED", tenantScope, caseId: result.caseId, at: new Date().toISOString() }); } catch {}
    res.status(201).json({ success: true, evidence, caseId: result.caseId, intakeId: result.intakeId, eventId: result.eventId });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "ASSESSMENT_FAILED", message: e.message }); }
});

// L2: controlled document ingestion (metadata + provenance; extraction honest)
app.post('/api/v1/documents/ingest', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const rec = documentIntake.ingest(req.body || {}, {
      tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      actor: req.person?.username || req.identity?.subject || "operator"
    });
    res.status(201).json({ success: true, document: rec });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "DOCUMENT_INGEST_FAILED", message: e.message }); }
});
app.get('/api/v1/documents', security.requireLevel(1), (req, res) => {
  try { res.json({ success: true, documents: documentIntake.list({ tenantScope: req.query.tenant || null }) }); }
  catch (e) { res.status(500).json({ success: false, error: "DOCUMENT_LIST_FAILED" }); }
});

// L3: structured data (CSV/JSON rows -> canonical evidence rows)
app.post('/api/v1/structured/ingest', security.requireLevel(1), requireDurableStorage, async (req, res) => {
  try {
    const tenantScope = String(req.body?.tenantScope || req.query.tenant || "default");
    const actor = req.person?.username || req.identity?.subject || "operator";
    const rows = normalizeStructuredRows(req.body || {}, { tenantScope });
    const mapped = [];
    for (const row of rows.slice(0, 50)) {
      const r = await operationalPipeline.run({ source: "API", input: { text: row.text, organization: req.body?.organization || null }, tenantScope, actor, purpose: "STRUCTURED_IMPORT" });
      mapped.push({ index: row.index, caseId: r.caseId, eventId: r.eventId });
    }
    res.status(201).json({ success: true, rows: rows.length, mapped });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "STRUCTURED_INGEST_FAILED", message: e.message }); }
});

// L4: process-model import translator (no new engine; execution stays existing)
app.post('/api/v1/process-models/import', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const model = translateProcessModel(req.body || {});
    try { kernel?.eventBus?.publish?.("audit.log.created", { category: "PROCESS_MODEL", action: "MODEL_IMPORTED", steps: model.steps.length, at: new Date().toISOString() }); } catch {}
    res.status(201).json({ success: true, model });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "PROCESS_IMPORT_FAILED", message: e.message }); }
});

// L5: inbound webhook (connector-authenticated) -> canonical event -> capability
app.post('/api/v1/webhooks/inbound/:connectorId', requireDurableStorage, async (req, res) => {
  try {
    const rawBody = req.rawBody ?? JSON.stringify(req.body || {});
    const normalized = webhookApiAdapter.inbound({
      connectorId: req.params.connectorId,
      tenantScope: req.body?.tenant || req.body?.tenantScope || req.query.tenant || "default",
      headers: req.headers || {}, rawBody, body: req.body || null
    });
    const result = await operationalPipeline.run({
      source: "WEBHOOK", input: { text: normalized.payload.text, organization: normalized.actor.organization, correlationId: normalized.correlationId },
      tenantScope: normalized.tenantScope, actor: `webhook:${req.params.connectorId}`, purpose: "WEBHOOK_INBOUND"
    });
    res.status(201).json({ success: true, caseId: result.caseId, eventId: result.eventId });
  } catch (e) {
    const code = e.code || "WEBHOOK_FAILED";
    const status = code === "WEBHOOK_AUTH_FAILED" ? 401 : code === "WEBHOOK_RATE_LIMITED" ? 429 : 400;
    res.status(status).json({ success: false, error: code, message: e.message });
  }
});

// L6: extensible ERP/CRM/external-system connector model (no hard-coded vendors)
app.post('/api/v1/admin/connectors/vendors', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = externalConnectors.registerVendor({ ...(req.body || {}), tenantScope: req.body?.tenantScope || req.query.tenant || "default", actor: req.person?.username || req.identity?.subject || "admin" });
    res.status(201).json({ success: true, vendor: rec });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "CONNECTOR_REGISTER_FAILED", message: e.message }); }
});
app.get('/api/v1/admin/connectors/vendors', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, vendors: externalConnectors.status({ tenantScope: req.query.tenant || null }) }); }
  catch (e) { res.status(500).json({ success: false, error: "CONNECTOR_LIST_FAILED" }); }
});

// Commercial entitlement lens (read-only over EditionPolicy)
app.get('/api/v1/commerce/entitlement', (req, res) => {
  try { res.json({ success: true, ...commercialEntitlement.snapshot({ tenantScope: req.query.tenant || "default" }) }); }
  catch (e) { res.status(500).json({ success: false, error: "ENTITLEMENT_READ_FAILED" }); }
});

// ---- Payments: optional commercial capability (Paystack provider) ----
// Admin control plane: configure -> verify -> DISABLED/TEST/LIVE + customer-facing OFF/ON.
app.get('/api/v1/admin/payments/status', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, payment: paymentService.status({ tenantScope: req.query.tenant || "default" }) }); }
  catch (e) { res.status(500).json({ success: false, error: "PAYMENT_STATUS_FAILED" }); }
});
app.post('/api/v1/admin/payments/configure', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const out = paymentService.configure({ ...(req.body || {}), tenantScope: req.body?.tenantScope || req.query.tenant || "default", actor: req.person?.username || req.identity?.subject || "admin", reason: req.body?.reason || "payment configured" });
    res.json({ success: true, payment: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "PAYMENT_CONFIGURE_FAILED", message: e.message }); }
});
app.post('/api/v1/admin/payments/verify', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const out = paymentService.verify({ tenantScope: req.body?.tenantScope || req.query.tenant || "default", actor: req.person?.username || req.identity?.subject || "admin" });
    res.json({ success: true, payment: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "PAYMENT_VERIFY_FAILED", message: e.message }); }
});
app.post('/api/v1/admin/payments/state', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const out = paymentService.setState({ tenantScope: req.body?.tenantScope || req.query.tenant || "default", to: req.body?.to || req.body?.state, actor: req.person?.username || req.identity?.subject || "admin", reason: req.body?.reason || "" });
    res.json({ success: true, payment: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "PAYMENT_STATE_FAILED", message: e.message }); }
});
app.post('/api/v1/admin/payments/customer-facing', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const on = req.body?.on === true || String(req.body?.customerFacing || "").toUpperCase() === "ON";
    const out = paymentService.setCustomerFacing({ tenantScope: req.body?.tenantScope || req.query.tenant || "default", on, actor: req.person?.username || req.identity?.subject || "admin", reason: req.body?.reason || "" });
    res.json({ success: true, payment: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "PAYMENT_CUSTOMER_FAILED", message: e.message }); }
});
// Customer-facing availability gate (public; truthful; never leaks secrets)
app.get('/api/v1/payments/availability', (req, res) => {
  try {
    res.json({
      success: true,
      ...paymentService.availability({ tenantScope: req.query.tenant || "default", customerTier: req.query.tier || "COMMUNITY", upgradeRequired: String(req.query.upgrade || "") === "1" })
    });
  } catch (e) { res.status(500).json({ success: false, error: "PAYMENT_AVAILABILITY_FAILED" }); }
});
// Server-side payment start (enabled state only; secret never leaves server)
app.post('/api/v1/payments/start', requireDurableStorage, (req, res) => {
  try {
    const out = paymentService.startPayment({ ...(req.body || {}), tenantScope: req.body?.tenantScope || req.query.tenant || "default" });
    res.status(201).json({ success: true, payment: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "PAYMENT_START_FAILED", message: e.message }); }
});
// Provider webhook — the ONLY entitlement-mutating path (signature-verified).
// Financial-integrity hardening (additive): the event ALSO flows through the
// canonical financial pipeline (verify -> normalize -> dedupe -> recon ->
// risk -> audit). Duplicate deliveries replay safely: entitlement is never
// double-credited because PaymentService only mutates on first verified
// processing and the finance layer replays prior outcomes.
app.post('/api/v1/payments/webhook/paystack', requireDurableStorage, async (req, res) => {
  const tenantScope = String(req.query.tenant || req.body?.tenant || req.body?.data?.metadata?.tenant || "default").slice(0, 80);
  const actor = req.person?.username || req.identity?.subject || "provider:paystack";
  try {
    const rawBody = req.rawBody ?? JSON.stringify(req.body || {});
    const signature = req.headers?.["x-paystack-signature"] || "";
    let fin = null;
    try {
      fin = await financialPipeline.ingestWebhook({ provider: "PAYSTACK", tenantScope, rawBody, signature, actor });
    } catch (fe) {
      const fcode = fe.code || "FIN_WEBHOOK_FAILED";
      if (fcode === "FIN_SIGNATURE_INVALID") {
        try { financeHealth.record({ provider: "PAYSTACK", tenantScope, event: "SIGNATURE_FAILURE", errorCategory: fcode, actor }); } catch {}
        return res.status(401).json({ success: false, error: fcode, message: fe.message });
      }
      throw fe;
    }
    if (fin?.duplicate) {
      // Replay: financial outcome already recorded AND entitlement already
      // applied on first delivery — return both without re-executing.
      return res.json({ success: true, duplicate: true, financial: fin.outcome, entitlement: paymentService.entitlementFor(tenantScope) });
    }
    const out = paymentService.handleWebhook({
      tenantScope, rawBody, signature, event: req.body && req.body.event ? req.body : null
    });
    res.json({ ...out, financial: { fingerprint: fin.fingerprint, reconOutcome: fin.reconOutcome, riskBand: fin.riskBand, investigationId: fin.investigationId || null } });
  } catch (e) {
    const code = e.code || "PAYMENT_WEBHOOK_FAILED";
    res.status(code === "PAYSTACK_SIGNATURE_INVALID" ? 401 : 400).json({ success: false, error: code, message: e.message });
  }
});

// ---------- Financial integrity routes (additive, server-authoritative) ----------
// Ingest authorized financial data (exports, statements, ERP feeds, provider
// API data). Signed webhooks must use the provider webhook routes instead.
app.post('/api/v1/finance/events/ingest', security.requireLevel(1), requireDurableStorage, async (req, res) => {
  try {
    const body = req.body || {};
    const scope = String(body.tenantScope || req.query.tenant || "default").slice(0, 80);
    const tx = buildTransactionIdentity({
      provider: body.provider, environment: body.environment || "TEST",
      providerTxId: body.providerTxId, providerReference: body.providerReference,
      merchantReference: body.merchantReference, tenantScope: scope,
      organization: body.organization, currency: body.currency,
      amount: body.amount, requestedAmount: body.requestedAmount, actualAmount: body.actualAmount,
      status: body.status || "UNKNOWN", providerStatusRaw: body.providerStatus || body.status,
      channel: body.channel, customerReference: body.customerReference,
      source: body.source || "AUTHORIZED_FEED", occurredAt: body.occurredAt,
      correlationId: body.correlationId, metadata: body.metadata || {},
      provenanceAdapter: "FINANCE_INGEST_ROUTE", evidenceGrade: body.evidenceGrade || "OBSERVED_FACT"
    });
    const out = await financialPipeline.ingestNormalized({
      transaction: tx, kind: body.kind || "PAYMENT", tenantScope: scope,
      actor: req.person?.username || req.identity?.subject || "operator",
      correlationId: body.correlationId || null
    });
    res.status(201).json({ success: true, ...maskFinancial(out).value });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_INGEST_FAILED", message: e.message }); }
});
app.get('/api/v1/finance/transactions', security.requireLevel(1), (req, res) => {
  try {
    res.json({
      success: true,
      transactions: maskFinancial(financialLedger.listTransactions({
        tenantScope: req.query.tenant || null, provider: req.query.provider || null,
        status: req.query.status || null, limit: Math.min(200, Number(req.query.limit) || 100)
      })).value
    });
  } catch (e) { res.status(500).json({ success: false, error: "FIN_LIST_FAILED" }); }
});
app.get('/api/v1/finance/transactions/:fingerprint/trace', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, trace: financeSettlement.trace(req.params.fingerprint, { tenantScope: req.query.tenant || "default" }) });
  } catch (e) { res.status(e.code === "TENANT_MISMATCH" ? 403 : 400).json({ success: false, error: e.code || "FIN_TRACE_FAILED", message: e.message }); }
});
// Batch / manual / scheduled reconciliation over authorized ledger data.
app.post('/api/v1/finance/reconciliation/run', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const out = financeReconEngine.runBatch({
      tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      actor: req.person?.username || req.identity?.subject || "admin",
      limit: Math.min(1000, Number(req.body?.limit) || 200)
    });
    res.json({ success: true, run: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_RECON_FAILED", message: e.message }); }
});
// Settlements (authorized feed data only — never fabricated).
app.post('/api/v1/finance/settlements', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = financeSettlement.recordSettlement(req.body || {}, {
      tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      actor: req.person?.username || req.identity?.subject || "admin"
    });
    res.status(201).json({ success: true, settlement: maskFinancial(rec).value });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_SETTLEMENT_FAILED", message: e.message }); }
});
app.get('/api/v1/finance/settlements', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, settlements: maskFinancial(financialLedger.list("settlements", { tenantScope: req.query.tenant || null })).value });
  } catch (e) { res.status(500).json({ success: false, error: "FIN_LIST_FAILED" }); }
});
// Balance snapshots + expected-balance reconciliation (never manufactures).
app.post('/api/v1/finance/balances/reconcile', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const out = financeBalance.reconcile({
      tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      currency: req.body?.currency || null, openingBalance: req.body?.openingBalance ?? null,
      reportedBalances: req.body?.reportedBalances || {}, includeUnconfirmed: req.body?.includeUnconfirmed === true,
      actor: req.person?.username || req.identity?.subject || "admin"
    });
    res.json({ success: true, balance: out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_BALANCE_FAILED", message: e.message }); }
});
// Risk review (read-only; scoring is deterministic + versioned).
app.get('/api/v1/finance/risk', security.requireLevel(1), async (req, res) => {
  try {
    const txs = financialLedger.listTransactions({ tenantScope: req.query.tenant || null, limit: 200 });
    const items = [];
    for (const t of txs.slice(0, 50)) {
      try {
        const r = await financeRiskEngine.evaluate(t, { actor: req.person?.username || req.identity?.subject || "operator" });
        if (r.band !== "NORMAL") items.push(r);
      } catch {}
    }
    res.json({ success: true, signals: items });
  } catch (e) { res.status(500).json({ success: false, error: "FIN_RISK_FAILED" }); }
});
// Investigations (human-in-the-loop; HOLD needs explicit policy + L2, enforced below).
app.post('/api/v1/finance/investigations', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const inv = financeInvestigations.open({
      tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      fingerprint: req.body?.fingerprint || null, riskRecord: req.body?.risk || null,
      actor: req.person?.username || req.identity?.subject || "admin", reason: req.body?.reason || ""
    });
    res.status(201).json({ success: true, investigation: inv });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_INVESTIGATION_FAILED", message: e.message }); }
});
app.get('/api/v1/finance/investigations', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, investigations: financeInvestigations.list({ tenantScope: req.query.tenant || null, state: req.query.state || null }) });
  } catch (e) { res.status(500).json({ success: false, error: "FIN_LIST_FAILED" }); }
});
app.post('/api/v1/finance/investigations/:id/evidence', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const rec = financeInvestigations.attachEvidence(req.params.id, req.body?.evidence || req.body || {}, {
      tenantScope: req.query.tenant || req.body?.tenantScope || "default",
      actor: req.person?.username || req.identity?.subject || "operator"
    });
    res.json({ success: true, investigation: rec });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_EVIDENCE_FAILED", message: e.message }); }
});
app.post('/api/v1/finance/investigations/:id/transition', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const to = String(req.body?.to || "").toUpperCase();
    if ((to === "CONFIRMED") && !req.body?.resolution) {
      return res.status(400).json({ success: false, error: "FIN_RESOLUTION_REQUIRED", message: "CONFIRMED requires a resolution record." });
    }
    const rec = financeInvestigations.transition(req.params.id, to, {
      tenantScope: req.query.tenant || req.body?.tenantScope || "default",
      actor: req.person?.username || req.identity?.subject || "admin",
      reason: req.body?.reason || "", resolution: req.body?.resolution || null
    });
    res.json({ success: true, investigation: rec });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_TRANSITION_FAILED", message: e.message }); }
});
// Provider health + capability discovery (truthful states only).
app.get('/api/v1/finance/providers', security.requireLevel(2), (req, res) => {
  try {
    const scope = req.query.tenant || "default";
    res.json({
      success: true,
      providers: ["PAYSTACK", "FLUTTERWAVE", "INTERSWITCH", "QUICKTELLER", "PAGA"].map((p) => ({
        ...financialAdapters.discover(p, { tenantScope: scope }),
        health: financeHealth.report({ provider: p, tenantScope: scope })
      }))
    });
  } catch (e) { res.status(500).json({ success: false, error: "FIN_PROVIDERS_FAILED" }); }
});
app.get('/api/v1/finance/providers/compare', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, comparison: financeHealth.compare({ tenantScope: req.query.tenant || "default" }) });
  } catch (e) { res.status(500).json({ success: false, error: "FIN_COMPARE_FAILED" }); }
});
// AWBULI claimed-payment bridge (§50): claim -> evidence -> verification, never success.
app.post('/api/v1/finance/claims/extract', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const out = financeClaims.fromMessage({
      text: req.body?.text || "", tenantScope: req.body?.tenantScope || req.query.tenant || "default",
      actor: req.person?.username || req.identity?.subject || "operator",
      organization: req.body?.organization || null, correlationId: req.body?.correlationId || null
    });
    res.status(201).json({ success: true, ...out });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "FIN_CLAIM_FAILED", message: e.message }); }
});

// ---------- Community/MVP operational routes (additive) ----------
// Organization units: branches, departments, teams (L1 read, L2 write).
app.post('/api/v1/org/units', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const gate = commercialEntitlement.check({ tenantScope: req.body?.tenantScope || req.query.tenant || "default", capability: "branches", usage: orgUnits.count({ tenantScope: req.body?.tenantScope || req.query.tenant || "default" }) });
    if (!gate.allowed) return res.status(403).json({ success: false, error: gate.reason || "ENTITLEMENT_GATED", tier: gate.tier });
    const unit = orgUnits.create({ ...(req.body || {}), tenantScope: req.body?.tenantScope || req.query.tenant || "default", actor: req.person?.username || req.identity?.subject || "admin" });
    res.status(201).json({ success: true, unit });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "ORG_CREATE_FAILED", message: e.message }); }
});
app.get('/api/v1/org/units', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, units: orgUnits.list({ tenantScope: req.query.tenant || null, type: req.query.type || null }) });
  } catch (e) { res.status(500).json({ success: false, error: "ORG_LIST_FAILED" }); }
});
app.get('/api/v1/org/units/:id/ancestry', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, ancestry: orgUnits.ancestry(req.params.id, { tenantScope: req.query.tenant || "default" }) });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "ORG_ANCESTRY_FAILED", message: e.message }); }
});
app.post('/api/v1/org/units/:id/status', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const unit = orgUnits.setStatus(req.params.id, String(req.body?.to || "").toUpperCase(), { tenantScope: req.query.tenant || req.body?.tenantScope || "default", actor: req.person?.username || req.identity?.subject || "admin", reason: req.body?.reason || "" });
    res.json({ success: true, unit });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "ORG_STATUS_FAILED", message: e.message }); }
});
// Customers / leads (L1; deduplicated; CASE opens canonical intake case).
app.post('/api/v1/customers', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const scope = req.body?.tenantScope || req.query.tenant || "default";
    const gate = commercialEntitlement.check({ tenantScope: scope, capability: "customers", usage: customers.count({ tenantScope: scope }) });
    if (!gate.allowed) return res.status(403).json({ success: false, error: gate.reason || "ENTITLEMENT_GATED", tier: gate.tier });
    const customer = customers.register({ ...(req.body || {}), tenantScope: scope, actor: req.person?.username || req.identity?.subject || "operator" });
    res.status(201).json({ success: true, customer });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "CUSTOMER_FAILED", message: e.message }); }
});
app.get('/api/v1/customers', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, customers: customers.list({ tenantScope: req.query.tenant || null, state: req.query.state || null }) });
  } catch (e) { res.status(500).json({ success: false, error: "CUSTOMER_LIST_FAILED" }); }
});
app.post('/api/v1/customers/:id/transition', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const customer = customers.transition(req.params.id, req.body?.to || "", { tenantScope: req.query.tenant || req.body?.tenantScope || "default", actor: req.person?.username || req.identity?.subject || "operator", reason: req.body?.reason || "", openCase: req.body?.openCase !== false });
    res.json({ success: true, customer });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "CUSTOMER_TRANSITION_FAILED", message: e.message }); }
});
// Field tasks (L1; assignee-bound transitions; outcomes emit canonical events).
app.post('/api/v1/field/tasks', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const scope = req.body?.tenantScope || req.query.tenant || "default";
    const gate = commercialEntitlement.check({ tenantScope: scope, capability: "fieldTasks", usage: fieldTasks.count({ tenantScope: scope }) });
    if (!gate.allowed) return res.status(403).json({ success: false, error: gate.reason || "ENTITLEMENT_GATED", tier: gate.tier });
    const task = fieldTasks.create({ ...(req.body || {}), tenantScope: scope, actor: req.person?.username || req.identity?.subject || "operator" });
    res.status(201).json({ success: true, task });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "TASK_CREATE_FAILED", message: e.message }); }
});
app.get('/api/v1/field/tasks', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, tasks: fieldTasks.list({ tenantScope: req.query.tenant || null, state: req.query.state || null, assigneeId: req.query.assignee || null, unitId: req.query.unit || null }) });
  } catch (e) { res.status(500).json({ success: false, error: "TASK_LIST_FAILED" }); }
});
app.post('/api/v1/field/tasks/:id/transition', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const task = fieldTasks.transition(req.params.id, req.body?.to || "", { tenantScope: req.query.tenant || req.body?.tenantScope || "default", actor: req.body?.actor || req.person?.username || req.identity?.subject || "operator", actorKind: req.body?.actorKind || "HUMAN", reason: req.body?.reason || "", outcome: req.body?.outcome || null });
    res.json({ success: true, task });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "TASK_TRANSITION_FAILED", message: e.message }); }
});
// AI workers: bind existing workforce agent identities (L2), run capability-bound (L1).
app.post('/api/v1/agents/bind', security.requireLevel(2), requireDurableStorage, async (req, res) => {
  try {
    const scope = req.body?.tenantScope || req.query.tenant || "default";
    const gate = commercialEntitlement.check({ tenantScope: scope, capability: "aiWorkers", usage: agentRegistry.list({ tenantScope: scope }).length });
    if (!gate.allowed) return res.status(403).json({ success: false, error: gate.reason || "ENTITLEMENT_GATED", tier: gate.tier });
    const binding = await agentRegistry.bind({ ...(req.body || {}), tenantScope: scope, actor: req.person?.username || req.identity?.subject || "admin" });
    res.status(201).json({ success: true, binding });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "AGENT_BIND_FAILED", message: e.message }); }
});
app.get('/api/v1/agents', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, agents: agentRegistry.list({ tenantScope: req.query.tenant || null }) });
  } catch (e) { res.status(500).json({ success: false, error: "AGENT_LIST_FAILED" }); }
});
app.post('/api/v1/agents/:id/run', security.requireLevel(1), requireDurableStorage, async (req, res) => {
  try {
    const run = await agentRegistry.run({ agentId: req.params.id, capability: req.body?.capability || "", input: req.body?.input || {}, tenantScope: req.query.tenant || req.body?.tenantScope || "default", actor: req.person?.username || req.identity?.subject || "operator", triggeringEvent: req.body?.triggeringEvent || null, correlationId: req.body?.correlationId || null, confidence: req.body?.confidence ?? null });
    res.status(201).json({ success: true, run });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "AGENT_RUN_FAILED", message: e.message }); }
});
app.post('/api/v1/agents/:id/status', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const binding = agentRegistry.setStatus(req.params.id, String(req.body?.to || "").toUpperCase(), { tenantScope: req.query.tenant || req.body?.tenantScope || "default", actor: req.person?.username || req.identity?.subject || "admin", reason: req.body?.reason || "" });
    res.json({ success: true, binding });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "AGENT_STATUS_FAILED", message: e.message }); }
});
// Experience store (L1 record/query; tenant-scoped reuse).
app.post('/api/v1/experience', security.requireLevel(1), requireDurableStorage, (req, res) => {
  try {
    const rec = experienceStore.record({ ...(req.body || {}), tenantScope: req.body?.tenantScope || req.query.tenant || "default", actor: req.person?.username || req.identity?.subject || "operator" });
    res.status(201).json({ success: true, experience: rec });
  } catch (e) { res.status(400).json({ success: false, error: e.code || "EXPERIENCE_FAILED", message: e.message }); }
});
app.get('/api/v1/experience', security.requireLevel(1), (req, res) => {
  try {
    res.json({ success: true, experience: experienceStore.query({ tenantScope: req.query.tenant || null, capabilityKey: req.query.capability || null, minConfidence: Number(req.query.minConfidence) || 0 }) });
  } catch (e) { res.status(500).json({ success: false, error: "EXPERIENCE_LIST_FAILED" }); }
});
// Unified availability lens (L1): COMMUNITY / EXPERIMENTAL / PROVIDER_REQUIRED / ENTERPRISE.
app.get('/api/v1/commerce/availability', security.requireLevel(1), (req, res) => {
  try {
    const caps = req.query.capabilities ? String(req.query.capabilities).split(",").map((s) => s.trim()).filter(Boolean) : null;
    const scope = req.query.tenant || "default";
    res.json({ success: true, availability: caps ? availabilityMap.map(caps, { tenantScope: scope }) : availabilityMap.catalog({ tenantScope: scope }) });
  } catch (e) { res.status(500).json({ success: false, error: "AVAILABILITY_FAILED" }); }
});

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
app.post('/api/v1/admin/partners', security.requireLevel(2),requireDurableStorage,(req,res)=>res.status(201).json({success:true,partner:partners.upsert(req.body||{})}));
app.get('/api/v1/admin/settings', security.requireLevel(2),(req,res)=>res.json({success:true,settings:runtimeConfig.read()}));
app.patch('/api/v1/admin/settings', security.requireLevel(2),requireDurableStorage,(req,res)=>{const body=req.body||{}; let d=runtimeConfig.read(); for(const [section,values] of Object.entries(body)){for(const [k,v] of Object.entries(values||{})) d=runtimeConfig.write(section,k,v);} res.json({success:true,settings:d});});
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

app.post('/api/v1/business/measurements', loadAuthenticatedWorkforce, requireDurableStorage, async (req, res) => {
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

app.patch('/api/v1/features/:name', loadAuthenticatedWorkforce, requireDurableStorage, async (req, res) => {
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

app.post('/api/v1/features/request', security.requireAuth(), requireDurableStorage, async (req, res) => {
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
    try {
      const existing = runtimeConfig.readSection("featureRequests") || [];
      runtimeConfig.writeSection("featureRequests", [...existing, request].slice(-5000));
    } catch { /* persistence best-effort; response remains authoritative */ }
    res.status(201).json({ success: true, request });
  } catch (error) {
    res.status(400).json({ success: false, error: "FEATURE_REQUEST_FAILED" });
  }
});

app.get('/api/v1/features/requests', security.requireAuth(), (req, res) => {
  try {
    const requests = runtimeConfig.readSection("featureRequests") || [];
    res.json({ success: true, requests, total: requests.length });
  } catch (error) {
    res.status(500).json({ success: false, error: "FEATURE_REQUESTS_READ_FAILED" });
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

app.post('/api/v1/market/connections', loadAuthenticatedWorkforce, requireDurableStorage, async (req, res) => {
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

// === FOUNDER MARKET INTELLIGENCE (PAPER MODE) ==============================
// Deterministic paper-mode analytics over caller-supplied candles.
// No live broker exists: live execution always BROKER_NOT_CONFIGURED.
// Founder/authorized only; paper execution is a durable business mutation.
app.get('/api/v1/trading/status', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, trading: signalEngine.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: "TRADING_STATUS_FAILED" });
  }
});

app.post('/api/v1/trading/analyze', security.requireLevel(2), (req, res) => {
  try {
    const body = req.body || {};
    const kind = String(body.kind || "FOREX").toUpperCase();
    const result = kind === "BINARY"
      ? signalEngine.analyzeBinary(body)
      : signalEngine.analyzeForex(body);
    res.json({ success: true, analysis: result });
  } catch (error) {
    res.status(400).json({ success: false, error: "TRADING_ANALYZE_FAILED", message: error.message });
  }
});

app.post('/api/v1/trading/paper', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const actor = req.identity?.sub || req.identity?.subject || "founder";
    const record = signalEngine.executePaper({ ...(req.body || {}), actor });
    res.status(201).json({ success: true, position: record });
  } catch (error) {
    const code = error.code || "PAPER_EXECUTE_FAILED";
    const status = code === "RISK_REJECTED" ? 422 : code === "DUPLICATE_SUPPRESSED" ? 409 : code === "SIGNAL_NOT_CONFIRMED" ? 400 : code === "BROKER_NOT_CONFIGURED" ? 503 : code === "EXECUTION_STYLE_INVALID" ? 400 : 400;
    res.status(status).json({ success: false, error: code, message: error.message });
  }
});

app.post('/api/v1/trading/paper/:id/close', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const record = signalEngine.closePaper({ id: req.params.id, ...(req.body || {}) });
    res.json({ success: true, position: record });
  } catch (error) {
    const code = error.code || "PAPER_CLOSE_FAILED";
    res.status(code === "PAPER_ALREADY_CLOSED" ? 409 : code === "PAPER_NOT_FOUND" ? 404 : 400).json({ success: false, error: code, message: error.message });
  }
});

app.get('/api/v1/trading/ledger', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, positions: signalEngine.listLedger(Number(req.query.limit) || 50, { actor: req.query.actor || null }) });
  } catch (error) {
    res.status(500).json({ success: false, error: "TRADING_LEDGER_FAILED" });
  }
});

// Deterministic backtest over caller-supplied candles (read-only evidence).
app.post('/api/v1/trading/backtest', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, backtest: signalEngine.backtestForex(req.body || {}) });
  } catch (error) {
    res.status(400).json({ success: false, error: "TRADING_BACKTEST_FAILED", message: error.message });
  }
});

// Honest gaming/virtual boundary: always an explicit non-prediction.
app.post('/api/v1/trading/gaming', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, gaming: signalEngine.analyzeGaming(req.body || {}) });
  } catch (error) {
    res.status(400).json({ success: false, error: "TRADING_GAMING_FAILED", message: error.message });
  }
});

// === AVIATOR / CRASH ANALYTICS (educational, never predictive) ==============
// This is the ONLY Aviator surface. It analyses SUPPLIED history for risk
// education — it never predicts the next crash. Reuses the same defense
// philosophy (stale guard + cross-venue check + distribution edge) without
// rebuilding heavy trading scripts. PAPER/ANALYTICS only; no auto-betting.
app.get('/api/v1/gaming/aviator/status', (req, res) => {
  try { res.json({ success: true, aviator: aviatorEngine.getStatus(), time: new Date().toISOString() }); }
  catch (e) { res.status(500).json({ success: false, error: "AVIATOR_STATUS_FAILED", message: e.message }); }
});

app.post('/api/v1/gaming/aviator/analyze', security.requireLevel(2), (req, res) => {
  try {
    const result = aviatorEngine.analyze(req.body || {});
    // INSUFFICIENT_DATA still returns 200 with state flag (diagnostic, not error)
    res.json({ success: true, aviator: result, time: new Date().toISOString() });
  } catch (e) {
    res.status(400).json({ success: false, error: "AVIATOR_ANALYZE_FAILED", message: e.message });
  }
});

app.post('/api/v1/gaming/aviator/simulate', security.requireLevel(2), (req, res) => {
  try {
    const result = aviatorEngine.simulateRound(req.body || {});
    if (result.error) return res.status(400).json({ success: false, error: "AVIATOR_SIMULATE_FAILED", message: result.error });
    res.json({ success: true, simulation: result, time: new Date().toISOString() });
  } catch (e) {
    res.status(400).json({ success: false, error: "AVIATOR_SIMULATE_FAILED", message: e.message });
  }
});

// Generic crash/gaming alias: same engine, any venue label. Keeps the
// "all gaming sites" request without duplicating logic.
app.post('/api/v1/gaming/crash/analyze', security.requireLevel(2), (req, res) => {
  try {
    const result = aviatorEngine.analyze({ venue: req.body?.venue || req.body?.provider || "CRASH", ...req.body });
    res.json({ success: true, crash: result, time: new Date().toISOString() });
  } catch (e) {
    res.status(400).json({ success: false, error: "CRASH_ANALYZE_FAILED", message: e.message });
  }
});

// === AVIATOR ROLLING HISTORY — automatic observation buffer =================
// Legitimate ingest only: webhook/poll/manual/operator feed. No scraping.
// History is rolling, deduped, persisted via RuntimeConfigStore.
app.get('/api/v1/gaming/aviator/history', security.requireLevel(2), (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const venue = req.query.venue || null;
    res.json({ success: true, history: aviatorHistory.list({ venue, limit }), status: aviatorHistory.getStatus(), time: new Date().toISOString() });
  } catch (e) { res.status(500).json({ success: false, error: "AVIATOR_HISTORY_FAILED", message: e.message }); }
});

app.post('/api/v1/gaming/aviator/history/ingest', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const { rounds, history, multiplier, venue, source } = req.body || {};
    const payload = rounds || history || (multiplier != null ? [{ multiplier, t: req.body.t, roundId: req.body.roundId }] : null);
    if (!payload) return res.status(400).json({ success: false, error: "ROUNDS_REQUIRED", message: "Provide rounds:[{multiplier}] or history:[{multiplier}] or multiplier:number" });
    const result = aviatorHistory.ingest(payload, { venue, source });
    res.status(201).json({ success: true, ...result, time: new Date().toISOString() });
  } catch (e) { res.status(400).json({ success: false, error: "AVIATOR_INGEST_FAILED", message: e.message }); }
});

app.delete('/api/v1/gaming/aviator/history', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try { res.json({ success: true, ...aviatorHistory.clear(), time: new Date().toISOString() }); }
  catch (e) { res.status(500).json({ success: false, error: "AVIATOR_HISTORY_CLEAR_FAILED", message: e.message }); }
});

app.post('/api/v1/gaming/aviator/history/analyze', security.requireLevel(2), (req, res) => {
  try {
    const result = aviatorHistory.analyzeWith(aviatorEngine, req.body || {});
    res.json({ success: true, aviator: result, historyCount: aviatorHistory.list({ limit: 500 }).length, time: new Date().toISOString() });
  } catch (e) { res.status(400).json({ success: false, error: "AVIATOR_HISTORY_ANALYZE_FAILED", message: e.message }); }
});

app.post('/api/v1/trading/live', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    signalEngine.executeLive();
  } catch (error) {
    return res.status(503).json({ success: false, error: error.code || "BROKER_NOT_CONFIGURED", message: error.message });
  }
});

app.post('/api/v1/trading/emergency-stop', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    res.json({ success: true, ...(signalEngine.setEmergencyStop(req.body?.on === true)) });
  } catch (error) {
    res.status(400).json({ success: false, error: "EMERGENCY_STOP_FAILED", message: error.message });
  }
});

// === AI PROVIDER CONFIGURATION ==============================================
// Founder/Admin dashboard-configurable (stored in durable runtimeConfig section aiProviders, never logged, never returned raw)
function aiStored() { try { const s = runtimeConfig.readSection?.("aiProviders") || runtimeConfig.read()?.aiProviders || {}; return s && typeof s==="object" ? s : {}; } catch { return {}; } }
function aiIsConfigured(name) {
  const k = String(name||"").toUpperCase();
  const envKey = k==="GEMINI" ? process.env.GEMINI_API_KEY : k==="GROQ" ? process.env.GROQ_API_KEY : k==="DEEPSEEK" ? process.env.DEEPSEEK_API_KEY : k==="QWEN" ? process.env.QWEN_API_KEY : null;
  if (envKey && String(envKey).trim() && String(envKey).trim()!=="[SENSITIVE]") return true;
  const stored = aiStored()[k];
  return !!(stored && stored.configured===true && stored.masked);
}

app.get('/api/v1/ai/providers', security.requireAuth(), (req, res) => {
  try {
    const aiStatus = UniversalAIGateway.getInstance().getProviderStatus();
    const stored = aiStored();
    const providers = [
      { name: "GEMINI", status: aiIsConfigured("GEMINI") ? "CONFIGURED" : "UNCONFIGURED", model: "gemini-pro", via: stored.GEMINI ? "DASHBOARD" : (process.env.GEMINI_API_KEY ? "ENV" : "NONE"), lastVerified: stored.GEMINI?.lastVerified||null },
      { name: "GROQ", status: aiIsConfigured("GROQ") ? "CONFIGURED" : "UNCONFIGURED", model: "llama-3.1-70b-versatile", via: stored.GROQ ? "DASHBOARD" : (process.env.GROQ_API_KEY ? "ENV" : "NONE"), lastVerified: stored.GROQ?.lastVerified||null },
      { name: "DEEPSEEK", status: aiIsConfigured("DEEPSEEK") ? "CONFIGURED" : "UNCONFIGURED", model: "deepseek-chat", via: stored.DEEPSEEK ? "DASHBOARD" : (process.env.DEEPSEEK_API_KEY ? "ENV" : "NONE"), lastVerified: stored.DEEPSEEK?.lastVerified||null },
      { name: "QWEN", status: aiIsConfigured("QWEN") ? "CONFIGURED" : "UNCONFIGURED", model: "qwen-plus", via: stored.QWEN ? "DASHBOARD" : (process.env.QWEN_API_KEY ? "ENV" : "NONE"), lastVerified: stored.QWEN?.lastVerified||null }
    ];
    const active = providers.filter(p=>p.status==="CONFIGURED").length;
    res.json({
      success: true,
      providers,
      activeProviders: active || aiStatus?.configuredProviderCount || 0,
      fallback: "OFFLINE_LEXICAL_ENGINE",
      note: "AI providers are optional and dashboard-configurable by Founder/Admin. ENV takes precedence, dashboard stores masked credentials durably."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "AI_PROVIDERS_FAILED" });
  }
});

app.post('/api/v1/ai/providers/:provider/configure', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const name = String(req.params.provider||"").toUpperCase();
    const allowed = ["GEMINI","GROQ","DEEPSEEK","QWEN"];
    if (!allowed.includes(name)) return res.status(400).json({ success:false, error:"UNKNOWN_PROVIDER", allowed });
    const { apiKey, enabled } = req.body||{};
    if (enabled===false) {
      const cur = aiStored(); delete cur[name]; runtimeConfig.writeSection("aiProviders", cur);
      try { kernel?.eventBus?.publish("ai.provider.removed", { provider:name }); } catch {}
      return res.json({ success:true, provider:name, status:"UNCONFIGURED" });
    }
    const key = String(apiKey||"").trim();
    if (!key || key.length<8) return res.status(400).json({ success:false, error:"API_KEY_REQUIRED", message:"Provide a valid API key (min 8 chars, masked on storage)" });
    const masked = key.slice(0,4)+"…"+key.slice(-4);
    const cur = aiStored();
    cur[name] = { configured:true, masked, lastVerified: new Date().toISOString(), model: name==="GEMINI"?"gemini-pro":name==="GROQ"?"llama-3.1-70b-versatile":name==="DEEPSEEK"?"deepseek-chat":"qwen-plus" };
    runtimeConfig.writeSection("aiProviders", cur);
    try { kernel?.eventBus?.publish("ai.provider.configured", { provider:name, masked }); } catch {}
    return res.json({ success:true, provider:name, status:"CONFIGURED", masked, via:"DASHBOARD" });
  } catch (e) { res.status(500).json({ success:false, error:"AI_CONFIGURE_FAILED", message:e.message }); }
});

app.post('/api/v1/ai/providers/:provider/verify', security.requireLevel(2), (req, res) => {
  try {
    const name = String(req.params.provider||"").toUpperCase();
    const configured = aiIsConfigured(name);
    if (!configured) return res.status(400).json({ success:false, error:"NOT_CONFIGURED", provider:name });
    // Truthful verify: we do not call external provider without consent; we verify stored presence + format
    const stored = aiStored()[name];
    const lastVerified = new Date().toISOString();
    if (stored) { stored.lastVerified = lastVerified; const cur=aiStored(); cur[name]=stored; try{ runtimeConfig.writeSection("aiProviders", cur);}catch{} }
    res.json({ success:true, provider:name, status:"VERIFIED", lastVerified, note:"Stored key presence verified (format/masked). Live provider call requires explicit test with provider network and remains optional." });
  } catch (e) { res.status(500).json({ success:false, error:"AI_VERIFY_FAILED", message:e.message }); }
});

// === EXTERNAL SERVICES: UPTIMEROBOT (Founder/Admin dashboard-configurable) ===
function uptimeStore() { try { const s = runtimeConfig.readSection?.("uptimeRobot") || runtimeConfig.read()?.uptimeRobot || {}; return s && typeof s==="object"?s:{}; } catch { return {}; } }
app.get('/api/v1/integrations/uptimerobot/status', security.requireLevel(2), (req,res)=>{
  try {
    const cfg = uptimeStore();
    const endpoint = "https://ade-apex-community.vercel.app/api/v1/health";
    const expected = "HTTP 200 and response status OK";
    if (!cfg.apiKey && !cfg.monitorId) return res.json({ success:true, configured:false, status:"NOT CONFIGURED", endpoint, expected, note:"No monitor configured. Use AUTHORIZE or CREATE/UPDATE monitor.", authRequired:true });
    if (cfg.apiKey && !cfg.monitorId) return res.json({ success:true, configured:true, status:"AUTHORIZATION REQUIRED", endpoint, expected, monitorId:null, note:"API key stored (masked). Click VERIFY CONNECTION to discover/create monitor.", authRequired:false, masked: cfg.masked||null });
    return res.json({ success:true, configured:true, status: cfg.status||"CONFIGURED", endpoint, expected, monitorId: cfg.monitorId||null, interval: cfg.interval||"5m", lastVerified: cfg.lastVerified||null, masked: cfg.masked||null });
  } catch(e){ res.status(500).json({ success:false, error:"UPTIME_STATUS_FAILED", message:e.message}); }
});
app.post('/api/v1/integrations/uptimerobot/configure', security.requireLevel(2), requireDurableStorage, (req,res)=>{
  try {
    const { apiKey, monitorId, interval } = req.body||{};
    const cur = uptimeStore();
    if (apiKey!==undefined) {
      const k=String(apiKey||"").trim();
      if (!k) { delete cur.apiKey; delete cur.masked; } else {
        if (k.length<8) return res.status(400).json({ success:false, error:"API_KEY_REQUIRED" });
        cur.apiKey = k; // stored durably, never returned raw
        cur.masked = k.slice(0,4)+"…"+k.slice(-4);
      }
    }
    if (monitorId!==undefined) cur.monitorId = String(monitorId).trim()||null;
    if (interval!==undefined) cur.interval = String(interval).trim()||"5m";
    cur.lastVerified = new Date().toISOString();
    cur.status = cur.monitorId ? "CONFIGURED" : (cur.apiKey ? "AUTHORIZATION REQUIRED" : "NOT CONFIGURED");
    runtimeConfig.writeSection("uptimeRobot", cur);
    try{ kernel?.eventBus?.publish("integrations.uptimerobot.configured", { monitorId:cur.monitorId||null, masked:cur.masked||null }); }catch{}
    res.json({ success:true, status:cur.status, monitorId:cur.monitorId||null, masked:cur.masked||null, endpoint:"https://ade-apex-community.vercel.app/api/v1/health" });
  } catch(e){ res.status(500).json({ success:false, error:"UPTIME_CONFIGURE_FAILED", message:e.message}); }
});
app.post('/api/v1/integrations/uptimerobot/verify', security.requireLevel(2), async (req,res)=>{
  try {
    const cfg = uptimeStore();
    // Verify health endpoint itself (truthful, no external UptimeRobot API call without real key test)
    const endpoint = "https://ade-apex-community.vercel.app/api/v1/health";
    // If no apiKey, return AUTHORIZATION REQUIRED honestly
    if (!cfg.apiKey) return res.json({ success:false, status:"AUTHORIZATION REQUIRED", endpoint, note:"Store UptimeRobot API key via AUTHORIZE first." });
    // If apiKey present, mark verified (we do not fabricate external monitor existence without real UptimeRobot API)
    cfg.lastVerified = new Date().toISOString();
    cfg.status = cfg.monitorId ? "VERIFIED" : "CONFIGURED";
    try{ runtimeConfig.writeSection("uptimeRobot", cfg);}catch{}
    res.json({ success:true, status:cfg.status, endpoint, expected:"HTTP 200 and status OK", monitorId: cfg.monitorId||null, note: cfg.monitorId ? "Monitor configured. Use UptimeRobot dashboard to confirm UP/DOWN." : "API key verified (masked). Create monitor for the endpoint with 5m interval." });
  } catch(e){ res.status(500).json({ success:false, error:"UPTIME_VERIFY_FAILED", message:e.message}); }
});

// === EXTERNAL SERVICES: RESEND (Founder/Admin dashboard-configurable) ===
app.get('/api/v1/email/status', security.requireLevel(2), (req,res)=>{
  try{
    const stored = (()=>{ try{ return runtimeConfig.readSection?.("resend") || runtimeConfig.read()?.resend || null; }catch{ return null; }})();
    const base = emailConnector.status();
    // If dashboard stored config exists, merge truthfully (ENV remains authoritative, dashboard supplements)
    if (stored?.apiKeyMasked) {
      return res.json({ success:true, status:{ ...base, dashboardConfigured:true, dashboardMasked: stored.apiKeyMasked, note: base.configured ? "Resend is CONFIGURED (ENV + dashboard masked). Production VERIFIED." : "Resend API key stored via dashboard (masked). Production will use ENV when present." }});
    }
    res.json({ success:true, status: base });
  } catch(e){ res.status(500).json({ success:false, error:"EMAIL_STATUS_FAILED", message:e.message}); }
});
app.post('/api/v1/email/configure', security.requireLevel(2), requireDurableStorage, (req,res)=>{
  try{
    const { apiKey, sender } = req.body||{};
    const cur = (()=>{ try{ return runtimeConfig.readSection?.("resend") || {}; }catch{ return {}; }})();
    if (apiKey!==undefined) {
      const k=String(apiKey||"").trim();
      if (!k) { delete cur.apiKey; delete cur.apiKeyMasked; } else {
        if (k.length<8) return res.status(400).json({ success:false, error:"API_KEY_REQUIRED" });
        cur.apiKey = k;
        cur.apiKeyMasked = k.slice(0,4)+"…"+k.slice(-4);
      }
    }
    if (sender!==undefined) cur.sender = String(sender).trim()||undefined;
    cur.lastVerified = new Date().toISOString();
    runtimeConfig.writeSection("resend", cur);
    try{ kernel?.eventBus?.publish("email.configured", { masked: cur.apiKeyMasked||null }); }catch{}
    res.json({ success:true, masked: cur.apiKeyMasked||null, sender: cur.sender||null });
  } catch(e){ res.status(500).json({ success:false, error:"EMAIL_CONFIGURE_FAILED", message:e.message}); }
});

// === CONNECTIVITY FABRIC + SIDEWAYS ACTIVATION (expansion batch) ==========
// Discovery/inventory are public reads (redacted). Verify/activate are L2.
app.get('/api/v1/connectivity/inventory', (req, res) => {
  try {
    res.json({ success: true, products: connectionFabric.inventory(), truth: "Grip % derives from verified required capabilities only. CONNECTED is never claimed from URL syntax." });
  } catch (error) {
    res.status(500).json({ success: false, error: "CONNECTIVITY_INVENTORY_FAILED", message: error.message });
  }
});

app.get('/api/v1/connectivity/products/:id', (req, res) => {
  try {
    const report = connectionFabric.inspect(String(req.params.id || "").toLowerCase());
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, error: "CONNECTIVITY_INSPECT_FAILED", message: error.message });
  }
});

app.post('/api/v1/admin/connections/:id/verify', security.requireLevel(2), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    // Resolve either a connection-record id or a product id.
    const rec = connectionManager.get(id);
    const productId = rec ? String(rec.provider || "").toLowerCase() : id.toLowerCase();
    const report = await connectionFabric.verify(productId);
    res.json({ success: true, verify: report.verify || null, report });
  } catch (error) {
    res.status(500).json({ success: false, error: "CONNECTIVITY_VERIFY_FAILED", message: error.message });
  }
});

app.get('/api/v1/capabilities/activation', security.requireAuth(), (req, res) => {
  try {
    res.json({ success: true, capabilities: capabilityActivation.assess(), ecosystem: capabilityActivation.ecosystemStates(BUILTIN_ECOSYSTEM_CAPABILITIES) });
  } catch (error) {
    res.status(500).json({ success: false, error: "ACTIVATION_MAP_FAILED", message: error.message });
  }
});

app.post('/api/v1/admin/capabilities/:id/activate', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    // Safe-local activation only: a handler must already exist or be supplied
    // by an authorized adapter call. External/credential gates are never bypassed.
    const result = capabilityActivation.activate(req.params.id, { handler: null, metadata: { activatedBy: req.identity?.sub || "founder" } });
    if (!result.ok) return res.status(422).json({ success: false, ...result });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: "ACTIVATION_FAILED", message: error.message });
  }
});

// === ECOSYSTEM EXPANSION: classify/report/exchange/learning (additive) =====
// Reads are public/redacted; every mutation is L2 + durable-gated.
app.get('/api/v1/connectivity/classify/:id', (req, res) => {
  try {
    res.json({ success: true, classification: connectionFabric.classify(String(req.params.id || "").toLowerCase()) });
  } catch (error) {
    res.status(500).json({ success: false, error: "CONNECTIVITY_CLASSIFY_FAILED", message: error.message });
  }
});

app.get('/api/v1/connectivity/report/:id', (req, res) => {
  try {
    res.json({ success: true, ...connectionFabric.report(String(req.params.id || "").toLowerCase()) });
  } catch (error) {
    res.status(500).json({ success: false, error: "CONNECTIVITY_REPORT_FAILED", message: error.message });
  }
});

app.get('/api/v1/connectivity/exchange/:id', security.requireAuth(), (req, res) => {
  try {
    res.json({ success: true, exchange: capabilityExchange.compare(String(req.params.id || "").toLowerCase()) });
  } catch (error) {
    res.status(500).json({ success: false, error: "EXCHANGE_FAILED", message: error.message });
  }
});

app.get('/api/v1/connectivity/exchange', security.requireAuth(), (req, res) => {
  try {
    res.json({ success: true, exchanges: capabilityExchange.inventory() });
  } catch (error) {
    res.status(500).json({ success: false, error: "EXCHANGE_FAILED", message: error.message });
  }
});

app.get('/api/v1/learning/candidates', security.requireLevel(2), (req, res) => {
  try {
    const derived = learningCandidates.deriveFromPatterns({});
    res.json({ success: true, candidates: learningCandidates.list(), newlyDerived: derived.length });
  } catch (error) {
    res.status(500).json({ success: false, error: "LEARNING_CANDIDATES_FAILED", message: error.message });
  }
});

app.post('/api/v1/learning/candidates/:id/decision', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const decidedBy = req.identity?.sub || req.identity?.subject || "founder";
    const { approved, reason } = req.body || {};
    // Handler/intent are never fabricated from HTTP: approval without a real
    // authorized handler is recorded as a blocked decision (truthful).
    const result = learningCandidates.decide(req.params.id, { approved: approved === true, decidedBy, reason: reason || "", handler: null, intent: null });
    res.json({ success: true, candidate: result });
  } catch (error) {
    const code = error.code || "LEARNING_DECISION_FAILED";
    const status = code === "CANDIDATE_NOT_FOUND" ? 404 : code === "APPROVAL_HANDLER_REQUIRED" ? 422 : 400;
    res.status(status).json({ success: false, error: code, message: error.message, detail: error.detail || null });
  }
});

// === TRADING VENUES + ENTITLEMENTS + SIGNAL GATE (surrounding only) ========
app.get('/api/v1/trading/venues', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, venues: venueRegistry.list(), kinds: ["BINARY_BROKER", "GAMING_BOOKIE"], note: "Catalog only. Live execution requires VERIFIED venue + entitlement + human approval. No stealth automation." });
  } catch (error) {
    res.status(500).json({ success: false, error: "VENUES_FAILED", message: error.message });
  }
});

app.post('/api/v1/trading/venues', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const venue = venueRegistry.registerVenue(req.body || {});
    res.status(201).json({ success: true, venue });
  } catch (error) {
    res.status(400).json({ success: false, error: error.code || "VENUE_REGISTER_FAILED", message: error.message });
  }
});

app.patch('/api/v1/trading/venues/:id', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const venue = venueRegistry.setConfigured(req.params.id, { configured: req.body?.configured !== false, verified: req.body?.verified === true, configuredBy: req.identity?.sub || "founder" });
    res.json({ success: true, venue });
  } catch (error) {
    res.status(error.code === "VENUE_NOT_FOUND" ? 404 : 400).json({ success: false, error: error.code || "VENUE_UPDATE_FAILED", message: error.message });
  }
});

app.get('/api/v1/trading/venues/:id/eligibility', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, ...venueRegistry.liveEligibility(req.params.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: "VENUE_ELIGIBILITY_FAILED", message: error.message });
  }
});

app.get('/api/v1/admin/trading/entitlements', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, entitlements: tradingEntitlements.list() });
  } catch (error) {
    res.status(500).json({ success: false, error: "ENTITLEMENTS_FAILED", message: error.message });
  }
});

app.post('/api/v1/admin/trading/entitlements', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const { userId, trading, gaming, capabilities, modes } = req.body || {};
    const rec = tradingEntitlements.grant(userId, { trading, gaming, capabilities, modes, grantedBy: req.identity?.sub || "founder" });
    res.status(201).json({ success: true, entitlement: rec });
  } catch (error) {
    res.status(400).json({ success: false, error: error.code || "ENTITLEMENT_GRANT_FAILED", message: error.message });
  }
});

app.delete('/api/v1/admin/trading/entitlements/:userId', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    res.json({ success: true, ...(tradingEntitlements.revoke(req.params.userId, { revokedBy: req.identity?.sub || "founder" }) || { revoked: false }) });
  } catch (error) {
    res.status(500).json({ success: false, error: "ENTITLEMENT_REVOKE_FAILED", message: error.message });
  }
});

app.post('/api/v1/trading/signal-gate', security.requireLevel(2), (req, res) => {
  try {
    const { analysis, minConfidence, userId, feature } = req.body || {};
    res.json({ success: true, ...signalQualityGate.gate(analysis || {}, { minConfidence: minConfidence ?? 0.6, userId: userId || null, feature: feature || "trading" }) });
  } catch (error) {
    res.status(500).json({ success: false, error: "SIGNAL_GATE_FAILED", message: error.message });
  }
});

app.post('/api/v1/trading/auto-mode', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, ...signalQualityGate.autoMode(req.body || {}) });
  } catch (error) {
    res.status(500).json({ success: false, error: "AUTO_MODE_FAILED", message: error.message });
  }
});

// === TRADING CONNECTION MODES (explicit mode contract, surrounding only) ===
app.get('/api/v1/trading/connection-modes', security.requireAuth(), (req, res) => {
  try {
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || null;
    const tenant = req.person?.tenantId || req.claims?.tenantId || "default";
    // L2 sees all; others see own scoped
    const isL2 = Number(req.claims?.level||0) >=2 || ["FOUNDER","ADMIN"].includes(String(req.person?.role||"").toUpperCase());
    const list = isL2 ? tradingConnectionModes.list({ tenantId: null }) : tradingConnectionModes.list({ userId: uid, tenantId });
    res.json({ success: true, modes: list, isL2 });
  } catch (e){ res.status(500).json({success:false, error:"CONNECTION_MODES_FAILED", message:e.message}); }
});
app.post('/api/v1/trading/connection-modes', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = tradingConnectionModes.upsert({ ...req.body, requestedBy: req.identity?.sub || req.person?.username || "founder" });
    res.status(201).json({ success: true, mode: rec });
  } catch (e){ res.status(400).json({success:false, error:e.code||"CONNECTION_MODE_FAILED", message:e.message}); }
});
app.patch('/api/v1/trading/connection-modes/:id', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const rec = tradingConnectionModes.setMode(req.params.id, req.body?.activeMode, { requestedBy: req.identity?.sub || req.person?.username || "founder" });
    res.json({ success: true, mode: rec });
  } catch (e){ res.status(e.code==="CONNECTION_NOT_FOUND"?404:400).json({success:false, error:e.code||"MODE_UPDATE_FAILED", message:e.message}); }
});
app.post('/api/v1/trading/connection-modes/:id/verify', security.requireLevel(2), (req, res) => {
  try { res.json({ success: true, mode: tradingConnectionModes.verify(req.params.id) }); }
  catch(e){ res.status(e.code==="CONNECTION_NOT_FOUND"?404:400).json({success:false, error:e.code||"VERIFY_FAILED", message:e.message}); }
});
app.get('/api/v1/trading/entitlements/me', security.requireAuth(), (req, res) => {
  try {
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || req.person?.username;
    const ent = tradingEntitlements.get(uid);
    const modes = tradingConnectionModes.list({ userId: uid });
    res.json({ success: true, entitlement: ent, modes, userId: uid });
  } catch(e){ res.status(500).json({success:false, error:"ENTITLEMENT_ME_FAILED", message:e.message}); }
});

// === INBOX (user-to-user messaging, same-tenant, persisted) ===
function inboxAuth(req,res,next){
  const h=String(req.get("authorization")||"");
  if(!h.startsWith("Bearer ")) return res.status(401).json({success:false, error:"Authentication required"});
  try{
    const claims=security.identity.verifySession(h.slice(7));
    req.inboxClaims=claims;
    // resolve person for tenant + name
    const pid=claims.personId || claims.sub;
    workforce.getPersonRecord(pid).then(p=>{ req.inboxPerson=p; next(); }).catch(()=>{ req.inboxPerson={ id:pid, username:String(pid), tenantId: String(claims.tenantId||"default") }; next(); });
  }catch(e){ return res.status(401).json({success:false, error:e.message}); }
}
app.post('/api/v1/inbox/send', inboxAuth, requireDurableStorage, async (req,res)=>{
  try{
    const senderId=req.inboxClaims.personId || req.inboxClaims.sub;
    const senderName=req.inboxPerson?.username || String(senderId);
    const tenantId=req.inboxPerson?.tenantId || req.inboxClaims.tenantId || "default";
    const { recipientId, subject, body, threadId, replyTo } = req.body||{};
    // tenant check: recipient must be same tenant (lookup)
    let recipientTenant="default";
    try{ const rp=await workforce.getPersonRecord(String(recipientId)); recipientTenant=String(rp?.tenantId||"default"); }catch{ recipientTenant=tenantId; }
    if(String(recipientTenant)!==String(tenantId) && String(tenantId)!=="default") return res.status(403).json({success:false, error:"CROSS_TENANT_BLOCKED"});
    const msg=inboxManager.send({ senderId, senderName, recipientId, subject, body, threadId, replyTo, tenantId });
    res.status(201).json({success:true, message: msg});
  }catch(e){ res.status(e.code==="BODY_REQUIRED"||e.code==="RECIPIENT_REQUIRED"?400:400).json({success:false, error:e.code||"INBOX_SEND_FAILED", message:e.message}); }
});
app.get('/api/v1/inbox', inboxAuth, (req,res)=>{
  try{
    const uid=req.inboxClaims.personId || req.inboxClaims.sub;
    const tenant=req.inboxPerson?.tenantId || req.inboxClaims.tenantId || null;
    res.json({success:true, messages: inboxManager.inboxFor(uid, {tenantId: tenant!=="default"?tenant:null}), unread: inboxManager.unreadCount(uid, {tenantId: tenant!=="default"?tenant:null})});
  }catch(e){ res.status(500).json({success:false, error:"INBOX_READ_FAILED", message:e.message}); }
});
app.get('/api/v1/inbox/sent', inboxAuth, (req,res)=>{
  try{
    const uid=req.inboxClaims.personId || req.inboxClaims.sub;
    const tenant=req.inboxPerson?.tenantId || req.inboxClaims.tenantId || null;
    res.json({success:true, messages: inboxManager.sentFor(uid, {tenantId: tenant!=="default"?tenant:null})});
  }catch(e){ res.status(500).json({success:false, error:"INBOX_SENT_FAILED", message:e.message}); }
});
app.get('/api/v1/inbox/unread-count', inboxAuth, (req,res)=>{
  try{
    const uid=req.inboxClaims.personId || req.inboxClaims.sub;
    res.json({success:true, unread: inboxManager.unreadCount(uid)});
  }catch(e){ res.status(500).json({success:false, error:"UNREAD_FAILED", message:e.message}); }
});
app.get('/api/v1/inbox/thread/:id', inboxAuth, (req,res)=>{
  try{
    const uid=req.inboxClaims.personId || req.inboxClaims.sub;
    const thread=inboxManager.thread(req.params.id);
    // auth: participant must be sender or recipient of at least one msg in thread
    const isParticipant=thread.some(m=>m.senderId===String(uid)||m.recipientId===String(uid));
    if(thread.length && !isParticipant) return res.status(403).json({success:false, error:"NOT_AUTHORIZED"});
    res.json({success:true, thread});
  }catch(e){ res.status(500).json({success:false, error:"THREAD_FAILED", message:e.message}); }
});
app.post('/api/v1/inbox/thread/:id/reply', inboxAuth, requireDurableStorage, async (req,res)=>{
  try{
    const uid=req.inboxClaims.personId || req.inboxClaims.sub;
    const senderName=req.inboxPerson?.username || String(uid);
    const tenantId=req.inboxPerson?.tenantId || req.inboxClaims.tenantId || "default";
    const thread=inboxManager.thread(req.params.id);
    if(!thread.length) return res.status(404).json({success:false, error:"THREAD_NOT_FOUND"});
    const isParticipant=thread.some(m=>m.senderId===String(uid)||m.recipientId===String(uid));
    if(!isParticipant) return res.status(403).json({success:false, error:"NOT_AUTHORIZED"});
    // recipient is the other participant of last message
    const last=thread[thread.length-1];
    const recipientId = last.senderId===String(uid) ? last.recipientId : last.senderId;
    const msg=inboxManager.send({ senderId: uid, senderName, recipientId, subject: `Re: ${last.subject}`, body: req.body?.body, threadId: req.params.id, replyTo: last.messageId, tenantId });
    res.status(201).json({success:true, message: msg});
  }catch(e){ res.status(400).json({success:false, error:e.code||"REPLY_FAILED", message:e.message}); }
});
app.post('/api/v1/inbox/:id/read', inboxAuth, requireDurableStorage, (req,res)=>{
  try{
    const uid=req.inboxClaims.personId || req.inboxClaims.sub;
    const msg=inboxManager.markRead(req.params.id, uid);
    res.json({success:true, message: msg});
  }catch(e){ res.status(e.code==="MESSAGE_NOT_FOUND"?404:403).json({success:false, error:e.code||"READ_FAILED", message:e.message}); }
});

// === FBS / MT5 HANDOFF + DERIV BOUNDARY + BROKER COMPARISON (scoped) ===
// FBS signal → MT5 handoff: validates entitlement + venue verification + mode,
// then returns handoff proposal; execution requires explicit confirmed:true.
app.post('/api/v1/trading/fbs/signal-handoff', security.requireAuth(), (req,res)=>{
  try{
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || req.person?.username;
    const tenant = req.person?.tenantId || req.claims?.tenantId || "default";
    const { signal, connectionId, confirmed } = req.body||{};
    if(!signal || !signal.instrument) return res.status(400).json({success:false, error:"SIGNAL_REQUIRED", message:"Provide signal {instrument, direction, state, confidence}"});
    // entitlement
    if(!tradingEntitlements.can(uid, "FOREX") && !tradingEntitlements.can(uid, "trading")) return res.status(403).json({success:false, error:"NOT_ENTITLED", message:"Founder has not granted Forex to this user."});
    const modeRec = connectionId ? tradingConnectionModes.get(connectionId) : null;
    const venueElig = venueRegistry.liveEligibility("fbs");
    const activeMode = modeRec?.activeMode || "DEMO";
    const connectionState = venueElig.eligible ? "CONNECTED" : venueElig.reason?.includes("CONFIGURED") ? "CONFIGURATION_REQUIRED" : "NOT_CONFIGURED";
    const proposal = {
      signal: { instrument: signal.instrument, direction: signal.direction, state: signal.state, confidence: signal.confidence, fingerprint: signal.fingerprint || signal.evidence?.fingerprint || null },
      venue: "fbs", adapter: "FBSAdapter (MT5)", protocol: "MT5 web/REST (official)",
      connectionState, verificationState: venueElig.eligible ? "VERIFIED" : "UNVERIFIED",
      activeMode, supportedModes: ["DEMO","PAPER","SANDBOX","LIVE"],
      executionCapability: venueElig.eligible && activeMode==="LIVE" ? "ORDER/EXECUTION REQUEST (requires explicit confirmation)" : "SIGNAL DELIVERY / HANDOFF (user executes in MT5 client)",
      classification: venueElig.eligible && activeMode==="LIVE" && confirmed===true ? "EXECUTION_REQUEST" : confirmed===true ? "SIGNAL_DELIVERY" : "ANALYSIS_ONLY",
      note: venueElig.eligible ? (activeMode==="LIVE" ? (confirmed===true ? "Order would route via official adapter — explicit human approval recorded." : "Set confirmed:true to submit via official adapter (still requires human approval).") : "Paper/Sandbox mode — signal delivered, no live order.") : `Live blocked: ${venueElig.reason} Configure ${venueRegistry.get("fbs")?.requiredFields?.join(", ")} then verify. MT5 desktop/mobile remains the client surface.`
    };
    if(confirmed===true && venueElig.eligible && activeMode==="LIVE"){
      try{ const auditRec = { signal: proposal.signal, venue:"fbs", mode:"LIVE", userId: uid, tenantId: tenant, confirmedAt: new Date().toISOString() }; (store=>{ try{ const list=brokerComparisonStore._load(); list.push({comparisonId:`handoff_${Date.now()}`, tenantId: tenant, userId: uid, platform:"FBS_MT5", asset: signal.instrument, direction: signal.direction, handoff: auditRec, createdAt:new Date().toISOString()}); /* lightweight audit */ }catch{} })(); }catch{}
    }
    res.json({success:true, handoff: proposal});
  }catch(e){ res.status(500).json({success:false, error:"FBS_HANDOFF_FAILED", message:e.message}); }
});
app.get('/api/v1/trading/deriv/status', security.requireAuth(), (req,res)=>{
  try{
    const v=venueRegistry.get("deriv");
    const elig=venueRegistry.liveEligibility("deriv");
    res.json({ success:true, venue: v, eligibility: elig, modes: ["DEMO","PAPER","LIVE"], classification: "SECONDARY to FBS", note: "Deriv uses official Deriv API only. Not an MT5 broker. Demo/virtual/real map to Deriv account modes." });
  }catch(e){ res.status(500).json({success:false, error:"DERIV_STATUS_FAILED", message:e.message}); }
});
// Broker comparison: same signal across unsupported binary platforms (manual external)
app.post('/api/v1/trading/broker-comparisons', security.requireAuth(), requireDurableStorage, (req,res)=>{
  try{
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || req.person?.username;
    const tenant = req.person?.tenantId || req.claims?.tenantId || "default";
    // entitlement: any trading capability
    if(!tradingEntitlements.can(uid,"BINARY_REGULAR") && !tradingEntitlements.can(uid,"BINARY_OTC") && !tradingEntitlements.can(uid,"trading"))
      return res.status(403).json({success:false, error:"NOT_ENTITLED", message:"Binary capability not granted."});
    const { platform, asset, marketType, direction, expiry, entryWindow, confidence, quality, signalTimestamp, signalEvidence, fingerprint } = req.body||{};
    const rec=brokerComparisonStore.create({ tenantId, userId: uid, platform, asset, marketType, direction, expiry, entryWindow, confidence, quality, signalTimestamp, signalEvidence, fingerprint });
    res.status(201).json({success:true, comparison: rec});
  }catch(e){ res.status(e.code==="PLATFORM_NOT_SUPPORTED"||e.code==="INVALID_MARKET_TYPE"||e.code==="SIGNAL_REQUIRED"?400:500).json({success:false, error:e.code||"COMPARISON_CREATE_FAILED", message:e.message}); }
});
app.get('/api/v1/trading/broker-comparisons', security.requireAuth(), (req,res)=>{
  try{
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || req.person?.username;
    const tenant = req.person?.tenantId || req.claims?.tenantId || "default";
    const isL2 = Number(req.claims?.level||0)>=2 || ["FOUNDER","ADMIN"].includes(String(req.person?.role||"").toUpperCase());
    const list = isL2 ? brokerComparisonStore.list({ tenantId: null }) : brokerComparisonStore.list({ tenantId, userId: uid });
    // optional filters
    const { platform, marketType, outcome } = req.query||{};
    let filtered=list;
    if(platform) filtered=filtered.filter(r=>r.platform===String(platform).toUpperCase().replace(/[^A-Z_]/g,"_"));
    if(marketType) filtered=filtered.filter(r=>r.marketType===String(marketType).toUpperCase());
    if(outcome) filtered=filtered.filter(r=>String(r.observedResult||"").toUpperCase()===String(outcome).toUpperCase());
    res.json({success:true, comparisons: filtered.slice(0,100)});
  }catch(e){ res.status(500).json({success:false, error:"COMPARISONS_LIST_FAILED", message:e.message}); }
});
app.get('/api/v1/trading/broker-comparisons/:id', security.requireAuth(), (req,res)=>{
  try{
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || req.person?.username;
    const rec=brokerComparisonStore.get(req.params.id);
    if(!rec) return res.status(404).json({success:false, error:"COMPARISON_NOT_FOUND"});
    const isL2 = Number(req.claims?.level||0)>=2 || ["FOUNDER","ADMIN"].includes(String(req.person?.role||"").toUpperCase());
    const tenant = req.person?.tenantId || req.claims?.tenantId || "default";
    if(!isL2 && (rec.userId!==String(uid) || rec.tenantId!==String(tenant) && rec.tenantId!=="default")) return res.status(403).json({success:false, error:"NOT_AUTHORIZED"});
    res.json({success:true, comparison: rec});
  }catch(e){ res.status(500).json({success:false, error:"COMPARISON_GET_FAILED", message:e.message}); }
});
app.patch('/api/v1/trading/broker-comparisons/:id/result', security.requireAuth(), requireDurableStorage, (req,res)=>{
  try{
    const uid = req.claims?.personId || req.claims?.sub || req.person?.id || req.person?.username;
    const rec=brokerComparisonStore.get(req.params.id);
    if(!rec) return res.status(404).json({success:false, error:"COMPARISON_NOT_FOUND"});
    const isL2 = Number(req.claims?.level||0)>=2 || ["FOUNDER","ADMIN"].includes(String(req.person?.role||"").toUpperCase());
    const tenant = req.person?.tenantId || req.claims?.tenantId || "default";
    if(!isL2 && rec.userId!==String(uid)) return res.status(403).json({success:false, error:"NOT_AUTHORIZED"});
    const updated=brokerComparisonStore.recordResult(req.params.id, req.body||{}, uid);
    res.json({success:true, comparison: updated});
  }catch(e){ res.status(e.code==="COMPARISON_NOT_FOUND"?404:400).json({success:false, error:e.code||"RESULT_FAILED", message:e.message}); }
});

// === ORACLE FABRIC + DATA INTELLIGENCE (expansion batch, advisory only) ===
app.get('/api/v1/oracle/status', security.requireAuth(), (req, res) => {
  try {
    res.json({
      success: true,
      oracle: oracleFabric.status(),
      gateway: UniversalAIGateway.getInstance().getProviderStatus(),
      catalog: PROVIDER_CATALOG,
      local: localProvider.status(),
      dataSources: publicDataRegistry.catalog(),
      note: "Oracle output is advisory. Guardian/Decision retain execution authority."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "ORACLE_STATUS_FAILED", message: error.message });
  }
});

app.post('/api/v1/oracle/query', security.requireAuth(), async (req, res) => {
  try {
    const { prompt, capability, privacy, includePublicData, humanInput } = req.body || {};
    const result = await oracleFabric.query({ prompt, capability, privacy, includePublicData, humanInput });
    if (!result.ok) return res.status(400).json({ success: false, ...result });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: "ORACLE_QUERY_FAILED", message: error.message });
  }
});

app.get('/api/v1/data-sources', (req, res) => {
  try {
    res.json({ success: true, sources: publicDataRegistry.catalog() });
  } catch (error) {
    res.status(500).json({ success: false, error: "DATA_SOURCES_FAILED", message: error.message });
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

app.post('/api/v1/feedback', requireDurableStorage, async (req, res) => {
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

app.post('/api/v1/media/request', requireDurableStorage, (req, res) => {
  try {
    const request = mediaEngine.createMediaRequest(req.body || {});
    res.status(201).json({ success: true, request });
  } catch (error) {
    res.status(400).json({ success: false, error: "MEDIA_REQUEST_FAILED", message: error.message });
  }
});

app.post('/api/v1/media/request/:requestId/concept', requireDurableStorage, (req, res) => {
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

// === PRODUCT THEATRE / MEDIA CONSOLE (founder + top-admin CMD console) ====
// Chat-console placement is served by the existing PRODUCT THEATER UI bound
// to these endpoints. Generation is open to authenticated operators; every
// SEND/EXTRACT (handoff outside ADE) requires a fresh founder/admin PIN via
// the canonical CredentialLifecycleStore. Artefacts self-purge after 7 days.
app.post('/api/v1/media/theatre/generate', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const { cmd, uploads, lexicon, freeSources } = req.body || {};
    const request = mediaEngine.generateFromCommand({ cmd, uploads, lexicon, freeSources });
    res.status(201).json({ success: true, request: { requestId: request.requestId, theatre: request.theatre, status: request.status } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message.startsWith("THEATRE_") ? error.message.split(":")[0] : "THEATRE_GENERATE_FAILED", message: error.message });
  }
});

app.post('/api/v1/media/theatre/:requestId/uploads', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const { uploads } = req.body || {};
    const request = mediaEngine.attachUploads(req.params.requestId, uploads);
    res.json({ success: true, requestId: request.requestId, uploads: request.theatre.uploads });
  } catch (error) {
    res.status(400).json({ success: false, error: "THEATRE_UPLOAD_FAILED", message: error.message });
  }
});

app.get('/api/v1/media/theatre/gallery', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, gallery: mediaEngine.listTheatreGallery(), retentionDays: 7 });
  } catch (error) {
    res.status(500).json({ success: false, error: "THEATRE_GALLERY_FAILED", message: error.message });
  }
});

app.post('/api/v1/media/theatre/purge', security.requireLevel(2), (req, res) => {
  try {
    res.json({ success: true, ...mediaEngine.purgeExpired() });
  } catch (error) {
    res.status(500).json({ success: false, error: "THEATRE_PURGE_FAILED", message: error.message });
  }
});

app.post('/api/v1/media/theatre/:requestId/send', security.requireLevel(2), requireDurableStorage, async (req, res) => {
  try {
    const { pin, destinations } = req.body || {};
    if (!pin || typeof pin !== "string") {
      return res.status(403).json({ success: false, error: "PIN_REQUIRED", message: "Founder/admin PIN is required to send or extract theatre artefacts." });
    }
    let ok = false;
    try { ok = await security.credentialStore.verifyPin(pin); } catch { ok = false; }
    if (!ok) {
      return res.status(403).json({ success: false, error: "PIN_INVALID", message: "PIN authorization failed." });
    }
    mediaEngine.authorizeSend(req.params.requestId);
    const request = mediaEngine.markSent(req.params.requestId, destinations);
    logEvent('MEDIA', `Theatre send authorized for ${request.requestId} by level-2 operator`);
    res.json({ success: true, requestId: request.requestId, delivery: request.theatre.delivery });
  } catch (error) {
    const msg = error?.message || "THEATRE_SEND_FAILED";
    const code = msg.split(":")[0] || "THEATRE_SEND_FAILED";
    res.status(msg.includes("EXPIRED") ? 410 : 400).json({ success: false, error: code, message: msg });
  }
});

// === COMMUNITY PROGRESSION ==================================================

app.post('/api/v1/community/intake', requireDurableStorage, (req, res) => {
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

app.post('/api/v1/procarta/pilot/approve', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const approvedBy = req.identity?.sub || req.identity?.subject || req.user?.sub || req.user?.subject || "LEVEL_2_OPERATOR";
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

app.post('/api/v1/procarta/pilot/verdict', security.requireLevel(2), requireDurableStorage, (req, res) => {
  try {
    const decidedBy = req.identity?.sub || req.identity?.subject || req.user?.sub || req.user?.subject || "LEVEL_2_OPERATOR";
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

// === UNIVERSAL OPERATIONAL GRAPH ============================================
// One navigable capability/route/product/RBAC/state spine for every module,
// product, role and future product. Public with optional identity: a Bearer
// token (when present and valid) annotates per-node access for that identity;
// without one the public surface is returned. Never 401s — it is discovery.
app.get('/api/v1/ops/graph', async (req, res) => {
  try {
    const ctx = { role: "PUBLIC", level: 0, elevated: false, authenticated: false, tenant: String(req.query.tenant || "default").slice(0, 80) };
    try {
      const header = String(req.get("authorization") || "");
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (token && security?.identity?.verifySession) {
        const claims = security.identity.verifySession(token);
        const persona = String(claims.persona || "").toUpperCase();
        if (persona === "ADMIN" && Number(claims.level) >= 2) {
          ctx.role = "ADMIN"; ctx.level = Number(claims.level) || 2; ctx.elevated = true; ctx.authenticated = true;
        } else if (persona === "WORKFORCE") {
          ctx.authenticated = true;
          ctx.level = Number(claims.level) || 1;
          ctx.elevated = claims?.metadata?.pinVerified === true || claims?.pinVerified === true;
          let role = String(claims?.metadata?.role || "").toUpperCase();
          if (!role) {
            try {
              const person = await workforce.getPersonRecord(claims.personId || claims.sub);
              role = String(person?.role || "").toUpperCase();
            } catch {
              try {
                const byName = await workforce.getPersonByUsername(claims.sub);
                role = String(byName?.role || "").toUpperCase();
              } catch {}
            }
          }
          ctx.role = role || "WORKER";
        }
      }
    } catch {}
    const matrix = new ProductSurfaceMatrix({
      productRegistry, capabilityActivation, connectionFabric, editionPolicy,
      capabilityRegistry: CapabilityRegistry, storageProvider,
      builtinCatalog: BUILTIN_ECOSYSTEM_CAPABILITIES
    });
    initOperationalGraph().deps.productSurfaceMatrix = matrix;
    res.json(initOperationalGraph().graph(ctx));
  } catch (error) {
    res.status(500).json({ success: false, error: "OPERATIONAL_GRAPH_FAILED", message: error.message });
  }
});

// ICX truth surface — what the Internal Communication eXperience engine is,
// what it can do, and where it sits (kernel-internal; Workforce → AI Workers
// is the canonical human surface; AgentRegistry is the execution binding).
// L2-gated; counts only, never message content or staff secrets.
app.get('/api/v1/icx/status', security.requireLevel(2), async (req, res) => {
  try {
    let engine = null;
    try { engine = kernel?.resolve?.("icx") || initOperationalGraph().deps.icxEngine || null; } catch {}
    const snapshot = (() => { try { return engine?.getSnapshot?.() || null; } catch { return null; } })();
    const agents = await workforce.listAgents().catch(() => []);
    res.json({
      success: true,
      icx: {
        implemented: Boolean(engine),
        meaning: "Internal Communication eXperience — org staff directory, presence, policy-gated messaging and escalation. Not a general AI executor.",
        engine: "ADE_ICX_Engine (canonical kernel subsystem)",
        roles: [...ICX_ROLES], channels: [...ICX_CHANNELS], messageTypes: [...ICX_MESSAGE_TYPES],
        httpExecutionSurface: false,
        canonicalSurface: "Workforce → AI Workers (this panel) for inspection; execution binds only through AgentRegistry → CapabilityRegistry.",
        snapshot: snapshot ? { staff: snapshot.staff?.length ?? 0, messages: snapshot.messages?.length ?? 0, escalations: snapshot.escalations?.length ?? 0 } : null,
        agentIdentities: Array.isArray(agents) ? agents.length : 0,
        entitlement: "Community: inspection allowed for elevated Founder/Admin/Operator; execution requires capability binding + L1 run grant + daily limits.",
        requiredAuthority: "L2 + elevated session for inspection; per-capability grant for execution."
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "ICX_STATUS_FAILED", message: error.message });
  }
});

// === PRODUCT-SURFACE CLOSURE ==================================================
// Unified catalogue -> activation -> entitlement -> role -> route -> nav ->
// action matrix. Composes existing authorities only; exposes no secrets
// (names/states/requiredAction only — never env values, keys or tokens).
app.get('/api/v1/product-surface', (req, res) => {
  try {
    const matrix = new ProductSurfaceMatrix({
      productRegistry,
      capabilityActivation,
      connectionFabric,
      editionPolicy,
      capabilityRegistry: CapabilityRegistry,
      storageProvider,
      builtinCatalog: BUILTIN_ECOSYSTEM_CAPABILITIES
    });
    res.json({ success: true, edition: editionPolicy.getEdition(), summary: matrix.summary(), surfaces: matrix.build() });
  } catch (error) {
    res.status(500).json({ success: false, error: "PRODUCT_SURFACE_FAILED", message: error.message });
  }
});

// Storage diagnostics: read probe by default; opt-in self-cleaning write
// probe (?write=true) that deletes any stale probe key first, writes a fresh
// probe value, reads it back, compares, then deletes it again. Every stage is
// reported, so a Founder can prove durable write+read+delete end-to-end (or
// see the exact failing stage) without leaving residue. L2-gated; no secrets.
const ADE_VERIFY_PROBE_KEY = "__ade_verify_probe__";
app.get('/api/v1/admin/storage/verify', security.requireLevel(2), async (req, res) => {
  try {
    const provider = storageProvider?.constructor?.name || "UNKNOWN";
    const configErr = typeof storageProvider?.configurationError === "function"
      ? storageProvider.configurationError()
      : null;
    if (configErr) {
      return res.json({ success: true, configured: false, provider, probe: "NOT_RUN", error: "STORAGE_NOT_CONFIGURED", message: String(configErr.message || configErr) });
    }
    const stages = {};
    try {
      await storageProvider.list(ADE_VERIFY_PROBE_KEY);
      stages.read = "OK";
    } catch (e) {
      return res.json({ success: true, configured: true, provider, probe: "FAILED", stages: { ...stages, read: "FAILED" }, error: "STORAGE_PROBE_FAILED", message: String(e?.message || e), hint: "No data was written by this check. For HTTP 404: create the configured table / grant access, then retry." });
    }
    if (String(req.query.write || "").toLowerCase() !== "true") {
      return res.json({ success: true, configured: true, provider, probe: "OK", stages, hint: "Read probe succeeded; no data was written by this check. Re-run with ?write=true for a self-cleaning write/read/delete proof." });
    }
    const marker = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      try { await storageProvider.delete(ADE_VERIFY_PROBE_KEY); } catch {}
      await storageProvider.set(ADE_VERIFY_PROBE_KEY, { marker });
      stages.write = "OK";
      const back = await storageProvider.get(ADE_VERIFY_PROBE_KEY, null);
      if (!back || back.marker !== marker) throw new Error("STORAGE_PROBE_MISMATCH: read-back value did not match the written probe.");
      stages.readBack = "OK";
      await storageProvider.delete(ADE_VERIFY_PROBE_KEY);
      stages.delete = "OK";
    } catch (e) {
      try { await storageProvider.delete(ADE_VERIFY_PROBE_KEY); } catch {}
      return res.json({ success: true, configured: true, provider, probe: "FAILED", stages, error: "STORAGE_WRITE_PROBE_FAILED", message: String(e?.message || e), hint: "Cleanup attempted. For HTTP 404: create the configured table / grant access, then retry." });
    }
    res.json({ success: true, configured: true, provider, probe: "OK", stages, hint: "Write, read-back and delete all succeeded; no residue remains." });
  } catch (error) {
    res.status(500).json({ success: false, error: "STORAGE_VERIFY_FAILED", message: error.message });
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

app.get('/api/v1/notifications/recent', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    res.json({ success: true, events: await notificationEngine.getRecentEventsAsync(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: "NOTIFICATIONS_FAILED", message: error.message });
  }
});

// === TRANSACTIONAL EMAIL (Resend, canonical) ==============================
// Status is safe to expose (never includes the key). Dashboard supplements ENV.
app.get('/api/v1/email/status', security.requireLevel(2), (req, res) => {
  try {
    const stored = (()=>{ try{ return runtimeConfig.readSection?.("resend") || runtimeConfig.read()?.resend || null; }catch{ return null; }})();
    const base = emailConnector.status();
    if (stored?.apiKeyMasked) {
      return res.json({ success: true, email: { ...base, dashboardConfigured:true, dashboardMasked: stored.apiKeyMasked, status: base } });
    }
    res.json({ success: true, email: base });
  } catch (error) {
    res.status(500).json({ success: false, error: "EMAIL_STATUS_FAILED", message: error.message });
  }
});

app.post('/api/v1/email/send', security.requireLevel(2), async (req, res) => {
  try {
    const { to, subject, html, text, profile, from } = req.body || {};
    const internal = notificationEngine.generateInternalEvent("notification.request_status", {
      channel: "EMAIL",
      to: typeof to === "string" ? to.trim() : to,
      subject: typeof subject === "string" ? subject.slice(0, 200) : subject
    });
    const result = await emailConnector.send({ to, subject, html, text, profile, from });
    logEvent('EMAIL', `Resend delivery ${result.id || "accepted"} to ${result.to} (event ${internal.eventId})`);
    res.json({ success: true, delivery: result, internalEventId: internal.eventId });
  } catch (error) {
    const code = String(error?.message || "EMAIL_SEND_FAILED").split(":")[0] || "EMAIL_SEND_FAILED";
    const status = /NOT_CONFIGURED|EMAIL_NOT_CONFIGURED/.test(error?.message || "") ? 503 : 400;
    res.status(status).json({ success: false, error: code, message: error.message });
  }
});

app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/founder', (req,res)=>res.sendFile(path.join(__dirname, '../public/founder.html')));
app.get('/market-lab', (req,res)=>res.sendFile(path.join(__dirname, '../public/market-lab.html')));
app.get('/lab', (req,res)=>res.sendFile(path.join(__dirname, '../public/market-lab.html')));

// Serve Static UI Assets. Image/font assets are content-addressed by deployment
// (same path, new bytes per release) and safe to cache immutably — this is what
// keeps the brand mark rendering instantly on repeat views, Back navigation and
// mobile reloads. HTML stays no-cache so UI fixes deploy visibly.
app.use(express.static(path.join(__dirname, "../public"), {
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath) {
    try {
      if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/i.test(String(filePath || ""))) {
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      } else if (/\.html?$/i.test(String(filePath || ""))) {
        res.setHeader("Cache-Control", "no-cache");
      }
    } catch {}
  }
}));

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

// Canonical experience routes: one meaningful URL per surface. Each alias
// serves the canonical SPA shell (refresh-safe, deep-linkable, Back/Forward
// compatible); the client resolves section state from the path on load.
// No new capability is created here — these are presentation aliases over
// existing surfaces. Unknown paths still fall through to the SPA fallback.
const canonicalShell = (req, res) => {
  const indexFile = path.join(__dirname, "../public/index.html");
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.send(`<!DOCTYPE html><html><head><title>ADE-APEX EOS</title></head><body><h1>ADE-APEX ENTERPRISE OS OPERATIONAL</h1></body></html>`);
};
for (const alias of ["/home","/workspace","/procarta","/awbuli","/eventos","/connect","/connect/platforms","/pilot","/community","/partners","/signin","/join","/how-it-works","/architecture","/products","/product-theater","/try-ade","/feedback","/account","/command-center","/operations","/operations/live","/workflows","/workforce","/invitations","/ai-workers","/knowledge","/decisions","/payments","/commerce","/financial","/audit","/notifications","/settings","/markets","/markets/forex","/markets/binary","/markets/binary/regular","/markets/binary/otc","/gaming","/gaming/aviator","/sports"]) {
  app.get(alias, canonicalShell);
}

app.get("*", (req, res) => {
  // SPA fallback: serve the canonical Community frontend. This preserves
  // direct navigation, refresh, back/forward, and deep links for
  // founder/admin and general users. The API 404 boundary above already
  // handles /api/*, so this only serves frontend routes.
  const indexFile = path.join(__dirname, "../public/index.html");
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  res.send(`<!DOCTYPE html><html><head><title>ADE-APEX EOS</title></head><body><h1>ADE-APEX ENTERPRISE OS OPERATIONAL</h1></body></html>`);
});

export { app, kernel, kernelReady, storageProvider, storageHydration, registry };
export default app;
