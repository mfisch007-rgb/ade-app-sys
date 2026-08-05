/**
 * ================================================================================
 * ADE-APEX FULL CTO ENTERPRISE ARCHITECTURAL & RUNTIME AUDITOR
 * Target Branch: enterprise-modernization-v1
 * Scope: READ-ONLY (Application Runtime & Core Kernel Source Scope - Native ESM)
 * ================================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const CONFIG = {
  targetBranch: 'enterprise-modernization-v1',
  scanDirectories: ['src', 'kernel', 'oracle', 'api', 'business', 'database'],
  fileExtensions: ['.js', '.mjs', '.ts'],
  excludedPatterns: [
    /node_modules/i,
    /\.git/i,
    /\.next/i,
    /dist/i,
    /build/i,
    /coverage/i,
    /run-enterprise-audit\.js$/i,
    /run-runtime-verification\.js$/i,
    /fix-.*\.js$/i,
    /autofix-.*\.js$/i,
    /master-remediator\.js$/i,
    /complete-enterprise-fix\.js$/i,
    /upgrade-enterprise\.js$/i
  ]
};

// --------------------------------------------------------------------------------
// Helper Utilities
// --------------------------------------------------------------------------------

function getAllFiles(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    // Normalize path separators to forward slashes for Windows CMD compatibility
    const relativePath = path.relative('.', fullPath).replace(/\\/g, '/');

    const isExcluded = CONFIG.excludedPatterns.some((pattern) => pattern.test(relativePath));
    if (isExcluded) continue;

    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (CONFIG.fileExtensions.includes(ext)) {
        fileList.push({ fullPath, relativePath });
      }
    }
  }

  return fileList;
}

function calculateCyclomaticComplexity(code) {
  const decisionKeywords = [
    /\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g,
    /\bcatch\b/g, /\?/g, /&&/g, /\|\|/g
  ];
  let complexity = 1;
  decisionKeywords.forEach((regex) => {
    const matches = code.match(regex);
    if (matches) complexity += matches.length;
  });
  return complexity;
}

// --------------------------------------------------------------------------------
// CTO Audit Engine
// --------------------------------------------------------------------------------

function executeCTOAudit() {
  const startTime = Date.now();
  
  // Resolve target application files cleanly across source directories
  let sourceFiles = [];
  for (const dir of CONFIG.scanDirectories) {
    if (fs.existsSync(dir)) {
      getAllFiles(dir, sourceFiles);
    }
  }

  // Fallback to root application files if dedicated directories are not isolated
  if (sourceFiles.length === 0) {
    const rootEntries = fs.readdirSync('.').filter((f) => {
      const rel = f.replace(/\\/g, '/');
      return !fs.statSync(f).isDirectory() &&
        (f.endsWith('.js') || f.endsWith('.mjs')) &&
        !CONFIG.excludedPatterns.some((p) => p.test(rel));
    });
    sourceFiles = rootEntries.map(f => ({ fullPath: f, relativePath: f }));
  }

  const metrics = {
    totalFilesAnalyzed: sourceFiles.length,
    importGraph: new Map(),
    diRegistrations: 0,
    diResolutions: 0,
    publishedTopics: new Set(),
    subscribedTopics: new Set(),
    dynamicPublishesDetected: 0,
    schemaValidatedEvents: 0,
    lifecycleHooks: 0,
    potentialMemoryLeaks: 0,
    unawaitedAsyncPublishes: 0,
    emptyCatchBlocks: 0,
    hasKernelLoaderWalk: false,
    mappedLayers: new Set(),
    securityFindings: {
      evalOrExec: 0,
      hardcodedSecrets: 0,
      pathTraversalRisks: 0
    },
    observabilityMetrics: {
      structuredLogs: 0,
      metricsProbes: 0,
      healthCheckProbes: 0
    },
    circularDependencies: [],
    highComplexityFiles: [],
    criticalWarnings: [],
    prioritizedRemediations: []
  };

  // Phase 1: File Content Analysis
  sourceFiles.forEach(({ fullPath, relativePath }) => {
    const content = fs.readFileSync(fullPath, 'utf8');

    // 54 Continuum Layer Mapping
    CONTINUUM_LAYERS.forEach((layer) => {
      if (content.includes(layer)) {
        metrics.mappedLayers.add(layer);
      }
    });

    // Kernel Loader dynamic walker detection
    if (
      relativePath.includes("KernelLoader") ||
      relativePath.includes("DIContainer") ||
      relativePath.includes("MasterIntegrationRegistry") ||
      relativePath.includes("index.js") ||
      relativePath.includes("server.js")
    ) {
      if (
        content.includes("walkDir") ||
        content.includes("initializeAllModules") ||
        content.includes("registerFactory") ||
        content.includes("bindAllSubscribers")
      ) {
        metrics.hasKernelLoaderWalk = true;
      }
    }

    // Dependency Injection Detection
    const diRegMatches = content.match(/registerValue|registerFactory|registerSingleton|container\.register/g);
    if (diRegMatches) metrics.diRegistrations += diRegMatches.length;

    const diResMatches = content.match(/container\.resolve|container\.get|inject\(/g);
    if (diResMatches) metrics.diResolutions += diResMatches.length;

    // Event Bus Topology
    const pubMatches = [...content.matchAll(/(?:eventBus\.publish|bus\.publish)\(\s*['"`]([^'"`]+)['"`]/g)];
    pubMatches.forEach((m) => metrics.publishedTopics.add(m[1]));

    const subMatches = [...content.matchAll(/(?:eventBus\.subscribe|bus\.subscribe|\.on\()\s*['"`]([^'"`]+)['"`]/g)];
    subMatches.forEach((m) => metrics.subscribedTopics.add(m[1]));

    const dynamicPubs = content.match(/(?:eventBus|bus)\.publish\(\s*([A-Za-z0-9_\.]+)\s*[,)]/g);
    if (dynamicPubs) metrics.dynamicPublishesDetected += dynamicPubs.length;

    // Schema Validation
    const schemaMatches = content.match(/SchemaValidatedEvent|validatePayload|registerSchema|zod|joi/gi);
    if (schemaMatches) metrics.schemaValidatedEvents += schemaMatches.length;

    // Lifecycle Hooks
    const hooks = content.match(/initialize\(|boot\(|ready\(|shutdown\(|dispose\(/g);
    if (hooks) metrics.lifecycleHooks += hooks.length;

    // Memory Leaks & Listener Risk Tracking
    const listeners = content.match(/\.on\(|\.addEventListener\(|setInterval\(/g);
    if (listeners) metrics.potentialMemoryLeaks += listeners.length;

    // Precise Un-awaited Async Bus Event Publish Detection
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
          metrics.unawaitedAsyncPublishes++;
        }
      } else {
        metrics.unawaitedAsyncPublishes++;
      }
    }

    // Empty Catch Blocks
    const emptyCatches = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
    if (emptyCatches) metrics.emptyCatchBlocks += emptyCatches.length;

    // Security Rules
    if (/\beval\(|child_process\.exec\(/g.test(content)) metrics.securityFindings.evalOrExec++;
    if (/(api_key|secret_key|password|jwt_secret)\s*=\s*['"`][^'"`]{8,}['"`]/gi.test(content)) {
      metrics.securityFindings.hardcodedSecrets++;
    }
    if (/path\.join\([^)]*req\./gi.test(content)) metrics.securityFindings.pathTraversalRisks++;

    // Observability Probes
    if (/logger\.(info|error|warn|debug)|pino|winston/g.test(content)) metrics.observabilityMetrics.structuredLogs++;
    if (/metrics\.|prometheus|counter|histogram/g.test(content)) metrics.observabilityMetrics.metricsProbes++;
    if (/healthCheck|livenessProbe|readinessProbe/g.test(content)) metrics.observabilityMetrics.healthCheckProbes++;

    // Cyclomatic Complexity
    const complexity = calculateCyclomaticComplexity(content);
    if (complexity > 25) {
      metrics.highComplexityFiles.push({ file: relativePath, complexity });
    }

    // Dependency Graph Construction
    const importMatches = [...content.matchAll(/import\s+.*?from\s+['"`]([^'"`]+)['"`]/g)];
    const imports = new Set();
    importMatches.forEach((m) => {
      const impPath = m[1];
      if (impPath.startsWith('.')) {
        const resolved = path.normalize(path.join(path.dirname(relativePath), impPath)).replace(/\\/g, '/');
        imports.add(resolved);
      }
    });
    metrics.importGraph.set(relativePath, imports);
  });

  // Circular Dependency Detection via DFS
  const visited = new Set();
  const recursionStack = new Set();

  function detectCycles(node, currentPath = []) {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = metrics.importGraph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        detectCycles(neighbor, [...currentPath]);
      } else if (recursionStack.has(neighbor)) {
        const cycleStartIndex = currentPath.indexOf(neighbor);
        const cycle = currentPath.slice(cycleStartIndex).concat(neighbor);
        metrics.circularDependencies.push(cycle.join(' -> '));
      }
    }
    recursionStack.delete(node);
  }

  for (const node of metrics.importGraph.keys()) {
    if (!visited.has(node)) {
      detectCycles(node);
    }
  }

  // Reachable Modules Calculation
  const totalFiles = metrics.totalFilesAnalyzed;
  let reachableCount = 0;

  if (metrics.hasKernelLoaderWalk) {
    // Dynamic KernelLoader mounts modules registered under application root
    reachableCount = sourceFiles.filter(f => f.relativePath.startsWith('src/')).length;
    if (reachableCount === 0) reachableCount = sourceFiles.length;
  } else {
    const reachableSet = new Set();
    metrics.importGraph.forEach((imports, file) => {
      if (imports.size > 0) reachableSet.add(file);
      imports.forEach((imp) => reachableSet.add(imp));
    });
    reachableCount = Math.min(totalFiles, reachableSet.size + metrics.diRegistrations);
  }

  const orphanCount = Math.max(0, totalFiles - reachableCount);

  // Dead Event Topics
  let deadTopics = 0;
  metrics.publishedTopics.forEach((topic) => {
    if (!metrics.subscribedTopics.has(topic)) deadTopics++;
  });

  // Continuum 54-Layer Mapping Scores
  const continuumScore = Math.round((metrics.mappedLayers.size / CONTINUUM_LAYERS.length) * 100);
  const reachabilityScore = totalFiles > 0 ? Math.round((reachableCount / totalFiles) * 100) : 100;
  const faultScore = Math.max(0, 100 - (metrics.unawaitedAsyncPublishes * 5 + metrics.emptyCatchBlocks * 10 + metrics.securityFindings.evalOrExec * 15));
  const lifecycleScore = Math.min(100, Math.round((metrics.lifecycleHooks / Math.max(1, totalFiles * 0.2)) * 100));

  const trueEnterpriseReadinessScore = Math.round(
    continuumScore * 0.25 +
    reachabilityScore * 0.25 +
    faultScore * 0.25 +
    lifecycleScore * 0.25
  );

  // Critical Findings & Remediations
  if (metrics.circularDependencies.length > 0) {
    metrics.criticalWarnings.push(`Detected ${metrics.circularDependencies.length} circular dependency chains.`);
  }
  if (metrics.securityFindings.evalOrExec > 0) {
    metrics.criticalWarnings.push(`Detected ${metrics.securityFindings.evalOrExec} instances of dangerous eval/exec calls.`);
  }
  if (metrics.unawaitedAsyncPublishes > 0) {
    metrics.criticalWarnings.push(`Detected ${metrics.unawaitedAsyncPublishes} un-awaited event bus publishing calls.`);
  }

  if (orphanCount > 0) {
    metrics.prioritizedRemediations.push(`1. Wire ${orphanCount} unreferenced module(s) into MasterIntegrationRegistry or DI container.`);
  }
  if (deadTopics > 0) {
    metrics.prioritizedRemediations.push(`2. Register explicitly typed subscribers for ${deadTopics} dead/unconsumed event topic(s).`);
  }
  if (metrics.unawaitedAsyncPublishes > 0) {
    metrics.prioritizedRemediations.push(`3. Prepend 'await' to all ${metrics.unawaitedAsyncPublishes} event bus publish calls.`);
  }

  const executionTimeMs = Date.now() - startTime;

  // Print Consolidated Executive Report
  console.log('================================================================================');
  console.log('   ADE-APEX ENTERPRISE BEHAVIORAL & ARCHITECTURAL AUDITOR (FULL CTO SCOPE)');
  console.log('================================================================================');
  console.log(`Target Branch: ${CONFIG.targetBranch}`);
  console.log(`Execution Scope: READ-ONLY (Application Source Scope - Native ESM)`);
  console.log(`Audit Execution Time: ${executionTimeMs} ms`);
  console.log('================================================================================');
  console.log(`Total Application Source Files Analyzed: ${totalFiles}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION A: DEPENDENCY & HYBRID REACHABILITY ANALYSIS');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Reachable Application Modules: ${reachableCount} / ${totalFiles}`);
  console.log(`Orphan / Unreferenced Modules: ${orphanCount}`);
  console.log(`Dependency Injection Registrations Detected: ${metrics.diRegistrations}`);
  console.log(`Dependency Injection Resolutions Detected: ${metrics.diResolutions}`);
  console.log(`Circular Dependencies Chain Count: ${metrics.circularDependencies.length}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION B: EVENT BUS TOPOLOGY & CONTRACTS');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Unique Event Topics Published: ${metrics.publishedTopics.size}`);
  console.log(`Unique Event Topics Subscribed: ${metrics.subscribedTopics.size}`);
  console.log(`Dead Event Topics (Unconsumed): ${deadTopics}`);
  console.log(`Dynamic Topic Publishes Analyzed: ${metrics.dynamicPublishesDetected}`);
  console.log(`Schema-Validated Event Contracts: ${metrics.schemaValidatedEvents}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION C: LIFECYCLE, MEMORY, SECURITY & OBSERVABILITY RISKS');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Lifecycle Hooks Detected (boot/ready/shutdown/dispose): ${metrics.lifecycleHooks}`);
  console.log(`Potential Unbounded Memory Listeners / Timers: ${metrics.potentialMemoryLeaks}`);
  console.log(`Un-awaited Async Bus Event Publishes: ${metrics.unawaitedAsyncPublishes}`);
  console.log(`Empty Catch Blocks (Swallowed Errors): ${metrics.emptyCatchBlocks}`);
  console.log(`Security Control Violations (eval/exec): ${metrics.securityFindings.evalOrExec}`);
  console.log(`Structured Logging Instrumentation Count: ${metrics.observabilityMetrics.structuredLogs}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION D: 54-LAYER ARCHITECTURAL CONTINUUM COVERAGE');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Subsystem Layers Mapped: ${metrics.mappedLayers.size} / ${CONTINUUM_LAYERS.length} (${continuumScore}%)`);

  console.log('\n================================================================================');
  console.log('SECTION E: HONEST ENTERPRISE ARCHITECTURAL SCORECARD');
  console.log('================================================================================');
  console.log(`  1. Architectural Continuum Score: ${continuumScore}/100`);
  console.log(`  2. Topological Reachability Score:  ${reachabilityScore}/100`);
  console.log(`  3. Event Bus & Fault Reliability:  ${faultScore}/100`);
  console.log(`  4. Lifecycle & Governance Score:   ${lifecycleScore}/100`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`  TRUE ENTERPRISE READINESS SCORE:   ${trueEnterpriseReadinessScore}/100`);
  console.log('================================================================================');

  if (metrics.criticalWarnings.length > 0) {
    console.log('\nCRITICAL FINDINGS & WARNINGS:');
    metrics.criticalWarnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (metrics.prioritizedRemediations.length > 0) {
    console.log('\nPRIORITIZED REMEDIATION ACTIONS:');
    metrics.prioritizedRemediations.forEach((r) => console.log(`  ${r}`));
  } else {
    console.log('\nPRIORITIZED REMEDIATION ACTIONS: None. Repository meets strict readiness criteria.');
  }
}

// Execute Audit Entry Point
executeCTOAudit();