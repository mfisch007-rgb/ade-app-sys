# BATCH 7A+7B+7C+7D — TRANSPORT-NEUTRAL INGESTION → ADAPTER → LEDGER → E2E PROOF — FINAL REPORT

Implementation batch. Additive only. No provider contacted, no WhatsApp connection, no trading
code touched, nothing committed (left ready for review).

## 1. Executive result

IMPLEMENTED + PROVEN: a transport-neutral normalized event envelope (7A), a generic injection
adapter boundary with a deterministic SIMULATED test adapter plus an honest provider boundary
descriptor (7B), an event→case/ledger mapper reusing the existing intake + case path with
tenant-scoped idempotency receipts (7C), and a full 18-assertion end-to-end proof (7D) using the
harmless synthetic event "Supplier delivered 20 cartons of milk." — stamped SIMULATED throughout,
never a production fact. 18/18 new tests pass; full suite 366/369 pass, 0 fail (baseline 348/351);
`npm run validate` FULL GREEN 13/13; community build succeeds; `git diff --check` clean.

## 2. 7A result — IMPLEMENTED + PROVEN

`src/ingestion/NormalizedEventEnvelope.js` (pure, no I/O): `createEventEnvelope`,
`validateEventEnvelope`, `serializeEventEnvelope` (deterministic key-sort), `deriveIdempotencyKey`
(sha256 of source|sourceType|eventId|tenant|text). Covers all required concepts: schemaVersion,
eventId, eventType (7-term allowlist), source/sourceType/sourceVersion, tenantScope (non-empty,
no whitespace/wildcards), actor{ id/displayName/organization }, correlationId, receivedAt/occurredAt
(ISO-validated), payload{text ≤5000, organization, entities[]}, metadata (≤50 keys), attachments
manifest (≤12, ref/uri required, `data:`/inline `content|base64|bytes` rejected), location (ranged
lat/lon + label), locale{language/region}, provenance{adapter/synthetic/evidence[]}, executionMode
(LIVE|SIMULATED|PROVIDER_GATED|HUMAN_ONLY), sensitivity (default INTERNAL), idempotencyKey
(explicit or derived), extensions{} for unknown optionals. Secrets redacted via 6D `redactSecrets`
(REUSE). No binary media can persist by construction. Test mapping: A–I.

## 3. 7B result — IMPLEMENTED + PROVEN

`src/ingestion/InjectionAdapter.js`: `InjectionAdapter` base (KNOWN_SOURCE_TYPES allowlist:
TEST/WHATSAPP/USSD/TELEGRAM/APP/WEB_API/SDK/IOT/DEVICE/FUTURE; identity/version/validation/
normalization/provenance/idempotency surface; `externalCalls` tripwire — any provider attempt is
recorded AND refused with PROVIDER_REQUIRED). `TestBusinessAdapter` (SIMULATED, deterministic:
content-hashed auto eventId, provenance.synthetic=true, zero network/credentials/mutations).
`awbuliProviderStatus(env)` — presence descriptor only (`{configured, state, required[], live:false,
note}`); never connects, never stores values. Provider boundary preserved: `AWBULI_API_URL/KEY`
unconfigured; code makes live-treatment impossible (no call path exists). Test mapping: J–K.

## 4. 7C result — IMPLEMENTED + PROVEN

`src/ingestion/InjectionToCaseMapper.js`: NORMALIZED EVENT → `intake.ingest("WEBHOOK", …)` (existing
UnifiedIntakeEngine + CaseManager path, source tag `INJECTION:<adapterId>`) → durable receipt in
existing-store section `injectionReceipts` (idempotencyKey↔caseId↔eventId↔adapter↔mode↔tenant) →
`audit.log.created` (`EVENT_MAPPED_TO_CASE` / `EVENT_DUPLICATE_REPLAY_SAFE`) + `injection.case.mapped`
domain event. Idempotency: tenant-scoped key; FIRST→ACCEPTED, SAME→duplicate:true with zero new
records, NEW→ACCEPTED (all asserted). No AWBULI ledger, no parallel schema, no second case system.
Case retains provenance via source tag + receipt sidecar. Test mapping: L–O, Q.

## 5. 7D result — PROVEN (test T, 18 assertions)

Synthetic→adapter→envelope→validation→intake→case→audit→result chain green: envelope valid (1),
identity present (2), tenant preserved (3), provenance + adapter preserved (4–5), SIMULATED stamped
(6), intake received normalized structure (7), existing case path used + assessment attached (8),
receipt links event identity (9), audit evidence (10), replay controlled (11), invalid envelope/
tenant rejected (12–13), credential payload redacted (14), zero external calls + provider not live
(15), TEST-typed source — no WhatsApp path (16), no registry/trading surface (17), standard
WEBHOOK channel — no private surface (18).

## 6. Normalized event schema

See §2 field list. Schema version 1. Deterministic serialization supports hashing/comparison.
Unknown optionals via `extensions{}` (sanitized, secret-scanned). Sensitivity defaults INTERNAL.

## 7. Adapter contract

`describe()` (identity/mode/zero-network attestation) → `normalize(input)` → envelope →
`externalCallAttempt()` tripwire. Subclass per transport later by setting sourceType + mapping
fields; core untouched. Base rejects unknown source types at construction.

## 8. ADE handoff path

Adapter envelope → `InjectionToCaseMapper.map()` → `UnifiedIntakeEngine.ingest("WEBHOOK",
{organization, description, contact, kind:"BUSINESS_EVENT"}, {source:"INJECTION:<id>",
authenticated:false})` → existing classify → `CaseManager.createCase` → existing decision/
workflow/audit downstream unchanged.

