# ADE Recovery — Phase 1 Evidence (Reproduce & Trace)

Date: 2026-10-13 (UTC). No fixes applied in this phase. No commit/push/merge/deploy.

## 1. Reality audit

- Branch: `enterprise/product-experience-redesign`; HEAD: `e5b77f0` ("docs(ux): batch-1 release notes…").
- Working tree: 12 tracked files modified, ~78 status lines including large untracked bundles/backups (see `git status --short`). Full status intentionally not pasted here; live state preserved untouched.
- Tracked diff (largest, safety-relevant):
  - `data/audit_ledger.json` (+15067), `data/runtime-config/admin.json` (+14103) — runtime data modified in worktree. **Must never be edited/cleared to make tests pass.**
  - `src/app.js` (+26/-): AWBULI/provider mutations now chain `security.requireConfigAction(...)` (register/edit/verify/configure/enable/suspend/state) + durable audit publishes for channel/connection mutations.
  - `src/security/HttpSecurityBoundary.js` (+50): new `requireConfigAction(action)` — L2 + identity-bound PIN step-up for metadata actions; attributable workforce/legacy-ADMIN for state actions; 403 `ELEVATED_PIN_REQUIRED` / `INSUFFICIENT_AUTHORIZATION`. Reads untouched.
  - `public/founder.html` (+48/-): adds `AWBULI` tab + `PRODUCT VISIBILITY` card reading `/api/v1/product-surface`; one JSX syntax repair (`'Refresh live feeds'` braces).
  - `public/admin/index.html`: channel-config validation (requires a selected channel + ≥1 field), settings save notice.
  - `public/index.html` (+90/-32): public AWBULI/product presentation changes (under verification in Phase 1B/C).
  - `tests/trading-paper.test.js` (+27): `resetTradeTestState()` in `before`/`after` — closes OPEN `trade-test` paper positions + revokes `trade-test` entitlement via server contracts only.
- Untracked: many `ADE-BATCH*`, `*.zip`, `*.bundle`, `dist/`, `evidence/`, `supabase/`, `live-desktop.png`, `live_root.html`, `check_home.js`, new tests (`awbuli-config-authorization`, `awbuli-lead-lifecycle`, `channel-config-baseurl`, `product-discovery-*`). None deleted or moved in Phase 1.
- Runtime-data state: `data/runtime-config/admin.json` and `data/audit_ledger.json` carry large worktree deltas — treated as user/production-adjacent data; Phase 2 must use isolated temp storage or test-owned teardown only.
- Deployed-vs-worktree parity: **not confirmed**. Static routes serve worktree files locally (`src/app.js:4190-4201`), but which commit is deployed was not checked (per instructions, no production proof claimed).

## 2. Founder trace (Phase 1A)

Auth contracts (source truth):
- `POST /api/v1/account/login` (`src/routes/identityRoutes.js:238`) → base workforce session, sets `ade_token` cookie (`pinVerified:false`).
- `POST /api/v1/account/pin` (`identityRoutes.js:260`) → requires `req.person.id != null` (else truthful 403 `WORKFORCE_SESSION_REQUIRED`); verifies per-user PIN; **revokes base token**, issues `pinVerified:true` session, sets `ade_token` + `ade_elevated` cookies; returns person+claims for atomic client sync.
- `GET /api/v1/account/session` (`identityRoutes.js:320`) → sole authority for `serverAuth`; founder UI gates on it.
- Legacy recovery `POST /api/v1/auth/pin` (`src/app.js:662`) → generic ADMIN bootstrap session, sets both cookies; explicitly NOT a Founder session (`public/founder.html:547-561, 666-675`).

Findings vs reported symptoms:

