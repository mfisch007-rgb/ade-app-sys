# BATCH_3_CAPABILITY_EXTRACTION_REPORT.md
Batch 3 — ADE Capability Extraction + AWBULI/PROCARTA/Architecture Census
Status: READ-ONLY / EVIDENCE-FIRST / NO INTEGRATION. MODIFICATIONS_MADE=NONE (this report file is the sole created artifact).
Date (UTC): 2026-09-23. Baseline: ADE-APP-SYS working tree @ HEAD 6031643 with 6 uncommitted files (4 source + 2 runtime-data). Extraction reflects the WORKING TREE unless noted.

Evidence statuses used: CONFIRMED / LOCAL-PROVEN / END_TO_END / CONFIGURATION_REQUIRED / PARTIAL / NOT_PROVEN / BLOCKED / REFERENCE_ONLY.

---

## 1. EXECUTIVE EVIDENCE SUMMARY

- Canonical PROCARTA (`src/procarta/`) is a REAL deterministic execution engine (LOCAL-PROVEN, END_TO_END via authenticated command path). AI path is LEXICAL/DETERMINISTIC with honest UNAVAILABLE fallback — no real LLM integration is configured anywhere accessible.
- Legacy PROCARTA surfaces (`products/procarta/`, `src/plugins/ProcartaPlugin.js`, `src/plugins/procarta.plugin.js`) are disconnected stubs/simulation — CANDIDATE LEGACY, must never be merged.
- Remote ADE-PROCARTA (GitHub HEAD 7dd0b3a, single branch, no tags, 2026-04-06) is a client-only marketing/onboarding SPA (BPMN export + PDF + Paystack/Supabase key fields + webhook fan-out). No assessment engine, no AI, no backend. Its committed variant is MORE functional than the locally modified working copy.
- AWBULI: NO executable implementation proven. In-repo `products/awbuli/AwbuliEngine.js` = in-memory lead/broadcast stubs (PARTIAL). Legacy `src/whatsapp/` Baileys surface = dead (missing deps, unmounted, mismatched exports). Concept note + connector analysis = REFERENCE_ONLY/CONNECTOR_ANALYSIS. WhatsApp supplier/carton/KPI workflows: NOT_PROVEN anywhere.
- Storage: production contract = `database/supabase-production-schema.sql` (`ade_*` namespace, ~18+ tables). `ADE PROJECT WORKS` schemas (48 tables, identical twins) belong to a DIFFERENT product lineage (merchant/subscription/POS/pharmacy) — no migration link to `ade_*`. Legacy `database/schema.sql` shares that old lineage.
- enterprise-modernization-v1 CLI/gateway suite is already incorporated into main (all 10 commands + entry points present). Branch fully merged (0 unique commits). Historical/reference only.
- Working-tree caveat: 4 source files carry uncommitted prior-session repairs (feedback persistence, feature-request persistence, PROCARTA escalation/readability, intent-honesty fixes incl. pilot-queue mirror). They are LOCAL-PROVEN by e2e but NOT committed and NOT in production (prod serves 8ba45a4).

## 2. DRIVE ACCESS STATUS

DRIVE_ACCESS=BLOCKED. This environment exposes no Google Drive connector or official authorization mechanism, so no sign-in request can be presented and no Drive search was performed. The Drive IDs `ADE-PROCARETER` and `ADE-AWBULI APP-SYS` remain NOT_ACCESSIBLE (distinct from empty). All AWBULI-newness questions depending on Drive are UNKNOWN. If Drive access is granted later, search the §A.8 term list read-only; download/merge nothing without review.

## 3. SOURCE INVENTORY

| # | Project | Location / commit | Stack | Status |
|---|---|---|---|---|
| 1 | ADE canonical | `ADE-APP-SYS`, HEAD 6031643 (+6 uncommitted) | Node ESM + Express 4, jsonwebtoken, bcryptjs, dotenv; SPA `public/` | CONFIRMED current |
| 2 | ADE-PROCARTA local | `Desktop/ADE-PROCARTA`, 7dd0b3a + local App.jsx edit | React 18 + Vite 5 + Tailwind, Supabase-js, jsPDF, Paystack field, Vercel analytics | CONFIRMED sibling |
| 3 | ADE-PROCARTA remote | GitHub main 7dd0b3a, 13 commits 2026-04-04→06, no tags | same as above | CONFIRMED latest-accessible |
| 4 | ade-procarta deployment | `ade-procarta.vercel.app`, bundle `index-3xBNcysj.js` | built Vite SPA of remote lineage (bundle markers: `MISSION SUCCESS`, `Make.com`, `consultation_type`) | STRONG EVIDENCE |
| 5 | ADE PROJECT WORKS | `Desktop/ADE PROJECT WORKS/ade_database.sql` + `COMPLETE DATABASE SCHEMA v1.0` (identical, 48 tables) | SQL DDL, merchant/POS lineage | CONFIRMED reference |
| 6 | enterprise-modernization-v1 | remote ref c76b5d3 (ancestor of main) | CLI/gateway/infra | CONFIRMED merged |
| 7 | GhostBrain/BST/EVO siblings | Desktop dirs | trading bots, browser extension | NOT_RELEVANT / UNKNOWN |

