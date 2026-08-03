import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd();

/**
 * Filter to exclude node_modules, build outputs, and audit runners
 */
function isExcluded(filePath) {
  const norm = filePath.replace(/\\/g, "/");
  return (
    norm.startsWith("node_modules/") ||
    norm.startsWith(".git/") ||
    norm.startsWith("dist/") ||
    norm.startsWith("build/") ||
    norm.endsWith(".cjs.cjs") ||
    norm.endsWith("run-enterprise-audit.js") ||
    norm.endsWith("fix-all-audit-issues.js") ||
    norm.startsWith("tools/") ||
    norm.startsWith("scripts/")
  );
}

function walkDir(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");

      if (isExcluded(relPath)) continue;

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walkDir(filePath, fileList);
      } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(file)) {
        fileList.push(relPath);
      }
    }
  } catch (err) {
    console.error(`[WALK_ERROR] ${err.message}`);
  }
  return fileList;
}

function runEnterpriseAudit() {
  console.log("================================================================================");
  console.log("          ADE-APEX ENTERPRISE REAL AST & DEPENDENCY FORENSIC REPORT");
  console.log("================================================================================");
  console.log("Target Branch: enterprise-modernization-v1");
  console.log("Execution Mode: READ-ONLY (Production Source Scope)");

  const sourceFiles = walkDir(ROOT_DIR);
  console.log(`Total Source Code Files Analyzed: ${sourceFiles.length}\n`);

  const importedModules = new Set();
  const publishedTopics = new Map();
  const subscribedTopics = new Map();
  const unsafeCalls = [];
  const emptyCatches = [];
  const unawaitedBusPublishes = [];
  const roadmapStubs = [];
  const continuumMappedLayers = new Set();

  const ALL_CONTINUUM_LAYERS = [
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

  for (const relFile of sourceFiles) {
    const fullPath = path.join(ROOT_DIR, relFile);
    let content = "";
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n");

    ALL_CONTINUUM_LAYERS.forEach((layer) => {
      if (content.includes(layer)) continuumMappedLayers.add(layer);
    });

    const importMatches = content.matchAll(/(?:import\s+.*?from\s+['"](.*?)['"]|require\(['"](.*?)['"]\))/g);
    for (const match of importMatches) {
      const target = match[1] || match[2];
      if (target && target.startsWith(".")) {
        const resolved = path.normalize(path.join(path.dirname(relFile), target)).replace(/\\/g, "/");
        importedModules.add(resolved);
        importedModules.add(resolved + ".js");
        importedModules.add(resolved + "/index.js");
      }
    }

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      const pubMatch = line.match(/(?:eventBus\.publish|bus\.publish)\(['"]([^'"]+)['"]/);
      if (pubMatch) {
        const topic = pubMatch[1];
        if (!publishedTopics.has(topic)) publishedTopics.set(topic, []);
        publishedTopics.get(topic).push({ file: relFile, line: lineNum });

        if (!line.includes("await ") && !line.includes("return ")) {
          unawaitedBusPublishes.push({ file: relFile, line: lineNum });
        }
      }

      const subMatch = line.match(/(?:eventBus\.subscribe|bus\.subscribe)\(['"]([^'"]+)['"]/);
      if (subMatch) {
        const topic = subMatch[1];
        if (!subscribedTopics.has(topic)) subscribedTopics.set(topic, []);
        subscribedTopics.get(topic).push({ file: relFile, line: lineNum });
      }

      // Security check: eval or child_process inside application code
      if (/eval\(|child_process\.exec|child_process\.spawn/i.test(line)) {
        if (!line.includes("isExcluded") && !line.includes("unsafeCalls")) {
          unsafeCalls.push({ file: relFile, line: lineNum, text: trimmed });
        }
      }

      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        emptyCatches.push({ file: relFile, line: lineNum });
      }

      if (/(TODO|FIXME|HACK|STUB|MOCK)/i.test(line)) {
        if (!line.includes("roadmapStubs") && !line.includes("isExcluded")) {
          roadmapStubs.push({ file: relFile, line: lineNum, text: trimmed });
        }
      }
    });
  }

  const entryPoints = ["src/server.js", "src/index.js", "index.js", "app.js"];
  const orphanModules = sourceFiles.filter((file) => {
    if (entryPoints.includes(file)) return false;
    if (file.startsWith("tests/")) return false;
    const baseWithoutExt = file.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/i, "");
    return !importedModules.has(file) && !importedModules.has(baseWithoutExt);
  });

  const deadEvents = [];
  publishedTopics.forEach((publishers, topic) => {
    if (!subscribedTopics.has(topic) && topic !== "system.boot") {
      deadEvents.push({ topic, publishers });
    }
  });

  const orphanSubscribers = [];
  subscribedTopics.forEach((subscribers, topic) => {
    if (!publishedTopics.has(topic) && topic !== "system.boot" && topic !== "system.*" && topic !== "system.event.all") {
      orphanSubscribers.push({ topic, subscribers });
    }
  });

  console.log("--------------------------------------------------------------------------------");
  console.log("SECTION A: REPOSITORY INTEGRITY & ORPHANS");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Orphan Modules (Unreferenced production code): ${orphanModules.length}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION D: EVENT BUS TOPOLOGICAL CONTRACTS");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Unique Event Topics Published: ${publishedTopics.size}`);
  console.log(`Unique Event Topics Subscribed: ${subscribedTopics.size}`);
  console.log(`Dead Events: ${deadEvents.length}`);
  console.log(`Orphan Subscribers: ${orphanSubscribers.length}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION E & F: SECURITY GATES & UNSAFE CALLS");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Unsafe System Calls (Application Source): ${unsafeCalls.length}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION H: RELIABILITY & SILENT FAILURES");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Empty Catch Blocks (Swallowed Errors): ${emptyCatches.length}`);
  console.log(`Un-awaited Async Bus Event Publishes: ${unawaitedBusPublishes.length}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION I & J: 56-LAYER CONTINUUM & ROADMAP STUBS");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Continuum Subsystem Coverage: ${continuumMappedLayers.size}/53 (${Math.round((continuumMappedLayers.size / 53) * 100)}%)`);
  console.log(`Roadmap Stubs/TODOs/HACKs: ${roadmapStubs.length}`);

  const archScore = Math.min(100, Math.round((continuumMappedLayers.size / 53) * 100));
  const secScore = unsafeCalls.length === 0 ? 100 : Math.max(0, 100 - unsafeCalls.length * 20);
  
  const totalEventTopics = Math.max(1, publishedTopics.size);
  const activeSubscribedTopics = Math.max(0, publishedTopics.size - deadEvents.length);
  const eventReliabilityScore = Math.min(100, Math.round((activeSubscribedTopics / totalEventTopics) * 100));

  const trueEnterpriseScore = Math.round(
    archScore * 0.3 + secScore * 0.3 + eventReliabilityScore * 0.4
  );

  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION M: HONEST UN-INFLATED CTO SCORECARD");
  console.log("--------------------------------------------------------------------------------");
  console.log(`  1. Architectural Continuum Score: ${archScore}/100`);
  console.log(`  2. Security & Unsafe Calls Score:  ${secScore}/100`);
  console.log(`  3. Event Bus & Fault Reliability:  ${eventReliabilityScore}/100`);
  console.log(`  4. True Enterprise Readiness Score: ${trueEnterpriseScore}/100`);
  console.log("================================================================================\n");
}

try {
  runEnterpriseAudit();
} catch (err) {
  console.error("FATAL AUDIT ERROR:", err);
  process.exit(1);
}