1. **Account & Elevation redirects to public workspace/sign-in.** Plausible mechanism identified, root cause NOT yet proven: three consoles use three different token keys — Founder mirrors `ade_founder_token` ↔ `ade_token` in local+session storage (`founder.html:233-251`); public index uses `ade_token` (`index.html:750-751`); Admin uses `ade_admin_token` in **sessionStorage only** (`admin/index.html:10`) plus `api()` that wipes it and re-renders login on 401/403/503 (`admin/index.html:26-29`). A Founder base/elevated session opened in `/founder` is therefore not guaranteed to be recognised by `/admin`, and elevation cookies (`ade_token` + `ade_elevated`, `hasSessionCookies` checks in `founder.html:337`, `admin/index.html:12`) can be absent after page switches — the code deliberately keeps the token and re-validates in Founder (`adeVerifySessionCookies`) but Admin's `verifySessionCookies` path only calls `fetchRole`. Whether the user's redirect was session loss, role-gate filtering, or route handling needs a live network trace (which API status + which token was sent). No code change made.
2. **`/admin` Founder PIN form "required credentials missing".** Source found: `founderLoginSubmit` (`admin/index.html:40`) requires **all three fields at once** — `if(!u||!pw||!fp)` → `"Founder username, password and Founder PIN are all required."` A PIN-only attempt on `/admin` therefore fails by design with exactly that message. This is a UX/contract mismatch (Founder console does login→PIN as two steps; Admin demands all three in one submit), not proof of broken PIN validation. The separate Admin-PIN path (`loginSubmit` → `POST /api/v1/auth/pin`) is the legacy bootstrap flow and must not be confused with Founder step-up.
3. **`/founder` blank dark-blue page.** No confirmed root cause. Established facts: `body{background:var(--bg:#07111f)}` is the page background, so an empty `#root` (React CDN failure, JS exception before `createRoot().render`, or a thrown render) presents as an empty dark-blue screen. Auth gating itself always renders something (checking/failed/PIN/no-record/login/workspace — `founder.html:693-777`), and `tabContent[tab]||TAB_OVERVIEW` (`founder.html:1516`) guards unknown tabs, so a truly blank page points to **before/at boot**: unpkg React UMD unreachable, an exception in early hooks (`validateSession`, `refreshAll` with 14 parallel fetches), or a served stale/cached HTML (HTML is no-cache per `app.js:4203+`, but deployment parity unconfirmed). Needs browser console + network capture (React loaded? `GET /api/v1/account/session` status? which commit served?). Not fixed by adding another login page; no such page added.
4. **Elevation persistence semantics.** Server design is single-live-session with base revocation on elevate (`identityRoutes.js:277-283`); client mirror keeps `ade_token` in sync (`founder.html:234-245`) and `api()` only clears the session on 401/token-death 403 **for the live token** (`founder.html:349-378`) to avoid a stale base-token race wiping elevation. Correct acceptance test: navigate/reload within valid session stays elevated; logout/expiry/revocation/new session does not inherit elevation; sensitive actions still step-up per policy. Not yet executed against a live server in Phase 1.
5. **Founder vs Admin separation preserved.** `isFounder = persona WORKFORCE + role FOUNDER` (`founder.html:675`); legacy ADMIN never satisfies it; `visibleTabs` filters per role (`676-690`). No identity-merging change made.

## 3. AWBULI trace (Phase 1B)

- Catalogue: `ProductRegistry.AWBULI` = "INTEGRATED/pluginRequired" (`src/products/ProductRegistry.js:33-39`).
- Surface row: `ProductSurfaceMatrix` declaration `id:awbuli` → `frontendRoute:#/product-theater`, `navSection:"Product Theater"`, button "Explore via Theater" (`ProductSurfaceMatrix.js:80-94`). Activation `EXTERNAL_GATED (bridge credential)`; role `PUBLIC_DEMO + OPERATOR_BRIDGE`.
- Public CTA is readiness-driven in code (`index.html:966-974` `awbuliCta`): no-surface → "Learn about AWBULI"; live+configured → "Open AWBULI Workspace"/"Try AWBULI"; configured-but-unverified → "Verify Connection"; setup path → "Set Up AWBULI". Live = connection `CONNECTED/VERIFIED`. Statuses `CONFIGURATION_REQUIRED` / `EXTERNAL_CREDENTIAL_REQUIRED` are honest "not configured" states with `requiredAction`/`errorRecovery` text — but user-tested journey had **no working public demo or setup-request that persists and returns a case/reference ID**. No such persisting public endpoint was found in Phase 1; `POST /api/v1/assessment/public-discovery` requires authorization and is not an AWBULI setup-request. Guided demo must use isolated sample data and never claim live WhatsApp sends — unverified.
- Discoverability gap confirmed in source terms: AWBULI's canonical destination is the Theater (`#/product-theater`), not a dedicated `lowercase` AWBULI landing/onboarding route; homepage AWBULI card exists but its primary action resolves through surface state (loading → "Learn about AWBULI" → Products). Whether it is "prominent without menu search" is a visual fact needing browser evidence, not decidable from code alone.
- Founder AWBULI tab (worktree addition) is **read-only visibility** over the same `product-surface` row (creates/configures/sends nothing) — acceptable direction, unverified visually.

## 4. Product navigation (Phase 1C)

