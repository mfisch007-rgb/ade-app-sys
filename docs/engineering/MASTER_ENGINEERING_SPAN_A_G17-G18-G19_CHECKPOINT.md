# ADE-APEX — MASTER ENGINEERING SPAN A CHECKPOINT (G17 / G18 / G19)

Date: 2026-09-03
Git branch: `main`
Git HEAD: `183c66cbd949e51997d52192ea6f1af19bdddc69`
Working tree: dirty (many pre-existing untracked backup/evidence bundles preserved).

## 0. Operating law observed

Historical reports, roadmap summaries and prior PASS statements were treated as
hypotheses and confirmed against the actual repository, Git state, source code,
tests, runtime behavior and build evidence. Nothing was assumed complete or
incomplete from a roadmap alone. No Wave 1 work was rebuilt or rewritten. No
destructive Git operation (reset / clean / stash / discard / branch switch) was
performed. No credentials or fake external-connector success were invented.

## 1. Starting repository truth

- Canonical launcher: `src/server.js` → `src/app.js` → `src/kernel/EnterpriseKernelMaster.js`.
- Portable/durable storage authority: `src/storage/StorageProvider.js` (contract),
  `src/storage/LocalStorageAdapter.js` (filesystem KV), `src/storage/DocumentStorageProvider.js`,
  `src/storage/LocalDocumentStorageAdapter.js` (document), `src/admin/RuntimeConfigStore.js`.
- Security/identity authority: `src/security/KeyManager.js`, `src/kernel/IdentityOnboarding.js`,
  `src/security/CredentialLifecycleStore.js`, `src/security/HttpSecurityBoundary.js`.
- Intake→case→decision→workflow→execution→feedback authority: `src/intelligence/UnifiedIntakeEngine.js`,
  `src/intelligence/CaseManager.js`, `src/engagement/CaseStateMachine.js`,
  `src/engagement/EngagementOrchestrator.js`, `src/engagement/CanonicalWorkflowAdapter.js`,
  `src/integrations/ChannelRegistry.js`, `src/integrations/PartnerRegistry.js`,
  `src/integrations/ConnectionManager.js`, `src/kernel/FeedbackPipeline.js`.
- Baseline test truth: `npm run test:full` = **96 tests, 94 pass, 2 fail**.
  Both failures were pre-existing and environment gated (see §11).

## 2. Wave 1 work preserved / reconciled

All Wave 1 authorities (`EnterpriseKernelMaster`, `EnterpriseEventBus`, `CapabilityRegistry`,
`UniversalAIGateway`, `IdentityOnboarding`, `ScenarioEngine`, `FeedbackPipeline`, `ADE_ICX_Engine`,
`CapabilityExecutor`, build/validate scripts, `tests/acceptance.test.js`, `tests/wave1-contract.test.js`)
were confirmed present and passing. No Wave 1 authority was duplicated, replaced, or weakened.

## 3. G17 actual status (Portable/Durable Storage Architecture)

**Already present:**
- Canonical `StorageProvider` contract (async get/set/delete/list/append/transaction + sync parities).
- `LocalStorageAdapter` (filesystem, atomic tmp+rename writes) and `LocalDocumentStorageAdapter`.
- `RuntimeConfigStore` (document config via LocalDocumentStorageAdapter), `PersistentStorageEngine`,
  `AuditStore`. Storage tests existed (`tests/storage/local-storage-adapter.test.js`,
  `tests/storage/runtime-config-adapter.test.js`).

**Genuinely missing (implemented this span):**
- A durable (non-filesystem) adapter for the `StorageProvider` contract. `src/config/supabaseClient.js`
  existed but was not adapted into the storage contract and its dependency is not installed.
