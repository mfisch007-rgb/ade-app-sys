# BATCH_6D-1_6D-2 — CANONICAL CAPABILITY RECORD + INTEGRATION DECISION — FINAL REPORT

Batch 6D-1 (Canonical Capability Record) + 6D-2 (Integration Decision + Durable Record). IMPLEMENTATION batch.
Note: the setup command's instruction file (`BATCH_6D_1_6D_2_INSTRUCTIONS.md`) was NOT present in the
working tree when execution began (read returned "File not found"); the mission text from the batch
message itself was used as the authoritative instruction. No other discrepancy found.

## 1. Executive result

IMPLEMENTED + PROVEN: a canonical, serializable capability record with controlled state machine and
secret redaction (`src/capabilities/CapabilityRecord.js`, pure/no-I/O), plus a durable tenant-scoped
record/decision store over the existing `RuntimeConfigStore` sections (`src/capabilities/CapabilityRecordStore.js`),
wired as an internal-only singleton in `src/app.js` (no routes). Comparison stays analysis
(`recordFromExchange` lands at MATCHED/UNKNOWN); activation stays authorized (only `authorizedActivate`
with an APPROVED decision — or explicit elevated identity+reason — plus a caller-supplied real handler
reaches the existing `CapabilityRegistry`). 20/20 new tests pass; full suite 348/351 pass with 0 failures
(baseline was 328/331); `npm run validate` FULL GREEN (13/13); community build succeeds. No trading,
auth, storage, or EventBus code touched. Nothing committed (per rule 12 — changes left ready for review).

## 2. Files added

- `src/capabilities/CapabilityRecord.js` (new, ~380 lines): record/decision factories, validation,
  deterministic serialization, secret redaction, state machine + transitions, decision vocabulary,
  execution modes, protected-intent patterns. Zero imports except `node:crypto`. No I/O.
- `src/capabilities/CapabilityRecordStore.js` (new, ~330 lines): durable service (hydrate/persist/trim
  over injected store), register/get/list/updateState, `recordFromExchange`, recordDecision/get/list,
  authorizeDecision, recordOutcome, `authorizedActivate`. Audit via existing `audit.log.created` topic.
- `tests/capability-record.test.js` (new, 20 tests): maps 1:1 to Part J items 1–24 (item 25 = full-suite green).

## 3. Files modified

- `src/app.js` (+3 lines): import + singleton instantiation after `learningCandidates`. No routes,
  no behavior change to existing flows.
- `package.json` (+1 token): appended `tests/capability-record.test.js` to the `test` script list.
- Pre-existing worktree modifications preserved byte-for-byte otherwise: `public/index.html`,
  `public/admin/index.html`, `src/intelligence/UnifiedIntakeEngine.js` untouched by this batch;
  `src/app.js` edit was a minimal insertion at the singleton block; `data/*.json` drift is runtime
  growth from test/validate runs only.

## 4. Existing components reused

CapabilityRegistry (`registerCapability` persist:false path, `publicRecord` handler-stripping, events),
CapabilityActivation (state vocabulary + safe-register rule mirrored), CapabilityExchange.compare
output shape (consumed by `recordFromExchange`), LearningCandidates approval rule (identity + reason +
real handler), RuntimeConfigStore `readSection`/`writeSection` (sections `capabilityRecords`,
`integrationDecisions`), `audit.log.created` convention (`category: CAPABILITY_RECORD`), EventBus
domain events (`capability.record.registered/decided/activated`), node:test + assert/strict + stubStore
test pattern from `tests/ecosystem-expansion.test.js`.

## 5. Canonical Capability Record schema

`{schemaVersion, capabilityId (CAP-<sha8> deterministic), intent, name, description, sourceSystem,
sourceVersion, sourceReference, sourceHash, discoveryMethod, evidenceReferences[], inputs{}, outputs{},
dependencies[], permissions{minLevel 0–4, roles[]}, tenantScope, executionMode (LOCAL_LIVE|SIMULATED|
PROVIDER_GATED|HUMAN_ONLY|UNKNOWN), providerRequirements[], sideEffects[], integrationMethod
(10-term controlled vocabulary), confidence 0–1, evidence[], status (17 states), owner, auditReference,
secretRedactions[], createdAt, updatedAt, history[] (append-only, capped 100)}`.
Validation: identity required; enums closed; strings/objects length-capped; unknowns stay explicit
("UNKNOWN"/null/[]/0). Serialization: recursive key-sort → stable JSON. Secrets: credential field
names dropped + reported; secret-shaped values replaced with `[REDACTED]`; nothing secret persists.

