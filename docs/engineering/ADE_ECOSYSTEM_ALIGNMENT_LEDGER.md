# ADE ECOSYSTEM ALIGNMENT LEDGER

Date: 2026-10-17
Baseline commit: `dfe05cd` (`main`, upstream `origin/main`)
Release commit message (locked): `feat(enterprise): complete ecosystem architecture alignment, node v24 lock, universal interactive config, PIN session persistence, and role onboarding mesh`

Evidence classes used below: **VERIFIED COMPLETE** (implemented + regression-locked),
**CODE VERIFIED / AWAITING EXTERNAL PROOF**, **REQUIRES EXTERNAL PROOF**,
**HUMAN/FOUNDER DECISION REQUIRED**.

---

## 1. Baseline inventory (pre-change, re-verified)

- Canonical runtime: `src/server.js → src/app.js → kernel master` (middleware order re-read, lines 164–619).
- Legacy surfaces confirmed UNMOUNTED (not modified, not deleted): `src/gateway/api-server.js`,
  `src/routes/admin.js`, `src/routes/whatsapp.js`.
- Canonical authorities re-confirmed: `POST /api/v1/connect/channels/configure` (L2 + durable storage,
  secrets write-only, tenant-aware, `src/app.js:1662`); `GET/PATCH /api/v1/admin/settings`
  (L2-gated, `src/app.js:2407-2408`); identity routes under `src/routes/identityRoutes.js`;
  workforce invite/accept with hashed codes + expiry in `src/identity/WorkforceManager.js` (`266`, `309`).
- Working tree carried exactly 3 runtime-data modifications (intentionally out of commit scope):
  `.ade_capability_store.json`, `data/audit_ledger.json`, `data/runtime-config/admin.json`.

## 2. Phase outcomes

| Phase | Outcome | Evidence |
|-------|---------|----------|
| 1 — Architecture alignment | **VERIFIED COMPLETE** — consumer → gateway → service → product flow unchanged; zero duplicate/competing registries, buses or gates introduced (GRAPH-4 green). | `tests/universal-surface.test.js` 9/9 |
| 2 — Product narrative | **VERIFIED COMPLETE** — hero eyebrow now "ADE — THE DIGITAL OPERATING LAYER FOR AFRICA"; 5-step operating loop (Observe / Learn / Decide / Execute / Continuously Improve) with grounded business examples (`data-testid='operating-philosophy'`); SystemExplorer with Business / Product / Operational / Architecture / Developer views (`data-testid='system-explorer'`, `sysview-*`). Test-pinned H1 "RUN YOUR BUSINESS THROUGH ADE" untouched. | `HOME-NARRATIVE-1`, `HOME-1` (all consoles parse) |
| 3 — Role / edition truth | **VERIFIED COMPLETE** — role, tier and level render from server `/api/v1/account/session` person + claims only; PIN elevation mirrors server `claims.pinVerified`; client never grants entitlements (server RBAC on execution). | `ELEV-PERSIST-1..7` 7/7; `CLIENT-AUTHORITY-1` |
| 4 — PIN hardening | **VERIFIED COMPLETE** — mirror stores only non-secret metadata (`active/method/role/level/tier/scope/subject/at`); no PIN material or bare codes stored; server-verified hydration preserves subject. | `PIN-STATE-1` (vm + fake storage) |
| 5 — Universal config + onboarding | **VERIFIED COMPLETE** — both consoles' configuration modal submits only to canonical `POST /api/v1/connect/channels/configure` with Bearer session; success renders honest amber `CONFIGURED — AWAITING VERIFICATION` (`CONFIGURED_UNVERIFIED` state); no local ACTIVE flip; metadata-only persistence. | `CLIENT-AUTHORITY-1`; suite re-run green |
| 6 — Role onboarding mesh | **VERIFIED COMPLETE** — server-side invitation claim authority (`INV-*` registry, env override `ADE_ROLE_INVITATION_CODES`, expiry `2027-12-31T23:59:59.999Z` default, tenant enforcement); `POST /api/v1/onboarding/claim` validates and returns claim only (`grantsAccess:false`, no session, no cookie); console banner stores server-validated, explicitly non-authoritative record. | `INV-CLAIM-1`, `INV-CLAIM-2`, `CLIENT-AUTHORITY-1` |
| 7 — Backend guardrails | **VERIFIED COMPLETE** — admin settings responses mask secret-shaped leaves on read AND write-echo (`maskSettingsSecrets`, `secretsMasked:true`); canonical redaction module extracted to `src/security/SettingsRedaction.js` (single implementation, no duplication with value-based `CapabilityRecord.redactSecrets`). | `SETTINGS-MASK-1` |
| 8 — UX quality | **VERIFIED COMPLETE** — console copy honest about verification state; invitation errors honest per status (400/404/410/403); config refusals name the required authority; no fabricated live claims. | `CLIENT-AUTHORITY-1`; existing `ux`/`DISCOVERY` suites green |
| 9 — Tests / build / release gates | **VERIFIED COMPLETE** — new guard suite 7/7; required acceptance suite 24/24; Node ≥ 24 locked in `package.json` engines, `.nvmrc`, and `Dockerfile` (`node:24-alpine`); community artifact rebuilt and hashed. | see §4 |
| 10 — Controlled release | **VERIFIED COMPLETE** — exact locked commit message; push executed only after all suites, artifact identity and release gates verified. | §4–§5 |

