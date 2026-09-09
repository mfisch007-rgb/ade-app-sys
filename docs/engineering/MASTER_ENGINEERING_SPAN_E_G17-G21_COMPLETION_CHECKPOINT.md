# ADE-APEX — SPAN E REALITY-AUDIT COMPLETION CHECKPOINT (G17 / G18 / G19 / G20 / G21)

Date: 2026-09-05
Git branch: `main`
Git HEAD: `183c66cbd949e51997d52192ea6f1af19bdddc69`
Working tree: dirty (pre-existing mangled index — staged deletions of oddly-named
files, many critical source files untracked; no Git write operation performed).

## 0. Operating law observed

Prior PASS statements and roadmap claims for G17–G21 were treated as hypotheses
and re-verified against the actual repository, source code, runtime behavior and
tests in a bounded reality audit. Only genuinely missing pieces were implemented.
No Wave 1 authority was duplicated, replaced, or weakened. No destructive Git
operation was performed (index/staging untouched — edits are disk-only). No new
dependencies were added. No credentials or fake external success were invented.
G22+ and unrelated chassis work were excluded.

## 1. Verification baseline

- Canonical launcher: `src/server.js` → `src/app.js` → `src/kernel/EnterpriseKernelMaster.js`.
- Canonical bus: `src/kernel/EnterpriseEventBus.js` (ordered delivery, handler
  isolation, DLQ, retries, serial LRU cache). `src/eventBus/eventBus.js` is a
  separate legacy bus used by legacy CLI only — untouched.
- Baseline test truth (before this span): `npm test` = **148 pass / 0 fail**.
- Git working tree was already heavily modified before this span (many `M`/`?`
  entries, staged oddities). All diffs below are relative to that dirty working
  tree state, not to HEAD.

## 2. Reality audit verdicts (before → after)

### G17 — Portable / Durable Storage Architecture
- Before: `StorageProvider` contract + `LocalStorageAdapter` +
  `LocalDocumentStorageAdapter` + `RuntimeConfigStore` present, but durable mode
  was decorative: `app.js` always used the local filesystem document store for
  runtime config and the case list regardless of `ADE_STORAGE_PROVIDER`; boot did
  not hydrate from the durable provider. `AuditStore` was orphaned (not wired) and
  its writes were non-atomic.
- After: `src/storage/ProviderDocumentStorageAdapter.js` (new) adapts any
  `StorageProvider` into the document adapter (`readSync/writeSync/read/write`),
  hydrating on first read and buffering pre-hydration writes via a serialized
  `_writeQueue` so no write is ever lost after reload. `app.js` now selects the
  durable document adapter when `ADE_STORAGE_PROVIDER` is non-local
  **and** `storageProvider.isConfigured()` is true; otherwise local behavior is
  unchanged. Boot awaits `storageHydration` (re-applies saved channels and calls
  `caseManager.reload()`) before the server listens, so an authoritative durable
  document is never overwritten by import-time defaults.

### G18 — Identity / Security Durability + First-Run Auth
- Before: first-run unset PIN produced HTTP 500 for `INITIAL_PIN_HASH_REQUIRED`
  (contract requires 503 `AUTH_NOT_CONFIGURED`); audit events were not persisted
  anywhere.
- After: `src/app.js` auth route maps both `ADMIN_AUTH_NOT_CONFIGURED` and
  `INITIAL_PIN_HASH_REQUIRED` to 503 `{success:false,error:"AUTH_NOT_CONFIGURED"}`
  (never 500). `src/storage/AuditStore.js` was rewritten: injectable `{file}`
  (default `data/audit_ledger.json`), atomic tmp+rename writes, `MAX_LEDGER_ENTRIES
  = 5000`, and `append`/`query`/`#read`. The AuditStore is wired to the canonical
  bus (`SECURITY_EVENT`, `audit.log.created`, `AUDIT_LOGS`) in `app.js`.

### G19 — Execution / Workflow Path
- Before: `CanonicalWorkflowAdapter` and `EngagementOrchestrator` expected
  `executeAutonomousWorkflow` on the canonical `WorkflowEngine`, but the canonical
  engine had only `execute()`; the real execution path was unreachable
  (`WORKFLOW_ENGINE_UNAVAILABLE`). `src/workflows/WorkflowEngine.js` carries an old
  copy and must stay unregistered to avoid duplicate authority.
- After: `src/kernel/SupportingEngines.js` canonical `WorkflowEngine` gained
  `executeAutonomousWorkflow(workflowId, inputData)` implementing
  OBSERVE→LEARN→DECIDE→EXECUTE→EVALUATE→COMPLETE with deterministic
  approve/hold/reject thresholds, confidence propagation (case record takes
  precedence over a derived decision object), REJECT/HOLD escalation throws
  (`WORKFLOW_REJECTED` / `WORKFLOW_ESCALATED`), canonical-bus lifecycle events
  (`engagement.workflow.started/completed/failed`, `human.escalation.required`),
  and kernel workflow metrics. Existing `execute()` is untouched.

