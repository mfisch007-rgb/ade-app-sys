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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Commercial operating loop / universal intake services. These are deliberately
// provider-neutral: Web, Email, WhatsApp, Telegram, Partner, CRM, API and
// procurement sources all terminate in the same intake/case model.
const runtimeConfig = new RuntimeConfigStore();
const secrets = { _m:new Map(), setSecret(k,v){this._m.set(k,v)}, getSecret(k){return this._m.get(k)||process.env[k]} };
const connectionManager = new ConnectionManager({ secrets });
const caseManager = new CaseManager({ eventBus: kernel?.eventBus, store: runtimeConfig });
const intake = new UnifiedIntakeEngine({ caseManager, eventBus: kernel?.eventBus, connectionManager });
const channels = new ChannelRegistry();
for (const [id,label] of [['WEB','ADE Portal'],['EMAIL','Email'],['WHATSAPP','WhatsApp / AWBULI'],['TELEGRAM','Telegram'],['API','API'],['WEBHOOK','Webhook'],['PARTNER','Partner / A2MPro'],['CRM','CRM'],['MARKETPLACE','Marketplace'],['PROCUREMENT','Enterprise Procurement'],['HUMAN','Human-assisted Intake']]) { const saved=runtimeConfig.read().channels?.[id] || {}; channels.register(id,{label,inbound:true,...saved}); }
const partners = new PartnerRegistry();


// Kernel Boot
if (kernel && typeof kernel.boot === "function") {
  try { kernel.boot(); } catch (e) { console.warn("[KERNEL BOOT NOTICE]", e.message); }
}

// Memory Log Buffer & Central Logging Pipeline
const systemLogs = [
  { time: new Date().toLocaleTimeString(), tag: "[KERNEL]", message: "ADE-APEX Enterprise Operating System booted." },
  { time: new Date().toLocaleTimeString(), tag: "[GUARDIAN]", message: "Security Gate initialized and active." }
];

function logEvent(tag, message) {
  const entry = { time: new Date().toLocaleTimeString(), tag: `[${tag}]`, message };
  systemLogs.push(entry);
  if (systemLogs.length > 200) systemLogs.shift(); // Bound memory size

  if (observatory && typeof observatory.logSystem === "function") {
    try { observatory.logSystem(tag, message); } catch(e){}
  }
}

console.log("[KERNEL ARCHITECTURE] Enterprise Kernel, Plugin Registry & Observatory wired.");

// Ecosystem Capabilities Catalog
const BUILTIN_ECOSYSTEM_CAPABILITIES = [
  { action: "ADE_AWBULI_HUB", label: "ADE-AWBULI System Controller & Automation Engine", category: "ADE Internal Subsystem" },
  { action: "PROCARTA_WORKFLOW", label: "Procarta Workflow Execution Hub", category: "Automation Subsystem" },
  { action: "LEAD_MGMT_PIPELINE", label: "Lead Management & CRM Engine", category: "Business Ops" },
  { action: "AFFILIATE_LOCK", label: "Affiliate Lock & License Validation Gateway", category: "Security & Licensing" },
  { action: "ORACLE_QUERY", label: "Oracle System Intelligence Engine & Knowledge Base", category: "Kernel AI & Analytics" },
  { action: "MARKETING_AI_STUDIO", label: "Marketing AI Studio & Content Generator", category: "AI Subsystem" },
  { action: "VERTEX_AI_ADAPTER", label: "Vertex AI / Google ADK Connector", category: "AI Adapters" },
  { action: "WHATSAPP_GATEWAY", label: "WhatsApp Automation Client & Webhook Gateway", category: "Communication Hub" },
  { action: "UNIVERSAL_WEBHOOK_ROUTER", label: "Universal Inbound Webhook Router", category: "External API Integration" },
  { action: "UNIVERSAL_AGGREGATOR", label: "Universal Data & Asset Stream Aggregator", category: "Data Ingestion" },
  { action: "ECHO_TOGGLE", label: "Toggle Kernel CLI Command Echoing (ECHO-OFF / ECHO-ON)", category: "Kernel CLI Control" },
  { action: "KERNEL_SHUTDOWN", label: "Safe Operating System Shutdown & Disconnect", category: "Kernel Control" },
  { action: "SECURITY_GATE_VERIFY", label: "Security Gate & PIN Validation", category: "System Security" }
];