## 3. Exact files changed (commit scope)

| File | Why |
|------|-----|
| `src/identity/RoleInvitationAuthority.js` | NEW — server invitation registry + `validateRoleInvitation` (expiry, tenant, env override, fail-closed on malformed override) |
| `src/routes/identityRoutes.js` | `POST /api/v1/onboarding/claim` — validates, returns claim, never issues session/cookie |
| `src/security/SettingsRedaction.js` | NEW — canonical `maskSettingsSecrets` (key-based, depth-bounded) |
| `src/app.js` | imports + applies redaction on `GET`/`PATCH /api/v1/admin/settings`; inline copy removed |
| `public/index.html` | positioning eyebrow; 5-step operating loop; SystemExplorer; config modal v2 (server-confirmed); invitation banner v2 (server-validated); 401/403 handling kept message-only |
| `public/founder.html` | config modal v2 + invitation banner v2 (mirrors index.html); duplicate pin-state include removed |
| `public/js/ade-pin-state.js` | server-verified hydration now propagates the session subject |
| `Dockerfile` | `node:20-alpine → node:24-alpine` (deployment target aligned to engines lock) |
| `.nvmrc` | NEW — pins release Node major `24` |
| `tests/enterprise-alignment-guards.test.js` | NEW — 7 regression guards (§4) |
| `docs/engineering/ADE_ECOSYSTEM_ALIGNMENT_LEDGER.md` | this ledger |

Intentionally NOT committed (runtime state): `.ade_capability_store.json`,
`data/audit_ledger.json`, `data/runtime-config/admin.json`.

## 4. Verification evidence

| Suite | Result |
|-------|--------|
| `tests/enterprise-alignment-guards.test.js` (INV-CLAIM-1/2, SETTINGS-MASK-1, CLIENT-AUTHORITY-1, PIN-STATE-1, HOME-NARRATIVE-1, ENGINES-24-1) | **7/7 pass** |
| Required acceptance: `config-contract-reconciliation` + `product-discovery-awbuli` + `production-safety` | **24/24 pass** |
| `founder-elevation-persistence` (ELEV-PERSIST-1..7) | **7/7 pass** (ELEV-PERSIST-6 defect found and fixed: message-only 401/403 branch rewritten to `[401,403].indexOf(r.status)>-1`, no session wipe) |
| `home-surface` (HOME-1 parses all 3 consoles, HOME-2..5) | **14/14 pass** (with guards suite) |
| `universal-surface` (GRAPH-1..4, ICX-1, AWBULI-1, INVITE-1, SURFACE-1/2) | **9/9 pass** |
| `canonical-workspace` (operations, products, palette, session, shells, routes, connect, mobile) | **8/8 pass** |
| `apex-closure` (APEX-1..9) | **9/9 pass** (observed green in full-batch run) |
| `product-discovery-visibility` (DISCOVERY-1..7) | **7/7 pass** (observed green in full-batch run) |
| `ux-cohesion-overhaul` | no top-level TAP tests (export-style module, exercised via batch) |

Engines: `package.json` `engines.node = >=24.0.0`; `.nvmrc` = `24`; Dockerfile base `node:24-alpine`.
Local DEV runtime remains Node v20.20.0 → npm EBADENGINE warnings are expected locally and
do not affect the release contract (production targets Node 24).

## 5. Release gates

- [x] Invitation claims validated by trusted backend (expiry + tenant), never grant access
- [x] No authoritative role store in localStorage (`authoritative:false` recorded)
- [x] Admin settings responses contain no raw secrets (read + write-echo)
- [x] Configuration submits only via canonical channel authority; no local ACTIVE flip
- [x] PIN mirror stores no PIN material
- [x] Homepage narrative + System Explorer shipped and test-pinned
- [x] Node ≥ 24 locked across package.json / .nvmrc / Dockerfile
- [x] All regression suites above green
- [x] Community build artifact rebuilt: `dist/ade-community-edition.zip`
  — 23,122,948 bytes, sha256 `355fabc108edf089d838b54634291cb68acf7e24eb90f0871afb39be7dff0c3c`,
  2,641 source files, manifest `dist/build-manifest.json` (build committed at base `dfe05cd`);
- [x] Exact locked commit message used; push performed only after this ledger was complete

External-proof items (unchanged, not regressions): live provider delivery, PM2/deployed instance
behavior, and serverless (`api/index.js`) runtime on Node 24 are **REQUIRES EXTERNAL PROOF**.
