# ADE-APEX Closure Report — Gates 1–8, Runtime Entitlement & Tenant Isolation

- Date: 2026-10-28 (UTC)
- Repository: `mfisch007-rgb/ade-app-sys`
- Branch: `main`
- Baseline: `a7e286547b12d396086f7a26c09e814361dcf519`
- Source commit: `a1296c818bf20c9eab1ff5515936bd0794c71392`
- Verified artifact manifest: `e3a00f12cafc015521ce34efd087bbc31630ee54`
- Final artifact commit: `af519de2a7f7c4b60c4db0ce86c5a8381da60794`
- Production: `https://ade-apex-community.vercel.app`
- Verified deployed commit: `af519de2a7f7c4b60c4db0ce86c5a8381da60794`

## 1. Outcome

All authorized ADE closeout gates through Gate 8 are complete and deployed. The work added the missing governed runtime-entitlement and AWBULI public-entry controls, removed environment-dependent test skips, and closed a real cross-tenant isolation bug.

The canonical architecture remains intact. `EditionPolicy` remains the edition authority, `PaymentService` remains the sole source of provider-derived paid entitlement, `AccessAdministration` remains the administrative grant authority, and the existing kernel, event bus, registry, decision engine, and security gate were not replaced.

No live payment, WhatsApp, AI, or media-rendering capability is claimed. Production remains truthful about every unconfigured provider.

## 2. Delivered changes

### 2.1 Gate 1 — environment-independent verification

- Replaced environment-dependent test skips with isolated temporary credential stores using `ADE_CREDENTIAL_STORE_FILE`.
- Re-enabled `G18.A`, `FIX2`, and `G26.19` as unconditional tests.
- Deferred application imports until after test credential environment variables are established.
- Changed `CredentialLifecycleStore` to resolve `ADE_CREDENTIAL_STORE_FILE` at construction time rather than module load time.
- Kept the long-running `G26.19` HTTP smoke test stable with a 120-second test-server keep-alive.
- Restored test credential environment variables and deleted temporary stores after each run.

### 2.2 Gate 2 — account-aware runtime entitlement

- Added `CommercialEntitlement.resolveRuntimeTier({ tenantScope, accountId, product, capability })`.
- The edition-derived tier is always the floor.
- A Paystack-derived paid plan can raise the tier only when the entitlement source begins with `PAYSTACK:`.
- An active administrative entitlement can raise the tier for its explicit product; it cannot lower the edition floor.
- Added capability-to-product mapping:
  - `messaging` → `AWBULI`
  - `branches`, `customers`, `fieldTasks`, `aiWorkers`, `operationalAssessments`, `workflows`, `automation` → `PROCARTA`
- Added optional `tier` input to `CommercialEntitlement.check`; a supplied tier may only raise the resolved edition tier.
- Protected commercial routes now resolve tenant and account from authenticated identity:
  - person tenant
  - claims `tenantId` / `tid`
  - identity tenant
  - request tenant fallback
- Added authenticated `GET /api/v1/account/runtime-entitlement`.
- Extended authenticated `GET /api/v1/account/access` with `runtimeTier`, `runtimeSource`, and `runtimeGrantId`.
- Exported `accessAdministration` and `commercialEntitlement` from `src/app.js`.

### 2.3 Gate 3 — Founder independence proof

No runtime source change was required. The following prove that Founder identity and sessions are not required for non-Founder operation:

- `tests/non-founder-independence.test.js`
- `tests/founder-identity-closure.test.js`
- `tests/founder-race-closure.test.js`
- `tests/founder-elevation-persistence.test.js`
- `tests/founder-session-lifecycle.test.js`
- `tests/founder-client-render-loop.test.js`

### 2.4 Gate 4 — AWBULI public-entry configuration

- Added explicit public-entry fields:
  - `publicBusinessNumber`
  - `clickToChatDestination`
  - `clickToChatUrl`
  - `cta`
  - `phoneNumberIdConfigured`
  - `providerTokenConfigured`
  - `webhook`
- Added optional click-to-chat destination, phone-number ID, and HTTPS webhook URL to the authenticated admin publish route.
- Click-to-chat URLs are generated as `https://wa.me/<digits>?text=START`.
- Invalid non-E.164 click destinations and non-HTTPS webhook URLs return `400`.
- Public responses expose configuration state only; provider tokens, webhook verification tokens, and the raw phone-number ID remain server-side.
- Unpublishing clears the public number, click-to-chat destination, phone-number ID, webhook URL, and approval metadata together.
- Updated the admin Channels UI and public AWBULI CTA.
- AWBULI continues to report `live: false` and never claims provider verification or delivery.

### 2.5 Gate 5 — paid runtime entitlement and payment controls