## 4. PROCARTA FOUR-WAY COMPARISON

### (1) Canonical `src/procarta/ProcartaExecutionEngine.js` + `procartaCapability.js` — LOCAL-PROVEN / END_TO_END (auth path)
- Entry: `POST /api/command/execute` action `PROCARTA_EXECUTE` (rbacLevel 1), `GET /api/v1/procarta/status` (public).
- Pipeline (all in-file): `_requireInput` → `_normalize` → `UnifiedIntakeEngine.normalize` → `CaseManager.createCase/get/update` → `_runDecision` (canonical DecisionEngine w/ DEFAULT fallback) → `_runAI` (UniversalAIGateway; `AI_AUGMENTATION_UNAVAILABLE` when unconfigured) → `_deriveFindings` (SYS_INTEGRATION_SURFACE, WORKFLOW_PROCESS_FOCUS, ASSESSMENT_READY, ESCALATION_REQUIRED, DISCOVERY_REQUIRED, AI_AUGMENTATION_UNAVAILABLE) → `_recommend` (PROCESS_CASE_UPSTREAM, AUTHORIZE_PUBLIC_DISCOVERY, CONFIGURE_AI_PROVIDER) → memory/knowledge persist, `procarta.executed` + `audit.log.created` events, `PROCARTA_FOLLOW_UP` feedback, qualified pilot-queue capture (`needsDiscovery && confidence>=0.6`, `metadata.procarta=true`).
- AI classification: LEXICAL/DETERMINISTIC w/ honest degradation (AI path CONFIGURATION_REQUIRED — no provider keys anywhere accessible).
- Persistence: cases durable (`RuntimeConfigStore` → `data/runtime-config/admin.json` → Supabase adapter when configured); executions ring in-memory (200/10).
- Public intake path (`POST /api/v1/intake/API`, working tree): deterministic `UnifiedIntakeEngine.classify` assessment (observation/bottleneck/digestionDelay/wasteReasoning/risk/improvement/recommendedNextStep/confidence/evidence/humanReviewRequired, `generatedBy:DETERMINISTIC_LINGUISTIC_ANALYSIS, aiUsed:false`), case persisted, `PResult` renders all areas, escalation button links `metadata.procartaCaseId` → Community intake; qualified BUSINESS_PROCESS intakes now mirror into pilot queue (working-tree fix, LOCAL-PROVEN by e2e: `PILOT_QUEUE_HITS`, `ESCALATION_LINK=OK`).

### (2) `procartaCapability.js` — CONFIRMED wiring
- Intent `PROCARTA_EXECUTE`, `rbacLevel:1, tier:FREE`, registers handler into CapabilityRegistry (EditionPolicy COMMUNITY:LIVE, CommunityEditionGuard L1/L2). No independent logic.

### (3) Legacy `products/procarta/` + `src/plugins/*` — CANDIDATE LEGACY / NOT_PROVEN
- `products/procarta/ProcartaEngine.js`: 1-line CJS KPI stub (`trackKPI`/`getHeatmap`, in-memory Map). Manifest `PLUGGABLE_ADAPTER` v1.0.0. No ESM, no imports from app (asserted by G26 tests). No HTTP, no persistence, no auth.
- `src/plugins/ProcartaPlugin.js`: sets `Map(workflowId→RUNNING)` on `PROCARTA_TRIGGER_WORKFLOW`; no analysis, no state machine.
- `src/plugins/procarta.plugin.js` (`PROCARTA_FINANCE.executeReconciliation`): hardcoded `SIMULATED, reconciled:true`, random `PRC-XXX` hash — MOCK/DEMO by its own label.
- None is reachable from public UI, API, or capability registry. Abandon, do not merge.