## 6. Integration Decision schema

`{decisionId (DEC-<8>), capabilityId (must exist), tenantScope, matchEvidence[], matchClassification,
proposedMethod, method (same 10-term vocabulary), rationale, confidence, risks[], requiredProvider[],
requiredHumanAction, authorization{PENDING|APPROVED|REJECTED + decidedBy/reason/decidedAt},
execution{NOT_STARTED|IN_PROGRESS|SUCCEEDED|FAILED|SKIPPED + detail}, validation{UNVALIDATED|
VALIDATED|INVALID}, outcome, auditReference, createdAt, updatedAt}`.
UNKNOWN / HUMAN_REVIEW / PROVIDER_REQUIRED are first-class non-forced outcomes.

## 7. State model

DISCOVERED→PARSED→UNDERSTOOD→MATCHED→PROPOSED→AWAITING_AUTHORIZATION→{APPROVED|REJECTED};
APPROVED→{ADAPTING|INTEGRATING|REGISTERED}; ADAPTING/INTEGRATING→VALIDATING→{VERIFIED|FAILED};
VERIFIED→REGISTERED→ACTIVE⇄SUSPENDED; FAILED→PROPOSED (retry); REJECTED/EXPIRED terminal-retained.
Analysis states (first five) carry no write authority by convention + construction (no handler path).
Every transition: closed allowlist, actor+reason recorded, tenant-checked, audit-published, tested
(valid chain + 3 invalid-jump cases).

## 8. Persistence model

Sections `capabilityRecords` / `integrationDecisions` (object maps id→record) via injected store —
durable iff the configured provider is durable (Supabase) else local-file, identical contract to
cases/feedback/intakes. Deterministic retrieval by id; list filtered by tenant (+"default" shared
semantics), status, method; createdAt-ordered; capped (default 2000, oldest-first trim); rehydrated
on construction; no silent overwrite (duplicate register throws `CAPABILITY_RECORD_EXISTS`;
terminal/pending guards on authorize). No second persistence architecture.

## 9. Security model

No secret storage (redaction at creation, verified by test); no credential persistence; tenant
isolation on get/list/mutate (+`TENANT_MISMATCH`); RBAC-compatible (permissions.minLevel recorded;
activation delegates to registry RBAC levels); Founder/Admin distinctions untouched (no identity code);
public callers get the default non-elevated path; protected intents (BINARY/FOREX/GAMING/BROKER/
VENUE_EXEC/LIVE_TRADE/MT5/MT4/DERIV/FBS/POCKET_OPTION/IQ_OPTION/AVIATOR, substring match) rejected
without `elevated:true`, and activation of them rejected without elevation even when approved;
external capabilities inert until authorized (only `authorizedActivate` touches the registry, and only
with approval + real handler); audit via existing topic; malformed input rejected with coded errors.
No second auth system. Secret scan of the diff: clean (only the redaction regex itself matches).

## 10. API/service seam

INTERNAL ONLY (per Part I allowance): exported `CapabilityRecordStore` class + app singleton
`capabilityRecordStore`. No HTTP routes added; no public surface for Founder/private capabilities;
no internal intelligence exposed anonymously. Rationale: all consumers this batch (exchange linkage,
activation linkage, tests) are in-process; routes would widen surface without a proven caller.

## 11. ProCarta proof

