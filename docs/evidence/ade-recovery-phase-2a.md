# ADE Recovery — Phase 2A Evidence (Live Reproduction & Root-Cause Confirmation)

Date: 2026-10-13 (UTC). Diagnostic phase only. No broad redesign, no auth/session
contract changes. No commit/push/merge/deploy, no prod env changes, no provider
provisioning, no production writes of any kind (all production access was
read-only GET).

Base: `docs/evidence/ade-recovery-phase-1.md` (intact, not overwritten).

## 0. Preservation check

- Branch `enterprise/product-experience-redesign`, HEAD still `e5b77f0`.
- Tracked modifications: same 12 files as Phase 1 (no tracked file edited in 2A).
  `data/audit_ledger.json` / `data/runtime-config/admin.json` diffs grew only via
  audit appends from the test runs below — preserved, never cleared.
- Phase 1 report + both Phase 1 logs verified present before starting.
- No reset/clean/restore/overwrite/delete performed.

## A. Deployment parity — CONFIRMED MISMATCH (not UNVERIFIED)

Reliable deployment metadata exists: `GET /api/v1/health` reports
`build.commit` from `VERCEL_GIT_COMMIT_SHA` (`src/app.js:1088-1092`).

- Production (`https://ade-apex-community.vercel.app`, URL from
  `ADE_FINAL_HOMEPAGE_RELEASE.ps1` / `ADE_HOMEPAGE_UI_RELEASE.ps1`):
  `build.commit = 046f29a3116a8fde79e5a85674061e54eb0b5a1d`
  (`docs/evidence/ade-phase2a-prod-health.json`, HTTP 200, kernel HEALTHY,
  11 subsystems, cold-start uptime 5s, AI unconfigured).
- Local: HEAD `e5b77f0`, i.e. **two commits ahead** of production
  (`046f29a` → `184f766` → `e5b77f0`) **plus** all uncommitted worktree changes.
- Serving path is identical in both environments: Vercel rewrites everything to
  `api/index.js`, which forwards to the same Express `app` from `src/app.js`
  (verified `api/index.js:1-13`). So the ONLY production-vs-worktree delta is
  the built commit + uncommitted changes — no separate frontend build to suspect.
- Consequence: production `/founder` (147,220 bytes, 1442 lines,
  `ade-phase2a-prod-founder.html`) predates the worktree `/founder`
  (1529 lines; local serve 150,950 bytes, `ade-phase2a-local-founder.html`).
  It lacks: `ade-design-system.css` link, `AWBULI` tab, `PRODUCT VISIBILITY`
  card, `product-surface` fetch, and — critically — the two paren fixes below.
- Stale local metadata is NOT deployment evidence: `ADE-GIT-RELEASE-EVIDENCE/`
  records `main @ 181c539` (2026-08/09 era); `ADE_FINAL_TRUTH_GATE.json` is
  2026-08-17. Vercel CLI is installed but no token is configured, so no
  deployment-list query was attempted (would need interactive login).

## B. Founder — ROOT CAUSE CONFIRMED (blank `/founder`)

**Confirmed:** the deployed `/founder` inline React script has a fatal
JavaScript syntax error, so `ReactDOM.createRoot(...).render(h(App))` never
executes and the page stays an empty dark-blue shell (`body` bg `#07111f`,
empty `#root`). This matches the reported symptom exactly and fires on EVERY
load regardless of session, tab, or role.

Evidence chain (all files in `docs/evidence/`):

1. `ade-phase2a-prod-founder-inline.js` (extracted from production HTML) →
   `node --check` FAILS: `SyntaxError` surfacing at line 1210
   (`TELEMETRY` card line — the parser choke point, not the bug site).
2. `ade-phase2a-worktree-founder-inline.js` (same extraction from
   `public/founder.html`) → `node --check` PASSES.
3. Programmatic brace/paren count on the `Refresh live feeds` line:
   prod `( 10 ) 11` (one extra `)`), worktree `( 10 ) 10` (balanced).
4. Bisection with `node --check`:
   - prod + fix #1 only → error moves 1210 → 1309 (partial progress);
   - prod + fix #2 only → still fails at 1210;
   - prod + **both** (`ade-phase2a-fixboth.js`) → **PASSES**
     (intermediate `fix1-only`/`fix2-only` files retained for the record).

The two defects (both already corrected in the worktree, uncommitted):