### (4) Remote ADE-PROCARTA @7dd0b3a — PARTIAL (UI_ONLY + CONFIGURATION_ONLY)
- UI surfaces: landing ("Digital Enterprise Suite"/"Grand Master"), onboarding form (name/email/company → webhook POST), CEO Command Center (`AdminDashboard.jsx`: Integrations tab for Paystack/Supabase keys → browser localStorage only), sidebar variant per history.
- Real implemented: BPMN XML export (`utils/bpmnExporter.js`, IMPLEMENTED), PDF generation (`utils/pdfGenerator.js`, IMPLEMENTED), webhook fan-out (`useAutomations.js`, IMPLEMENTED), pricing/currency UI (`usePricing.js`, `CurrencyContext.jsx`, PARTIAL).
- NOT present: assessment/bottleneck/workflow-analysis logic (NOT_PROVEN — zero scoring/classification code in `src/`), AI (NOT_PROVEN), backend/APIs/Edge functions (NOT_PROVEN — none in tree), authentication (CONFIGURATION_ONLY — key fields, no auth flow), localization/i18n/region logic (NOT_PROVEN — no locale files; only a currency context), persistence beyond browser localStorage (NOT_PROVEN).
- Deployment: Vite static build; Supabase/Paystack live only if operator pastes keys (CONFIGURATION_REQUIRED).

### Reconciliation verdict
| Capability | Canonical | Capability glue | Legacy | Remote SPA |
|---|---|---|---|---|
| Real assessment engine | YES | — | NO | NO |
| Bottleneck/delay/waste/risk output | YES (deterministic) | — | NO | NO |
| Decision + findings + next actions | YES | — | NO | NO |
| Persistence (cases/intakes) | YES durable | — | NO | NO (localStorage keys only) |
| AuthN/AuthZ | YES (L1/L2) | YES | NO | NO |
| BPMN export / PDF report | NO | — | NO | YES |
| Payments / Supabase wiring | NO (truthful CONFIG_REQUIRED) | — | NO | FIELDS ONLY |
| AI | honest UNAVAILABLE | — | NO | NO |
| Executions/audit/telemetry | YES | — | NO | NO |

Stronger/newer: NOTHING newer exists accessibly; remote SPA is older (Apr 2026) and functionally disjoint (marketing + export vs engine). Unique-to-remote (BPMN/PDF export) is reusable-later material, not a replacement.

## 5. AWBULI EVIDENCE REPORT

| Artifact | Classification | Evidence |
|---|---|---|
| `products/awbuli/AwbuliEngine.js` | PARTIAL_IMPLEMENTATION | `captureLead()` (Map, stage NEW), `broadcastMessage()` (QUEUED only); 1-line CJS; no transport, no WhatsApp protocol, no durability |
| `products/awbuli/{adapter,index,manifest}.js(on)` | REFERENCE_ONLY | plumbing/manifest v1.0.0, no logic beyond engine |
| `src/whatsapp/whatsappClient.js` (Baileys socket, QR/pairing, Redis-worker reply loop, branded `ADE-Automated Business LedgerFlow` replies) | PARTIAL_IMPLEMENTATION (dead) | imports `@whiskeysockets/baileys`, `@hapi/boom`, `pino`, `qrcode-terminal` — NONE in package.json; only importer is legacy `botGuardian.js`; route file self-declares dead |
| `src/routes/whatsapp.js` (`/pair`, `/status`, `/paystack`) | NOT_PROVEN (dead-end) | header: "LEGACY / NON-CANONICAL — NOT mounted"; imports `requestPairingCode/isConnected/getSocket` which the client does NOT export |
| `src/engines/reportEngine.js` (8PM WhatsApp reports), `businessEngine.js` (pg `$1` placeholders), `MarketingAIStudio.broadcastMedia`, `MediaEngine` WHATSAPP channel | REFERENCE_ONLY (fragments, old lineage) | keyword hits, no wired path |
| `PROJECT AWBULI START.txt` (WhatsApp BI ledger: credits/debits/invoices/defaulters, close-of-day digest, KPI competitor comparison, predictive suggestions) | CONCEPT_ONLY | 60-line planning note, zero code |
| `docs/architecture/products/AWBULI-CONNECTOR-ANALYSIS.md` | CONNECTOR_ANALYSIS | in-repo native mode; env `AWBULI_API_URL/KEY` ABSENT; no external repo/deployment/DB accessible |
| Channel `WHATSAPP / AWBULI` + feature `AWBULI_MESSAGING` (COMMUNITY, `requiresExternal:true, available:false`) | CONFIGURATION_ONLY | `src/app.js:228`, feature registry |

Answers: (1) Executable locally? NO — stubs + dead legacy surface only. (2) In GitHub? NO evid
...[truncated 6154 chars]