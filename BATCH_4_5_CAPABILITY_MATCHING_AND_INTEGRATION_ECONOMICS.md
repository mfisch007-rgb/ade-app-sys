# BATCH_4_5_CAPABILITY_MATCHING_AND_INTEGRATION_ECONOMICS.md
Batch 4 (capability matching) + Batch 5 (integration economics). READ-ONLY / NO IMPLEMENTATION / NO MERGE.
Baseline: BATCH_3_CAPABILITY_EXTRACTION_REPORT.md (FROZEN, unmodified). ADE HEAD 6031643.
AWBULI input status: REFERENCE ARCHITECTURE / PRODUCT INTENT (Founder-supplied spec: 44 capability families). NOT implementation proof. AWBULI_BUILT=NO.

Statuses used: CONFIRMED / LOCAL-PROVEN / END_TO_END / PARTIAL / CONFIGURATION_REQUIRED / NOT_PROVEN / REFERENCE_ONLY / BLOCKED.

---

## 1. EXECUTIVE SUMMARY

- ADE already substantially owns the operating-system substrate AWBULI would need: intake→case→decision→execution→audit loop (END_TO_END), RBAC/session/PIN, tenant-scoped inbox, audit ledger, SSE telemetry, storage adapters, CLI/operator tooling (all merged), product-surface honesty matrix.
- AWBULI's genuinely new material is its outer rings: WhatsApp-native transport, multimodal extraction (OCR/STT), multilingual NLU, ledger/insight/predictive verticals, offline sync, device/IP intel. Against ADE these are E (absent) or F (provider-dependent) — no local implementation exists for any of them.
- Middle rings (commands, classification/scoring, queue/worker, retry, scheduling, RBAC, audit, dashboards, monetization rails) map A–C onto existing ADE engines: REUSE/ADAPT/INVOKE, never duplicate.
- Legacy WhatsApp/Baileys + bull/redis + node-cron + pg-SQL engine fragments inside ADE are DEAD surfaces (deps absent from package.json, routes unmounted, exports mismatched) — they are traps, not foundations. Any AWBULI transport work starts from the adapter contract (`AWBULI_API_URL/KEY`), not from `src/whatsapp/`.
- Remote ADE-PROCARTA contributes exactly two reusable UI-side capabilities (BPMN export, PDF reporting); everything else duplicates-or-lags ADE.
- Answer to the key question: YES — evidence supports AWBULI eventually becoming a capability/product layer inside ADE (intake channel + product + capability intents + tenant-scoped cases), because every load-bearing substrate already exists and is END_TO_END. What is missing is transport + intelligence providers + vertical logic, all of which attach at existing seams.

## 2. BATCH 3 BASELINE

Frozen report `BATCH_3_CAPABILITY_EXTRACTION_REPORT.md` (hash recorded at Batch 4 start; unmodified — see §BATCH_3_MODIFIED=NO trailer). Adopted facts: 4-way PROCARTA reconciliation (canonical END_TO_END; legacy dead; remote SPA UI-only); AWBULI truth (no executable implementation; `AwbuliEngine` stubs PARTIAL; concept/analysis REFERENCE_ONLY); storage reconciliation (`ade_*` production contract vs unrelated 48-table POS lineage); enterprise-modernization fully merged; 14 architectural gaps; DRIVE_ACCESS=BLOCKED.

## 3. ADE CAPABILITY INVENTORY (condensed; owners + status)

| Capability | Owner/engine | Location | Status / E2E |
|---|---|---|---|
| Business intake + classification | UnifiedIntakeEngine | `src/intelligence/` | LOCAL-PROVEN / END_TO_END (public form→assess→case→result→escalation) |
| Assessment execution | ProcartaExecutionEngine + procartaCapability | `src/procarta/` | LOCAL-PROVEN / END_TO_END (auth `PROCARTA_EXECUTE`) |
| Case lifecycle (17-state machine) | CaseManager + CaseStateMachine + EngagementOrchestrator | `src/intelligence/`, `src/engagement/` | LOCAL-PROVEN / END_TO_END (process/execute/feedback/close) |
| Pilot gate/registry; partner catalog/registry | PilotGate/PilotRegistry/PartnerRegistry | `src/community/`, `src/integrations/` | LOCAL-PROVEN / END_TO_END (L2 approve/verdict) |
| Community progression/intakes | CommunityProgression | `src/community/` | LOCAL-PROVEN / END_TO_END |
| Knowledge/Decision + Oracle/Gateway + Guardian | SupportingEngines, OracleFabric, UniversalAIGateway, guardian subsystem | `src/kernel/`, `src/ai/` | LOCAL-PROVEN; AI = deterministic/lexical, providers CONFIGURATION_REQUIRED |
| RBAC/session/PIN/recovery/invites | WorkforceManager + identityRoutes + HttpSecurityBoundary + CommunityEditionGuard | `src/identity/`, `src/routes/`, `src/security/` | LOCAL-PROVEN / END_TO_END (L1/L2/L3; Founder≠Admin PINs, CONFIRMED separate) |
| Tenant-scoped inbox messaging | InboxManager | `src/messaging/` + app routes | LOCAL-PROVEN / END_TO_END (CROSS_TENANT_BLOCKED) |
| Audit ledger | AuditStore/ledger | `src/storage/`, `data/` | LOCAL-PROVEN |
| Telemetry SSE/metrics/recent | TelemetryEventHub/SSEGateway, `/events/stream`, `/metrics` | `src/telemetry/`, app routes | LOCAL-PROVEN (STREAM_CONNECTED filtered in primary surfaces) |
| Storage (local + Supabase) | StorageProvider/LocalDoc/Supabase adapters, RuntimeConfigStore | `src/storage/`, `src/admin/` | LOCAL-PROVEN local; Supabase CONFIGURATION_REQUIRED in prod |
| Feature feedback w/ persistence | FeedbackIntelligence (+kernel FeedbackPipeline) | `src/feedback/` | LOCAL-PROVEN (working-tree fix) |
| Service/feature requests | `POST/GET /features/requests` | `src/app.js` | LOCAL-PROVEN (working-tree fix) / PARTIAL e2e (auth e2e pending) |
| Product honesty matrix | ProductSurfaceMatrix + ProductRegistry + ConnectionFabric | `src/products/`, `src/integrations/` | LOCAL-PROVEN (prod-verified labels) |
| Trading (Forex/Binary/Gaming paper + guards) | FounderSignalEngine, VenueRegistry, entitlements/modes/comparisons | `src/trading/` | LOCAL-PROVEN paper; live CONFIGURATION_REQUIRED; reg
...[truncated 13571 chars]