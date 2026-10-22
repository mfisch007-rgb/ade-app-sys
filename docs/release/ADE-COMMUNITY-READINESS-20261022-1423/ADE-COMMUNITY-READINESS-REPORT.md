# ADE Community Start — Release Readiness Report

- **Report time:** 2026-10-22T17:05Z
- **Repository:** `C:\Users\USER\Desktop\ADE-APP-SYS`
- **Branch:** `main`
- **Edition:** `COMMUNITY`
- **Production URL:** `https://ade-apex-community.vercel.app`
- **Verified runtime/artifact commit:** `293129e01cce474f54b945831d444a908335da57`
- **Verdict:** **DEPLOYED AND POST-DEPLOY VERIFIED — BROWSER LOGIN VERIFICATION PENDING**

The release is deployed. Anonymous media and manifest requests return 401, and the retired `.bak` and internal README paths return 404 instead of the SPA shell. The dependency audit is clean and the deployed kernel reports `HEALTHY`. The browser-level login sequence remains unverified. A docs-only commit after this verification does not change the runtime.

## 1. Executive summary

Four confirmed defects were fixed and deployed:

1. **AWBULI status routing** — The public “See AWBULI Status” action and the AWBULI product-surface action no longer route to Product Theater. The status modal remains the AWBULI surface, and the server product matrix now points AWBULI at `#/products`.
2. **Public source media** — Raw MP4 names, source-library cards, the source selector, and the manifest link were removed from public HTML. `/ade-experience/media` and `/ade-experience/media-manifest.json` are L2-guarded in `src/app.js`; production returns **401** anonymously.
3. **Login repeat-submit** — The public sign-in path is still a single-submit flow, username Enter now submits, and a static regression test covers single-submit login, modal close, Workspace navigation, and the distinct PIN step-up. Browser-level reproduction of the reported “second submit or Cancel” behavior was not obtained.
4. **Public/private separation** — Operator links are token-gated, and three tracked legacy `.bak` files plus the internal experience README were moved out of `public/`. A fail-closed middleware returns **404** for both retired path patterns in production; a regression test now rejects `.bak` files in the public tree.

Remaining launch requirement:

- Verify public sign-in and founder two-step login in a real browser; the reported second-submit/Cancel sequence remains **NOT VERIFIED**.

## 2. Release gate evidence

| Gate | Result | Evidence |
|---|---|---|
| `npm test` | PASS | 575 tests, 572 pass, 3 skipped, 0 fail, rerun after the final guard |
| `npm run test:full` | PASS | 775 tests, 772 pass, 3 skipped, 0 fail, clean rerun with an ephemeral test-only `ADE_HTTP_TEST_PIN` |
| `npm run validate` | PASS | 13/13, “FULL GREEN” |
| `npm run build:community` | PASS | 948 source files; final artifact below |
| `npm run verify:release` | PASS | 3/3 |
| `npm audit --audit-level=high` | PASS | `found 0 vulnerabilities` |
| `npm audit --omit=dev --audit-level=high` | PASS | `found 0 vulnerabilities` |
| Production health | PASS | commit `293129e01cce...`; status `OK`; kernel `HEALTHY`; 11 subsystems |
| Production media privacy | PASS | Raw MP4 and manifest return **401** `application/json` |
| Production retired paths | PASS | `.bak` and internal README return **404** `application/json` |
| Browser login reproduction | **NOT VERIFIED** | No browser automation available |

One full-suite run during final re-verification produced a transient `E2E_CREDENTIAL_STORE_NOT_CREATED` in G18.14 after all lifecycle assertions passed; the isolated test and a complete rerun both passed. This was not reproduced and is recorded as a test-stability risk, not a product failure.

The deployed release artifact is `dist/ade-community-edition.zip`: **22,303,603 bytes**, SHA-256 `c1cdc240ece5a3e6aad06f2153665fbecb422b38d29f6a7181f91fb4c65e8e09`, timestamp `2026-10-22T16:46:53.254Z`, 948 source files. `dist/build-manifest.json` records source commit `4f873e9389c1a0c31481924ee603b39cbc85b507`; the artifact and deployment commit is `293129e01cce474f54b945831d444a908335da57`.

The artifact hash changes on rebuild because the build metadata includes a timestamp. The manifest’s `commit_sha` records the release source commit; do not treat an earlier hash as evidence for a later build.

## 3. Dependency audit resolution

Authorization was given to apply a lockfile-only transitive security update. The update stayed within the existing Express 4 semver range:

- `express` 4.22.2 → 4.22.3
- `body-parser` 1.20.6 → 1.20.9
- `qs` 6.15.2 → 6.16.1
- `proxy-addr` 2.0.7 → 2.0.8 (GHSA-jqcg-44mw-7w3h fixed)
- `side-channel` 1.1.0 → 1.1.1

