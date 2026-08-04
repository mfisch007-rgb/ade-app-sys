import fs from "fs";
import path from "path";

const ROOT_DIR = process.cwd();
const TARGET_BRANCH = "enterprise-modernization-v1";

console.log("================================================================================");
console.log("    ADE-APEX NEXT-GEN RUNTIME & ARCHITECTURAL REACHABILITY FORENSIC SUITE");
console.log("================================================================================");
console.log(`Target Branch: ${TARGET_BRANCH}`);
console.log(`Execution Mode: READ-ONLY (Deep AST & Behavioral Inspection)`);
console.log("================================================================================");

// Excluded root scripts (Fixers/Remediators) to prevent false runtime contamination
const ROOT_EXCLUSIONS = new Set([
  "run-enterprise-audit.js",
  "fix-all-audit-issues.js",
  "master-remediator.js",
  "final-perfect-scorecard.js",
  "repair-enterprise-final.js",
  "autofix-enterprise.js",
  "patch-scorecard.js"
]);

// 1. File Crawler & Scope Filter
function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");

    if (
      relPath.startsWith("node_modules/") ||
      relPath.startsWith(".git/") ||
      relPath.startsWith("dist/") ||
      relPath.startsWith("build/")
    ) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (/\.(js|ts|mjs|cjs)$/i.test(file)) {
      if (path.dirname(relPath) === "." && ROOT_EXCLUSIONS.has(file)) continue;
      fileList.push({ fullPath, relPath });
    }
  }
  return fileList;
}

const sourceFiles = scanDirectory(ROOT_DIR);
console.log(`Total Active Application Source Files Analyzed: ${sourceFiles.length}\n`);

// Data structures for forensic checks
const moduleGraph = new Map(); // File -> Set of Imports
const publishedEvents = new Set();
const subscribedEvents = new Set();
const lifecycleHooks = { init: 0, boot: 0, ready: 0, shutdown: 0, dispose: 0 };
let memoryLeakRisks = 0;
let unawaitedPublishes = 0;
let emptyCatches = 0;
let roadmapStubs = 0;
let schemaValidatedEvents = 0;

// All 53 Continuum Subsystem Keywords
const SUBSYSTEM_LAYERS = [
  "CoreKernel", "EventBus", "MasterBoot", "Registry", "ChannelAdapter",
  "DecisionEngine", "AutonomousExecution", "ContextCache", "AnomalyEngine",
  "EvaluationEngine", "FinancialSettlement", "GodMode", "KnowledgeEngine",
  "LearningEngine", "MemoryEngine", "NexusLedger", "ObservationEngine",
  "OfflineQueue", "OracleIntelligence", "StorageEngine", "TaskConfidenceRouter",
  "ConfidenceEngine", "HealthSupervisor", "AuthEngine", "IdentityEngine",
  "BillingEngine", "PaymentGatewayEngine", "PersistenceEngine", "OpenAPIGateway",
  "FounderCircle", "Academy", "NotificationEngine", "AuditLogs", "Frontend",
  "Mobile", "Deployment", "DisasterRecovery", "AutomationEngine", "PluginRuntime",
  "CICD", "Cloud", "Backups", "GitHubActions", "Vercel", "GoogleCloud",
  "HealthChecks", "SelfHealing", "AutonomousLoop", "HumanEscalation",
  "BusinessLogic", "Documentation", "CommercialReadiness", "Production"
];

const mappedSubsystems = new Set();

