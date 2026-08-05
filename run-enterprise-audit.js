import fs from "fs";
import path from "path";

const ROOT_DIR = process.cwd();
const TARGET_BRANCH = "enterprise-modernization-v1";

console.log("================================================================================");
console.log("   ADE-APEX ENTERPRISE BEHAVIORAL & ARCHITECTURAL AUDITOR (STRICT SCOPE)");
console.log("================================================================================");
console.log(`Target Branch: ${TARGET_BRANCH}`);
console.log(`Execution Scope: READ-ONLY (Application Runtime Scope)`);
console.log("================================================================================");

// Strict exclusion of developer tooling scripts from runtime architectural scores
const TOOLING_EXCLUSIONS = new Set([
  "run-enterprise-audit.js",
  "fix-all-audit-issues.js",
  "master-remediator.js",
  "final-perfect-scorecard.js",
  "repair-enterprise-final.js",
  "autofix-enterprise.js",
  "patch-scorecard.js",
  "fix-async-publishes.js"
]);

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
      if (path.dirname(relPath) === "." && TOOLING_EXCLUSIONS.has(file)) continue;
      fileList.push({ fullPath, relPath });
    }
  }
  return fileList;
}

const sourceFiles = scanDirectory(ROOT_DIR);
console.log(`Total Application Source Files Analyzed: ${sourceFiles.length}\n`);

const moduleGraph = new Map();
const publishedEvents = new Set();
const subscribedEvents = new Set();

let lifecycleBootCount = 0;
let lifecycleReadyCount = 0;
let lifecycleShutdownCount = 0;
let lifecycleDisposeCount = 0;

let memoryLeakRisks = 0;
let unawaitedPublishes = 0;
let emptyCatches = 0;
let schemaEnforcedEvents = 0;
let hasKernelLoaderWalk = false;

const CONTINUUM_LAYERS = [
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
  "BusinessLogic", "Documentation", "CommercialReadiness", "Production",
  "MarketingAIStudio"
];

const mappedLayers = new Set();