1. `TAB_LIVE` Refresh-feeds button — a premature `)` closes the
   `h('button', …)` call before its label child:
   deployed `…notify(e.message);}}}),'Refresh live feeds')` (parens 10v11);
   correct `…notify(e.message);}}},'Refresh live feeds')`.
   (Deployed renders nothing at all — the whole script dies at parse time —
   but had it parsed, this would also have produced an unlabelled button plus
   a stray "Refresh live feeds" text node.)
2. Header `topRight` pill — the outer `((…)( )||h('span',…))` group is never
   closed: deployed `…kernLive?'ONLINE':kernStatus),` should be
   `…kernLive?'ONLINE':kernStatus)),` (public/founder.html worktree form).

**Limitations stated explicitly:** no browser automation exists in this
environment (no Playwright/Puppeteer; `vercel` CLI present but unauthenticated),
so no live-browser console capture was performed. It was not needed for this
defect: a script that fails `node --check` cannot run in ANY browser, and the
unpkg React CDN was verified reachable (HTTP 302 version-resolve, normal).
Local serve of the worktree (`PORT=4599`) confirms the fixed page is served:
`GET /founder` → 200 (150,950 bytes), extracted inline script passes
`node --check`, kernel boots ONLINE (`ade-phase2a-local-boot.log`).

**Account & Elevation / `/admin` PIN — status: mechanism confirmed, live
walkthrough blocked without credentials (by design):**

- `GET /api/v1/account/session` without token → **401**
  `{"success":false,"error":"Authentication required"}`
  (`ade-phase2a-local-session-noauth.json`) — fail-closed, no leakage. Verified
  against the local worktree server; no secrets involved.
- The `/admin` triple-field gate (`admin/index.html:40`,
  `"Founder username, password and Founder PIN are all required."`) and the
  three-console token-key split (Founder `ade_founder_token`↔`ade_token`,
  Admin session-only `ade_admin_token`) stand as the confirmed mechanisms for
  the reported redirect/PIN-form symptoms. A live login→PIN→elevation
  walkthrough was NOT executed: it requires a workforce password+PIN, and
  provisioning or using real credentials is out of scope for this phase
  (no production credentials touched; local `data/*.json` left unmodified
  except test-run audit appends). This remains the one Founder item needing a
  browser + approved-test-account pass after the parse fix is deployed.
- No passwords, PINs, tokens, or cookies appear in any log or report.

## C. AWBULI & Product Suite — CONFIRMED (read-only, no production writes)

Production `GET /api/v1/product-surface` (200, 31,431 bytes,
`ade-phase2a-prod-surface.json`): edition COMMUNITY, 24 surfaces;
`awbuli | AWBULI | CONFIGURATION_REQUIRED | EXTERNAL_CREDENTIAL_REQUIRED |
#/product-theater`. This reproduces the user's screenshot exactly from the
server side. `GET /api/v1/products` returns the 4-entry registry
(`ade-phase2a-prod-products.json`).

- **CTA driver:** the public CTA is driven by the product-surface row
  (`status` + `activation.state` + `connection.state`), per `awbuliCta` in
  `public/index.html:966-974`. With the production row state, the honest UI
  outcome is a setup/configuration path — but **no AWBULI-branded public
  setup-request journey exists**: no `POST /api/v1/awbuli/*` or setup endpoint
  in `src/app.js`; the public `POST /api/v1/intake/:channel` (201 + case id)
  is generic intake, not an AWBULI onboarding flow; the public
  `POST /api/v1/demo/run` + `GET /api/v1/demo/trace/:demoId` primitives exist
  with isolated DEMO-source cases, yet `src/demo/DemoScenarios.js` lists NO
  AWBULI scenario (7 scenarios: operational-assessment, workflow-automation,
  performance-decline, business-process-assessment, automation-opportunity,
  oracle-intelligence, full-trace). Nothing was POSTed to production — this is
  endpoint + scenario inventory, not a submission test.
- **Discovery:** production homepage (200, 267,543 bytes,
  `ade-phase2a-prod-home.html`) mentions AWBULI 22×, but the path map sends
  `/awbuli` → `Products` section and the workspace AWBULI module is
  "Channel pipeline states" (diagnostics). There is no dedicated lowercase
  AWBULI landing/onboarding route; AWBULI's canonical destination is
  `#/product-theater`. No provider was configured, no credentials touched.
- **Registry vs matrix:** confirmed two datasets behind the confusing copy —
  `/api/v1/products` (4 registry entries) vs `/api/v1/product-surface`
  (24 matrix surfaces); raw `Route: … · Role: …` renders at
  `public/index.html:1132` (`surfaceMatrixCard`). Untouched in this phase.

