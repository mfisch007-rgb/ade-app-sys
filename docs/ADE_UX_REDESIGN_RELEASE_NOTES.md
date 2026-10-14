# ADE Product-Experience Redesign — Batch 1 Release Notes

**Branch:** `enterprise/product-experience-redesign`
**Commit:** `184f766` · **Base:** `046f29a` (main, 2026-10-09)
**Scope:** additive premium UX foundation; zero backend changes.

## Modified files (this commit only)

| File | Change |
|---|---|
| `public/ade-design-system.css` | NEW — enterprise tokens, themes, components, homepage elevation |
| `public/js/ade-api-client.js` | NEW — `window.ADE` transport client + SSE + theme |
| `public/js/ade-route-registry.js` | NEW — `window.ADE_ROUTES` canonical registry |
| `docs/ADE_ROUTE_CAPABILITY_MATRIX.md` | NEW — route & capability integration matrix |
| `public/index.html` | +17/−1 — meta/OG, design link, theme bootstrap, skip link, theme toggle, client wiring |
| `public/admin/index.html` | 1 line — design-system link |
| `public/market-lab.html` | +2 — design-system link + meta description |

## Architectural decisions

1. **No framework migration.** UI is static HTML + React-18 UMD served by
   `express.static`; there is no Vite/SPA build to “upgrade”. Work layers on
   the existing architecture instead of replacing it.
2. **Marker-preserving surgery.** `public/index.html` is guarded by
   `home-surface`, `public-ux`, `ux-cohesion-overhaul` tests (50 pinned
   markers verified byte-exact in the staged blob). Premium treatment is
   delivered through the additive stylesheet, not view-logic rewrites.
3. **Server stays authoritative.** New JS is transport + presentation only:
   no auth logic, no mock data, no simulated success. Truth states
   (LIVE/PAPER/SIMULATED/PROVIDER_REQUIRED/UNAVAILABLE) unchanged.
4. **Others’ dirty work untouched.** Pre-existing uncommitted work from prior
   sessions (admin channel-config validation, founder productSurface,
   homepage Who-serves/How-to-begin/live-strips, `data/*` runtime writes)
   was deliberately excluded from this commit via byte-exact selective
   staging and remains in the worktree.
5. **founder.html deferred.** `HEAD:public/founder.html` has a pre-existing
   inline-JS syntax error (fails `node --check`; fixed only in the dirty
   worktree). Its design-system link stays worktree-only until that work
   lands, so this commit stays fully green.

## Test results

| Suite | Result |
|---|---|
| `public-ux` + `home-surface` + `ux-cohesion-overhaul` | 18/18 pass (before and after) |
| Backend subset (acceptance, wave1, production-safety, capability-discovery, sse-delivery-proof, ops-control-plane) | 89/89 pass |
| Full `npm test` | 523 pass / 0 fail / 3 skipped (526 total) |
| `node --check` on `src/app.js`, `api/index.js`, new client/registry JS | OK |
| Live boot (`PORT=4124`): `/api/v1/health` HEALTHY, 11 subsystems; `/`, `/ade-design-system.css`, `/js/ade-api-client.js` all 200; homepage contains design link + theme toggle | OK |

## Visual / interaction evidence

- No browser automation is available in this environment, so no screenshots
  were captured. Evidence is server-side: 200s for every new asset, marker
  presence in served HTML, and static responsive guards (`@media`,
  `overflow-x:clip`, 44px touch targets, 900px hero stacking).
- Manual verification still required (see Release).

## Incomplete / simulated (unchanged truthfulness boundaries)

- AWBULI live send: SIMULATED-ONLY until real provider integration.
- AI providers: `OFFLINE_LEXICAL_ENGINE` fallback; external keys required.
- Live trading execution: PROVIDER_REQUIRED (`BROKER_NOT_CONFIGURED` truthful).
- Resend/UptimeRobot: endpoint LIVE; external configuration out of scope.
- Responsive + screenshots + keyboard/contrast pass: pending manual review.

## Release instructions (DO NOT auto-deploy)

1. Review: `git diff main...enterprise/product-experience-redesign`.
2. Run: `node --test tests/public-ux.test.js tests/home-surface.test.js
   tests/ux-cohesion-overhaul.test.js` and full `npm test`; compare with
   the table above.
3. Boot locally (`node src/server.js`), open `/`, `/admin`, `/market-lab`;
   check console for errors, toggle theme, test at 390px and 1280px widths.
4. Merge to `main` only after review + manual visual pass; deploy follows
   the existing Vercel pipeline (`api/index.js`), no new env vars required.

## Rollback

- Revert single commit: `git revert 184f766` (fully additive; removes
  4 new files and restores 3 edited lines). No backend/state impact.
- Worktree-only changes (prior sessions’ dirty work) are unaffected by
  this commit in either direction.