Canonical `PROCARTA_EXECUTE` record → decision REUSE ("already ADE-owned; G26 contract; no second
engine") — IMPLEMENTED + PROVEN by test. External BPMN export pattern → ADAPT with evidence
("render ADE findings through the XML pattern; import no engine") — IMPLEMENTED (decision path) +
PROVEN by test; live rendering remains a later batch. Legacy SIMULATED plugin → KEEP_SEPARATE —
IMPLEMENTED + PROVEN by test.

## 12. AWBULI proof

`WHATSAPP_TRANSPORT` (PROVIDER_GATED + `AWBULI_API_URL/KEY` requirements) → PROVIDER_REQUIRED with
founder verification action — IMPLEMENTED + PROVEN by test; WhatsApp is NOT live and the record
says so. `MULTILINGUAL_NLU` (no evidence, Drive BLOCKED) → HUMAN_REVIEW — IMPLEMENTED + PROVEN.
`OPERATIONAL_LEDGER` (cases/measurements/audit evidence) → ADAPT ("no second ledger") — IMPLEMENTED
+ PROVEN. No WhatsApp connection created; no transport code written.

## 13. Test results

New file: 20 tests / 20 pass / 0 fail (covers Part J items 1–24: valid, malformed, identity,
unknown-provider, provider-required, tenant isolation, unauthorized mutation, redaction,
serialization, exchange linkage, REUSE/ADAPT/KEEP_SEPARATE/PROVIDER_REQUIRED/HUMAN_REVIEW/rejected
decisions, invalid+valid transitions, durable save/retrieve, decision persistence, no-auto-activation,
authorized-activate rules, protected boundary ×4, registry compat, activation compat).
Full suite: BASELINE 331 tests / 328 pass / 0 fail / 3 skipped → CURRENT 351 / 348 / 0 / 3.
NEW FAILURES: none. PRE-EXISTING FAILURES: none. Skipped (3) unchanged.

## 14. Build/validation results

`node --check`: CapabilityRecord.js, CapabilityRecordStore.js, app.js — clean. `git diff --check`:
clean. `npm run validate`: FULL GREEN, platform health 13/13 (100%). `npm run build:community`:
success — 1731 source files, 23,295,561 bytes, sha256 `9d4cbd62…`, commit `6031643`.

## 15. Worktree safety verification

Tracked modified: 6 pre-existing + `package.json` (1-line test-list addition). No deletions
(checked). No untracked evidence/report deletions. No unrelated modifications. No secrets
introduced (diff scan clean). No credentials committed (nothing committed at all). Protected
trading/execution code: `git diff --name-only` shows zero hits under trading/Gaming/Broker/Deriv/
Workforce/SecurityGate/EventBus/Decision paths. Frozen batch reports (3, 4/5, 6A, 6B, 6C):
unmodified.

## 16. Known limitations

Decisions/records are inert data until a caller drives transitions (no background worker — by
design); exchange linkage covers manifest-style compare outputs only (no OpenAPI/foreign-repo
ingest — G1 still open); matching stays lexical via exchange (no semantic scorer); economics is
still a human document (no computable scorer); protected-intent matching is substring-based
(conservative by design: may over-block novel intents containing e.g. "FBS" — elevated path
exists); tenant `"default"` records are visible to all tenants (shared-catalog semantics,
documented, same as inbox).

## 17. Provider-required boundaries

WhatsApp/AWBULI transport, STT, OCR, LLM, geo, Supabase project, sender identity, payment
providers: records carry `providerRequirements` + `PROVIDER_REQUIRED` decisions; nothing attempts
connection; `AWBULI_API_URL/KEY` contract unchanged and empty. Status: PROVIDER_REQUIRED.

## 18. Human-required boundaries

Crossing PROPOSED→APPROVED (identity + reason mandatory), any registry activation, protected-intent
handling, pilot promotion (existing), external bridge enablement (existing L3), trading-adjacent
anything: HUMAN_ACTION_REQUIRED. The mechanism cannot self-authorize.

## 19. Exact next recommended engineering batch

Batch 7 — TRANSPORT-NEUTRAL INGESTION CONTRACT + ENVELOPE VALIDATION (seams S1+S3): define the
normalized message/business-event envelope (reuse `EventSchemaRegistry` pattern + media-manifest
shape), validate ADE intake→case round-trip through it with tests, still no provider, no transport,
no multimodal. Then Batch 8 — single provider adapter behind the existing `AWBULI_API_URL/KEY`
contract (human-owned credentials only).
