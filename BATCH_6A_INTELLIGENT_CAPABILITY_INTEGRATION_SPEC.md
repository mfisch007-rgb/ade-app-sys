# BATCH_6A_INTELLIGENT_CAPABILITY_INTEGRATION_SPEC.md
Batch 6A — Intelligent Capability Integration: reality audit + specification.
READ-ONLY. NO IMPLEMENTATION / MERGE / DEPLOY / DELETE. Batches 3 and 4/5 FROZEN (hashes §2).
Every claim cites source file/module/route/test or is marked UNKNOWN.

## 1. Executive truth

ADE already owns ~70% of an intelligent capability-integration mechanism as REAL, tested, wired code — registry, manifest-grounded comparison, activation gating, human-approved learning promotion, sandboxed plugin execution, demo-mode execution guards, RBAC/tenant enforcement, audit/telemetry, persistent knowledge. What is genuinely MISSING is the front half: no external discovery input, no semantic understanding beyond lexical matching, no unified integration-decision selector, no persisted experience record, no computable economics. The minimum build is therefore small and precise: a discovery/normalization front-end + a decision/record core that reuses every existing authority. Nothing existing needs replacement; the dead legacy surfaces (`src/whatsapp/`, bull/redis queues, node-cron schedulers, pg-SQL engines, SIMULATED plugins) must be left dead, not revived.

## 2. Source baseline

- HEAD `6031643` (`fix(closure): …`), branch `main`, remote `origin https://github.com/mfisch007-rgb/ade-app-sys.git`, latest commit same as HEAD.
- Working tree (preserved, untouched): 6 modified-unstaged files — `data/audit_ledger.json`, `data/runtime-config/admin.json` (runtime growth), `public/admin/index.html`, `public/index.html`, `src/app.js`, `src/intelligence/UnifiedIntakeEngine.js` (uncommitted prior-session repairs). ~60+ untracked batch/backup/evidence artifacts preserved.
- Frozen reports present (untracked, never modified): `BATCH_3_CAPABILITY_EXTRACTION_REPORT.md` (git hash `bf8cba1103cd13819171fd6367be11897ffaee26`), `BATCH_4_5_CAPABILITY_MATCHING_AND_INTEGRATION_ECONOMICS.md` (`9dba7bd246e07a22f2025f2dc981a3e4271d06e3`). Hashes are evidence only.

## 3. Existing ADE intelligence substrate (audited, call-path traced)

