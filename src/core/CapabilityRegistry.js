import fs from "node:fs";
import path from "node:path";
import KernelEventBus from "../kernel/EnterpriseEventBus.js";

const DEFAULT_STORE = path.resolve(process.env.ADE_CAPABILITY_STORE || ".ade_capability_store.json");

export class CapabilityRegistry {
  constructor({ storePath = DEFAULT_STORE, eventBus = KernelEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.storePath = storePath;
    this.capabilities = new Map();
    this.subsystems = new Map();
    this.revoked = new Set();
    this.#loadPersistentState();
    this.initCoreCapabilities();
  }

  static getInstance() {
    if (!globalThis.__capabilityRegistryInstance) globalThis.__capabilityRegistryInstance = new CapabilityRegistry();
    return globalThis.__capabilityRegistryInstance;
  }

  #loadPersistentState() {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const state = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      for (const cap of state.capabilities || []) this.capabilities.set(cap.intent, { ...cap, handler: undefined });
      for (const item of state.subsystems || []) this.subsystems.set(item[0], item[1]);
      this.revoked = new Set(state.revoked || []);
    } catch (error) {
      console.warn(`[CapabilityRegistry] Persistence load skipped: ${error.message}`);
    }
  }

  #persist() {
    const dir = path.dirname(this.storePath);
    fs.mkdirSync(dir, { recursive: true });
    const state = {
      version: 1,
      updatedAt: new Date().toISOString(),
      capabilities: [...this.capabilities.values()].map(({ handler, ...cap }) => cap),
      subsystems: [...this.subsystems.entries()],
      revoked: [...this.revoked]
    };
    const tmp = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, this.storePath);
  }

  initCoreCapabilities() {
    const core = [
      { intent: "PING", name: "Kernel Ping", rbacLevel: 0, sourceModule: "CORE", tier: "FREE", handler: () => ({ pong: true }) },
      { intent: "PUBLIC_INFO", name: "Public Platform Information", rbacLevel: 0, sourceModule: "CORE", tier: "FREE", handler: () => ({ platform: "ADE-APEX", execution: "LIVE" }) },
      { intent: "WATCH_ASSET", name: "Watch Asset Stream", rbacLevel: 1, sourceModule: "CORE", tier: "FREE", handler: (p = {}) => ({ subscribed: p.asset || "UNKNOWN" }) },
      { intent: "TELEMETRY_SSE", name: "Live Telemetry Stream", rbacLevel: 1, sourceModule: "CORE", tier: "FREE", handler: (p = {}) => ({ channel: p.channel || "KERNEL" }) },
      { intent: "UNIVERSAL_AI_GATEWAY", name: "Universal AI Gateway", rbacLevel: 1, sourceModule: "CORE", tier: "FREE", handler: (p = {}) => ({ accepted: true, promptLength: String(p.prompt || "").length }) },
      { intent: "MULTI_STREAM", name: "Multi-Stream Operations", rbacLevel: 2, sourceModule: "CORE", tier: "PRO", handler: (p = {}) => ({ streams: Number(p.count || 0) }) },
      { intent: "SYSTEM_HEALTH", name: "System Health", rbacLevel: 1, sourceModule: "CORE", tier: "FREE", handler: () => ({ requested: true }) },
      { intent: "SYSTEM_SHUTDOWN", name: "Controlled System Shutdown", rbacLevel: 4, sourceModule: "CORE", tier: "ENTERPRISE", handler: () => ({ requested: true }) }
    ];
    for (const cap of core) {
      const existing = this.capabilities.get(cap.intent);
      if (!existing || !existing.handler) this.registerCapability(cap, { persist: false });
    }
    this.#persist();
  }

  registerCapability(capabilityOrExtension, intent, handlerOrLevel, rbacLevel = 1, options = {}) {
    let cap;
    if (capabilityOrExtension && typeof capabilityOrExtension === "object" && !Array.isArray(capabilityOrExtension)) cap = { ...capabilityOrExtension };
    else if (typeof capabilityOrExtension === "string" && typeof intent === "string" && typeof handlerOrLevel === "function") cap = { extensionId: capabilityOrExtension, intent, handler: handlerOrLevel, rbacLevel, sourceModule: capabilityOrExtension };
    else throw new Error("Invalid Capability registration.");
    if (!cap.intent) throw new Error("Capability intent is required.");
    if (typeof cap.handler !== "function") throw new Error(`Capability '${cap.intent}' requires a runtime handler.`);
    const record = {
      id: cap.id || cap.intent,
      intent: cap.intent,
      name: cap.name || cap.intent,
      rbacLevel: Number.isFinite(Number(cap.rbacLevel)) ? Number(cap.rbacLevel) : 1,
      sourceModule: cap.sourceModule || "EXTERNAL_SUBSYSTEM",
      extensionId: cap.extensionId || null,
      tier: cap.tier || "FREE",
      classification: cap.classification || "STATIC_CORE_CAPABILITY",
      description: cap.description || "",
      registeredAt: cap.registeredAt || new Date().toISOString(),
      handler: cap.handler
    };
    this.capabilities.set(record.intent, record);
    this.revoked.delete(record.intent);
    if (options.persist !== false) this.#persist();
    try { this.eventBus.publish("CAPABILITY_REGISTERED", this.publicRecord(record)); } catch {}
    return record;
  }

  register(key, capabilityData = {}) { return this.registerCapability({ ...capabilityData, intent: capabilityData.intent || key, id: key }); }

  bindCapabilityHandler(intent, handler) {
    if (typeof handler !== "function") throw new Error("Capability handler must be a function.");
    const cap = this.capabilities.get(intent);
    if (!cap) throw new Error(`Unknown capability '${intent}'.`);
    cap.handler = handler;
    return cap;
  }

  verifyCapability(extensionId, intent) {
    const capability = this.capabilities.get(intent);
    return Boolean(capability && !this.revoked.has(intent) && (!capability.extensionId || capability.extensionId === extensionId));
  }

  unregisterCapability(intent) {
    if (!this.capabilities.has(intent)) return false;
    this.capabilities.delete(intent);
    this.revoked.delete(intent);
    this.#persist();
    try { this.eventBus.publish("CAPABILITY_UNREGISTERED", { intent }); } catch {}
    return true;
  }

  revokeCapability(intent) {
    if (!this.capabilities.has(intent)) throw new Error(`Unknown capability '${intent}'.`);
    this.revoked.add(intent);
    const cap = this.capabilities.get(intent);
    cap.classification = "REVOKED_CAPABILITY";
    this.#persist();
    try { this.eventBus.publish("CAPABILITY_REVOKED", { intent }); } catch {}
    return true;
  }

  restoreCapability(intent) {
    if (!this.capabilities.has(intent)) throw new Error(`Unknown capability '${intent}'.`);
    this.revoked.delete(intent);
    const cap = this.capabilities.get(intent);
    cap.classification = cap.classification === "REVOKED_CAPABILITY" ? "DYNAMIC_CAPABILITY" : cap.classification;
    this.#persist();
    try { this.eventBus.publish("CAPABILITY_RESTORED", { intent }); } catch {}
    return true;
  }

  getCapability(intent) {
    const cap = this.capabilities.get(intent);
    if (!cap || this.revoked.has(intent)) return undefined;
    return cap;
  }

  publicRecord(cap) {
    if (!cap) return null;
    const { handler, ...safe } = cap;
    return { ...safe, revoked: this.revoked.has(cap.intent), runtimeBound: typeof cap.handler === "function" };
  }

  listCapabilities() { return [...this.capabilities.values()].map(c => this.publicRecord(c)); }
  getAll() { return this.listCapabilities(); }
  hasCapability(id) { return Boolean(this.getCapability(id)); }

  search(query = "") {
    const q = String(query).trim().toLowerCase();
    return this.listCapabilities().filter(cap => !q || [cap.id, cap.intent, cap.name, cap.category, cap.description].some(v => String(v || "").toLowerCase().includes(q)));
  }

  getPlanCapabilities(planKey = "FREE") {
    const plan = String(planKey).toUpperCase();
    return this.listCapabilities().filter(cap => plan === "ENTERPRISE" || plan === "PRO" ? cap.tier !== "ENTERPRISE" || plan === "ENTERPRISE" : cap.tier === "FREE");
  }

  registerSubsystem(moduleName, capabilitiesManifest) {
    if (!moduleName || !Array.isArray(capabilitiesManifest)) throw new Error("Subsystem and capability manifest are required.");
    for (const cap of capabilitiesManifest) this.registerCapability({ ...cap, sourceModule: moduleName, classification: "DYNAMIC_CAPABILITY" });
    const record = { registeredAt: new Date().toISOString(), capabilityCount: capabilitiesManifest.length };
    this.subsystems.set(moduleName, record);
    this.#persist();
    return record;
  }

  getSubsystems() { return [...this.subsystems.entries()]; }
  getPersistenceSnapshot() { return { path: this.storePath, capabilities: this.listCapabilities().length, revoked: this.revoked.size }; }
}

const canonicalRegistry = CapabilityRegistry.getInstance();
export default canonicalRegistry;