## 9. Case/measurement mapping

Case per event (first-seen); `request.assessment` attached by existing classify (e.g. supplier
text → PROCUREMENT area signals); measurements/pilots flow downstream untouched. No new ledger:
receipt sidecar (`injectionReceipts`) is the only new persisted shape, and it is a link record,
not a business ledger.

## 10. Provenance model

`provenance{adapter, synthetic, evidence[]}` + `source`/`sourceType`/`eventId`/`correlationId`/
`idempotencyKey` on envelope; case `source` tag; receipt quad-link; audit payloads carry
eventId+caseId+adapter+mode+tenant. Round-trippable both directions (receiptFor lookup).

## 11. Idempotency model

Derived key (sha256) or explicit; tenant-scoped composite key; first-write-wins receipt;
replay returns prior caseId with `duplicate:true`; cross-instance durable via shared store
section (tested); no global infrastructure added.

## 12. Security model

Inherited, none parallel: tenant isolation (envelope gate + scoped receipts + `TENANT_MISMATCH`),
existing intake validation, `audit.log.created` evidence, 6D secret redaction reused, attachment
binary embargo, metadata caps, no credentials in envelope/adapter/store, protected-trading
isolation (mapper owns no registry/trading refs; asserted), public path uses unauthenticated
WEBHOOK intake only — no Founder/private invocation possible.

## 13. Provider boundary

WhatsApp: NOT LIVE, NOT CONFIGURED, NOT CONTACTED (no Baileys import, no network call, tripwire
empty in all tests). AWBULI provider: PROVIDER_REQUIRED (descriptor only). STT/OCR: NOT
IMPLEMENTED. LLM: NOT REQUIRED and untouched (lexical path only). Dead legacy Baileys/queues/
cron untouched (still dead).

## 14. WhatsApp truth status

SIMULATED test adapter only. No WhatsApp code path exists in the new chain (sourceType TEST).
Legacy `src/whatsapp/` remains dead and uninstalled (rule 6 obeyed — not revived, not removed).

## 15. Future seams (IoT/USSD/Telegram/APP/SDK/device)

Each = new `InjectionAdapter` subclass (sourceType already allowlisted) mapping its fields to
`createEventEnvelope`; zero core changes. Provider-backed ones add their descriptor + L3-gated
enablement, mirroring `awbuliProviderStatus`.

## 16. Tests

`tests/injection-envelope.test.js`: 18 tests covering batch items A–T (A valid, B no-id, C no/bad
type, D bad tenant ×2, E bad timestamp, F bad mode, G redaction, H attachments ×4, I determinism,
J normalization, K provider-uncalled + boundary, L handoff, M provenance, N replay, O new event,
P audit, Q tenant + durable receipts, R malformed, S protected isolation, T full 7D). Result:
18/18 pass.

## 17. Regression results

BASELINE (Batch 6D): 351 tests / 348 pass / 0 fail / 3 skipped. CURRENT: 369 / 366 / 0 / 3.
Delta: +18 new, all pass. NEW FAILURES: none. PRE-EXISTING FAILURES: none. Skipped unchanged.

## 18. Validate result

`npm run validate`: FULL GREEN — platform health 13/13 (100%), behavioral runtime + failure
injection + shutdown/restart passed.

## 19. Build result

`npm run build:community`: success — 1745 source files, 23,320,107 bytes, sha256
`869791b5…`, commit `6031643`, COMMUNITY edition.

## 20. Worktree verification

Tracked modified: 6 pre-existing + `package.json` (two one-line test-list additions: 6D + 7D).
`src/app.js` diff is the pre-existing 6D wiring (untouched this batch — this batch added no app
wiring by design). No deletions. No unrelated changes. Batch 6D files intact. Zero protected
trading/Forex/Binary/Gaming/identity/security/storage files in diff. No credentials added
(`AWBULI_API_URL/KEY` unconfigured; secret scan of new code: only redaction patterns). No
provider connection made (tripwire-tested). No source artifacts removed. Nothing staged/committed.

## 21. Files added

- `src/ingestion/NormalizedEventEnvelope.js` (7A)
- `src/ingestion/InjectionAdapter.js` (7B: base + TestBusinessAdapter + provider descriptor)
- `src/ingestion/InjectionToCaseMapper.js` (7C)
- `tests/injection-envelope.test.js` (7D + A–T)

## 22. Files modified

- `package.json`: test script list +1 entry (`tests/injection-envelope.test.js`).
- Pre-existing (untouched this batch): `src/app.js` (6D wiring), `public/index.html`,
  `public/admin/index.html`, `src/intelligence/UnifiedIntakeEngine.js`, `data/*.json`
  (runtime growth from test/validate runs).

## 23. Limitations

Mapper covers text-first business events; voice/image/doc/location extraction awaits providers
(S5). Tenant `"default"` receipts visible across default scope (documented shared semantics).
Case record itself carries no tenant column (pre-existing model) — isolation enforced at
envelope + receipt layers. Derived eventIds collide only on identical (text|tenant|type).
No HTTP routes added (internal seam; routes only when a proven external caller exists).

## 24. Exact next batch

Batch 8 — SINGLE PROVIDER ADAPTER (human-owned credentials only): implement one
transport-specific `InjectionAdapter` subclass (WhatsApp-first) reusing S1–S3 + envelope
validation + receipt idempotency, with `ConnectionManager.test()` verification and L3-gated
enablement. Prerequisites: named credential owner, target endpoint, verification run. Still
no multimodal, no ledger changes, no trading contact.
