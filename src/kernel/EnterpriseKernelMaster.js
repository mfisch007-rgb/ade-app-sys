/**
 * ADE-APEX CANONICAL ENTERPRISE KERNEL
 *
 * src/kernel/EnterpriseKernelMaster.js is the single authoritative runtime
 * kernel. src/core/EnterpriseKernelMaster.js is a compatibility facade only.
 */
import TelemetryEventHub from "../telemetry/TelemetryEventHub.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";
import UniversalAIGateway from "../ai/UniversalAIGateway.js";
import EnterpriseEventBus from "./EnterpriseEventBus.js";
import {
  StructuredJSONLogger,
  ContextMemoryEngine,
  KnowledgeEngine,
  DecisionEngine,
  OracleIntelligenceEngine,
  GuardianSecurityEngine,
  NotificationEngine,
  NexusLedgerEngine,
  WorkflowEngine
} from "./SupportingEngines.js";
import { CapabilityRegistry } from "../core/CapabilityRegistry.js";
import { runtimeState, updateRuntimeState, recordRuntimeFailure } from "../core/runtimeState.js";

export class EnterpriseKernelMaster {
  constructor(options = {}) {
    this.status = "STOPPED";
    this.isBooted = false;
    this.logger = options.logger || new StructuredJSONLogger();
    this.hub = options.telemetry || TelemetryEventHub.getInstance();
    this.eventBus = options.eventBus || EnterpriseEventBus.getInstance();
    this.guard = options.guard || CommunityEditionGuard.getInstance();
    this.capabilityRegistry =
      options.capabilityRegistry || CapabilityRegistry.getInstance();

    this.activeAssets = new Set();
    this.container = new Map();
    this.subsystems = new Map();
    this.subsystemRegistry = this.subsystems;
    this.engines = this.subsystems;
    this.modules = this.subsystems;

    this.metrics = {
      bootTimeMs: null,
      boot_time_ms: null,
      shutdownTimeMs: null,
      bootCount: 0,
      restartCount: 0,
      activeSubsystems: 0,
      intentsDispatched: 0,
      intentsSucceeded: 0,
      intentsFailed: 0,
      eventsPublished: 0,
      eventsDelivered: 0,
      eventsFailed: 0,
      decisionsEvaluated: 0,
      memoryOperations: 0,
      knowledgeOperations: 0,
      workflowStarted: 0,
      workflowCompleted: 0,
      workflowFailed: 0,
      workflowExecutions: 0,
      errors: 0,
      lastBootAt: null,
      lastShutdownAt: null,
      startedAt: null
    };

    this.systemState = {
      status: "STOPPED",
      bootTime: null,
      activeConnections: 0,
      telemetryChannels: new Set([
        "SYS_HEALTH",
        "AUDIT_LOGS",
        "AI_GATEWAY",
        "KERNEL_EVENTS",
        "SUBSYSTEM_EVENTS"
      ])
    };

    this.aiGateway = null;
    this._initializeAIGateway();
    this._registerCoreSubsystems();
    this._bindCoreCapabilityHandlers();
    this._wireEventBusMetrics();
  }

  static getInstance() {
    if (!globalThis.__ADE_CANONICAL_ENTERPRISE_KERNEL__) {
      globalThis.__ADE_CANONICAL_ENTERPRISE_KERNEL__ =
        new EnterpriseKernelMaster();
    }
    return globalThis.__ADE_CANONICAL_ENTERPRISE_KERNEL__;
  }

  _initializeAIGateway() {
    try {
      this.aiGateway =
        typeof UniversalAIGateway.getInstance === "function"
          ? UniversalAIGateway.getInstance()
          : new UniversalAIGateway();
    } catch (error) {
      this.metrics.errors++;
      this.aiGateway = {
        complete: async () => ({
          provider: "kernel-offline-fallback",
          mode: "OFFLINE_FALLBACK"
        }),
        getMetrics: () => ({
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          cacheHits: 0,
          cacheMisses: 0
        })
      };
    }
    this.container.set("aiGateway", this.aiGateway);
  }