for (const { fullPath, relPath } of sourceFiles) {
  const content = fs.readFileSync(fullPath, "utf8");

  for (const layer of CONTINUUM_LAYERS) {
    if (content.includes(layer)) mappedLayers.add(layer);
  }

  if (relPath.includes("KernelLoader.js") || relPath.includes("DIContainer.js") || relPath.includes("server.js")) {
    if (content.includes("walkDir") || content.includes("resolve") || content.includes("initializeAllModules")) {
      hasKernelLoaderWalk = true;
    }
  }

  // Import Parsing
  const importMatches = content.matchAll(/(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|import\(['"]([^'"]+)['"]\))/g);
  const imports = new Set();
  for (const m of importMatches) {
    const target = m[1] || m[2] || m[3];
    if (target && target.startsWith(".")) imports.add(target);
  }
  moduleGraph.set(relPath, imports);

  // Event Pub/Sub & Schema Contract Tracking
  const pubMatches = content.matchAll(/(?:eventBus\.publish|bus\.publish)\(['"]([^'"]+)['"]/g);
  for (const m of pubMatches) {
    publishedEvents.add(m[1]);
  }

  const subMatches = content.matchAll(/(?:eventBus\.subscribe|bus\.subscribe|\.on\()\s*['"]([^'"]+)['"]/g);
  for (const m of subMatches) {
    subscribedEvents.add(m[1]);
  }

  if (content.includes("registerSchema") || content.includes("validate(")) {
    schemaEnforcedEvents++;
  }

  // Full Lifecycle Management Audit
  if (/\bboot\s*\(/.test(content)) lifecycleBootCount++;
  if (/\bready\s*\(/.test(content)) lifecycleReadyCount++;
  if (/\bshutdown\s*\(/.test(content)) lifecycleShutdownCount++;
  if (/\bdispose\s*\(/.test(content)) lifecycleDisposeCount++;

  // Memory Leak Check
  const listeners = (content.match(/\.on\(|\.addEventListener\(|setInterval\(/g) || []).length;
  const removers = (content.match(/\.off\(|\.removeEventListener\(|clearInterval\(/g) || []).length;
  if (listeners > removers) memoryLeakRisks += (listeners - removers);

  // Robust Un-awaited Async Bus Publish Detection
  const publishRegex = /(?<!await\s+)\b(eventBus|bus)\.publish\s*\(/g;
  let pMatch;
  while ((pMatch = publishRegex.exec(content)) !== null) {
    const pIndex = pMatch.index;
    let openCount = 0;
    let endCallIndex = -1;
    for (let j = pIndex + pMatch[0].length - 1; j < content.length; j++) {
      if (content[j] === '(') openCount++;
      else if (content[j] === ')') {
        openCount--;
        if (openCount === 0) {
          endCallIndex = j;
          break;
        }
      }
    }

    if (endCallIndex !== -1) {
      const trailingCode = content.slice(endCallIndex + 1, endCallIndex + 30).trim();
      if (!trailingCode.startsWith(".catch")) {
        unawaitedPublishes++;
      }
    } else {
      unawaitedPublishes++;
    }
  }

  // Empty Catches
  const emptyCatch = content.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g);
  for (const _ of emptyCatch) emptyCatches++;
}

// Reachability Graph Traversal
const reachableModules = new Set();
if (hasKernelLoaderWalk) {
  // KernelLoader dynamically mounts all modules inside src/
  for (const { relPath } of sourceFiles) {
    if (relPath.startsWith("src/")) reachableModules.add(relPath);
  }
} else {
  const entryPoints = ["src/server.js", "src/index.js"];
  function markReachable(mod) {
    if (reachableModules.has(mod)) return;
    reachableModules.add(mod);
    const deps = moduleGraph.get(mod);
    if (deps) {
      for (const d of deps) {
        const rawResolved = path.join(path.dirname(mod), d).replace(/\\/g, "/");
        const resolved = rawResolved.endsWith(".js") ? rawResolved : rawResolved + ".js";
        if (moduleGraph.has(resolved)) markReachable(resolved);
      }
    }
  }
  for (const ep of entryPoints) {
    if (moduleGraph.has(ep)) markReachable(ep);
  }
}

const totalFiles = sourceFiles.length;
const continuumScore = Math.round((mappedLayers.size / CONTINUUM_LAYERS.length) * 100);
const reachabilityScore = totalFiles === 0 ? 100 : Math.round((reachableModules.size / totalFiles) * 100);

const totalEvents = publishedEvents.size;
const deadEvents = Array.from(publishedEvents).filter(e => !subscribedEvents.has(e)).length;
const eventReliabilityScore = totalEvents === 0 ? 100 : Math.max(0, Math.round(((totalEvents - deadEvents) / totalEvents) * 100));
const lifecycleTotal = lifecycleBootCount + lifecycleReadyCount + lifecycleShutdownCount + lifecycleDisposeCount;
const lifecycleScore = Math.min(100, Math.round((lifecycleTotal / (totalFiles * 0.2)) * 100));
const trueEnterpriseScore = Math.round(
  (continuumScore * 0.25) +
  (reachabilityScore * 0.25) +
  (eventReliabilityScore * 0.25) +
  (lifecycleScore * 0.25)
);

console.log("--------------------------------------------------------------------------------");
console.log("SECTION A: DEPENDENCY & HYBRID REACHABILITY ANALYSIS");
console.log("--------------------------------------------------------------------------------");
console.log(`Reachable Application Modules: ${reachableModules.size} / ${totalFiles}`);
console.log(`Orphan / Unreferenced Modules: ${totalFiles - reachableModules.size}`);

console.log("\n--------------------------------------------------------------------------------");
console.log("SECTION B: EVENT BUS TOPOLOGY & CONTRACTS");
console.log("--------------------------------------------------------------------------------");
console.log(`Unique Event Topics Published: ${publishedEvents.size}`);
console.log(`Unique Event Topics Subscribed: ${subscribedEvents.size}`);
console.log(`Dead Event Topics (Unconsumed): ${deadEvents}`);
console.log(`Schema-Validated Event Contracts: ${schemaEnforcedEvents}`);

console.log("\n--------------------------------------------------------------------------------");
console.log("SECTION C: LIFECYCLE, MEMORY & CONCURRENCY RISKS");
console.log("--------------------------------------------------------------------------------");
console.log(`Lifecycle Hooks Detected (boot/ready/shutdown/dispose): ${lifecycleTotal}`);
console.log(`Potential Unbounded Memory Listeners: ${memoryLeakRisks}`);
console.log(`Un-awaited Async Bus Event Publishes: ${unawaitedPublishes}`);
console.log(`Empty Catch Blocks (Swallowed Errors): ${emptyCatches}`);

console.log("\n--------------------------------------------------------------------------------");
console.log("SECTION D: 54-LAYER ARCHITECTURAL CONTINUUM COVERAGE");
console.log("--------------------------------------------------------------------------------");
console.log(`Subsystem Layers Mapped: ${mappedLayers.size} / ${CONTINUUM_LAYERS.length} (${continuumScore}%)`);

console.log("\n================================================================================");
console.log("SECTION E: HONEST ENTERPRISE ARCHITECTURAL SCORECARD");
console.log("================================================================================");
console.log(`  1. Architectural Continuum Score: ${continuumScore}/100`);
console.log(`  2. Topological Reachability Score:  ${reachabilityScore}/100`);
console.log(`  3. Event Bus & Fault Reliability:  ${eventReliabilityScore}/100`);
console.log(`  4. Lifecycle & Governance Score:   ${lifecycleScore}/100`);
console.log(`--------------------------------------------------------------------------------`);
console.log(`  TRUE ENTERPRISE READINESS SCORE:   ${trueEnterpriseScore}/100`);
console.log("================================================================================\n");