- Implemented `src/storage/SupabaseStorageAdapter.js` (durable Supabase/Postgres provider) and
  `src/storage` factory `createStorageProvider()` (`local` default / `supabase` durable, selected by
  `ADE_STORAGE_PROVIDER`). No fabricated credentials: absent config fails safely with
  `STORAGE_NOT_CONFIGURED`. The Supabase client is lazy-loaded only after config is confirmed, so the
  module imports without the optional dependency.
- Wired the provider into the runtime (`src/app.js` exports `storageProvider`, logs active provider)
  and documented the boundary in `.env.example`.

## 4. G18 actual status (Identity / Keys / Sessions / Security Durability)

**Already present (reconciled as valid):**
- KeyManager (RSA 2048, env-secret override), IdentityOnboarding (RS256 signed+verified sessions,
  issuer/audience checks, expiry, revocation list persistence, RBAC levels 0–4, persona checks,
  credential-version enforcement for privileged admin sessions), CredentialLifecycleStore (bcrypt PIN,
  rotation, recovery with hash-protected recovery key, atomic 0600 writes), HttpSecurityBoundary
  (HTTP auth wiring: `/auth/pin`, `/auth/rotate`, `/auth/recover`, `/auth/revoke`), duration audit via
  `SECURITY_EVENT`. Security tests existed (`tests/security/g18-14-r18-abc.test.mjs`,
  `tests/security/g18-14-http-lifecycle.test.mjs`, `tests/security/http-auth-boundary.http.test.mjs`,
  `tests/security/credential-lifecycle-regression.test.mjs`).

**Genuinely missing (implemented this span):**
- Brute-force rate limiting on the authentication endpoints. Added `src/security/RateLimiter.js`
  (self-contained, fixed-window, per-client fan-out by IP, safe proxy-header handling, returns 429,
  bounded memory) and applied it to `/auth/pin`, `/auth/rotate`, `/auth/recover` in `src/app.js`.
  No new external dependency and no hard-coded secrets.

## 5. G19 actual status (Unified Intake → Case → Decision → Workflow → Execution → Feedback)

**Already present (reconciled as valid):**
- Provider-neutral `UnifiedIntakeEngine` with 11 channels (WEB, EMAIL, WHATSAPP, TELEGRAM, API,
  WEBHOOK, PARTNER, CRM, MARKETPLACE, PROCUREMENT, HUMAN); `CaseManager` with guarded state machine;
  `EngagementOrchestrator` covering discovery → analysis → decision (capability/partner routing) →
  workflow → execution → feedback; `CaseStateMachine`, `CanonicalWorkflowAdapter`, `PartnerRegistry`,
  `ChannelRegistry`, `ConnectionManager`, `FeedbackPipeline` (PII sanitization + durable queue).
- HTTP surface wired in `src/app.js`: `/api/v1/intake/:channel`, `/api/v1/cases`,
  `/api/v1/cases/:id/process`, `.../execute`, `.../feedback`, `.../transitions`.
- `tests/engagement-reconciliation.test.js` existed.

**Genuinely missing / defect fixed (this span):**
- **Defect (confirmed by executable evidence):** `CaseManager.persist()` called
  `store.write("cases", list)` but `RuntimeConfigStore.write(section, key, value)` treats the second
  argument as a key, so cases were persisted as `{ cases: {} }` and did NOT survive restart.
- **Fix:** added `RuntimeConfigStore.readSection(section)` / `writeSection(section, value)` and updated
  `CaseManager` to use them (with graceful fallback to the legacy document contract).
  Verified cases now persist and restore across a fresh instance at unit and HTTP level.

## 6. What was already present

See §3–§5 "Already present". All three stages had substantial, valid, untracked foundation work from
prior batches that was preserved and extended.

## 7. What was genuinely missing

1. Durable (external, non-filesystem) `StorageProvider` adapter + provider factory (G17).
2. Auth-endpoint brute-force rate limiting (G18).
3. Correct durable case persistence across restart (G19 defect).

## 8. Implementation completed