| Subsystem | File | Owner/wiring | In → out; persist/auth/events/tests | Status |
|---|---|---|---|---|
| CapabilityRegistry | `src/core/CapabilityRegistry.js:85,115,130,187` | kernel singleton; imported `src/app.js`, engines | register/unregister/list, `persist` option, revoke/restore; `EnterpriseKernelMaster.js:129` registers `{persist:true}`; `ConnectionFabric.js:505` registers product adapters `{persist:false, sourceModule:PRODUCT:X}` | LOCAL-PROVEN (registration + persistence paths real) |
| CapabilityActivation | `src/capabilities/CapabilityActivation.js:43,50,83,98` | app singleton (`app.js:256`) w/ registry+EditionPolicy+`UniversalAIGateway.getProviderStatus()` | `assess()` → 8-state rows (AVAILABLE/ACTIVATED/CONFIGURATION_REQUIRED/PARTNER_REQUIRED/EXTERNAL_CREDENTIAL_REQUIRED/PREVIEW/OFFLINE/UNAVAILABLE); `activate()` registers only with caller-supplied real handler | LOCAL-PROVEN; tests `connectivity-fabric.test.js:107`, `product-surface-closure.test.js:15` |
| CapabilityExchange | `src/integrations/CapabilityExchange.js:51,61` | app singleton w/ ProductRegistry+registry+`ConnectionFabric.inspect()` | `compare(productId)` → productCaps (manifest+adapter/engine file evidence) + adeCaps + lexical OVERLAP + MISSING + SAFE_AUGMENTATIONS + REQUIRED_HUMAN_ACTION; never fabricates handlers | LOCAL-PROVEN; test `ecosystem-expansion.test.js:57` |
| KnowledgeEngine / DecisionEngine | `src/kernel/SupportingEngines.js:156,286` (+`memory.storeValue:87`, `knowledge.ingest:186`) | kernel subsystems | key/value memory + document ingest; decision `process/evaluate` w/ DEFAULT fallback (used `ProcartaExecutionEngine.js:218`, `EngagementOrchestrator.js:142`) | LOCAL-PROVEN. No ExperienceStore/RuleEngine/ConfidenceEngine classes exist (grep CONFIRMED absent) — analogous roles live in CapabilityActivation + deterministic classifiers |
| OracleFabric / Guardian | `src/ai/OracleFabric.js:50,78`, guardian subsystem (`EnterpriseKernelMaster`) | gateway + policy layer | provider-aware reasoning w/ lexical fallback; protection boundaries | LOCAL-PROVEN (Batch 1–2 evidence) |
| UniversalAIGateway | `src/ai/UniversalAIGateway.js:138` | singleton; `getProviderStatus()` consumed `app.js:256,830,913,1630,2165,2361` | `{configuredProviderCount:0}` in this env → lexical fallback; modalities catalog lists Whisper STT as provider-gated (`ProviderCatalog.js:31` REFERENCE_ONLY) | LOCAL-PROVEN gateway; providers CONFIGURATION_REQUIRED |
| SecurityGate / HttpSecurityBoundary | `src/security/SecurityGate.js:10` (JWT verify + `enforceLevel`, RBAC_DENIED events), `src/security/HttpSecurityBoundary.js` (`requireAuth/requireLevel`), `IdentityOnboarding.authorize` | every protected route | 401/403 + audit events; L1/L2/L3 enforcement; tenant checks (`CROSS_TENANT_BLOCKED`, app.js:2011) | LOCAL-PROVEN / END_TO_END |
| WorkforceManager | `src/identity/WorkforceManager.js` (FOUNDER:3, bcrypt, PIN `/^\d{6}$/`, invites/expiry/revocation) | identityRoutes session/elevation | person-bound credentials; Founder≠Admin PINs CONFIRMED separate | LOCAL-PROVEN / END_TO_END |
| EventBus + SSE telemetry | `src/kernel/EnterpriseEventBus.js`, `src/telemetry/TelemetryEventHub.js + TelemetrySSEGateway.js`, `GET /api/v1/events/stream`, `/metrics`, `/events/recent` | kernel/app singletons | publish/subscribe + 100-buffer + heartbeat; STREAM_CONNECTED filtered in primary surfaces | LOCAL-PROVEN |
| StorageProvider / RuntimeConfigStore | `src/storage/*`, `src/admin/RuntimeConfigStore.js` | `createStorageProvider()`; local default, Supabase when configured | sections incl. cases/feedback/featureRequests/communityIntakes; atomic writes | LOCAL-PROVEN local; Supabase CONFIGURATION_REQUIRED |
| CaseManager/StateMachine/EngagementOrchestrator | `src/intelligence/CaseManager.js`, `src/engagement/CaseStateMachine.js` (17 states), `EngagementOrchestrator.js` | intake→discovery→decision→route→execute→close | transitions + history + `transitions` API; feedback ingest closes loop | LOCAL-PROVEN / END_TO_END |
| ProductRegistry/SurfaceMatrix/ConnectionFabric | `src/products/`, `src/integrations/ConnectionFabric.js:126,187,505` | catalog + honesty + verify/test | manifest read, `inspect()`, truthful CONNECTED/CONFIGURATION_REQUIRED | LOCAL-PROVEN |
| UnifiedIntakeEngine / ProcartaExecutionEngine | `src/intelligence/`, `src/procarta/` (methods enumerated Batch 3) | public intake + auth execution | deterministic classify + findings + pilot-queue + audit | LOCAL-PROVEN / END_TO_END |
| LearningCandidates | `src/learning/LearningCandidates.js:29,41,84,123` | app singleton (feedback+registry+bus) | patterns→CANDIDATE→(identity+reason+real handler)→REGISTERED→MONITORED(3 reuses)→EXPIRED; in-memory Map (NOT persisted) | LOCAL-PROVEN logic; persistence NOT_PROVEN; test `ecosystem-expansion.test.js:70` |
| PluginRegistry / PluginSandbox | `src/kernel/PluginRegistry.js` (manual register/boot only), `src/plugins/PluginSandbox.js:8` (JSON sanitize + 3s timeout + PLUGIN_EXECUTED/ERROR events) | kernel; used by legacy finance/trading plugins; `cli/doctor.js` | isolation-light execution, no discovery, no dependency install | LOCAL-PROVEN mechanism; only legacy callers |
| DemoSafetyBoundary | `src/core/DemoSafetyBoundary.js:29,47,59` | app + DemoOrchestrator | 15 blocked action classes, 7 simulated classes, 5-min sessions, LIVE-vs-SIMULATED classification | LOCAL-PROVEN; tests `final-reconciliation.test.js:118+` |
| Queues/workers/schedulers (legacy, DEAD) | `src/queues/messageQueue.js` (bull+ioredis), `redisQueue.js`, `src/scheduler.js` + `subscriptionAutomation.js` (node-cron), pg-SQL `subscriptionEngine/securityEngine/fraudEngine/businessEngine` | none (unmounted/uninstalled) | deps ABSENT from package.json (express/bcryptjs/dotenv/jsonwebtoken only); `routes/whatsapp.js` self-declares dead; export mismatch (`requestPairingCode/isConnected/getSocket` ≠ exported `startWhatsApp`) | NOT_PROVEN / dead — must stay dead |