// GATE 1 & 2: Auth
app.post("/api/v1/auth/pin", (req, res) => {
  const { pin } = req.body || {};
  if (!pin || pin !== "888888") {
    logEvent("GUARDIAN", "Unauthorized access attempt blocked.");
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  logEvent("GUARDIAN", "Admin Authenticated via Gate 2 PIN.");
  return res.status(200).json({
    success: true,
    authLevel: 4,
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_token_mock"
  });
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
      label: `⚡ Kernel Intent Dispatch: "${rawQuery}"`,
      category: "Kernel Dynamic Resolver",
      query: rawQuery
    });
  }

  return res.json({ success: true, commands: matched });
});

// GATE 4 (Exec): Dispatcher
app.post("/api/command/execute", (req, res) => {
  const { action, payload } = req.body || {};
  const details = payload ? JSON.stringify(payload) : "none";

  logEvent("COMMAND", `Kernel Action Dispatched: ${action} | Payload: ${details}`);

  if (kernel && typeof kernel.dispatchIntent === "function") {
    try { kernel.dispatchIntent(action, payload); } catch(e){}
  }

  return res.json({ success: true, action, payload, status: "DISPATCHED_TO_KERNEL" });
});

// GATE 5: Real-time SSE Stream
app.get("/api/v1/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (res.flushHeaders) res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "CONNECTED", message: "Kernel SSE Bus Stream Active" })}\n\n`);

  const timer = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() })}\n\n`);
  }, 15000);

  req.on("close", () => clearInterval(timer));
});


// === UNIVERSAL OPERATING SURFACE ==========================================
// Canonical SSE route. The earlier runtime had multiple historical SSE paths;
// this is now the stable public contract used by the Command Center.
app.get("/api/v1/events/stream", (req,res)=>{
  res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache, no-transform");
  res.setHeader("Connection","keep-alive"); if(res.flushHeaders) res.flushHeaders();
  const send=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('connected',{status:'CONNECTED',service:'ADE_EVENT_STREAM',timestamp:new Date().toISOString()});
  const timer=setInterval(()=>send('heartbeat',{timestamp:new Date().toISOString()}),1000);
  req.on('close',()=>clearInterval(timer));
});

// Authoritative capability surface used by UI discovery and external clients.
app.get('/api/v1/capabilities',(req,res)=>{
  const capabilities=[
    ['PING','Kernel Ping',0,'CORE','FREE'],['PUBLIC_INFO','Public Platform Information',0,'CORE','FREE'],
    ['WATCH_ASSET','Watch Asset Stream',1,'CORE','FREE'],['TELEMETRY_SSE','Live Telemetry Stream',1,'CORE','FREE'],
    ['UNIVERSAL_AI_GATEWAY','Universal AI Gateway',1,'CORE','FREE'],['MULTI_STREAM','Multi-Stream Operations',2,'CORE','PRO'],
    ['SYSTEM_HEALTH','System Health',1,'CORE','FREE'],['SYSTEM_SHUTDOWN','Controlled System Shutdown',4,'CORE','ENTERPRISE'],
    ['UNIVERSAL_INTAKE','Universal Business Intake',1,'CORE','FREE'],['CASE_MANAGEMENT','Autonomous Case / Opportunity Management',1,'CORE','FREE'],
    ['ENTITY_INTELLIGENCE','Entity & Trust Intelligence',2,'CORE','PRO'],['CONNECTION_MANAGER','Integration / Connection Manager',3,'CORE','PRO'],
    ['PARTNER_ROUTING','Partner Capability Matching',2,'CORE','PRO'],['PUBLIC_DISCOVERY','Authorized Public Business Discovery',1,'CORE','FREE']
  ].map(([id,name,rbacLevel,sourceModule,tier])=>({id,intent:id,name,rbacLevel,sourceModule,extensionId:null,tier,classification:'STATIC_CORE_CAPABILITY',description:'',registeredAt:new Date().toISOString(),revoked:false,runtimeBound:true}));
  res.json({success:true,authoritative:true,capabilities,subsystems:Array.from(kernel?.subsystems?.keys?.()||[])});
});

app.post('/api/v1/intake/:channel',(req,res)=>{ try { const result=intake.ingest(req.params.channel,req.body||{},{source:req.body?.source||req.params.channel,authenticated:Boolean(req.headers.authorization)}); logEvent('INTAKE',`Created ${result.case.id} from ${req.params.channel}`); res.status(201).json(result); } catch(e){res.status(400).json({success:false,error:e.message});} });
app.get('/api/v1/cases',(req,res)=>res.json({success:true,count:caseManager.list().length,cases:caseManager.list()}));
app.get('/api/v1/cases/:id',(req,res)=>{const c=caseManager.get(req.params.id); if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'}); res.json({success:true,case:c});});
app.patch('/api/v1/cases/:id',(req,res)=>{const c=caseManager.update(req.params.id,req.body||{}); if(!c)return res.status(404).json({success:false,error:'CASE_NOT_FOUND'}); res.json({success:true,case:c});});

app.get('/api/v1/admin/overview',(req,res)=>res.json({success:true,channels:channels.list(),connections:connectionManager.list(),partners:partners.list(),cases:caseManager.list(),settings:runtimeConfig.read()}));
app.get('/api/v1/admin/channels',(req,res)=>res.json({success:true,channels:channels.list()}));
app.patch('/api/v1/admin/channels/:id',(req,res)=>{const c=channels.set(req.params.id,req.body||{}); runtimeConfig.write('channels',req.params.id,c); res.json({success:true,channel:c});});
app.get('/api/v1/admin/connections',(req,res)=>res.json({success:true,connections:connectionManager.list()}));
app.post('/api/v1/admin/connections',(req,res)=>{try{res.status(201).json({success:true,connection:connectionManager.upsert(req.body||{})});}catch(e){res.status(400).json({success:false,error:e.message});}});
app.post('/api/v1/admin/connections/:id/test',async(req,res)=>res.json(await connectionManager.test(req.params.id)));
app.get('/api/v1/admin/partners',(req,res)=>res.json({success:true,partners:partners.list()}));
app.post('/api/v1/admin/partners',(req,res)=>res.status(201).json({success:true,partner:partners.upsert(req.body||{})}));
app.get('/api/v1/admin/settings',(req,res)=>res.json({success:true,settings:runtimeConfig.read()}));
app.patch('/api/v1/admin/settings',(req,res)=>{const body=req.body||{}; let d=runtimeConfig.read(); for(const [section,values] of Object.entries(body)){for(const [k,v] of Object.entries(values||{})) d=runtimeConfig.write(section,k,v);} res.json({success:true,settings:d});});
app.post('/api/v1/assessment/public-discovery',async(req,res)=>{try{if(!req.body?.authorization?.publicAnalysis)return res.status(403).json({success:false,error:'PUBLIC_ANALYSIS_AUTHORIZATION_REQUIRED'}); const result=await publicDiscovery(req.body.url); res.json(result);}catch(e){res.status(400).json({success:false,error:e.message});}});

app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname, '../public/admin/index.html')));

// Serve Static UI Assets
app.use(express.static(path.join(__dirname, "../public")));

app.get("*", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>ADE-APEX EOS</title></head><body><h1>ADE-APEX ENTERPRISE OS OPERATIONAL</h1></body></html>`);
});

app.listen(PORT, () => {
  console.log(`[ADE-APEX KERNEL] Server online at http://localhost:${PORT}`);
});