- `next-payments.test.js` exercises Paystack-derived settlement and verifies that non-`PAYSTACK:` claims cannot raise paid access.
- Added `requirePaymentAdmin` for payment administration:
  - legacy elevated ADMIN (`persona: ADMIN`, level >= 2) remains supported for the admin console
  - FOUNDER and ADMIN workforce roles are allowed
  - other roles receive `403 INSUFFICIENT_AUTHORIZATION`
- Payment mutation routes now also require the canonical configuration action:
  - `payment-configure`
  - `payment-verify`
  - `payment-state`
  - `payment-customer-facing`
- All payment administration uses claim-derived tenant scope, not caller-supplied body/query tenant values.
- Added `tests/gate5-payment-routes.test.js`, covering route authorization, tenant scope, and payment state.
- Public payment start remains prepared-only/disabled. No live checkout or provider transaction is claimed.

### 2.6 Gate 6 — media truthfulness

No source change was required. Verification confirmed:

- No FFmpeg or rendering implementation is present or invoked.
- Unconfigured providers report `UNCONFIGURED`.
- Local video, image, and audio providers report `UNAVAILABLE`.
- The render pipeline reports `configurationRequired: true` and `renderingImplemented: false`.
- Truthful placeholders return `queuedJobId: null` and `assetUrl: null`.
- No synthetic media, fake render completion, or fabricated provider result is exposed.

Focused Gate 6 suite:

- `tests/production-boundaries.test.js`
- `tests/final-reconciliation.test.js`
- `tests/community-foundation.test.js`
- `tests/forensic-reconciliation-20261009.test.js`
- Result: 58 pass, 0 fail.

### 2.7 Gate 7 — authenticated tenant authority

A real cross-tenant isolation defect was found and fixed.

`HttpSecurityBoundary` now applies `#applyAuthenticatedTenant` both when claims are authenticated and again after workforce person hydration. When an authenticated person or claim carries a tenant, the boundary overwrites:

- `req.tenantId`
- `req.query.tenant`
- `req.query.tenantId`
- existing body `tenant`, `tenantId`, and `tenantScope`

A caller-supplied tenant hint can therefore no longer override the authenticated session tenant. A legacy ADMIN without a tenant claim is unaffected, preserving existing admin-console behavior.

New `tests/gate7-tenant-isolation.test.js` proves:

- Two operators in different tenants create separate organization records.
- An authenticated tenant cannot read another tenant by default.
- A query-string tenant cannot cross the authenticated boundary.
- Body tenant spoofing on `/api/v1/experience` is stored under the authenticated tenant.
- The spoofed tenant cannot read the record; the owner tenant can.
- No implicit global tenant read occurs.

The Gate 7 regression battery also passed, including access administration, payment routes, financial integrity, production safety, durable closure, configuration contracts, payments, acceptance, deployed reality, session precedence, trading hardening, client authority, and binary broker truthfulness.

## 3. Verification

### 3.1 Full suite

Command:

```powershell
npx -y node@24 scripts/run-tests.mjs
```

Result:

- pass: 826
- fail: 0
- skipped: 0
- duration: not recorded in the final aggregate

The prior baseline was 817 tests with 3 environment-dependent skips. The final suite runs all tests with zero skips.

### 3.2 Targeted regressions

- Gate 6 production/media reconciliation: 58/58 pass.
- `tests/gate7-tenant-isolation.test.js`: pass.
- `tests/gate2-runtime-entitlement.test.js`: pass.
- `tests/gate5-payment-routes.test.js`: pass.
- `tests/next-payments.test.js`: 14/14 pass.
- Gate 7 security/data-integrity battery: all selected suites passed.
- Release verification (`tests/release-verification.test.js`): 3/3 pass.

### 3.3 Validation and hygiene

- `npx -y node@24 src/cli/ade-validate.js` — passed, 13/13 checks.
- `npx -y node@24 scripts/secret-scan.mjs` — `SECRET SCAN: CLEAN`.
- `npm audit --json` — 0 vulnerabilities across all severities.
- `git diff --check` — clean apart from expected CRLF normalization warnings.
- GitHub Actions at `af519de`:
  - ADE Production CI — success
  - ADE Production Verification — success

### 3.4 Production verification

`GET /api/v1/health` after deployment:

- commit: `af519de2a7f7c4b60c4db0ce86c5a8381da60794`
- Vercel SHA: `af519de2a7f7c4b60c4db0ce86c5a8381da60794`
- kernel: `HEALTHY`
- booted: `true`
- subsystems: `11`
- degraded: `[]`
- AI: `configured: false`, `0/4` providers, `UNAVAILABLE`, fallback `OFFLINE_LEXICAL_ENGINE`

`GET /api/v1/runtime`:

- edition: `COMMUNITY`
- runtime mode: `FULL`
- storage: `SupabaseStorageAdapter`
- configured / durable / hydrated / healthy: `true`
- storage last error: `null`
- runtime: Linux, Node `v24.21.0`, alive

