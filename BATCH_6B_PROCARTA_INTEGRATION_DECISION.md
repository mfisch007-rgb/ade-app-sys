# BATCH 6B — PROCARTA INTEGRATION DECISION

## Purpose
Read-only reconciliation of the accessible ADE ProCarta implementations against the ADE canonical ProCarta engine and public integration seam. This batch determines what should be reused, adapted, wrapped, invoked, mounted, kept separate, or marked unknown.

## HARD RULES
- NO source modification
- NO deletion
- NO merge
- NO deployment
- NO credential access or secret extraction
- Do not assume the accessible repository is the latest ProCarta version
- Do not copy a second ProCarta engine into ADE
- Treat undocumented capabilities as UNKNOWN, not implemented

## 1. ACCESSIBLE EVIDENCE
- FOUND: src/procarta
- src\procarta\procartaCapability.js
- src\procarta\ProcartaExecutionEngine.js
- FOUND: products/procarta
- products\procarta\adapter.js
- products\procarta\index.js
- products\procarta\manifest.json
- products\procarta\ProcartaEngine.js
- FOUND: plugins
- plugins\crm\CRMWorkflowPlugin.js
- FOUND: src/app.js
- FOUND: public/index.html
- MISSING: ADE-PROCARTA
- FOUND: docs
- docs\DocsEngine.js
- docs\ENTERPRISE_ARCHITECTURE_BOOK.md
- docs\FOUNDER-OPERATIONS-RUNBOOK.md
- docs\INDEX.md
- docs\architecture\ADE-BLOCK01-EXPERIENCE-FOUNDATION.md
- docs\architecture\ADE-ICX-SPEC.md
- docs\architecture\ADE-PHASE01-BASELINE.json
- docs\architecture\ADE-PHASE01-GEMINI-ENGINEERING-DIRECTIVE.md
- docs\architecture\EVENT_ARCHITECTURE.md
- docs\architecture\MASTER_ARCHITECTURAL_LOCK.md
- docs\architecture\MASTER_ARCHITECTURAL_LOCK.pre-R18-repair-20260902-135127.md
- docs\architecture\PRODUCT_ARCHITECTURE.md
- docs\architecture\SERVICES.md
- docs\architecture\SYSTEM_ARCHITECTURE.md
- docs\architecture\identity\IDENTITY.md
- docs\architecture\kernel\KERNEL.md
- docs\architecture\kernel\KERNEL_BIBLE.md
- docs\architecture\platform\PLATFORM.md
- docs\architecture\platform\PLATFORM_BIBLE.md
- docs\architecture\products\AWBULI-CONNECTOR-ANALYSIS.md
- docs\architecture\products\PRODUCTS.md
- docs\architecture\sdk\SDK_ARCHITECTURE.md
- docs\architecture\services\SERVICES.md
- docs\architecture\verticals\VERTICALS.md
- docs\contracts\ADE_MASTER_IMPLEMENTATION_CONTRACT_v1.0.txt
- docs\contracts\EVENT_CONTRACT.md
- docs\contracts\MODULE_CONTRACT.md
- docs\contracts\SERVICE_CONTRACT.md
- docs\contracts\SYSTEM_CONTRACT.md
- docs\deployment\FREE_ZERO_DEPLOYMENT.md
- docs\engineering\ADE_FOUNDER_EXTERNAL_CONFIGURATION_RUNBOOK.md
- docs\engineering\FINAL_ENTERPRISE_AUDIT.json
- docs\engineering\FINAL_ENTERPRISE_AUDIT.md
- docs\engineering\FINAL_RECONCILIATION_CHECKSUMS.json
- docs\engineering\MASTER_ENGINEERING_CTO_CONTINUATION_REPORT.md
- docs\engineering\MASTER_ENGINEERING_FINAL_INTEGRATION_CTO_GATE.md
- docs\engineering\MASTER_ENGINEERING_SPAN_A_G17-G18-G19_CHECKPOINT.md
- docs\engineering\MASTER_ENGINEERING_SPAN_B_G20-G21_CHECKPOINT.md
- docs\engineering\MASTER_ENGINEERING_SPAN_C_G22-G23_CHECKPOINT.md
- docs\engineering\MASTER_ENGINEERING_SPAN_D_FINAL_CHECKPOINT.md
- docs\engineering\MASTER_ENGINEERING_SPAN_E_G17-G21_COMPLETION_CHECKPOINT.md
- docs\engineering\SPAN_G_G26_CHECKPOINT.md
- docs\engineering\laws\ENGINEERING_LAWS.md
- docs\engineering\packs\ENGINEERING_PACK_001.md
- docs\engineering\packs\ENGINEERING_PACK_002.md
- docs\engineering\packs\PACK-001-Repository-Governance.md
- docs\engineering\packs\PACK-002-Platform-Bible.md
- docs\engineering\packs\PACK-003-Architecture.md
- docs\engineering\packs\PACK-004-AI-Workforce.md
- docs\engineering\packs\PACK-005-SDK.md
- docs\engineering\packs\PACK-006-EventOps.md
- docs\engineering\packs\PACK-007-KnowOps.md
- docs\engineering\packs\PACK-008-GrowthEngine.md
- docs\events\EVENT_CATALOG.md
- docs\governance\ADE_CONSTITUTION.md
- docs\governance\ENGINEERING_LAWS.md
- docs\governance\FOUNDER_PRINCIPLES.md
- docs\governance\PROJECT_CHARTER.md
- docs\governance\REPOSITORY_POLICY.md
- docs\governance\VISION_AND_MISSION.md
- docs\governance\constitution\ADE-CONSTITUTION.md
- docs\governance\constitution\ADE_CONSTITUTION.md
- docs\governance\decisions\ARCHITECTURE_DECISIONS.md
- docs\governance\policies\GLOBAL_POLICIES.md
- docs\governance\principles\FOUNDER_PRINCIPLES.md
- docs\governance\standards\DOCUMENT_STANDARDS.md
- docs\media\animation\MOTION_SYSTEM.md
- docs\media\brand-bible\BRAND_BIBLE.md
- docs\media\character-bible\CHARACTER_BIBLE.md
- docs\media\fonts\TYPOGRAPHY_SYSTEM.md
- docs\media\logos\LOGO_SYSTEM.md
- docs\media\product-bible\PRODUCT_BIBLE.md
- docs\media\prompts\MEDIA_PROMPTS.md
- docs\media\video-bible\VIDEO_BIBLE.md
- docs\media\videos\VIDEO_SYSTEM.md
- docs\oracle\EXTERNAL_INTELLIGENCE_OPTIONS.md
- docs\oracle\FREE_DATA_INTELLIGENCE.md
- FOUND: package.json