## 4. Capability discovery reality

EXISTS (LOCAL-PROVEN, in-repo scope only): `ConnectionFabric` manifest read (`products/:id/manifest.json:126`) + engine-file evidence scan (`CapabilityExchange.js:33-49`: adapter presence + known engine filenames + `CANONICAL:PROCARTA_EXECUTE`); `ProductRegistry` catalog; `GET /api/v1/capabilities|capability-map|product-surface|connectivity/*` listing surfaces.
ABSENT (NOT_PROVEN): every EXTERNAL stage — no OpenAPI/WSDL/swagger parsing (grep: zero hits), no endpoint/schema introspection, no repo/package/module inspection, no webhook of discovery, no DISCOVERY INPUT beyond the local `products/` directory. A CapabilityRegistry is (correctly) not discovery. Missing-stage verdict: EXTRACTION (external) ✗, NORMALIZATION (external) ✗, CAPABILITY MODEL (external) ✗; REGISTRATION ✓ (`registerCapability` + persist).

## 5. Capability understanding reality

ACTUAL: lexical intent classification (`UnifiedIntakeEngine.classify`: systems/workflows/area/signal lexicons + evidence strings + honest confidence); product-declared metadata (`manifest.json` name/version + adapter/engine file presence); activation-state derivation (policy × registry × provider status); lexical overlap matching (`CapabilityExchange.js:74-78`); provider catalog with modality labels (`ProviderCatalog.js:31` REFERENCE_ONLY for STT). These extract product/module/operation/dependency/provider/persistence/side-effect concepts ONLY where a manifest/adapter/registry row declares them.
ARCHITECTURAL INTENT (not implementation): semantic understanding of foreign code, embeddings/vectors (no vector store found), model-driven extraction (gateway has no configured provider), license-constraint reasoning, runtime-requirement inference. Verdict: PARTIAL — understanding is lexical/declarative, never semantic.

## 6. Duplication detection reality

REAL and tested: `CapabilityExchange.compare()` answers "do we already have this / overlap / missing / what can the product consume / safe next human action" over evidence-derived sets (manifest+files vs live registry intents). Adjacent: `ProductSurfaceMatrix` status derivation (prevents double-claiming readiness), `PilotGate` metadata filter, revocation/offline states. LIMITS (honest): matching is lexical-substring, not semantic — paraphrased/foreign-language equivalents will NOT match; strength comparison (stronger/weaker) is NOT computed; authority arbitration (which side stays authoritative) is a human decision surfaced as `requiredHumanAction`, not an automated verdict. Verdict: PARTIAL — sufficient for same-ecosystem dedup, insufficient for foreign-system semantic dedup.

## 7. Integration decision reality

EXISTING mechanisms (each real, none unified): `CapabilityActivation.assess/activate` (state + safe-register, closest to a REUSE/ADAPT/WRAP/INVOKE/REGISTER selector but scoped to catalogued intents); `LearningCandidates.decide` (human identity+reason+real-handler gate); `PilotGate.approveCandidate` (L2 + reason); `EngagementOrchestrator` routing (HUMAN_REVIEW sink); settings `humanApproval` threshold; `activateSubscription`-style legacy paths (dead). Each carries input→logic→authority→output→audit; persistence only via registry/audit, not as decision records. MISSING: one `IntegrationDecision` that maps (understood capability × match result × risk) → {REUSE, ADAPT, WRAP, INVOKE, MOUNT, REGISTER, KEEP_SEPARATE, PROVIDER_REQUIRED, HUMAN_REVIEW, REJECT} with persisted rationale. Verdict: PARTIAL — decide-by-human-in-the-loop exists; decide-by-policy-engine does not. Must be specified, not assumed.