- `src/storage/SupabaseStorageAdapter.js` (new) — durable `StorageProvider` impl + `createStorageProvider()` factory.
- `src/security/RateLimiter.js` (new) — self-contained windowed rate limiter + `authRateLimit()`.
- `src/admin/RuntimeConfigStore.js` — added `readSection` / `writeSection`.
- `src/intelligence/CaseManager.js` — persist via `writeSection`/`readSection` (fallback preserved).
- `src/app.js` — wired `storageProvider` (export/log) and applied `authRateLimit()` to auth routes.
- `.env.example` — documented durable storage provider + rate-limit environment contract.
- `package.json` — canonical `npm test` now includes the new unit test files (no HTTP/PIN-gated tests).

## 9. Files changed (this span)

- Added: `src/storage/SupabaseStorageAdapter.js`, `src/security/RateLimiter.js`,
  `tests/case-durability.test.js`, `tests/storage/supabase-storage-adapter.test.js`,
  `tests/security/rate-limiter.test.js`, this checkpoint.
- Modified: `src/admin/RuntimeConfigStore.js`, `src/intelligence/CaseManager.js`, `src/app.js`,
  `.env.example`, `package.json`.

## 10. Executable validation evidence

- `npm test` (canonical, now 9 test files): **83/83 pass**.
- `npm run test:full`: **112 tests, 111 pass, 1 fail** — the sole failure is the pre-existing,
  environment-gated `http-auth-boundary.http.test.mjs` (requires externally-set `ADE_HTTP_TEST_PIN`).
- `src/cli/ade-validate.js`: **LEVEL-3 PLATFORM HEALTH 100% (13/13), FULL GREEN**.
- `npm run verify:release`: **3/3 pass** (release surface, canonical JS parse, verified build).
- `scripts/build-community.mjs`: **success**, 765 source files, zip SHA-256 verified (`Match: true`).
- Syntax checks on all changed files: pass.
- HTTP runtime smoke (configured PIN, local cred/revocation/config files):
  - Login `200` + token issued.
  - Brute-force burst on `/auth/pin` → **429** (rate limiter proven at runtime).
  - Intake via `POST /api/v1/intake/EMAIL` → **201** case created (G19 HTTP surface).
  - `ADE_STORAGE_PROVIDER=supabase` without credentials → server boots, provider selected, no crash
    (safe config boundary; operations fail with `STORAGE_NOT_CONFIGURED` only on use).
- Case persistence verified at unit level (case + status transitions + intake case survive fresh
  instance) and confirmed durable through `RuntimeConfigStore`.

## 11. Pre-existing failures (not caused by this span)

- `tests/security/http-auth-boundary.http.test.mjs` — throws `ADE_HTTP_TEST_PIN_NOT_CONFIGURED`
  unless a 6-digit `ADE_HTTP_TEST_PIN` is supplied by an operator; it is a config gate, not a defect,
  and is excluded from the canonical `npm test`.
- (Historical) `g18-14-http-lifecycle.test.mjs` failed only when run in parallel with other
  HTTP-spawning tests due to port/resource contention; it passed in isolation and now passes within
  the full suite after the storage durability updates.

## 12. Genuine blockers / remaining gaps

- A live Supabase/Postgres instance is not required for any test or local import (the durable adapter
  is lazily loaded and boundaries are unit-testable). Wiring a live durable deployment still requires
  an operator to provide `SUPABASE_URL`, `SUPABASE_STORAGE_KEY`, `SUPABASE_STORAGE_TABLE`.
- External connectors (WhatsApp/Telegram/Partner/CRM/Marketplace/etc.) are represented by a
  provider-neutral intake contract and adapter boundaries, not fabricated live connections.
- AI remains optional; no G20 expansion was started.

## 13. Boundary confirmation

This checkpoint closes **Master Engineering Span A (G17 / G18 / G19 reconciliation + safe
foundation)**. **No G20 or later roadmap-stage work was started.** Autonomous execution stopped at
completion of the bounded span; no further roadmap span was automatically continued.
