# BATCH 6C — AWBULI INTEGRATION DECISION

## Purpose
Read-only reconciliation of the AWBULI product architecture/specification against the actually accessible ADE implementation. Determine what is real, what ADE can reuse, what requires an adapter/service, what remains external, and what is not proven.

## HARD RULES
- NO source modification
- NO deletion
- NO merge
- NO deployment
- NO credential extraction
- AWBULI architecture/specification is intent, not proof of implementation
- Do not treat a filename, manifest, comment, or documentation statement as executable capability
- Do not revive dead WhatsApp/Baileys/legacy systems merely because they exist
- Do not duplicate ADE core systems
- Mark inaccessible, conceptual, or unverified capabilities UNKNOWN

## 1. ACCESSIBLE EVIDENCE
- FOUND: products/awbuli
-   products\awbuli\adapter.js
-   products\awbuli\AwbuliEngine.js
-   products\awbuli\index.js
-   products\awbuli\manifest.json
- FOUND: src/whatsapp
-   src\whatsapp\whatsappClient.js
- FOUND: src/routes/whatsapp.js
- FOUND: docs/architecture/products/AWBULI-CONNECTOR-ANALYSIS.md
- MISSING: PROJECT AWBULI START.txt
- FOUND: src/intelligence
-   src\intelligence\CaseManager.js
-   src\intelligence\PublicDiscovery.js
-   src\intelligence\UnifiedIntakeEngine.js
- FOUND: src/procarta
-   src\procarta\procartaCapability.js
-   src\procarta\ProcartaExecutionEngine.js
- FOUND: src/security
-   src\security\AffiliateLockGuard.js
-   src\security\CommunityEditionGuard.js
-   src\security\CredentialLifecycleStore.js
-   src\security\ExtensionSandboxGuard.js
-   src\security\HttpSecurityBoundary.js
-   src\security\KeyManager.js
-   src\security\LicensingMiddleware.js
-   src\security\MasterAdminLicenseControl.js
-   src\security\PreDeploymentAuditProbe.js
-   src\security\RateLimiter.js
-   src\security\SecurityGate.js
-   src\security\SecurityGateway.js
- MISSING: src/workforce
- FOUND: src/storage
-   src\storage\AuditStore.js
-   src\storage\DocumentStorageProvider.js
-   src\storage\LocalDocumentStorageAdapter.js
-   src\storage\LocalStorageAdapter.js
-   src\storage\ProviderDocumentStorageAdapter.js
-   src\storage\SupabaseStorageAdapter.js
- FOUND: src/events
-   src\events\EventSchemaRegistry.js
- FOUND: src/capabilities
-   src\capabilities\CapabilityActivation.js
- MISSING: src/cases
- FOUND: src/app.js
- FOUND: package.json

Evidence-location notes (read-only): `PROJECT AWBULI START.txt` is MISSING relative to repo root because it lives at Desktop root (`C:\Users\USER\Desktop\PROJECT AWBULI START.txt`, 60-line concept note, Batch 1 evidence — untouched). Workforce implementation lives at `src/identity/WorkforceManager.js` (not `src/workforce/`); cases live at `src/intelligence/CaseManager.js` + `src/engagement/` (not `src/cases/`). Additional surfaces found during inspection: `src/core/EventSchemaRegistry.js` (duplicate of `src/events/` variant), `src/security/SecurityGateway.js` (JWT/role gate alongside `SecurityGate.js`), `src/extensions/BinaryBrokerConnector.js` (uses `ExtensionSandboxGuard`).

## 2. AWBULI CAPABILITY RECONCILIATION

Per-capability record format: Evidence/source · Executable vs reference vs conceptual · Current ADE implementation · Inputs/outputs · Persistence · Dependencies · Security/tenant implications · Overlap · Missing · Decision. Classifications ONLY: REUSE | ADAPT | WRAP | INVOKE | MOUNT | KEEP_SEPARATE | NEW_SERVICE | PROVIDER_REQUIRED | UNKNOWN.