- Contradictory message resolved to **two different datasets**, not one bug to hide: `PRODUCTS()` renders `GET /api/v1/products` (ProductRegistry: 4 entries) with empty text `"Product registry reports no public products in this runtime slice (server truth)."` (`index.html:1145`), while `surfaceMatrixCard()` renders `GET /api/v1/product-surface` (ProductSurfaceMatrix: 24 surfaces incl. backend-only) with empty text `"Product-surface matrix unavailable in this runtime slice."` (`index.html:1128-1137`). When `/api/v1/products` is empty but `/api/v1/product-surface` is populated, both strings appear on the same page — confusing but technically accurate per-source. Fix direction (Phase 2/3): keep both truthful, disambiguate labels, and stop showing raw `Route: … · Role: …` (`index.html:1132`) to normal visitors (retain for authorised diagnostics); backend-only entries (e.g. durable storage `ST · SERVER_SIDE`) belong in an architecture/technical area, not the end-user catalogue. No copy hidden in Phase 1.
- Raw metadata occurrences inventoried: `surfaceMatrixCard` line 1132 (`Route:` + `Role:`), `pubB` title tooltips exposing server enums (acceptable as tooltip, visitor reads plain words per `PUBSTATE` map `1111-1114`), palette hints (`Hint: … PRODUCT · navSection`), workspace product items showing raw `status` badges. Map of dead/duplicated/mismatched routes not yet completed — needs click-through of every published CTA (Phase 2C/3F).

## 5. Test isolation (Phase 1D)

- Known failure `tests/trading-paper.test.js`: expected `QUALITY_THRESHOLD_BLOCKED`, received `RISK_REJECTED`. Mechanism confirmed in code: `POST /api/v1/trading/paper` runs `SignalQualityGate.gate()` first (→ `QUALITY_THRESHOLD_BLOCKED` on fail, `app.js:2689-2691`) and only then `signalEngine.executePaper()` (whose own failures surface as `RISK_REJECTED`/`DUPLICATE_SUPPRESSED`/… `app.js:2692-2698`). The "unentitled → QUALITY_THRESHOLD_BLOCKED" assertion (`trading-paper.test.js:168-170`) holds only when `trade-test` has **no** entitlement. A persisted `trade-test` entitlement (or an OPEN leftover position) from a prior run flips the path: gate passes → engine rejects with `RISK_REJECTED`. Classic order-dependent isolation failure; prior report's failing run predates the worktree `resetTradeTestState()` fix.
- Worktree fix (`trading-paper.test.js:112-142`): `before`+`after` close OPEN `trade-test` positions and DELETE its entitlement via server contracts only — touches no other actors, writes no files, weakens no assertions. Compliant with the "never clear `admin.json`/`audit_ledger.json`" rule.
- Bounded verification this phase (logs saved, terminal kept short):
  - `tests/trading-paper.test.js` → 11/11 pass isolated (67s). Log: `docs/evidence/ade-recovery-phase1-trading-paper.log`.
  - `tests/product-discovery-visibility.test.js` + `tests/product-discovery-awbuli.test.js` → 17/17 pass (6s), incl. "inline scripts of all three consoles parse". Log: `docs/evidence/ade-recovery-phase1-product-discovery.log`.
  - **Not yet done:** repeated runs of the trading suite in a clean isolated env to prove the order-dependence is gone; broader `npm test`; local browser checks. Those belong to Phase 2/4 with resource control (one bounded batch at a time; laptop-resource caution noted).
- Founder/auth skip pattern noted: tests that skip when real credentials exist need isolated first-run + positive-auth tests without touching real credentials — planned, not executed.

## 6. Safety & non-regression notes

- No destructive commands run; no reset/restore; no credential/provisioning changes; no provider activation; no env changes.
- Protected authorities untouched: no new EventBus/SecurityGate/CapabilityRegistry/Decision Engine; `EventSchemaRegistry` untouched; UI owns no business logic (Founder AWBULI tab reads `product-surface` only).
- Data/credential safety: `data/audit_ledger.json` + `data/runtime-config/admin.json` deltas preserved as-is for later review/rollback evidence.

## 7. Phase 2 entry criteria (do not start until approved)

- Live reproduce with browser devtools: record `/founder` console errors + `GET /api/v1/account/session` traffic for base→PIN→elevated; record `/admin` submit payload vs "all required" message; confirm served commit vs worktree.
- Then surgical fixes only: cross-console session continuity without merging Founder/Admin identities; PIN contract UX alignment using existing flows; console render resilience with loading/error/empty states; product-surface labelling (keep diagnostics for operators, plain language for visitors); AWBULI dedicated landing + real setup-request persistence with reference ID + safe guided demo; test-isolation repeat runs.
- Stop before commit/push/merge/deploy; produce Phase 2 verification evidence first.
