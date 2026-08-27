/**
 * ADE-APEX Shared Runtime State
 *
 * This object is intentionally plain and serializable.
 * The canonical kernel remains the owner of live runtime behavior.
 */

export const runtimeState = {

  mode: process.env.ADE_RUNTIME_MODE || "FULL",

  status: "STOPPED",

  services: {
    whatsapp: false,
    database: false,
    aiGateway: false,
    telemetry: true,
    memory: false,
    knowledge: false,
    decision: false,
    workflow: false
  },

  metrics: {

    restartCount: 0,

    bootCount: 0,

    messagesProcessed: 0,

    intentsDispatched: 0,

    intentsSucceeded: 0,

    intentsFailed: 0,

    decisionsEvaluated: 0,

    workflowExecutions: 0,

    errors: 0,

    bootTimeMs: null,

    shutdownTimeMs: null,

    activeSubsystems: 0,

    lastBootAt: null,

    lastShutdownAt: null
  },

  failures: [],

  health: {
    status: "UNKNOWN",
    lastCheckAt: null
  },

  version: "1.0.0",

  updatedAt: new Date().toISOString()
};

export function updateRuntimeState(patch = {}) {

  if (patch.services) {
    runtimeState.services = {
      ...runtimeState.services,
      ...patch.services
    };
  }

  if (patch.metrics) {
    runtimeState.metrics = {
      ...runtimeState.metrics,
      ...patch.metrics
    };
  }

  if (patch.health) {
    runtimeState.health = {
      ...runtimeState.health,
      ...patch.health
    };
  }

  const scalarKeys = [
    "mode",
    "status",
    "version"
  ];

  for (const key of scalarKeys) {
    if (patch[key] !== undefined) {
      runtimeState[key] = patch[key];
    }
  }

  if (Array.isArray(patch.failures)) {
    runtimeState.failures = patch.failures;
  }

  runtimeState.updatedAt = new Date().toISOString();

  return runtimeState;
}

export function recordRuntimeFailure(error, context = {}) {

  const entry = {
    message: error?.message || String(error),
    context,
    timestamp: new Date().toISOString()
  };

  runtimeState.failures.push(entry);

  if (runtimeState.failures.length > 100) {
    runtimeState.failures.shift();
  }

  runtimeState.metrics.errors++;

  runtimeState.updatedAt =
    new Date().toISOString();

  return entry;
}

export default runtimeState;