  _bindCoreCapabilityHandlers() {
    const bind = (intent, handler) => {
      const capability = this.capabilityRegistry.getCapability(intent);
      if (!capability) return;
      this.capabilityRegistry.registerCapability({ ...capability, handler }, { persist: true });
    };
    bind("PING", () => ({ pong: true, timestamp: new Date().toISOString() }));
    bind("PUBLIC_INFO", () => ({ platform: "ADE-APEX", execution: "LIVE", runtime: "canonical-kernel" }));
    bind("WATCH_ASSET", (payload = {}) => {
      const symbol = String(payload.symbol || payload.asset || "").trim();
      if (!symbol) throw new Error("Asset symbol is required.");
      this.activeAssets.add(symbol);
      return { subscribed: symbol, activeAssets: this.activeAssets.size };
    });
    bind("TELEMETRY_SSE", (payload = {}) => ({ channel: payload.channel || "KERNEL", endpoint: "/api/v1/events/stream" }));
    bind("UNIVERSAL_AI_GATEWAY", async (payload = {}) => {
      const prompt = String(payload.prompt || "").trim();
      if (!prompt) throw new Error("AI prompt is required.");
      return this.aiGateway.dispatchPrompt(prompt, payload.options || {});
    });
    bind("MULTI_STREAM", (payload = {}) => ({ streams: Math.max(0, Math.min(100, Number(payload.count || 0))) }));
    bind("SYSTEM_HEALTH", () => this.getHealth());
    bind("SYSTEM_SHUTDOWN", async () => this.shutdown());
  }

  _wireEventBusMetrics() {
    this.container.set("eventBus", this.eventBus);
    this.eventBus.registerModule?.("canonical-kernel", { version: "1.0.0" });
  }

  _registerCoreSubsystems() {
    const memory = new ContextMemoryEngine({ kernel: this });
    const knowledge = new KnowledgeEngine({ kernel: this, memory });
    const decision = new DecisionEngine({
      kernel: this,
      memory,
      knowledge,
      policy: {
        approveThreshold: 0.8,
        holdThreshold: 0.5
      }
    });
    const oracle = new OracleIntelligenceEngine({
      kernel: this, knowledge, decision
    });
    const guardian = new GuardianSecurityEngine({
      kernel: this, guard: this.guard
    });
    const notification = new NotificationEngine({ kernel: this });
    const ledger = new NexusLedgerEngine({ kernel: this });
    const workflow = new WorkflowEngine({ kernel: this });

    this._registerSubsystem("memory", memory);
    this._registerSubsystem("knowledge", knowledge);
    this._registerSubsystem("decision", decision);
    this._registerSubsystem("oracle", oracle);
    this._registerSubsystem("guardian", guardian);
    this._registerSubsystem("notification", notification);
    this._registerSubsystem("ledger", ledger);
    this._registerSubsystem("workflowEngine", workflow);

    this.container.set("memoryEngine", memory);
    this.container.set("contextMemory", memory);
    this.container.set("knowledgeEngine", knowledge);
    this.container.set("decisionEngine", decision);
    this.container.set("oracleIntelligence", oracle);
    this.container.set("guardianSecurity", guardian);
    this.container.set("workflow", workflow);
    this.container.set("ledger", ledger);
    this.container.set("kernel", this);
  }

  _registerSubsystem(name, instance) {
    if (!name || !instance) {
      throw new Error("[EnterpriseKernelMaster] Invalid subsystem registration.");
    }
    this.subsystems.set(name, instance);
    this.container.set(name, instance);
    this.metrics.activeSubsystems = this.subsystems.size;
  }

  resolve(name) {
    if (!name) throw new Error("[EnterpriseKernelMaster] Dependency name is required.");
    if (this.container.has(name)) return this.container.get(name);

    const aliases = {
      context: "memory",
      contextMemoryEngine: "memory",
      memoryEngine: "memory",
      knowledgeEngine: "knowledge",
      decisionEngine: "decision",
      decision_engine: "decision",
      oracleEngine: "oracle",
      guardianEngine: "guardian",
      workflow: "workflowEngine",
      event: "eventBus"
    };
    const normalized = aliases[name];
    if (normalized && this.container.has(normalized)) {
      return this.container.get(normalized);
    }
    throw new Error(`[EnterpriseKernelMaster] Unregistered dependency: '${name}'`);
  }

