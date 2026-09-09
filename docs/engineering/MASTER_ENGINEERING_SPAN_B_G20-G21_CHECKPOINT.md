# ADE-APEX — MASTER ENGINEERING SPAN B CHECKPOINT (G20 / G21)

Date: 2026-09-04
Git branch: `main`
Git HEAD: `183c66cbd949e51997d52192ea6f1af19bdddc69` (committed) + dirty working tree
Working tree: intentionally dirty (many pre-existing untracked backup/evidence bundles preserved).

## 0. Operating law observed

Historical reports, roadmap summaries and prior PASS statements were treated as
hypotheses and confirmed against the actual repository, Git state, source code,
tests, runtime behavior and build evidence. Nothing was assumed complete or
incomplete from a roadmap alone. No Wave 1 or Span A work was rebuilt or
rewritten. No destructive Git operation was performed. No credentials or fake
external-connector success were invented.

## 1. Starting repository truth

Span B begins from the validated Span A state (G17/G18/G19 = CLOSED/ACCEPTED).
All Span A authorities remain intact.

## 2. G20 — Provider-Neutral AI (actual status)

**Already present (reconciled as valid):**
- `UniversalAIGateway` with 4 providers (Gemini, Groq, DeepSeek, Qwen)
- Provider-agnostic `dispatchPrompt` with cascade fallback
- Jaccard semantic cache (threshold 0.75)
- Circuit breaker timeout (8s via `fetchWithTimeout` + AbortController)
- `getProviderStatus()` — honest config-only reporting, no fabricated connectivity
- Offline Lexical Engine fallback (deterministic, explicitly labelled)
- EventBus integration: `AI_DISPATCH_EVENT` and `AI_PROVIDER_ERROR` events
- Kernel integration via `EnterpriseKernelMaster._initializeAIGateway()` with graceful offline fallback
- Health surface integration: `/api/v1/health` reports AI as optional/degraded, never marking core dead

**Tests (6/6 PASS):**
- G20.A: Canonical provider-neutral authority
- G20.B: Deterministic config-gated provider selection
- G20.C: Missing config handled safely (no fake connectivity)
- G20.D: Provider failure isolated, never crashes caller
- G20.E: Offline fallback honest (not live AI)
- G20.F: No fake external-provider success

**G20 verdict: VALIDATED — no gaps found, no repairs needed.**

## 3. G21 — Observability / Internal Operations (actual status)

**Already present (reconciled as valid):**
- `/api/v1/health` canonical health surface (unauthenticated, core vs. optional AI distinction)
- EnterpriseEventBus with ordered delivery, DLQ, metrics, health, history
- TelemetryEventHub (SSE broadcast, event buffer)
- TelemetryGateway (trade/signal/security metrics)
- TelemetrySSEGateway (EventBus→SSE bridge)
- RuntimeObservatory (module states, event/workflow metrics, memory snapshot)
- StructuredJSONLogger (structured JSON logging)
- EventSchemaRegistry with 30+ schema contracts (kernel, capability, engagement, marketing, audit)

**Genuinely missing (implemented this span):**

1. **RuntimeObservatory.logSystem() / getRecentLogs()** — `app.js` lines 125–127 and 280 called these
   methods but they DID NOT EXIST on the class. Calls were swallowed by try/catch, meaning the
   `/api/telemetry/poll` endpoint always fell back to the raw `systemLogs` buffer instead of the
   observatory. **Fixed:** Added `logSystem(tag, message)` (bounded 200-entry ring buffer) and
   `getRecentLogs(limit)` to `RuntimeObservatory`. The `app.js` telemetry poll now surfaces real
   observatory records.

2. **No `/api/v1/metrics` HTTP endpoint** — kernel metrics, EventBus metrics, and observatory
   snapshots were only available programmatically. **Fixed:** Added unauthenticated canonical
   `/api/v1/metrics` endpoint returning `kernel.metrics`, `eventBus.getMetrics()`, and
   `observatory.getLiveSnapshot()`.

3. **No `/api/v1/events/recent` HTTP endpoint** — event history was only available programmatically
   via `EventBus.getHistory()`. **Fixed:** Added canonical `/api/v1/events/recent` endpoint with
   bounded query (limit 1–200) returning `eventId`, `topic`, `payload`, `traceId`, `timestamp`.

4. **Missing G21 observability event schemas** — `EventSchemaRegistry` had kernel/capability/
   engagement/audit schemas but no schemas for G21 observability topics. **Fixed:** Registered
   schemas for `SYS_HEALTH`, `AUDIT_LOGS`, `AI_GATEWAY`, `KERNEL_EVENTS`, `SUBSYSTEM_EVENTS`,
   `KERNEL_STATUS`, `KERNEL_BOOT_COMPLETE`, `KERNEL_BOOT_FAILED`, `KERNEL_SHUTDOWN_COMPLETE`,
   `KERNEL_INTENT`, `KERNEL_SUBSYSTEM_ATTACHED`, `METRIC_SNAPSHOT`, `SECURITY_EVENT`,
   `HEALTH_CHECK`, `ALERT_RAISED`, `DEPLOYMENT_RELEASED`, `ERROR_OCCURRED`, `AI_PROVIDER_ERROR`.

**Tests (9/9 PASS):**
- G21.A: Canonical health surface reports live core with uptime
- G21.B: Kernel status and subsystem count surfaced
- G21.C: Unconfigured AI does NOT mark core dead (degraded optional)
- G21.D: Configured AI reflected in health as CONFIGURED
- G21.E: AI lifecycle events flow through canonical EventBus
- G21.F: Provider failure events emitted to EventBus, core continues
- G21.G: Observable kernel metrics exposed via canonical HTTP surface (NEW)
- G21.H: Recent operational events exposed via canonical HTTP surface (NEW)
- G21.I: RuntimeObservatory records system logs through the logSystem integration path (NEW)

**G21 verdict: VALIDATED — 4 genuine gaps found and repaired, all 9 tests pass.**

## 4. Files materially changed (this span)

**Modified:**
- `src/observatory/RuntimeObservatory.js` — added `systemLogs` init, `logSystem()`, `getRecentLogs()`
- `src/core/EventSchemaRegistry.js` — added 18 G21 observability event schemas
- `src/app.js` — added `/api/v1/metrics` and `/api/v1/events/recent` endpoints (untracked)

**Added:**
- `tests/g21-observability.test.js` — 9 tests covering all G21 observability contracts
- `docs/engineering/MASTER_ENGINEERING_SPAN_B_G20-G21_CHECKPOINT.md` (this file)

## 5. Executable validation evidence

- **`npm test` canonical suite:** 98/98 pass (all Span A + Span B tests).
- G20 tests: 6/6 PASS.
- G21 tests: 9/9 PASS.
- No regressions to any existing test.
- No new external dependencies introduced.
- No fake credentials, connectivity, or external success fabricated.

## 6. Pre-existing failures (not caused by this span)

- `tests/security/http-auth-boundary.http.test.mjs` — requires `ADE_HTTP_TEST_PIN` (config gate)
- Various legacy `src/cli/test-*.js` scripts — pre-existing failures in trading/plugin/E2E scripts
  unrelated to G20/G21 scope. These existed before Span A and remain outside the canonical test suite.

## 7. Genuine blockers / remaining gaps

None for G20 or G21. Both stages are validated with executable evidence.

## 8. Boundary confirmation

This checkpoint closes **Master Engineering Span B (G20 / G21)**. Autonomous execution
stopped at completion of the bounded span; no further roadmap span was automatically continued.
G22+ work is NOT started.