## 8. Security reality

EXISTING SAFETY (all LOCAL-PROVEN): JWT/RBAC L0–L3 + persona separation (Founder≠Admin); tenant isolation (`CROSS_TENANT_BLOCKED`, per-tenant list filters); `DemoSafetyBoundary` 15 blocked classes incl. `CREDENTIAL_USAGE/SECRET_BEARING_CALL/EXTERNAL_API_MUTATION/PRODUCTION_DB_MUTATION`; `PluginSandbox` sanitize+timeout; `CapabilityActivation` never invents handlers / never bypasses credentials / never touches vendors; `LearningCandidates` APPROVAL_HANDLER_REQUIRED; humanApproval threshold; audit ledger + RBAC_DENIED/PLUGIN events; secrets server-side redaction (`ConnectionManager`); PII redaction in feedback pipeline.
MISSING SAFETY (must be built with any discovery front-end): manifest-code sandboxing beyond 3s timeout (no dependency quarantine, no static secret-scan on ingest, no egress allowlist for discovery fetches); malicious/invalid-manifest rejection tests; provenance pinning (source hash → registered artifact); destructive-change double-approval; trading/broker surface hard-exclusion list for auto paths.
REQUIRED SAFETY GATES: (1) discovery is read-only/network-egress-allowlisted; (2) no credential fields ever imported (schema-level deny); (3) REGISTER requires human identity+reason+real handler (already the LearningCandidates rule — extend to all); (4) trading/Forex/Binary/Gaming/vendor-execution intents excluded from automatic methods; (5) tenant-scoped visibility enforced at read; (6) every state transition audited. No existing control is weakened by this spec.

## 9. Analysis/execution separation

EXISTS: DISCOVER (in-repo manifests) → ANALYZE (`compare`, `assess`, classify) → PROPOSE (`missingCapabilities`, `safeAugmentations`, `requiredHumanAction`, candidate records) → AUTHORIZE (L2/identity+reason gates) → EXECUTE (registry/dispatch/case flow) → VERIFY (`inspect`, transitions API, telemetry) → RECORD (audit ledger, knowledge ingest, feedback). What is load-bearing: analysis NEVER writes — `compare`/`assess`/`deriveFromPatterns` are pure reads; writes require a separate authorized call with a real handler. The future model therefore already exists as convention + partial enforcement; the gap is making AUTHORIZE→EXECUTE a single policy-chokepoint instead of several per-surface gates. Verdict: PARTIAL-STRONG — stages exist, chokepoint unification missing.

## 10. Experience/learning reality

REAL PERSISTED: audit ledger entries, knowledge `ingest()` docs, memory `storeValue`, feedback store + pattern reports + improvement proposals (durable), community intakes, case histories. LOGGING ONLY: telemetry stream/buffer, PLUGIN_EXECUTED/ERROR events, demo stage records. NOT persisted: `LearningCandidates` records (in-memory Map — the richest decision object ADE has), `CapabilityExchange.compare()` outputs (computed per call), activation assessments, match rationales. So ADE remembers WHAT happened (audit) but not WHAT IT LEARNED (decision+why+outcome per inspected system). Verdict: PARTIAL — persist the candidate/decision/match record and the loop closes with zero new philosophy.

## 11. Tenant/product boundaries

Verified: tenant-scoped inbox/trading-comparison queries with `default`-tenant semantics; `CROSS_TENANT_BLOCKED` on send; L2-gated ops reads; partner telemetry suppression in UI + server role filtering; public intake vs operator process separation; Community→Pilot→Partner→Enterprise progression gates; Founder L3 vs Admin L2 vs legacy-Admin persona separation. Consequence for the future mechanism: discovery inputs/outputs must carry `tenantScope`; cross-tenant match reads are denied by default; external apps receive only the `consumableByProduct` safe subset (existing pattern, `CapabilityExchange.js:81`); connection never confers privilege (role derived from workforce identity, never from adapter presence). Verdict: LOCAL-PROVEN — boundaries already enforceable, must be inherited not re-derived.

## 12. ProCarta seam (no merge, no copy, evidence-only)