## D. Test isolation — VERIFIED (repeated runs, no data deletion)

`resetTradeTestState()` (`tests/trading-paper.test.js:112-142`) re-reviewed:
closes only OPEN `trade-test` paper positions + DELETEs only the `trade-test`
entitlement via server contracts in `before`/`after`; no file writes, no other
actors touched, assertions unweakened. Compliant with the
never-clear-`admin.json`/`audit_ledger.json` rule.

Results (full logs saved, summaries only here):

- `tests/trading-paper.test.js` run 1 → **11/11 pass** (16.2s,
  `ade-phase2a-trading-run1.log`); run 2 → **11/11 pass** (3.9s,
  `ade-phase2a-trading-run2.log`); pass/fail/test counts identical.
  Order-dependence NOT observed with the worktree fix. (Reproducing the
  original `RISK_REJECTED` failure would require disabling the fix — not done;
  the mechanism is documented from `src/app.js:2666-2699` gate-before-engine
  ordering.)
- `tests/founder-elevation-persistence.test.js` +
  `tests/founder-identity-closure.test.js` → **19/19 pass**
  (`ade-phase2a-founder-auth.log`).
- `tests/awbuli-config-authorization.test.js` → **8/8 pass**
  (`ade-phase2a-awbuli-authz.log`).
- Credential-dependent skips (reported separately, none hit in these runs):
  `tests/g25-phase4-reconciliation.test.js:160` and
  `tests/procarta/g26-procarta-vertical-slice.test.js:579` skip positive HTTP
  auth flows when a credential is already configured ("not safe to bootstrap")
  — the correct pattern; no real credentials touched.
- Full `npm test` **deferred**: only ~0.65 GB free of 3.86 GB RAM at run time;
  the full suite boots the kernel per file and is unsafe under the
  resource-control rule. No failures hidden — the broader suite was not run.

## E. Files modified / stop condition

- Tracked files modified in Phase 2A: **none** (same 12 modified files as
  Phase 1; `git diff --name-only` verified).
- New files: 20 under `docs/evidence/` (prod captures, extracts, fix
  bisection, local-boot/serve proofs, 5 test logs). Temp scripts live outside
  the repo (`%LOCALAPPDATA%/Temp/opencode/phase2a-*.mjs`) and touch no repo
  state. Superseded bisection intermediates were removed to avoid confusion;
  `fix1-only`/`fix2-only`/`fixboth` are retained as the attribution record.

### Smallest safe fix per confirmed issue (for approval, NOT applied)

1. **Blank `/founder` (confirmed, production-breaking):** commit the worktree's
   two paren corrections in `public/founder.html` (L1205-equivalent `}}}),`→
   `}}},`; topRight `kernStatus),`→`kernStatus)),`) — or equivalently the
   current worktree state of those two lines — then follow Gates 3–5
   (focused tests incl. DISCOVERY-7 parse check, local browser load of
   `/founder`, push → PR → preview verify → production redeploy). No other
   Founder edit is justified by Phase 2A evidence.
2. **`/admin` PIN-form message (mechanism confirmed):** align the Admin Founder
   submit to the two-step workforce flow or reword the—. No contract change
   until the post-deploy browser walkthrough (B, remaining item) confirms the
   exact user-facing sequence.
3. **Account & Elevation continuity (mechanism confirmed, live proof pending):**
   unify/share session recognition across the three consoles without merging
   Founder/Admin identities; verify with the approved test account in a
   browser (reload/navigation/elevated-persistence + logout boundary).
4. **AWBULI journey (confirmed gap):** dedicated landing route + wire the
   existing `demo/run` primitive with an AWBULI scenario (isolated sample
   data) and/or an intake-backed setup-request returning the case id; keep
   provider setup disabled. No fake success responses.
5. **Product Suite copy (confirmed):** disambiguate registry vs matrix empty
   states; move raw `Route/Role` to operator diagnostics; relocate
   backend-only surfaces to an architecture area. Copy-only, no route removal.
6. **Test isolation (verified):** no fix needed; keep `resetTradeTestState()`;
   run the broader suite when memory allows, before any release gate.

**Stop.** Evidence report saved at `docs/evidence/ade-recovery-phase-2a.md`.
No commit, push, merge, deploy, or credential/provider change performed.
Next: review this report, then approve the minimal `/founder` paren-fix batch
through Gates 3–5 (redeploy required — production still serves `046f29a`).
