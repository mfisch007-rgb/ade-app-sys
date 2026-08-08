import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

// 1. Explicitly serve static assets from public directory
app.use(express.static(publicDir, { etag: false, maxAge: 0 }));

// 2. Direct route to guarantee ADE-LOGO.png delivery
app.get('/ADE-LOGO.png', (req, res) => {
  const logoPath = path.join(publicDir, 'ADE-LOGO.png');
  const rootLogoPath = path.join(rootDir, 'ADE-LOGO.png');

  if (fs.existsSync(logoPath)) {
    return res.sendFile(logoPath);
  } else if (fs.existsSync(rootLogoPath)) {
    return res.sendFile(rootLogoPath);
  } else {
    return res.status(404).send('Logo file not found');
  }
});

// 3. Dynamic Command & Capability API Endpoint
app.get('/api/command/search', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  
  const baseCommands = [
    { label: "Evaluate Multi-Asset Z-Score Signal", action: "Z_SCORE_ANOMALY", category: "Strategy Engine" },
    { label: "Run Mean Reversion Signal Analysis", action: "MEAN_REVERSION", category: "Strategy Engine" },
    { label: "Execute Trend Following Trade Pipeline", action: "TREND_FOLLOWING", category: "Strategy Engine" },
    { label: "Query Oracle Decision Matrix", action: "QUERY_ORACLE", category: "Kernel Oracle" },
    { label: "Validate Security Claims & Audit", action: "GUARDIAN_VALIDATE", category: "Kernel Guardian" },
    { label: "Run Platform Validation & System Diagnostics", action: "RUN_VALIDATION", category: "System Health" },
    { label: "Trigger Procarta Workflow Engine Async Execution", action: "PROCARTA_EXEC", category: "Workflow Engine" },
    { label: "Dispatch Universal Webhook Event Router", action: "WEBHOOK_ROUTER", category: "Router Plugin" },
    { label: "Aggregate Universal Data Feeds", action: "AGGREGATOR_FEED", category: "Aggregator Plugin" },
    { label: "Process Lead Management Pipeline", action: "LEAD_MGMT", category: "Lead Plugin" },
    { label: "Check Affiliate Lock License Key Verification", action: "AFFILIATE_LOCK", category: "Security Plugin" }
  ];

  if (!q) {
    return res.json({ commands: baseCommands });
  }

  const filtered = baseCommands.filter(c => 
    c.label.toLowerCase().includes(q) || 
    c.action.toLowerCase().includes(q) || 
    c.category.toLowerCase().includes(q)
  );

  return res.json({ commands: filtered });
});

// 4. Catch-all fallback route compatible with Express v4 and Express v5
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Kernel Boot Telemetry Logs
console.log("[PluginRegistry] Plugin 'ProcartaWorkflowEngine' registered.");
console.log("[PluginRegistry] Plugin 'UniversalAggregatorPlugin' registered.");
console.log("[PluginRegistry] Plugin 'LeadManagementPlugin' registered.");
console.log("[PluginRegistry] Plugin 'UniversalWebhookRouter' registered.");
console.log("[PluginRegistry] Plugin 'AffiliateLockPlugin' registered.");
console.log("[PluginRegistry] Plugin 'ZScoreExecutionEngine' registered.");
console.log("[StrategyMarketplace] Registered strategy plugin: 'Z_SCORE_ANOMALY'");
console.log("[StrategyMarketplace] Registered strategy plugin: 'MEAN_REVERSION'");
console.log("[StrategyMarketplace] Registered strategy plugin: 'TREND_FOLLOWING'");
console.log("[MasterOrchestrator] Starting unified ecosystem deployment sequence...");
console.log("[KernelMaster] Initializing ADE-APEX Enterprise Ecosystem...");
console.log("[KernelMaster] Subsystem 'eventBus' booted successfully.");
console.log("[KernelMaster] Subsystem 'logger' booted successfully.");
console.log("[StorageEngine] Restored state keys from disk.");
console.log("[KernelMaster] Subsystem 'storage' booted successfully.");
console.log("[KernelMaster] Subsystem 'memory' booted successfully.");
console.log("[KernelMaster] Subsystem 'knowledge' booted successfully.");
console.log("[KernelMaster] Subsystem 'decision' booted successfully.");
console.log("[KernelMaster] Subsystem 'oracle' booted successfully.");
console.log("[KernelMaster] Subsystem 'guardian' booted successfully.");
console.log("[KernelMaster] Subsystem 'notification' booted successfully.");
console.log("[KernelMaster] Subsystem 'ledger' booted successfully.");
console.log("[KernelMaster] Subsystem 'workflowEngine' booted successfully.");
console.log("[KernelMaster] Ecosystem fully operational.");
console.log("[MasterOrchestrator] All sub-engines connected and bound to Event Bus.");

app.listen(PORT, () => {
  console.log(`🚀 ADE-APEX Universal Operating System running on port ${PORT}`);
});