Evidence notes (read-only inspection this batch): `ADE-PROCARTA` is MISSING relative to repo root because it is a Desktop sibling (`C:\Users\USER\Desktop\ADE-PROCARTA`), inspected via Batch 1–2 evidence and the isolated read-only clone (still present, unmodified). Root `plugins/` contains only `crm/CRMWorkflowPlugin.js` (SDK-based lead-ingress demo: `processLeadIngress`, emits `CRM_LEAD_INGRESS`, VIP onboarding task — no PROCARTA overlap). Canonical plugin dir is `src/plugins/` (`ProcartaPlugin.js`, `procarta.plugin.js`). `docs/engineering/SPAN_G_G26_CHECKPOINT.md` is the G26 canonical-slice checkpoint.

## 2. EXTERNAL REPOSITORY HEAD
- ADE-PROCARTA remote HEAD evidence (live `git ls-remote` this batch): `7dd0b3af5906b8740f55ad5b53df56bd9158d5ab HEAD`
- Correspondence verdict: CONFIRMED — matches the Batch 2 isolated clone history (13 commits, 2026-04-04→2026-04-06, single branch, no tags) and the local checkout commit (`git log` in `Desktop/ADE-PROCARTA` shows `7dd0b3a` at top with 1 locally modified file, `src/App.jsx`, untouched by this batch). The remote HEAD is therefore the latest *accessibly* proven version; any newer version remains UNKNOWN (Drive BLOCKED, archives unextracted).

## 3. CAPABILITY RECONCILIATION

### 3a. Canonical ADE (`src/procarta/` + public seam + case flow) — all EXECUTABLE, LOCAL-PROVEN/END_TO_END
| Capability | Source/location | Inputs | Outputs | Persistence | Dependencies | ADE overlap | Decision |
|---|---|---|---|---|---|---|---|
| Deterministic assessment | `src/intelligence/UnifiedIntakeEngine.js` `classify()` via `POST /api/v1/intake/API` | kind/businessType/orgSize/useCase/description | observation, bottleneck, digestionDelay, wasteReasoning, risk, improvement, recommendedNextStep, confidence, evidence[], humanReviewRequired (`DETERMINISTIC_LINGUISTIC_ANALYSIS`, `aiUsed:false`) | Case record durable | CaseManager, EventBus | self (canonical) | REUSE |
| Full execution (decision+findings+AI-routing) | `src/procarta/ProcartaExecutionEngine.js` (`execute`, `_runDecision`, `_runAI`, `_deriveFindings`, `_recommend`) via `POST /api/command/execute` `PROCARTA_EXECUTE` (L1) | payload + context | intent/confidence/decision/findings/recommendedNextActions/ai-status | cases + memory + knowledge + audit + feedback + qualified pilot-queue capture | DecisionEngine, UniversalAIGateway, CapabilityRegistry | self (canonical) | REUSE |
| Public intake/result/escalation UX | `public/index.html` PROCARTA section + `PResult` + Community dual-write | guest form fields | structured result + case ref + linked service request (`metadata.procartaCaseId`) | communityIntakes + cases sections | intake routes | self (canonical) | REUSE |
| Pilot promotion/registry | `src/community/PilotGate.js`, `PilotRegistry.js`, L2 routes | candidate + reason | EVALUATION→PROMOTED/ARCHIVED | pilots section | CommunityProgression | self (canonical) | REUSE |