ADE owns: deterministic assessment + decision + findings + case persistence + pilot queue + honesty fallbacks (END_TO_END). External ProCarta owns: landing/onboarding UX, BPMN export (IMPLEMENTED), PDF reporting (IMPLEMENTED), Paystack/Supabase key-field configuration (CONFIGURATION_ONLY). Overlap: lead capture (ADE community intake ⊇ remote webhook fan-out destination-wise). Complementary: export/reporting UX could be INVOKED (e.g. render ADE findings through the remote export pattern) without touching engines. Remains external: its deployment, its keys, its onboarding copy. UNKNOWN: remembered "advanced version" — no accessible evidence; treated as NOT_PROVEN. Seam verdict: INVOKE-side reuse candidate (export adapters), KEEP_SEPARATE engines.

## 13. AWBULI seam (per-family: ADE capability → relationship)

Transport/ingestion (WhatsApp layer, chat commands, voice, images, docs, receipts/PDF, location pins, multichannel): ADE has channel label + dead Baileys legacy + metadata-only media uploads → NEW ADAPTER + EXTERNAL PROVIDER (transport), INVOKE intake once normalized. AI ingestion/extraction (event extraction, multimodal intel, OCR, STT, NLU, multilingual, correction/normalization, classification/scoring): ADE has lexical classify + evidence strings + provider-gated STT label → NEW SERVICE (behind UniversalAIGateway) or EXTERNAL PROVIDER; REUSE the confidence/evidence/humanReview contract shape. Ledger/insights/predictive/fraud/verticals (ledger, insights, predictive, fraud watch, gov/NGO/health/edu/agri, SME, POS): ADE has cases+measurements+pilots+EXPERIMENTAL fraud-watch + community types → ADAPT (cases/measurements as ledger substrate) + NEW SERVICE for scoring/prediction; POS/pharmacy lineage stays dead. Platform (dashboard, RBAC/PIN/session, audit, scheduling, queue/workers, retry, automation, offline sync, multitenant, currency, device/IP, monetization, decision support): ADE has workspaces, RBAC, audit, tenant scope, CLI, feature-incident flow → REUSE/ADAPT across the board; offline sync + device/IP = NEW ADAPTER or NOT YET PROVEN. Nothing here authorizes building; every row resolves to an existing seam.

## 14. Canonical capability object proposal (design artifact, NOT implemented)

```json
{ "capabilityId": "stable id (e.g. intent or adapter-qualified name)", "sourceSystem": "name + repo/url/path", "sourceVersion": "commit/tag/version + sourceHash", "name": "", "description": "", "category": "", "inputs": [], "outputs": [], "dependencies": [], "permissions": { "minLevel": 0, "tenantScoped": true }, "tenantScope": "default|tenant|system", "executionMode": "LOCAL_LIVE|SIMULATED|PROVIDER_GATED|HUMAN_ONLY", "providerRequirements": [], "persistenceRequirements": [], "sideEffects": [], "integrationMethod": "REUSE|ADAPT|WRAP|INVOKE|MOUNT|REGISTER|KEEP_SEPARATE", "confidence": 0.0, "evidence": [], "status": "analysis/authorization/execution state (see §15)", "owner": "engine or human role", "auditReference": "", "discoveredAt": "", "validatedAt": "" }
```

Every field maps to an existing ADE concept (intent/registry row, manifest+hash, activation state, RBAC level, tenantId, ProductSurfaceMatrix status, evidence strings, audit id). New: `sourceHash` pinning + `integrationMethod` + explicit state. Persist beside audit/cases (durable sections pattern), never inside secrets-adjacent stores.

## 15. Integration state-machine proposal (derived from ADE's own states)

Analysis: DISCOVERED → PARSED → UNDERSTOOD → MATCHED → {DUPLICATE | COMPLEMENTARY | NOVEL}. Authorization: PROPOSED → AWAITING_AUTHORIZATION → {APPROVED | REJECTED} (identity+reason mandatory, mirroring `LearningCandidates.decide`). Execution: ADAPTING → INTEGRATING → VALIDATING → {VERIFIED | FAILED}. Operational: REGISTERED → ACTIVE ⇄ SUSPENDED (revocation exists in registry). Terminal honesty: FAILED/REJECTED/EXPIRED retained, never deleted. This mirrors `CANDIDATE/APPROVED/REJECTED/REGISTERED/MONITORED/EXPIRED` + `ACTIVATION_STATES` + case-machine conventions — no invented metaphysics.