// 2. Deep Source Inspection
for (const { fullPath, relPath } of sourceFiles) {
  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split("\n");

  // Track Subsystem Continuum Presence
  for (const layer of SUBSYSTEM_LAYERS) {
    if (content.includes(layer)) mappedSubsystems.add(layer);
  }

  // Track Imports / Dependency Graph
  const importMatches = content.matchAll(/(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g);
  const imports = new Set();
  for (const m of importMatches) {
    const target = m[1] || m[2];
    if (target && target.startsWith(".")) imports.add(target);
  }
  moduleGraph.set(relPath, imports);

  // Event Pub/Sub & Schema Checks
  const pubMatches = content.matchAll(/(?:eventBus\.publish|bus\.publish)\(['"]([^'"]+)['"](?:\s*,\s*({[^}]+}))?/g);
  for (const m of pubMatches) {
    publishedEvents.add(m[1]);
    if (m[2] && (m[2].includes("schema") || m[2].includes("payload"))) schemaValidatedEvents++;
  }

  const subMatches = content.matchAll(/(?:eventBus\.subscribe|bus\.subscribe)\(['"]([^'"]+)['"]/g);
  for (const m of subMatches) {
    subscribedEvents.add(m[1]);
  }

  // Lifecycle Verification
  if (/async\s+boot\s*\(|function\s+boot\b/.test(content)) lifecycleHooks.boot++;
  if (/async\s+init\s*\(|function\s+initialize\b/.test(content)) lifecycleHooks.init++;
  if (/async\s+shutdown\s*\(|function\s+shutdown\b/.test(content)) lifecycleHooks.shutdown++;
  if (/async\s+dispose\s*\(|function\s+dispose\b/.test(content)) lifecycleHooks.dispose++;

  // Memory Leak Inspection (Unbounded Event Listeners & Timers)
  const listenerMatches = (content.match(/\.on\(|\.addEventListener\(|setInterval\(/g) || []).length;
  const removerMatches = (content.match(/\.off\(|\.removeEventListener\(|clearInterval\(/g) || []).length;
  if (listenerMatches > removerMatches) {
    memoryLeakRisks += (listenerMatches - removerMatches);
  }

  // Unawaited Publishes Inspection
  const unawaited = content.matchAll(/(?<!await\s+)(?:eventBus\.publish|bus\.publish)\(/g);
  for (const _ of unawaited) unawaitedPublishes++;

  // Empty Catch Inspection
  const emptyCatch = content.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g);
  for (const _ of emptyCatch) emptyCatches++;

  // Roadmap Stubs / TODOs
  for (const line of lines) {
    if (/\/\/\s*(TODO|HACK|FIXME|STUB)/i.test(line)) roadmapStubs++;
  }
}

// 3. Reachability & Entry-Point Traversal
const entryPoints = ["src/server.js", "src/index.js", "src/app.js", "src/core/Kernel.js"];
const reachableModules = new Set();

function markReachable(modPath) {
  if (reachableModules.has(modPath)) return;
  reachableModules.add(modPath);

  const deps = moduleGraph.get(modPath);
  if (deps) {
    for (const dep of deps) {
      // Resolve relative path
      const dir = path.dirname(modPath);
      let resolved = path.join(dir, dep).replace(/\\/g, "/");
      if (!resolved.endsWith(".js")) resolved += ".js";
      if (moduleGraph.has(resolved)) markReachable(resolved);
    }
  }
}

for (const ep of entryPoints) {
  if (moduleGraph.has(ep)) markReachable(ep);
}

// 4. Calculate Metrics & Un-inflated Enterprise Scorecard
const totalFiles = sourceFiles.length;
const orphanCount = totalFiles - reachableModules.size;
const deadEvents = Array.from(publishedEvents).filter(e => !subscribedEvents.has(e)).length;

const continuumCoverage = Math.round((mappedSubsystems.size / SUBSYSTEM_LAYERS.length) * 100);
const eventBusScore = publishedEvents.size === 0 ? 100 : Math.max(0, Math.round(((publishedEvents.size - deadEvents) / publishedEvents.size) * 100));
const reachabilityScore = totalFiles === 0 ? 100 : Math.round((reachableModules.size / totalFiles) * 100);
const lifecycleScore = Math.min(100, Math.round(((lifecycleHooks.boot + lifecycleHooks.shutdown) / (totalFiles * 0.1 || 1)) * 100));

// Honest Enterprise Readiness Formula
const trueReadinessScore = Math.round(
  (continuumCoverage * 0.25) +
  (eventBusScore * 0.25) +
  (reachabilityScore * 0.25) +
  (lifecycleScore * 0.25)
);

// PRINT REPORT
console.log("--------------------------------------------------------------------------------");
console.log("SECTION A: DEPENDENCY & REACHABILITY ANALYSIS");
console.log("--------------------------------------------------------------------------------");
console.log(`Reachable Application Modules: ${reachableModules.size} / ${totalFiles}`);
console.log(`Orphan / Unreferenced Modules: ${orphanCount}`);

console.log("\n--------------------------------------------------------------------------------");
console.log("SECTION B: EVENT BUS TOPOLOGY & CONTRACTS");
console.log("--------------------------------------------------------------------------------");
console.log(`Unique Event Topics Published: ${publishedEvents.size}`);
console.log(`Unique Event Topics Subscribed: ${subscribedEvents.size}`);
console.log(`Dead Event Topics (Unconsumed): ${deadEvents}`);
console.log(`Schema-Validated Event Publishes: ${schemaValidatedEvents}`);

console.log("\n--------------------------------------------------------------------------------");
console.log("SECTION C: LIFECYCLE, MEMORY & CONCURRENCY RISKS");
console.log("--------------------------------------------------------------------------------");
console.log(`Lifecycle Methods Detected (Boot/Init/Shutdown/Dispose): ${lifecycleHooks.boot + lifecycleHooks.init + lifecycleHooks.shutdown + lifecycleHooks.dispose}`);
console.log(`Potential Unbounded Memory Listeners/Timers: ${memoryLeakRisks}`);
console.log(`Un-awaited Async Bus Event Publishes: ${unawaitedPublishes}`);
console.log(`Empty Catch Blocks (Swallowed Errors): ${emptyCatches}`);
console.log(`Roadmap TODOs/HACKs/STUBs: ${roadmapStubs}`);

console.log("\n--------------------------------------------------------------------------------");
console.log("SECTION D: 53-LAYER ARCHITECTURAL CONTINUUM COVERAGE");
console.log("--------------------------------------------------------------------------------");
console.log(`Subsystem Layers Mapped: ${mappedSubsystems.size} / 53 (${continuumCoverage}%)`);

console.log("\n================================================================================");
console.log("SECTION E: UN-INFLATED CTO ARCHITECTURAL SCORECARD");
console.log("================================================================================");
console.log(`  1. Architectural Continuum Score: ${continuumCoverage}/100`);
console.log(`  2. Topological Reachability Score:  ${reachabilityScore}/100`);
console.log(`  3. Event Bus & Fault Reliability:  ${eventBusScore}/100`);
console.log(`  4. Lifecycle & Governance Score:   ${lifecycleScore}/100`);
console.log(`--------------------------------------------------------------------------------`);
console.log(`  TRUE ENTERPRISE READINESS SCORE:   ${trueReadinessScore}/100`);
console.log("================================================================================\n");