### A. WhatsApp / transport / channel ingestion
- **WhatsApp Business transport** — Evidence: `src/whatsapp/whatsappClient.js` (Baileys socket, QR/pairing, Redis-worker reply loop) + `src/routes/whatsapp.js` (self-declares "LEGACY / NON-CANONICAL — NOT mounted") + `products/awbuli/` stubs + connector analysis (env ABSENT). Executable vs reference: DEAD legacy (deps `@whiskeysockets/baileys`, `@hapi/boom`, `pino`, `qrcode-terminal`, `bull`, `ioredis`, `node-cron` ALL absent from `package.json`; route unmounted; export mismatch `requestPairingCode/isConnected/getSocket` vs exported `startWhatsApp`). ADE now: channel label `WHATSAPP / AWBULI` + `AWBULI_MESSAGING` (blocked, `requiresExternal:true`) + `ConnectionManager.test()` verifier. In: phone/message; Out: none live. Persist: none. Deps: provider endpoint + key (absent). Security: outbound messaging is a `DEMO_BLOCKED_ACTIONS` class (`MESSAGING_SEND_OUTBOUND`); live send needs L3 enablement. Overlap: label only. Missing: entire transport. Decision: **NEW_SERVICE + PROVIDER_REQUIRED** (adapter behind `AWBULI_API_URL/KEY` contract; legacy stays dead).
- **Structured chat ingestion (text commands)** — Evidence: concept note (`CLOSE-DAY`, `BALANCE` commands) + `UnifiedIntakeEngine.classify` (text→structure). Conceptual except ADE lexical classify (LOCAL-PROVEN). ADE: intake text pipeline. Decision: **ADAPT** (intake as normalization target) + **UNKNOWN** for command grammar (no command parser exists).
- **Voice notes / images / documents-PDFs / location pins** — Evidence: none (no STT/OCR/geo code; `MediaEngine` holds upload METADATA only, "binary content held by uploader"). UNKNOWN across all four. ADE: metadata-manifest pattern (ADAPT-able envelope). Decision: **NEW_SERVICE + PROVIDER_REQUIRED** (STT/OCR/geo providers) or **UNKNOWN** if Drive holds more.
- **Future SMS/Telegram/Email/web/POS/banking/IoT channels** — Evidence: channel registry rows (WEB/EMAIL/WHATSAPP/TELEGRAM/API/WEBHOOK/PARTNER/CRM/MARKETPLACE/PROCUREMENT/HUMAN, `src/app.js:228`) + `MediaEngine` THEATRE_CHANNELS. Reference/registry-level only; no per-channel transports proven. Decision: **ADAPT** (registry pattern) with each transport **PROVIDER_REQUIRED** when activated.

### B. Intelligence / normalization
- **Extraction / correction-normalization / classification / validation / categorization-tagging / scoring / entity-linking** — Evidence: `UnifiedIntakeEngine.classify` (area/systems/signal lexicons, evidence strings, honest confidence, `humanReviewRequired`) — EXECUTABLE, LOCAL-PROVEN. ADE owner: intake + PROCARTA findings. In: free text; Out: structured assessment. Persist: case records. No PII-secrets risk (pipeline redacts). Overlap: this IS the normalization layer AWBULI describes. Missing: entity linking, multilingual models, score calibration beyond heuristics. Decision: **REUSE** (lexical core) with scoring/entity work as **NEW_SERVICE** later.
- **Multilingual processing** — Evidence: `src/parsers/languageDetector.js` (amount formatting ₦/$, geolocation fallback attempt — legacy POS lineage, PARTIAL). No locale packs, no i18n framework. Decision: **NEW_SERVICE + PROVIDER_REQUIRED**, current fragment **KEEP_SEPARATE** (do not promote legacy parser).
- **OCR/STT/LLM/multimodal** — Evidence: `ProviderCatalog.js:31` modality label ("when keyed"); gateway `configuredProviderCount:0`. REFERENCE_ONLY. Decision: **PROVIDER_REQUIRED** (+ **NEW_SERVICE** thin routing behind `UniversalAIGateway`).

### C. Unified operational ledger
- **Every interaction → structured record; sales/expenses/inventory/debt; supplier/PO/delivery; payroll/incident/compliance; NGO/edu/health/agri records** — Evidence: cases (17-state machine + history), `ade_business_measurements`, pilots, partners, community intakes, feedback, audit — all EXECUTABLE and durable. Vertical schemas (sales ledger, supplier PO, payroll, NGO verticals): NOT_PROVEN (PROJECT WORKS 48-table POS schema is a DIFFERENT lineage, no migration link). ADE owner: CaseManager/EngagementOrchestrator + measurements. In: intake/events; Out: transitioned records. Persist: durable sections. Tenant-scoped. Overlap: ledger-as-cases/measures substantially covers the pattern. Missing: vertical table shapes + posting rules. Decision: **ADAPT** (cases/measurements as ledger substrate; verticals as additive record types later, never a second ledger).