`package.json` dependency ranges were not changed. `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` both report **0 vulnerabilities**. All functional gates were rerun after the update.

## 4. Product readiness matrix

At verified commit `293129e`, `/api/v1/product-surface` reported 24 surfaces: `ACTIVATED:4`, `CONFIGURATION_REQUIRED:3`, `AVAILABLE:12`, `FUTURE:2`, `EXPERIMENTAL:1`, `PREVIEW:1`, `ROADMAP:1`.

| Product | Runtime evidence | Readiness label | Scope / limitation |
|---|---|---|---|
| ADE Platform | `ACTIVATED`; kernel `HEALTHY`; 11 subsystems; production routes return 200 | **READY** | Optional AI provider is absent; lexical fallback is active. Email is unconfigured. Local storage is active unless Supabase is configured. |
| PROCARTA | `ACTIVATED`; connection `CONNECTED`, grip 100; `PROCARTA_EXECUTE` is `LIVE` | **READY** | `PROCARTA_WORKFLOW` is unavailable in COMMUNITY (plugin/edition scope). Assessment/intake is ready. |
| AWBULI | `CONFIGURATION_REQUIRED`; activation `EXTERNAL_CREDENTIAL_REQUIRED`; connection `INSPECTABLE`, grip 0; entry `live:false`, `configured:false` | **CONFIGURATION REQUIRED** | Requires `AWBULI_API_URL` + `AWBULI_API_KEY`, verification, and an enabled provider gate. No public number and no live WhatsApp transport. Local command grammar and ledger are implemented and tested. |
| ADE Oracle | `ACTIVATED`; lexical fallback active | **READY / OPTIONAL ENHANCEMENT** | External AI quality requires an optional provider key. No provider is configured. |
| NEXUS | `CONFIGURATION_REQUIRED`; activation `PREVIEW`; connection `DISCOVERED`, grip 0 | **IMPLEMENTATION REQUIRED** | Inventory/contract surface only; not a production integration promise. |
| EVENTOS | `CONFIGURATION_REQUIRED`; activation `PREVIEW`; connection `DISCOVERED`, grip 0 | **IMPLEMENTATION REQUIRED** | Catalogue and engine contract only; no production matching workflow. |
| ADE-TIDES | Surface status `FUTURE`; contact path only | **IMPLEMENTATION REQUIRED** | No cross-border payments or settlement execution. |
| FOUNDERS CIRCLE | `AVAILABLE`; pilot intake path is live | **READY — REQUEST ACCESS ONLY** | Full peer/capital/governance hub is not verified as a delivered product. |
| ADE-MARKET CIRCLE | `AVAILABLE`; partner-registration path is live | **READY — PARTNER INTAKE ONLY** | Commerce operations, verified buyers/suppliers, and distribution execution are **NOT VERIFIED**. |

Public route shells `/products`, `/procarta`, `/awbuli`, `/nexus`, `/connect`, `/eventos`, `/community`, `/tides`, `/marketplace`, `/oracle`, `/founders-circle`, `/founder`, `/admin`, and `/command-center` all returned HTTP 200. Route availability is not proof of functional readiness.

## 5. AWBULI evidence

- `/api/v1/awbuli/entry` returns `success:true`, `configured:false`, `live:false`, `providerState:"NOT_CONFIGURED"`, trigger words `START`/`STAR`, number `null`.
- Grammar version: `AWBULI-COMMAND-v1`.
- Authorized command entry: `POST /api/v1/awbuli/commands` at L2 with PIN.
- No live WhatsApp bridge, inbound webhook, or public business number is active.
- Z-Maths / Smart Logic evidence remains `MISSING_EVIDENCE`; no formula was invented.
- Local AWBULI work includes command grammar, business ledger, founder panel, L2/PIN command routes, simulated inbound case creation, and focused tests.

## 6. Public/private exposure

Local state:

- `public/index.html` no longer contains `SOURCE MEDIA LIBRARY`, raw source filenames, `mediaManifest`, `sourceMedia`, or public media links.
- `public/ade-experience/index.html` no longer exposes the source-video selector or `sourceVideo`; labels are now Product Theater / Concept Preview / Media Engine.
- `/ade-experience/media/*` and `/ade-experience/media-manifest.json` are L2-guarded and return 401 anonymously; tests assert this.
- Three tracked backups were quarantined to `docs/archive/`:
  - `index.html.activation-audit-20260918-121148.bak`
  - `index.html.before-final-ui-20260917-205229.bak`
  - `index.html.pre-security-isolation-20260920-135507.bak`