  has(name) {
    try { return this.container.has(name); } catch { return false; }
  }

  registerSubsystemToKernel(moduleName, instance) {
    if (!moduleName || !instance) {
      throw new Error("[EnterpriseKernelMaster] moduleName and instance are required.");
    }
    if (this.subsystems.has(moduleName)) {
      throw new Error(`[EnterpriseKernelMaster] Subsystem '${moduleName}' is already registered.`);
    }
    this._registerSubsystem(moduleName, instance);
    this._publish("KERNEL_SUBSYSTEM_ATTACHED", {
      moduleName,
      activeSubsystemsCount: this.subsystems.size
    });
    return {
      success: true,
      moduleName,
      activeSubsystemsCount: this.subsystems.size
    };
  }

  registerSubsystem(moduleName, instance) {
    return this.registerSubsystemToKernel(moduleName, instance);
  }

  async boot() {
    if (this.isBooted) {
      return { status: "ALREADY_RUNNING", ...this.getSystemState() };
    }

    const start = Date.now();
    this.status = "BOOTING";
    this.systemState.status = "BOOTING";
    this._publish("KERNEL_STATUS", { status: "BOOTING" });

    try {
      const order = Array.from(this.subsystems.entries());
      for (const [name, subsystem] of order) {
        try {
          if (typeof subsystem.initialize === "function") {
            await subsystem.initialize(this);
          } else if (typeof subsystem.boot === "function") {
            await subsystem.boot(this);
          } else {
            throw new Error(`Subsystem '${name}' has no lifecycle initializer.`);
          }
          this.logger.info("Subsystem initialized", { subsystem: name });
        } catch (error) {
          this.metrics.errors++;
          recordRuntimeFailure(error, { phase: "boot", subsystem: name });
          throw new Error(`[Kernel Boot] Subsystem '${name}' failed: ${error?.message || error}`);
        }
      }

      this.isBooted = true;
      this.status = "ONLINE";
      this.systemState.status = "ONLINE";

      const elapsed = Date.now() - start;
      this.metrics.bootTimeMs = elapsed;
      this.metrics.boot_time_ms = elapsed;
      this.metrics.bootCount++;
      if (this.metrics.bootCount > 1) this.metrics.restartCount++;
      this.metrics.activeSubsystems = this.subsystems.size;
      this.metrics.lastBootAt = new Date().toISOString();
      this.metrics.startedAt = this.metrics.lastBootAt;
      this.systemState.bootTime = this.metrics.lastBootAt;

      updateRuntimeState({
        status: "ONLINE",
        services: {
          memory: true,
          knowledge: true,
          decision: true,
          workflow: true,
          telemetry: true,
          aiGateway: Boolean(this.aiGateway)
        },
        metrics: {
          ...this.metrics
        },
        health: { status: "HEALTHY", lastCheckAt: this.metrics.lastBootAt }
      });

      this._publish("KERNEL_BOOT_COMPLETE", {
        status: "ONLINE",
        bootTimeMs: elapsed,
        subsystemsLoaded: Array.from(this.subsystems.keys()),
        subsystemCount: this.subsystems.size,
        timestamp: this.metrics.lastBootAt
      });

      return {
        status: "ONLINE",
        bootTimeMs: elapsed,
        subsystemsLoaded: Array.from(this.subsystems.keys())
      };
    } catch (error) {
      this.status = "FAILED";
      this.systemState.status = "FAILED";
      this.metrics.errors++;
      updateRuntimeState({ status: "FAILED", metrics: { ...this.metrics } });
      this._publish("KERNEL_BOOT_FAILED", {
        status: "FAILED",
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  async dispatchIntent(intentName, payload = {}, userLevel = 1) {
    try {
      if (!intentName) throw new Error("Intent name is required.");
      const capability = this.capabilityRegistry.getCapability(intentName);
      if (!capability) throw new Error(`Capability '${intentName}' is not registered or has been revoked.`);
      if (Number(userLevel) < Number(capability.rbacLevel || 0)) {
        throw new Error(`Capability '${intentName}' requires RBAC level ${capability.rbacLevel}.`);
      }
      this.guard?.assertCapabilityAllowed?.(intentName, Number(userLevel));

      if (payload?.symbol && intentName === "WATCH_ASSET") {
        this.activeAssets.add(payload.symbol);
        this.guard?.validateAssetLimit?.(this.activeAssets.size, userLevel);
      }

      this.metrics.intentsDispatched++;
      let executionResult;
      if (typeof capability.handler !== "function") {
        throw new Error(`Capability '${intentName}' is registered but has no runtime handler bound.`);
      }
      executionResult = await capability.handler(payload, { userLevel, kernel: this });

      const result = await this.eventBus.publish(
        "KERNEL_INTENT",
        { intent: intentName, payload, userLevel, result: executionResult }
      );

      this.metrics.eventsDelivered += result.deliveredCount;
      this.metrics.eventsFailed += result.failedCount;
      if (result.failedCount > 0) throw new Error(`Intent event delivery failed for '${intentName}'.`);

      this.metrics.intentsSucceeded++;
      return { success: true, intent: intentName, status: "EXECUTED", result: executionResult };
    } catch (error) {
      if (payload?.symbol && intentName === "WATCH_ASSET") this.activeAssets.delete(payload.symbol);
      this.metrics.intentsFailed++;
      this.metrics.errors++;
      recordRuntimeFailure(error, { phase: "intent", intentName });
      return { success: false, intent: intentName, reason: error?.message || String(error) };
    }
  }

  _publish(event, payload = {}) {
    this.metrics.eventsPublished++;
    this.hub?.broadcast?.(event, payload);
    this.eventBus.publish(event, payload).then(result => {
      this.metrics.eventsDelivered += result.deliveredCount;
      this.metrics.eventsFailed += result.failedCount;
    }).catch(error => {
      this.metrics.eventsFailed++;
      this.metrics.errors++;
      recordRuntimeFailure(error, { phase: "event", event });
    });
  }

  getSystemState() {
    return {
      isBooted: this.isBooted,
      status: this.status,
      bootTime: this.systemState.bootTime,
      activeSubsystems: Array.from(this.subsystems.keys()),
      activeSubsystemCount: this.subsystems.size,
      registeredDependencies: this.container.size,
      activeAssets: this.activeAssets.size,
      metrics: { ...this.metrics }
    };
  }

  getHealth() {
    return {
      status: this.isBooted ? "HEALTHY" : this.status,
      kernel: { booted: this.isBooted, status: this.status },
      subsystems: {
        total: this.subsystems.size,
        active: Array.from(this.subsystems.keys())
      },
      metrics: { ...this.metrics },
      eventBus: this.eventBus.getHealth?.()
    };
  }

  async shutdown() {
    if (!this.isBooted) return { status: "ALREADY_OFFLINE" };

    const start = Date.now();
    for (const [name, subsystem] of Array.from(this.subsystems.entries()).reverse()) {
      try {
        if (typeof subsystem.dispose === "function") await subsystem.dispose();
        else if (typeof subsystem.shutdown === "function") await subsystem.shutdown();
      } catch (error) {
        this.metrics.errors++;
        recordRuntimeFailure(error, { phase: "shutdown", subsystem: name });
        this.logger.error("Subsystem shutdown failure", {
          subsystem: name,
          error: error?.message || String(error)
        });
      }
    }

    this.isBooted = false;
    this.status = "OFFLINE";
    this.systemState.status = "OFFLINE";
    const elapsed = Date.now() - start;
    this.metrics.shutdownTimeMs = elapsed;
    this.metrics.lastShutdownAt = new Date().toISOString();

    updateRuntimeState({
      status: "OFFLINE",
      services: {
        memory: false, knowledge: false, decision: false, workflow: false
      },
      metrics: { ...this.metrics },
      health: { status: "OFFLINE", lastCheckAt: this.metrics.lastShutdownAt }
    });

    this._publish("KERNEL_SHUTDOWN_COMPLETE", {
      status: "OFFLINE",
      shutdownTimeMs: elapsed,
      timestamp: this.metrics.lastShutdownAt
    });

    return { status: "OFFLINE", shutdownTimeMs: elapsed };
  }

  stop() { return this.shutdown(); }
  close() { return this.shutdown(); }
}

export default EnterpriseKernelMaster;