### D. Analytics / intelligence
- **KPI/operational insights** — Evidence: `/metrics`, attention stats, measurements `avgImprovement`, progression stats — EXECUTABLE aggregates. Decision: **REUSE**, extend via **ADAPT**.
- **Late-payment / stockout risk, anomaly detection, cashflow prediction, debt recovery, health scoring, predictive recommendations** — Evidence: none (no scoring/prediction code; `fraud-watch`/`biz-watch` are EXPERIMENTAL/FUTURE surface labels). UNKNOWN/conceptual. Decision: **NEW_SERVICE** genuinely required (scoring models + calibration data), behind decision/human gates.

### E. Fraud / governance
- **Duplicate invoices, ghost workers, expense manipulation, diversion, POS/procurement/payroll anomalies, behavioral/location/time/transaction anomalies** — Evidence: legacy pg-SQL `fraudEngine/securityEngine` fragments (dead lineage), `fraud_alerts` admin query, `fraudCheck` cron (dep absent), `fraud-watch` EXPERIMENTAL. No live detection proven. Decision: **NEW_SERVICE** (rules/scoring over ledger data) when justified; legacy fragments **KEEP_SEPARATE** (never revive). RBAC-gated viewing already exists (`can_view_fraud_alerts`).

### F. Platform / enterprise substrate
- **RBAC / tenant isolation / audit / credential handling / PIN-password-session** — EXECUTABLE, LOCAL-PROVEN/END_TO_END (`SecurityGate`, `HttpSecurityBoundary`, `SecurityGateway`, `WorkforceManager`, `CredentialLifecycleStore`, `KeyManager`, tenant-scoped inbox/trading queries, `CROSS_TENANT_BLOCKED`, audit ledger). Decision: **REUSE** (authoritative; AWBULI must not duplicate).
- **Encrypted/durable storage** — EXECUTABLE local; Supabase CONFIGURATION_REQUIRED. Decision: **REUSE**.
- **MFA** — Evidence: none found (recovery codes + step-up PIN exist; no TOTP/second-factor). Decision: **UNKNOWN** (assume absent; verify before claiming).
- **Scheduling/reminders/escalation** — Pattern EXECUTABLE via case `nextAction`/history + attention queue; `node-cron` schedulers dead (dep absent). Decision: **ADAPT** (orchestrator-native scheduling, not cron revival).
- **Offline/low-bandwidth** — Evidence: lexical offline fallback + local-first storage only; no outbox/sync protocol found. Decision: **NEW_SERVICE** if required, else **UNKNOWN** scope.
- **Device/IP intelligence** — Evidence: none (refusal-of-fingerprint-evasion posture in trading registry). Decision: **UNKNOWN** + policy caution (privacy posture suggests deliberate absence).
- **Multi-tenant/currency** — TenantId plumbing EXECUTABLE across inbox/trading/cases; currency only as legacy `₦` formatting + remote currency-context UI. Decision: **REUSE** (tenancy) + **ADAPT** (currency formatting per tenant locale later).

## 3. INTEGRATION CLASSIFICATION (applied above; counts)
REUSE 8 (classify-core, gateway-shape, cases/ledger substrate, metrics aggregates, RBAC/tenant/audit/creds/PIN-session, durable storage, tenancy, channel-registry pattern) · ADAPT 7 (command grammar target, media envelope, scoring/entities later-shape, vertical record types, aggregates extension, orchestrator scheduling, currency locale) · WRAP 0 (no external capability exists to wrap) · INVOKE 0 (nothing live externally) · MOUNT 0 (nothing proven to mount) · KEEP_SEPARATE 6 (dead Baileys/queues/cron/pg-fraud/legacy parsers, POS schema, remote keys dashboards) · NEW_SERVICE 9 (transport adapter impl, voice/image/doc/location ingestion, multilingual, OCR/STT routing, predictive/risk scoring, fraud detection, offline sync, vertical posting rules) · PROVIDER_REQUIRED 7 (transport endpoint+key, STT, OCR, LLM, geo, Supabase project, any messaging sender identity) · UNKNOWN 6 (MFA, device/IP, Drive-held AWBULI, remembered advanced builds, command-grammar completeness, scale characteristics).

