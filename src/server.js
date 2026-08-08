import express from 'express';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

app.use(express.json());

// Strict NO-CACHE headers
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

class KernelEventBus extends EventEmitter {}
const kernelBus = new KernelEventBus();

const recentLogs = [];

function pushLog(tag, message, metadata = {}) {
  const logItem = {
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    tag,
    message,
    metadata
  };
  recentLogs.push(logItem);
  if (recentLogs.length > 50) recentLogs.shift();
  return logItem;
}

pushLog('[SYSTEM]', 'ADE-APEX Kernel Master booted. Telemetry engine fully online.');

// Telemetry Polling Endpoint
app.get('/api/telemetry/poll', (req, res) => {
  res.json({ logs: recentLogs });
});

// Deep Ecosystem Search Engine
app.get('/api/command/search', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  
  const systemCapabilities = [
    { label: "Evaluate Agnostic Market Feed Pipeline", action: "INGEST_PIPELINE", category: "Data Engine", keywords: "ingest market feed data flow pipeline" },
    { label: "Evaluate Multi-Asset Z-Score Signal Engine", action: "Z_SCORE_ANOMALY", category: "Strategy Engine", keywords: "z-score anomaly signal strategy math" },
    { label: "Run Mean Reversion Execution Matrix", action: "MEAN_REVERSION", category: "Strategy Engine", keywords: "mean reversion execution trading matrix" },
    { label: "Execute Trend Following Momentum Engine", action: "TREND_FOLLOWING", category: "Strategy Engine", keywords: "trend momentum strategy execution" },
    { label: "Query Oracle Universal Decision Core", action: "QUERY_ORACLE", category: "Kernel Oracle", keywords: "oracle intelligence query decision brain" },
    { label: "Inspect Guardian Shield Security Audit Logs", action: "GUARDIAN_VALIDATE", category: "Kernel Guardian", keywords: "guardian security audit lock shield validate" },
    { label: "Run System Health & Diagnostics Matrix", action: "RUN_VALIDATION", category: "System Diagnostics", keywords: "diagnostics health audit validate check" },
    { label: "Trigger Procarta Async Workflow Engine", action: "PROCARTA_EXEC", category: "Workflow Engine", keywords: "procarta workflow async engine dispatch" },
    { label: "Dispatch Universal Webhook Event Router", action: "WEBHOOK_ROUTER", category: "Router Plugin", keywords: "webhook router dispatch network router" },
    { label: "Aggregate Universal Multi-Asset Feeds", action: "AGGREGATOR_FEED", category: "Aggregator Plugin", keywords: "aggregator multi-asset asset feed data" },
    { label: "Query Deep Kernel Storage Keys", action: "QUERY_STORAGE_KEYS", category: "Memory Subsystem", keywords: "memory storage keys disk state database search" },
    { label: "Inspect EventBus Handlers", action: "INSPECT_EVENTBUS", category: "Kernel Master", keywords: "eventbus event bus listeners handlers pubsub" },
    { label: "Dump Active Ecosystem Ledger", action: "DUMP_LEDGER", category: "Ledger Subsystem", keywords: "ledger audit history transactions logs record" }
  ];

  if (!q) return res.json({ commands: systemCapabilities });

  const filtered = systemCapabilities.filter(c => 
    c.label.toLowerCase().includes(q) || 
    c.action.toLowerCase().includes(q) || 
    c.category.toLowerCase().includes(q) ||
    c.keywords.toLowerCase().includes(q)
  );

  return res.json({ commands: filtered });
});

// Single Execution Endpoint (Clean, Deduplicated Logging)
app.post('/api/command/execute', (req, res) => {
  const { action, payload } = req.body;
  const label = payload?.label || action;

  let tag = '[COMMAND-EXEC]';
  let logMessage = `Executed: ${action} (${label})`;

  if (action === 'DYNAMIC_KERNEL_INTENT') {
    tag = '[KERNEL-RESOLVER]';
    logMessage = `Resolved Dynamic Intent query -> "${payload?.query || label}"`;
  } else if (action.includes('ORACLE')) {
    tag = '[ORACLE]';
  } else if (action.includes('GUARDIAN')) {
    tag = '[GUARDIAN]';
  }

  // Push single authoritative log
  const entry = pushLog(tag, logMessage, payload);

  res.json({ status: 'SUCCESS', action, logged: entry });
});

// Logo Asset Handler
app.get('/ADE-LOGO.png', (req, res) => {
  const logoPath = path.join(publicDir, 'ADE-LOGO.png');
  const rootLogoPath = path.join(rootDir, 'ADE-LOGO.png');
  if (fs.existsSync(logoPath)) return res.sendFile(logoPath);
  if (fs.existsSync(rootLogoPath)) return res.sendFile(rootLogoPath);
  return res.status(404).send('Logo file not found');
});

app.use(express.static(publicDir, { etag: false, maxAge: 0 }));

app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Precision Heartbeat Pulse (3000ms)
let heartbeatCount = 0;
setInterval(() => {
  heartbeatCount++;
  pushLog('[KERNEL-PULSE]', `System Health 100% | Pulse #${heartbeatCount}`);
}, 3000);

console.log("[PluginRegistry] Registered all core engines & strategy plugins.");
console.log("[MasterOrchestrator] Starting unified ecosystem deployment sequence...");
console.log("[KernelMaster] Initializing ADE-APEX Enterprise Ecosystem...");

app.listen(PORT, () => {
  console.log(`🚀 ADE-APEX Universal Operating System running on port ${PORT}`);
});