### G20 — Provider-Neutral AI Integration
- After: no gaps found. `UniversalAIGateway`/provider-neutral masking is already
  covered; `src/ai/AIGatewayMaster.js` + `src/cli/verify_ai_gateway.js` +
  `src/cli/run_mvp_demo.js` are legacy CLI-only references and were
  intentionally left untouched. Registered as REFERENCE.

### G21 — Observability / SSE Telemetry
- Before: both SSE routes were heartbeat-only (`events/stream` defaulted to the
  `WELCOME` event type; `/api/v1/sse` was non-functional), and canonical-bus
  `"*"` subscribers could never fire (publish delivered only to exact-topic
  listeners).
- After: `EnterpriseEventBus.publish` now delivers exact-topic listeners first,
  then wildcard `"*"` listeners (full envelope passed as both args) whenever
  `listenerCount("*") > 0`. `/api/v1/events/stream` writes a default-type
  `STREAM_CONNECTED` frame on connect (browser `onmessage`-compatible), forwards
  canonical bus events to wired clients, and emits comment heartbeats every 15s.
  `/api/v1/sse` registers a `TelemetryEventHub` client and replays the init buffer
  (`TELEMETRY_INIT`) before live forwarding.

## 3. Files changed (disk-only, relative to dirty working tree)

| File | Change |
|---|---|
| `src/kernel/EnterpriseEventBus.js` | wildcard `"*"` delivery in `publish` |
| `src/kernel/SupportingEngines.js` | `executeAutonomousWorkflow` on canonical `WorkflowEngine` |
| `src/intelligence/CaseManager.js` | added `reload()` for durable boot hydrate |
| `src/storage/AuditStore.js` | rewritten: atomic, durable, injectable file, 5000-entry cap |
| `src/storage/ProviderDocumentStorageAdapter.js` | **new** durable document adapter over `StorageProvider` |
| `src/app.js` | durable-mode selection, audit + telemetry wiring, auth 503 mapping, SSE routes, `storageHydration` export |
| `src/server.js` | boot awaits `Promise.all([kernelReady, storageHydration])` |
| `api/index.js` | same boot await for serverless entrypoint |
| `package.json` | `test` script registers `tests/g17-g21-completion.test.js` |
| `tests/g17-g21-completion.test.js` | **new** executable evidence suite (12 tests) |

Reference-only, deliberately untouched: `src/workflows/WorkflowEngine.js`
(unregistered duplicate), `src/ai/AIGatewayMaster.js`,
`src/cli/verify_ai_gateway.js`, `src/cli/run_mvp_demo.js` (legacy CLI),
`src/eventBus/eventBus.js` (legacy bus), `src/config/supabaseClient.js` +
`src/engines/*` (legacy, non-canonical `@supabase/supabase-js` imports).

## 4. Evidence

- `node --check` on all nine changed/new files: **ALL_SYNTAX_OK**.
- `tests/g17-g21-completion.test.js` standalone: **12/12 pass** —
  - G17.A adapter round-trip + simulated restart
  - G17.B pre-hydration write buffering (never lost)
  - G17.C local default persists unless a durable provider is configured
  - G18.A unconfigured PIN auth → 503 `AUTH_NOT_CONFIGURED` (never 500)
  - G18.B AuditStore atomic + durable (restart survives)
  - G18.C `SECURITY_EVENT` on canonical bus persisted by wired AuditStore
  - G19.A live-kernel workflow completes the full pipeline
  - G19.B low-confidence workflow rejected (`WORKFLOW_REJECTED`)
  - G19.C full ADE case lifecycle intake → ADE_EXECUTION → FEEDBACK_PENDING → CLOSED
  - G21.A wildcard bus meta-delivery
  - G21.B `events/stream` STREAM_CONNECTED (default type) + live bus probe
  - G21.C `/api/v1/sse` TELEMETRY_INIT replay
- Full canonical suite: **160 / 160 pass, 0 fail** (148 baseline + 12 new; zero
  regressions).
- Live boot smoke test: `/api/v1/health` → 200 `HEALTHY/booted=true`,
  `/api/v1/events/stream` → 200 `text/event-stream` (LocalStorageAdapter active).

## 5. Known deltas / non-goals

- `data/audit_ledger.json` is tracked and already exists; AuditStore appends there
  by default. Test runs write to this ledger (acceptable; entries are bounded by
  the 5000 cap).
- G18.A is environment-gated in the suite (skips if `ADE_ADMIN_PIN_HASH` is set or
  `data/admin-credential.json` exists); on this machine neither exists, so it ran.
- The Git index remains mangled from before this span (pre-existing
  `git status --short` oddities). No Git write/repair was attempted per operating
  law; a dedicated index-repair pass is a separate decision for the operator.