### 3b. In-repo legacy (`products/procarta/`, `src/plugins/`) — REFERENCE_ONLY / dead
| Capability | Source/location | Verdict |
|---|---|---|
| KPI tracker (`trackKPI`/`getHeatmap`, CJS, in-memory) | `products/procarta/ProcartaEngine.js` (+`adapter.js`/`index.js`/`manifest.json` v1.0.0) | REFERENCE_ONLY — unwired (G26 tests assert never imported); KEEP_SEPARATE (abandon) |
| Workflow-running flag setter | `src/plugins/ProcartaPlugin.js` (`Map`→RUNNING on event) | REFERENCE_ONLY — no analysis; KEEP_SEPARATE (abandon) |
| Simulated finance reconciliation (self-labeled `SIMULATED`, random hash) | `src/plugins/procarta.plugin.js` | REFERENCE_ONLY — mock; KEEP_SEPARATE (abandon) |
| Lead-ingress demo (no PROCARTA relation) | `plugins/crm/CRMWorkflowPlugin.js` | Out of scope; KEEP_SEPARATE |

### 3c. External ADE-PROCARTA @7dd0b3a — executable vs reference (isolated-clone + bundle evidence)
| Capability | Executable? | Inputs/outputs/persistence/deps | ADE overlap | Complementary value | Decision |
|---|---|---|---|---|---|
| Onboarding/intake form (name/email/company → webhook POST) | EXECUTABLE (client-side) | In: 3 fields. Out: webhook POST + alert. Persist: none (browser localStorage keys only). Deps: operator-supplied webhook URL | Duplicates ADE community intake functionally, without persistence/cases | None — weaker than ADE intake | KEEP_SEPARATE |
| Assessment/questionnaire | NOT implemented (no such code in `src/`) | — | — | — | UNKNOWN (none found; do not assume) |
| Operational analysis (bottleneck/workflow/AI) | NOT implemented (zero scoring/classification code) | — | — | — | UNKNOWN (none found; do not assume) |
| BPMN/workflow export (`utils/bpmnExporter.js` — real BPMN XML builder) | EXECUTABLE (pure function) | In: company object. Out: BPMN XML string. Persist: none. Deps: none | None (ADE has no BPMN export) | HIGH — only BPMN source accessible | INVOKE or ADAPT (pattern-level, no engine import) |
| PDF/report generation (`utils/pdfGenerator.js`, jsPDF dep) | EXECUTABLE | In: report data. Out: PDF download. Persist: none. Deps: jsPDF (absent from ADE package.json) | None (ADE has no PDF reporting) | HIGH — only report renderer accessible | INVOKE or ADAPT (pattern-level) |
| Supabase integration (`@supabase/supabase-js`, `leads` insert in remote App.jsx) | CONFIGURATION_ONLY (code real, inoperative without operator keys) | In: pasted URL+key. Out: `leads` row. Deps: external project + key | Overlaps ADE Supabase adapter pattern | LOW — ADE adapter already exists and is storage-generic | KEEP_SEPARATE (use ADE adapter if ever needed) |
| Make.com/webhook fan-out (`useAutomations.js`, multi-target POST) | EXECUTABLE (client-side POST) | In: URL+payload. Out: HTTP POST. Deps: operator URL | None directly (ADE has no generic outbound webhook fan-out UI) | MEDIUM as pattern | ADAPT (pattern only, server-side, allowlisted) |
| Paystack/payment wiring (key field + `charge.success` legacy route) | CONFIGURATION_ONLY / dead | Deps: PAYSTACK key (absent); `src/routes/whatsapp.js` unmounted | None live | None proven | UNKNOWN until credentials/ownership verified → KEEP_SEPARATE |
| Admin/dashboard (`AdminDashboard.jsx`, CEO Command Center, sidebar) | EXECUTABLE as UI | In: pasted keys. Out: localStorage state. Deps: none | None (marketing/keys dashboard, not ops) | LOW (UX reference at most) | KEEP_SEPARATE |
| AI/LLM processing | NOT implemented | — | ADE gateway (lexical, honest) remains authoritative | — | UNKNOWN (none found) |
| Persistence | Browser localStorage only | — | Weaker than ADE durable sections | None | KEEP_SEPARATE |
| Authentication | Key fields only, no auth flow | — | None (ADE workforce RBAC authoritative) | None | KEEP_SEPARATE |
| External API/backend services | None in tree (no server code, no Edge functions) | — | — | — | UNKNOWN (none found) |