## 4. CURRENT AWBULI REALITY (checklist verdicts — no inference from docs)
- `products/awbuli/AwbuliEngine.js`: IMPLEMENTED-AS-STUB (PARTIAL) — `captureLead()` Map/NEW + `broadcastMessage()` QUEUED-only; no transport, no WhatsApp protocol, no durability.
- Adapter/manifest/index files: PLUMBING ONLY (manifest v1.0.0, no logic).
- Legacy `src/whatsapp` implementation: EXISTS BUT DEAD (missing deps, single legacy importer, export mismatch) — must stay dead.
- WhatsApp routes and mounting: NOT mounted (file self-declares dead); no canonical `/api/whatsapp/*`.
- Durable ledger: ABSENT (Map-only; durable home would be ADE cases/sections, not AwbuliEngine).
- Multimodal ingestion: ABSENT.
- AI/LLM provider integration: ABSENT (gateway at zero providers).
- Analytics/prediction/fraud engine: ABSENT (labels + dead fragments only).
- Worker/queue architecture: ABSENT live (bull/redis files exist, deps absent, unimported by runtime).
- Offline synchronization: ABSENT (no protocol).
- Multilingual intelligence: ABSENT (legacy amount-formatter fragment only).

## 5. ADE SUBSTRATE MATCH (what AWBULI genuinely adds vs renames)
REUSED-as-is: `UnifiedIntakeEngine` (normalization target), `ProcartaExecutionEngine` (analysis), `KnowledgeEngine`/`DecisionEngine` (structure/decide), `UniversalAIGateway/Oracle/Guardian` (provider seam + protection), `CapabilityRegistry/Activation/Exchange` (register/gate/compare), `CaseManager`/state machine (ledger + lifecycle), EventBus/SSE (event fabric + telemetry), StorageProvider/sections (durability), SecurityGate/RBAC/tenant isolation (authority), `WorkforceManager` (identity/PIN), feedback/learning (improvement loop), ProductRegistry/SurfaceMatrix/ConnectionFabric (honest product posture). GENUINELY NEW from AWBULI: transport + multimodal extraction + multilingual NLU + vertical posting/scoring rules + offline sync + (possibly) device/IP context. Everything else in the AWBULI spec renames ADE-owned substrate — adopt the names at most, never the machinery.

## 6. AWBULI → ADE TARGET ARCHITECTURE (decision map, not implementation)
Transport (WhatsApp/provider) → NEW adapter behind `AWBULI_API_URL/KEY` contract + `ConnectionManager.test()` verify (L3 enablement) · message/document/media → normalized envelope (ADAPT media-manifest pattern; binary stays with uploader; envelope schema-validated via `EventSchemaRegistry` pattern) · normalization/extraction → `UnifiedIntakeEngine` lexical core now, provider-backed multimodal later (gateway-routed) · business event → case/ledger record (ADAPT cases/measurements; no second ledger) · analysis → PROCARTA/decision/knowledge substrate (REUSE) · prediction/fraud → NEW specialized capability only where absent (gated, calibrated) · workflow/action → EngagementOrchestrator + EventBus (REUSE; cron/queue legacy stays dead) · audit/security → ADE authoritative substrate (REUSE; sandbox guards `PluginSandbox`/`ExtensionSandboxGuard` + demo-boundary blocked classes) · tenant/product surface → product registration + L0/L1/L2 boundaries (REUSE; Community gets intake/results/consented follow-up only).

## 7. PROTECTED BOUNDARIES (confirmed)
AWBULI integration must not absorb or expose: Trading, Forex, Binary Regular, Binary OTC, Gaming, broker/provider execution credentials, Founder private operational intelligence. Verified enforceable: PROCARTA/AWBULI-labeled routes carry no trading/broker handlers; trading surfaces sit behind L2 + entitlements + `BROKER_NOT_CONFIGURED`/`PAPER_ONLY` guards; secrets redacted server-side; tenant isolation at query + send layers. Any future connector passes `requireAuth/requireLevel`, tenant checks, activation gating, and audit — no exceptions, no parallel auth.

## 8. PRIORITY SEAMS (minimum safe path, grouped)
S1 (transport-neutral ingestion contract — ADAPT intake + envelope validation): SMALL · S2 (WhatsApp/provider adapter boundary — contract + verifier, no legacy revival): SMALL contract / LARGE with provider · S3 (normalized message/business-event envelope — schema registry pattern): SMALL · S4 (durable ledger mapping onto cases/measurements): MODERATE · S5 (multimodal provider seam behind gateway): MODERATE (+provider) · S6 (analytics/prediction seam — scoring over ledger data): LARGE (needs calibration data) · S7 (fraud/governance seam — rules over ledger + RBAC viewing): LARGE. Grouped path: S1+S3 (contract) → S2 (one provider) → S4 (ledger) → S5 (modalities) → S6+S7 (intelligence). No separate projects; one adapter family, one envelope, one ledger.

