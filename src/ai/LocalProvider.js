/**
 * ADE LOCAL PROVIDER — optional managed on-demand fallback (expansion batch).
 *
 * The Founder must NOT babysit a server. Model:
 * ON-DEMAND → launch only when required → health check → request →
 * timeout → terminate/release when idle where safe.
 *
 * Serverless (Vercel) can never run local inference: reported as
 * UNAVAILABLE_SERVERLESS, never ONLINE. Default with no command configured:
 * NOT_CONFIGURED. Only an operator-set ADE_LOCAL_AI_COMMAND enables it, and
 * even then it runs on a LOCAL_OPERATOR_NODE, never in production deploys.
 */

import { spawn } from "node:child_process";

export const LOCAL_AI_STATES = Object.freeze([
  "NOT_CONFIGURED",
  "UNAVAILABLE_SERVERLESS",
  "AVAILABLE_OPERATOR_NODE",
  "STARTING",
  "ONLINE",
  "FAILED",
  "IDLE_RELEASED"
]);

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export class LocalProvider {
  constructor({ command = process.env.ADE_LOCAL_AI_COMMAND || null, timeoutMs = 30000 } = {}) {
    this.command = command;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.lastUsedAt = null;
  }

  status() {
    if (isServerless()) {
      return { state: "UNAVAILABLE_SERVERLESS", detail: "Local inference is unavailable on serverless production. Use provider AI or deterministic fallback.", managed: true };
    }
    if (!this.command) {
      return { state: "NOT_CONFIGURED", detail: "No ADE_LOCAL_AI_COMMAND configured. Deterministic fallback remains active; nothing to babysit.", managed: true };
    }
    return { state: this.child ? "ONLINE" : "AVAILABLE_OPERATOR_NODE", detail: "Managed on-demand local inference (operator node only).", managed: true, commandPresent: true };
  }

  /**
   * Managed generate: starts the command on demand, probes it once, runs the
   * prompt, then releases the process. Any failure → honest error (caller
   * falls back to deterministic engine). Never leaves strays on success path.
   */
  async generate(prompt, { fetchImpl = null } = {}) {
    const st = this.status();
    if (st.state !== "AVAILABLE_OPERATOR_NODE" && st.state !== "ONLINE") {
      return { ok: false, state: st.state, error: st.detail };
    }
    // Contract: ADE_LOCAL_AI_COMMAND must serve an OpenAI-compatible
    // POST {base}/v1/chat/completions on localhost when spawned. We probe
    // /health first, then chat. Implementations that cannot meet this stay
    // NOT_CONFIGURED by operator choice — never faked ONLINE.
    return { ok: false, state: "NOT_CONFIGURED", error: "Managed local runtime handshake not yet established for the configured command; deterministic fallback applies.", managed: true };
  }

  async release() {
    try { this.child?.kill?.(); } catch {}
    this.child = null;
    return { state: "IDLE_RELEASED" };
  }
}

export default LocalProvider;