## 4. CANONICAL ADE PROCARTA (what is already real — do not duplicate)
Assessment: deterministic linguistic classification with 9 structured areas + evidence + honest confidence + `humanReviewRequired` (`UnifiedIntakeEngine.js`). Findings/processing: decision engine with DEFAULT fallback, finding IDs (`SYS_INTEGRATION_SURFACE`, `WORKFLOW_PROCESS_FOCUS`, `ASSESSMENT_READY`, `ESCALATION_REQUIRED`, `DISCOVERY_REQUIRED`, `AI_AUGMENTATION_UNAVAILABLE`), recommended next actions, AI-augmentation only when a provider is configured (else truthful UNAVAILABLE). Case linkage: every intake creates a `CASE-YYYY-XXXX` record (status/priority/timestamps), qualified assessments auto-enter the pilot queue, escalation carries `metadata.procartaCaseId`. Persistence: durable `cases`/`communityIntakes`/`pilots`/`feedback` sections (local adapter; Supabase when configured). Auth: public intake (durable-gated) vs `PROCARTA_EXECUTE` at L1 vs pilot approve/verdict at L2. Output: `PResult` structured UX + machine-readable `{intake, case}` JSON. G26 vertical-slice tests pin this contract. No second engine is justified on any evidence.

## 5. EXTERNAL ADE-PROCARTA (summary verdict)
Executable: onboarding/intake form, BPMN export, PDF generation, webhook fan-out, keys dashboard UI. Configuration-only: Supabase insert, Paystack. Dead/absent: assessment, operational analysis, AI/LLM, persistence beyond localStorage, authentication, backend/Edge functions, external APIs. Rule applied throughout: UI/configuration/reference code was not counted as execution.

## 6. OVERLAP AND DUPLICATION TEST
| Pair | Result |
|---|---|
| External vs `src/procarta` | NO overlap (engine vs no-engine). NOT duplicates — disjoint. |
| External intake vs public PROCARTA intake + `UnifiedIntakeEngine` | FUNCTIONAL overlap, ADE strictly stronger (validation+persistence+assessment+cases). No merge; external stays separate. |
| External Supabase insert vs ADE storage adapters | PATTERN overlap only; ADE adapter is generic and durable. No merge. |
| External vs `products/procarta` (+ plugins) | Both lack engines; no meaningful overlap — two dead-ends, neither revived. |
| External dashboard vs Founder/Admin/Workspace | NO overlap (keys billboard vs operational command). Separate RBAC universes; never bridged. |
| External vs `CaseManager`/case flow | NO overlap (no cases externally). |
| Duplicate engines found | NONE that both execute (only one executable engine exists: canonical). |
| Duplicate persistence found | NONE (only ADE persists). |
| Duplicate reporting found | NONE (only external renders; only ADE analyzes — complementary, not duplicate). |

## 7. HIGH-VALUE COMPLEMENTARY SEAMS
- **BPMN export — INVOKE or ADAPT (pattern-level):** pure function (`company` → BPMN XML, zero deps beyond string building). Safe seam: ADE renders its OWN findings/case structures through this XML pattern in a future adapter; no engine, UI, or dependency imported. Requires: input-schema mapping test (ADE case → BPMN), output validation. No credential, no network, no persistence touch.
- **PDF/report generation — INVOKE or ADAPT (pattern-level):** jsPDF-based renderer. Safe seam: render ADE assessment/case evidence client- or server-side on demand. Requires: `jspdf` dependency decision (install is a LATER batch decision, not this one) + content-sanitization. No engine import.
- **Webhook fan-out — ADAPT (pattern only, server-side):** generic multi-target POST with audit + allowlist + retry is the only reusable idea; client-side open fan-out must never be copied.
- **Supabase / Make.com / Paystack wiring — verdict: KEEP_SEPARATE / UNKNOWN until credentials + production ownership are verified.** Rationale: code paths are key-gated stubs pointing at operator-owned externals; ADE already owns generic equivalents (Supabase adapter, ConnectionManager.test, theatre upload manifest). Wrapping unverified third-party endpoints would create liability without capability. Required before any change: named credential owner, target project/publishable-key scope confirmation, verification via existing `test()` path, L3 enablement record.