## 9. FINAL DECISION TABLE
| AWBULI capability | Evidence | Current ADE owner | Overlap | Decision | Why | Later action |
|---|---|---|---|---|---|---|
| WhatsApp transport | dead Baileys + stubs, env absent | — (label only) | none live | NEW_SERVICE + PROVIDER_REQUIRED | No live transport exists | Adapter contract + provider + L3 enablement |
| Structured chat ingestion | concept note + lexical classify | UnifiedIntakeEngine | substantial | ADAPT | Real normalizer exists | Command-grammar spec later |
| Voice/images/docs/location | none | media-manifest pattern | envelope only | NEW_SERVICE + PROVIDER_REQUIRED | No extraction code | Provider seam (S5) |
| Future channels | registry rows | channel registry | pattern | ADAPT | Registry real, transports not | Per-channel provider |
| Extraction→scoring core | lexical classify + findings | Intake/PROCARTA | substantial | REUSE | Proven + tested | Extend entities/scores later |
| Multilingual/OCR/STT/LLM | labels only, 0 providers | Gateway shape | seam only | PROVIDER_REQUIRED | No models/keys | Keys or local models |
| Unified ledger + verticals | cases/measures durable; verticals absent | CaseManager/Orchestrator | pattern+substrate | ADAPT | No second ledger ever | Additive record types |
| KPI insights | metrics/attention/measurements | ADE aggregates | substantial | REUSE | Live aggregates | Extend measures |
| Risk/prediction/recommendations | none | — | none | NEW_SERVICE | No scoring code/data | Models + calibration |
| Fraud/governance | dead fragments + EXPERIMENTAL label | RBAC viewing only | viewing | NEW_SERVICE | No detection live | Rules over ledger |
| RBAC/tenant/audit/creds/session/storage | live + tested | SecurityGate/Workforce/Stores | full | REUSE | Authoritative, tested | None — inherit |
| MFA | none found | recovery+step-up only | partial | UNKNOWN | Unverified | Verify before claim |
| Scheduling/reminders | attention/nextAction live; cron dead | Orchestrator | pattern | ADAPT | Native over cron | Orchestrator-native |
| Offline sync / device-IP | none / refused posture | — | none | NEW_SERVICE / UNKNOWN | No protocol; privacy posture | Scope + policy first |
| Tenancy/currency | tenantId live; currency legacy-fragment | Inbox/trading/cases | tenancy full | REUSE / ADAPT | Tenancy proven | Locale formatting later |

## 10. IMPLEMENTATION BOUNDARY
- Already real in ADE: lexical normalization, assessment/decision/findings, cases/ledger substrate, metrics aggregates, RBAC/tenant/audit/credential/session/storage substrate, channel registry, product honesty posture, CLI/operator tooling.
- Small adapter/extension: ingestion contract + envelope validation, provider adapter boundary, vertical record types, orchestrator-native scheduling, currency locale, command grammar.
- New service genuinely required: transport implementation, multimodal extraction, multilingual NLU, risk/prediction scoring, fraud detection, offline sync.
- External provider required: WhatsApp/transport endpoint + key, STT, OCR, LLM, geo, Supabase project, sender identity — all human-owned, all absent today.
- Keep separate: dead Baileys/queues/cron/pg-fraud/legacy parsers, POS-lineage schema, remote keys dashboards, unverified third-party endpoints.
- UNKNOWN / needs evidence: MFA, device/IP, Drive-held AWBULI, remembered advanced builds, command-grammar completeness, ledger scale characteristics.

## 11. VERIFICATION
- `git diff --check`: clean (no whitespace errors).
- `git status --short` (tracked): exactly the 6 pre-existing modified files (`data/audit_ledger.json`, `data/runtime-config/admin.json`, `public/admin/index.html`, `public/index.html`, `src/app.js`, `src/intelligence/UnifiedIntakeEngine.js`) — none touched by this batch; inspection was read-only throughout, including the three header peeks in this batch (`ExtensionSandboxGuard.js`, `EventSchemaRegistry.js`, `PublicDiscovery.js`) plus caller tracing.
- `git diff --cached --name-only`: empty (nothing staged, nothing committed).
- Frozen reports (`BATCH_3_*`, `BATCH_4_5_*`, `BATCH_6A_*`, `BATCH_6B_*`): unmodified.
- New artifacts this batch: `BATCH_6C_AWBULI_INTEGRATION_DECISION.md` only (scaffold created by the specified command, completed from source findings; no source file created/modified/deleted).

## FINAL RULE
Batch 6C produces the AWBULI decision boundary only. No implementation is permitted in this batch.