## 16. Human-in-the-loop boundary

AUTOMATIC (no human): read-only discovery/compare/assess listing; telemetry; candidate derivation. POLICY-GATED (rules + audit, human-configured threshold): LOCAL_LIVE registration of side-effect-free intents with real handlers from allowlisted in-repo adapters. ADMIN-APPROVAL (L2): product mounting, pilot promotion, announcements, workforce changes (existing). FOUNDER-APPROVAL (L3): RBAC/entitlement changes, external bridge enablement, any new persistence of customer data,trading-adjacent surface changes. HUMAN-ONLY (never automatic): source-code ingestion into runtime, external API mutation, data migration, credentials/secrets, financial/subscription changes, healthcare/government/identity data flows, trading/Forex/Binary/Gaming execution paths, destructive/irreversible operations (extends `DEMO_BLOCKED_ACTIONS` to all modes for the integration actor). No automatic permission escalation, ever.

## 17. Integration economics reality

Batch 5's REUSE/LOW/MEDIUM/NEW-ADAPTER/NEW-SERVICE/EXTERNAL/CONFIG-ONLY/NOT-JUSTIFIED/UNKNOWN classification is STATIC REPORTING, not a computable capability: no economics function, scorer, or cost model exists in source (grep CONFIRMED absent). What exists that could ground one: activation states (observation), `compare()` overlap/missing sets (evidence inputs), provider status (cost driver), humanApproval threshold (policy input), reuse counters (`recordReuse`), audit outcomes (verification). Required for computability: persisted decision/match records (§10) + a pure scoring function over (overlap, evidence strength, provider needs, risk class) → economics class + rationale, evaluated in tests before any use. Until then, Batch 5 remains a human document.

## 18. Implementation gap (exists? / real-exec? / reusable? / missing? / security / approval)

| # | Capability | Exists? | Real exec? | Reusable? | Missing | Security | Approval | Priority |
|---|---|---|---|---|---|---|---|---|
| G1 | External discovery input (repo/API/manifest ingest) | NO | NO | — | fetcher+normalizer+allowlist egress | G§8 gates 1–2 | policy-gated reads | FIRST |
| G2 | Semantic understanding (beyond lexical) | PARTIAL (lexical) | YES (lexical) | YES as fallback | provider-backed extractor or stricter declarative schema | no secret-bearing fields | automatic w/ audit | AFTER G1 |
| G3 | Unified IntegrationDecision selector | NO (fragments exist) | NO | YES fragments (Activation, Learning decide, PilotGate) | pure policy fn + persisted rationale | inherits RBAC/tenant | per §16 | WITH G1 |
| G4 | Persisted experience/decision record | NO (in-memory only) | NO | YES (candidate shape) | durable section + reuse query | tenant-scoped reads | automatic | WITH G1 |
| G5 | Computable economics scorer | NO | NO | YES inputs exist | pure fn + tests | none (read-only) | automatic | AFTER G4 |
| G6 | Manifest/code sandbox + secret-scan | PARTIAL (3s sandbox) | YES (legacy only) | YES pattern | quarantine, static scan, provenance pin | gates 1–6 | founder (new exec surfaces) | WITH G1 |
| G7 | Transport adapters (WhatsApp etc.) | NO (dead legacy) | NO | YES contract (`AWBULI_API_URL/KEY` + ConnectionManager.test) | provider + verifier | credential handling L3 | founder enablement | WHEN provider exists |
| G8 | Multimodal/AI services | NO (labels only) | NO | YES gateway shape | provider keys or local models | PII redaction extend | admin config | WHEN needed |
| G9 | State-machine enforcement | PARTIAL (conventions) | YES fragments | YES | single transition authority + tests | audit every transition | per §16 | WITH G3 |

Priorities are engineering-sequence only (G1→G3/G4/G6→G2/G5→G7/G8 as providers demand).

## 19. Minimum implementation plan (no code in this batch)