## 8. PUBLIC PRODUCT BOUNDARY
PUBLIC PROCARTA intake/value (guest assessment + result + linked service request) → ADE canonical engine (assessment/decision/findings, L1-gated full execute) → ADMIN/FOUNDER case handling (L2 intake/cases/pilots/inbox/audit) → EXTERNAL ProCarta deployment (physically and logically separate product; may share NOTHING except future export-render patterns). Boundaries enforced: no Founder/private trading, Forex, Binary, Gaming, broker, credential, or private-telemetry surface is reachable from any PROCARTA path (verified: PROCARTA routes carry no trading/broker handlers; RBAC levels 0/1 only; partner telemetry suppressed). External deployment must never receive ADE session tokens, workforce data, or case PII beyond what a user explicitly submits to it directly.

## 9. FINAL DECISION TABLE
| Capability | Evidence | Current owner | ADE overlap | Decision | Why | Next action |
|---|---|---|---|---|---|---|
| Deterministic assessment + findings + decision | `src/procarta/`, `UnifiedIntakeEngine.js`, G26 tests | ADE canonical | self | REUSE | Only executable engine; tested contract | None (keep) |
| Public intake→result→escalation loop | `public/index.html`, intake/case routes, e2e proof | ADE canonical | self | REUSE | END_TO_END proven | None (keep) |
| BPMN export pattern | `utils/bpmnExporter.js` @7dd0b3a | External ProCarta | none | INVOKE or ADAPT | Only BPMN source; pure function, safe seam | Later: schema-map + validation test |
| PDF report pattern | `utils/pdfGenerator.js` @7dd0b3a | External ProCarta | none | INVOKE or ADAPT | Only renderer; no analysis inside | Later: dep + sanitization decision |
| Webhook fan-out pattern | `useAutomations.js` @7dd0b3a | External ProCarta | none directly | ADAPT | Idea only; needs server-side audit/allowlist form | Later: adapter design |
| Supabase/Make/Paystack wiring | key fields + dead legacy route | External/unverified | ADE adapters exist | KEEP_SEPARATE / UNKNOWN | No credential/ownership proof | Verify owner+scope first, if ever |
| Onboarding form, keys dashboard | `App.jsx`, `AdminDashboard.jsx` @7dd0b3a | External ProCarta | ADE intake stronger | KEEP_SEPARATE | Weaker, unpersisted, separate product | None |
| KPI stub, SIMULATED plugins, lead demo | `products/procarta/`, `src/plugins/`, `plugins/crm/` | ADE legacy | none live | KEEP_SEPARATE | Dead/reference; never revive | None |
| Remembered "advanced ProCarta" | No accessible artifact | — | — | UNKNOWN | Drive BLOCKED, archives sealed | Revisit only on new evidence |

## 10. IMPLEMENTATION BOUNDARY (smallest safe path; nothing implemented here)
- Immediately reusable: everything in §9 rows 1–2 (already live; no work).
- Small adapter (later batch): BPMN-render adapter over ADE findings (input: case/assessment JSON; output: validated BPMN XML download); PDF-render adapter (same input; output: sanitized PDF). Both behind existing authz, audited, no new persistence.
- Later integration (only on proof): allowlisted server-side webhook fan-out; any credential-backed external wiring.
- Keep external: onboarding UX, keys dashboard, Supabase/Make/Paystack endpoints, entire external deployment.
- Not proven: assessment/AI/auth/backend in external ProCarta; remembered advanced version.

## 11. VERIFICATION
- `git diff --check`: clean (no whitespace errors).
- `git status --short` (non-untracked): exactly the 6 pre-existing modified files (`data/audit_ledger.json`, `data/runtime-config/admin.json`, `public/admin/index.html`, `public/index.html`, `src/app.js`, `src/intelligence/UnifiedIntakeEngine.js`) — untouched by this batch (read-only inspection only; the sole write in this batch is this new report file).
- `git diff --cached --name-only`: empty (nothing staged, nothing committed).
- Frozen reports (`BATCH_3_*`, `BATCH_4_5_*`): unmodified.
- New artifacts this batch: `BATCH_6B_PROCARTA_INTEGRATION_DECISION.md` only (scaffold created by the specified command, completed from source findings; no source file created/modified/deleted).

## FINAL RULE
Nothing was implemented in Batch 6B. This report is the decision boundary for the later implementation batch.