Smoke checks:

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/health` | `200`, deployed commit `af519de`, `HEALTHY`, `degraded: []` |
| `GET /api/v1/runtime` | `200`, `COMMUNITY`, durable/hydrated/healthy storage |
| `GET /api/v1/awbuli/entry` | `200`, `NOT_PUBLISHED`, `NOT_CONFIGURED`, `clickToChatConfigured: false`, `webhook: NOT_CONFIGURED`, `live: false` |
| `GET /api/v1/media/providers` | `200`, truthful provider states, no fake renderer |
| `GET /api/v1/admin/payments/status` (anonymous) | `401` |
| `GET /api/v1/admin/awbuli/public-entry` (anonymous) | `401` |
| `GET /api/v1/account/runtime-entitlement` (anonymous) | `401` |
| `GET /api/v1/org/units` (anonymous) | `401` |

Media provider states observed in production:

- `replicate`, `runway`, `stability`, `dalle`, `elevenlabs`: `UNCONFIGURED`
- `local-video`, `local-image`, `local-audio`: `UNAVAILABLE`
- `local-captions`: `AVAILABLE`
- Asset count: `0`

No production access grant was created. No customer data was used.

## 4. Community artifact

Command:

```powershell
npx -y node@24 scripts/build-community.mjs
```

Final artifact:

- Artifact: `dist/ade-community-edition.zip`
- Manifest: `dist/build-manifest.json`
- Size: `22,186,916` bytes
- SHA-256: `bad3ff9b7a92f8ebd21da65da42eb5a040b5c3368e2788ee92effbfbd9714797`
- Source files: `950`
- Build timestamp: `2026-10-28T17:42:37.047Z`
- Manifest commit SHA: `e3a00f12cafc015521ce34efd087bbc31630ee54`
- Artifact commit: `af519de2a7f7c4b60c4db0ce86c5a8381da60794`

The manifest hash matches the actual archive hash. The artifact was generated from `e3a00f1`, which changes only the community artifact relative to source commit `a1296c8`. Commit `af519de` commits that artifact without further source changes.

The build excludes runtime state, `data/`, secrets, key material, logs, `node_modules`, and Git metadata.

## 5. Files changed in source commit `a1296c8`

- `public/admin/index.html`
- `public/index.html`
- `src/app.js`
- `src/commerce/CommercialEntitlement.js`
- `src/routes/identityRoutes.js`
- `src/security/CredentialLifecycleStore.js`
- `src/security/HttpSecurityBoundary.js`
- `tests/awbuli-public-entry.test.js`
- `tests/g17-g21-completion.test.js`
- `tests/g25-phase4-reconciliation.test.js`
- `tests/next-payments.test.js`
- `tests/procarta/g26-procarta-vertical-slice.test.js`
- `tests/gate2-runtime-entitlement.test.js` (new)
- `tests/gate5-payment-routes.test.js` (new)
- `tests/gate7-tenant-isolation.test.js` (new)

## 6. Truthfulness and residual boundaries

- **Paystack/live payments remain blocked.** No real payment credentials are configured. Checkout remains prepared-only/disabled. No transaction or paid entitlement from a provider was fabricated.
- **WhatsApp/AWBULI live delivery remains unverified.** No approved public number, provider credentials, or verified webhook are configured. Production reports `NOT_PUBLISHED`, `NOT_CONFIGURED`, and `live: false`.
- **AI remains an offline lexical fallback.** Production reports no configured providers and does not claim a live model.
- **Media rendering remains unavailable.** Providers are unconfigured or unavailable, assets are zero, and the render pipeline reports no implementation.
- **Legacy ADMIN access remains compatible.** Payment management still accepts elevated legacy admin sessions, but also requires the explicit payment-admin and configuration-action checks.
- **Administrative grant writes remain process-local.** Concurrent cross-instance edits to the shared access document are last-write-wins. This does not affect Founder bootstrap, which uses the atomic storage claim.
- **Supabase schema visibility may require owner action.** Any `PGRST205` condition must be verified before schema changes; no destructive production schema operation was performed.
- **Production timestamp offset remains.** The production runtime clock is approximately 24 hours behind the local device clock. Historical and runtime timestamps were not rewritten.
- **Legacy runtime state remains uncommitted.** Local runtime files (`data/`, root `admin.json`, root `audit_ledger.json`, `.ade_capability_store.json`, `debug.log`, `run-ade-closeout.ps1`) were intentionally excluded from source, artifact, and report commits.

## 7. Rollback

If rollback is required:

1. Revert source commit `a1296c8` on `main`, or deploy the prior verified commit `a7e2865`.
2. Rebuild and commit the community artifact for the rollback commit, or revert `e3a00f1` and `af519de`.
3. Push `main` and confirm `/api/v1/health` returns the rollback SHA, `kernel.status: HEALTHY`, and `degraded: []`.
4. Re-run smoke checks: AWBULI entry is `200` with no live claim, and protected admin/account routes return `401` anonymously.

No production data migration was performed, so rollback has no data-schema step.