- EXISTING — KEEP: registry, activation, exchange-compare, LearningCandidates rules, sandbox, demo boundary, RBAC/tenant, audit/telemetry, intake/case/decision/knowledge/feedback loop, CLI.
- EXISTING — CONNECT: `compare()` outputs → persisted decision records; candidate records → durable section; `recordReuse` → economics inputs; `consumableByProduct` → external-facing subset policy.
- EXISTING — STRENGTHEN: sandbox (quarantine+scan+pinning); exchange matching (configurable similarity threshold + language-agnostic normalization, lexical first); registry (sourceHash + integrationMethod fields — additive only).
- NEW — BUILD: G1 discovery/normalizer, G3 decision selector, G4 record store, G5 scorer, G9 transition authority (+ §19 tests). Small, bounded, behind existing gates.
- EXTERNAL — PROVIDE: AI provider keys, WhatsApp/AWBULI bridge endpoint+key, Supabase project (all human-owned, all CONFIGURATION_REQUIRED today).
- HUMAN — CONFIGURE: approval thresholds, allowlists, tenant bindings, pilot scopes.
- Forbidden duplication restated: identity, tenants, cases, workflows, knowledge, decisions, persistence, audit, events, notifications, agents, security, operational records — all REUSED, none rebuilt. Legacy dead surfaces stay dead.

## 20. Test strategy (specified, not implemented)

Happy: known app (manifest→compare→overlap), complementary (missing→PROPOSED→APPROVED→REGISTERED→ACTIVE), reuse-of-learned-knowledge (second identical system resolves from record without re-analysis). Adversarial: unknown/malformed/malicious manifest (REJECTED, no write); missing dependency/provider (PROVIDER_REQUIRED, honest); unsafe permission request (REJECTED + audit); cross-tenant discovery attempt (denied); failed integration (FAILED + rollback to prior registry state); human rejection (REJECTED retained). Regression: duplicate capability (DUPLICATE, no second registration); conflicting capability (HUMAN_REVIEW); full chain replay (DISCOVERED→ACTIVE with every transition audited). All vectors must pass with deps unconfigured (honest CONFIGURATION_REQUIRED, never fake success).

## 21. Explicit unknowns

Drive contents (BLOCKED); remembered "advanced ProCarta/AWBULI" (NOT_PROVEN); exact provider set/cost for AI/multimodal (UNKNOWN until keys exist); production deploy cadence for new work (prod serves 8ba45a4 while main is 6031643 — deployment pipeline ownership unconfirmed); whether uncommitted working-tree repairs will be committed (human decision); scale/load characteristics of decision-record store (UNKNOWN, small by design).

## 22. Evidence index

Registry `src/core/CapabilityRegistry.js:80-187`; Activation `src/capabilities/CapabilityActivation.js:43-100`; Exchange `src/integrations/CapabilityExchange.js:33-110`; Fabric `src/integrations/ConnectionFabric.js:126,187,505`; Learning `src/learning/LearningCandidates.js:29-131`; Sandbox `src/plugins/PluginSandbox.js:8-20`; DemoBoundary `src/core/DemoSafetyBoundary.js:29-110`; SecurityGate `src/security/SecurityGate.js:10-60`; Workforce `src/identity/WorkforceManager.js` (+`identityRoutes.js`); Tenant `src/app.js:1958-2152`, `src/messaging/InboxManager.js:43-110`; Knowledge/memory `src/kernel/SupportingEngines.js:87,186`; Gateway `src/ai/UniversalAIGateway.js:138` + `ProviderCatalog.js:31`; Intake/engine `src/intelligence/UnifiedIntakeEngine.js`, `src/procarta/ProcartaExecutionEngine.js:218-449`, `procartaCapability.js`; Cases `src/intelligence/CaseManager.js`, `src/engagement/`; Events `src/kernel/EnterpriseEventBus.js`, `src/telemetry/`; Storage `src/storage/`, `src/admin/RuntimeConfigStore.js`; CLI `cli/ade.js`, `src/cli/{ade-cli,doctor,commands/*}.js`; tests `ecosystem-expansion`, `connectivity-fabric`, `product-surface-closure`, `final-reconciliation`; dead surfaces `src/whatsapp/`, `src/queues/messageQueue.js:1-2`, `src/scheduler.js:2`, `src/routes/whatsapp.js:1-9`, legacy pg engines; frozen reports (hashes §2).

## 23. Final engineering conclusion

The intelligent capability-integration mechanism is not a new system to build — it is a front half (discover/normalize/decide/record: G1+G3+G4+G5+G6+G9) mated to a back half that already exists, runs, and is tested. The spec above keeps every authority where it is, adds no duplicate engine, weakens no control, and makes the human the final authority wherever consequences exist. Batch 6B (ProCarta integration decision) can proceed on this foundation without any implementation having occurred in 6A.