- `public/ade-experience/README-INTEGRATION.md` was moved to `docs/media/ADE-EXPERIENCE-INTEGRATION.md` and corrected.
- Home and mobile operator links are token-gated. Direct `/admin` and `/founder` shells remain public login surfaces by design.

Production state at verified commit `293129e`:

- `/ade-experience/media/Try_again(3).mp4` — **401**, `application/json`
- `/ade-experience/media-manifest.json` — **401**, `application/json`
- `/index.html.activation-audit-20260918-121148.bak` — **404**, `application/json`
- `/ade-experience/README-INTEGRATION.md` — **404**, `application/json`
- `/` — `200`, `text/html`
- `/admin` and `/founder` — `200` login shells; browser login verification remains pending

Both privacy fixes are therefore present in production.

Media playback caveat: `src/kernel/IdentityOnboarding.js` accepts Bearer tokens only, not cookies. Authorized browser playback of a protected media URL must use a Bearer `fetch`/blob path; a bare `<video src>` element cannot authenticate with the session cookie alone.

## 7. Login evidence

- Public `signIn` remains a single-submit handler: one login API call, `setToken`, `setAuth(false)`, `go('Workspace')`.
- Username Enter now calls `signIn()`.
- PIN step-up remains a separate call to `/api/v1/account/pin`.
- Founder workforce login + six-digit PIN is intentionally two-step and must not be collapsed.
- `HOME-3d` covers the intended public flow statically.
- The reported second-submit/Cancel sequence was **not reproduced in a browser**; this remains a `NOT VERIFIED` UX item.

## 8. Residual risks and post-deploy checks

1. **Browser login UX** — not verified end to end; verify before announcing the launch.
2. **Node mismatch** — local Node `v20.20.0`; repository/CI require `>=24.0.0`. CI remains authoritative.
3. **Dirty worktree** — runtime data and unrelated pre-existing changes are present. Stage only the intended release files; never stage `data/audit_ledger.json`, `data/runtime-config/admin.json`, or `.ade_capability_store.json`.
4. **AWBULI live messaging** — provider bridge and sender identity are not configured; no public number.
5. **Z-Maths / Smart Logic** — source evidence remains inaccessible.
6. **Legacy RAR artifacts** — `ADE-AWBULI.G.DRIVE DOWNLOAD.rar` and `ADE-PROCARTA.rar` remain uninspected; no extraction tool is available.
7. **PM2** — local process was not restarted or reconfigured.
8. **Test stability** — one full-suite run produced a transient G18.14 credential-store file-check failure; isolated and full reruns passed. A repeat should block the credential-lifecycle area until explained.
9. **Docs-only deployment commits** — a later commit containing only release-document changes can advance the Vercel HEAD without changing runtime source or the artifact. Verify `/api/v1/health` and the artifact hash rather than assuming every HEAD change is a runtime change.

## 9. Release recommendation

The release is deployed and the privacy checks pass. Before announcing the launch:

1. Verify public single-submit sign-in and founder password + PIN in a real browser.
2. Re-check `/api/v1/health`, `/api/v1/product-surface`, and `/api/v1/awbuli/entry`.
3. Keep the release commit and artifact SHA-256 above as the rollback reference.
4. If any check fails, redeploy the previous known-good deployment and record the rollback.

Do not describe AWBULI, NEXUS, EVENTOS, or ADE-TIDES as live integrations.

## 10. Evidence commands

```powershell
npm test
$env:ADE_HTTP_TEST_PIN='<ephemeral-6-digit-test-pin>'; npm run test:full; Remove-Item Env:ADE_HTTP_TEST_PIN
npm run validate
npm run build:community
npm run verify:release
npm audit --audit-level=high
```

Production spot checks:

```powershell
$base='https://ade-apex-community.vercel.app'
Invoke-RestMethod "$base/api/v1/health" | ConvertTo-Json -Depth 8
Invoke-RestMethod "$base/api/v1/product-surface" |
  Select-Object -ExpandProperty surfaces |
  Where-Object id -eq 'awbuli'
Invoke-RestMethod "$base/api/v1/awbuli/entry"
curl.exe -sS -o NUL -w "%{http_code} %{content_type}`n" "$base/ade-experience/media/Try_again(3).mp4"
curl.exe -sS -o NUL -w "%{http_code} %{content_type}`n" "$base/ade-experience/media-manifest.json"
curl.exe -sS -o NUL -w "%{http_code} %{content_type}`n" "$base/index.html.activation-audit-20260918-121148.bak"
curl.exe -sS -o NUL -w "%{http_code} %{content_type}`n" "$base/ade-experience/README-INTEGRATION.md"
```

Expected media/manifest: `401 application/json`. Expected retired paths: `404 application/json`.
