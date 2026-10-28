# ADE-APEX Closure Report — Governed Access & Atomic Founder Bootstrap

- Date: 2026-10-28 (UTC)
- Repository: `mfisch007-rgb/ade-app-sys`
- Branch: `main`
- Baseline: `f27a957` (prior ADE-APEX closure)
- Source commit: `b636d0c5935670a17af2c7d07e6ba97828783cd8`
- Artifact commit: `d7426ab1f3952a242622aafa053f37fdaa866c06`
- Production: `https://ade-apex-community.vercel.app`
- Verified deployed commit: `d7426ab1f3952a242622aafa053f37fdaa866c06`

## 1. Outcome

This closure delivered three missing controls without replacing the canonical architecture:

1. AWBULI public WhatsApp configuration is now discoverable in the admin **Channels** section, with the public entry and sender-number registry separated from provider credentials.
2. Governed access, tier and trial administration is available through a canonical account-scoped service and authenticated admin/account routes.
3. Founder bootstrap is atomic across instances through a storage-level create-if-absent claim, with crash recovery from the claim document.

The canonical authorities remain intact: `EditionPolicy` is still the runtime edition authority, `PaymentService` remains the sole authority for paid access derived from a provider transaction, and access grants are recorded only as `ADMIN_ENTITLEMENT` / `ADMIN_TRIAL` with no payment reference.

## 2. Delivered changes

### 2.1 Atomic Founder bootstrap

- Added `StorageProvider.insertIfAbsent(key, value)` as an optional atomic create-if-absent contract returning `{ claimed, value }`.
- `LocalStorageAdapter` implements the primitive with synchronous read/write claim semantics.
- `SupabaseStorageAdapter` implements the durable claim through PostgREST `on_conflict=k` with `resolution=ignore-duplicates` and through supabase-js `upsert({ onConflict: "k", ignoreDuplicates: true }).select("k,v")`.
- `WorkforceManager` now writes a bootstrap claim at `ade:workforce:founder-bootstrap:v1` containing the candidate workforce document before canonical persistence.
- A losing instance re-reads canonical state and returns truthful `FOUNDER_ALREADY_PROVISIONED`; it never creates a second Founder.
- `initialize` and `#refreshState` recover the Founder from the claim when canonical state is empty, covering a crash between claim and canonical write.
- Founder IDs now use a shared `workforceId(seq)` generator.

### 2.2 Governed access administration

New canonical service: `src/commerce/AccessAdministration.js`.

- Products: `AWBULI`, `PROCARTA`.
- Tiers: `COMMUNITY`, `TRIAL`, `PAID`, `ENTERPRISE`.
- Policies:
  - FOUNDER: all tiers, trial up to 30 days, grant up to 365 days, can manage all grants.
  - ADMIN: `COMMUNITY` / `TRIAL` / `PAID`, trial up to 15 days, grant up to 90 days.
  - OPERATOR: `COMMUNITY` / `TRIAL`, trial up to 14 days, grant up to 30 days, own grants only.
- Guardrails:
  - No self-grants.
  - No grants targeting a FOUNDER account.
  - Reason required and audited.
  - Integer day windows.
  - New grants supersede the prior active grant for the same tenant/account/product.
  - Expired trials fall back to `COMMUNITY`; expired grants can be extended inside the role window.
  - Every mutation emits an `audit.log.created` event in category `ACCESS`.
- Paid records are explicit administrative entitlements. They carry `paymentReference: null` and `paymentStatus: NOT_APPLICABLE`; they never claim a Paystack charge.

Authenticated routes:

- `GET /api/v1/admin/access/grants`
- `POST /api/v1/admin/access/grants`
- `POST /api/v1/admin/access/grants/:id/extend`
- `POST /api/v1/admin/access/grants/:id/revoke`
- `GET /api/v1/account/access`

The admin routes require an elevated (PIN-verified) FOUNDER/ADMIN/OPERATOR session. Anonymous requests receive `401`; base sessions receive `403 ELEVATED_PIN_REQUIRED`. Tenant scope is derived only from the authenticated request tenant, not an unauthenticated query parameter.

### 2.3 AWBULI placement and separation

- Added an **Access** tab in the canonical admin console.
- Moved the AWBULI public-entry card and numbered-sender registry from Providers into **Channels**.
- Channels now shows:
  - provider bridge state (descriptor only, never live),
  - registered sender-line count, active count and default count,
  - public entry approval state,
  - masked sender registry with verify/default/activate/suspend/disable actions.
- The public entry remains a separate opt-in contact line; provider credentials and phone-number identifiers stay server-side and are never displayed.
- Sender actions refresh the Channels surface instead of the Providers surface.

## 3. Verification

### 3.1 Full suite

Command:

```powershell
npx -y node@24 scripts/run-tests.mjs
```

Final result:

- tests: 817
- pass: 814
- fail: 0
- skipped: 3 (credential-gated positive flows intentionally skipped)
- duration: 326,556 ms

An earlier full run hit a transient local `ECONNRESET` in `tests/g25-phase4-reconciliation.test.js` (FIX4 authentication-bound command test). The test passed in isolation and the subsequent full run completed green. No source change was made to mask it.

### 3.2 Focused regressions

New tests:

- `tests/access-administration.test.js` — 6/6
- `tests/access-administration-routes.test.js` — 1/1
- `tests/founder-race-closure.test.js` — 2/2
- Storage additions — 2/2

Focused run result: 9/9 pass.

Coverage includes service policy boundaries, extension windows, supersede/revoke audit history, tenant isolation, route elevation, anonymous rejection, Operator PAID rejection, self-grant rejection, cross-role revoke denial, two-instance Founder race, and claim recovery after canonical loss.

### 3.3 Other gates

- Behavioral validation: `npx -y node@24 src/cli/ade-validate.js` — **13/13 PASS**, platform health 100%.
- Dependency audit: `npm audit --audit-level=high` — **0 vulnerabilities**.
- Secret scan: `npx -y node@24 scripts/secret-scan.mjs` — **CLEAN**.
- Admin inline-script parse checked directly and by the existing `DISCOVERY-7` regression.

### 3.4 Production verification

`GET /api/v1/health` after deployment:

- commit: `d7426ab1f3952a242622aafa053f37fdaa866c06`
- kernel: `HEALTHY`
- booted: `true`
- subsystem count: `11`
- degraded: `[]`
- runtime alive: `true`
- AI: `configured: false`, `providerCount: 0`, state `UNAVAILABLE`, fallback `OFFLINE_LEXICAL_ENGINE`

Smoke checks:

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/awbuli/entry` | `200`, public entry `NOT_PUBLISHED`, provider `NOT_CONFIGURED`, `live: false` |
| `GET /api/v1/account/access` (anonymous) | `401` |
| `GET /api/v1/admin/access/grants` (anonymous) | `401` |

No production access grant was created. No customer data was used.

## 4. Community artifact

Command:

```powershell
npx -y node@24 scripts/build-community.mjs
```

- Artifact: `dist/ade-community-edition.zip`
- Manifest: `dist/build-manifest.json`
- Size: 22,171,715 bytes
- SHA-256: `db67bfb9bc5cfc4864a488c5c341829594bdfa20c43b46e45727e6635c740e5f`
- Source files: 946
- Commit SHA: `b636d0c5935670a17af2c7d07e6ba97828783cd8`
- Build timestamp: `2026-10-28T12:57:21.583Z`

The build script excludes runtime state, `data/`, secrets, key material, logs, node_modules and git metadata.

## 5. Files changed in source commit `b636d0c`

- `src/commerce/AccessAdministration.js` (new)
- `src/storage/StorageProvider.js`
- `src/storage/LocalStorageAdapter.js`
- `src/storage/SupabaseStorageAdapter.js`
- `src/identity/WorkforceManager.js`
- `src/routes/identityRoutes.js`
- `src/app.js`
- `public/admin/index.html`
- `tests/access-administration.test.js` (new)
- `tests/access-administration-routes.test.js` (new)
- `tests/founder-race-closure.test.js` (new)
- `tests/storage/local-storage-adapter.test.js`
- `tests/storage/supabase-storage-adapter.test.js`

## 6. Truthfulness and residual boundaries

- **Paystack/live payments remain blocked.** No real payment credentials are configured. Checkout availability remains disabled/prepared-only. No transaction or entitlement from a provider was fabricated.
- **WhatsApp/AWBULI live delivery remains unverified.** No real provider credentials or approved public business number are configured. Production reports `NOT_PUBLISHED` / `NOT_CONFIGURED` / `live: false`.
- **AI remains offline lexical fallback.** Production reports `configured: false`; no live model claim is made.
- **Access grants are an administrative overlay.** They are account/product-scoped records and an `/api/v1/account/access` read surface. They do not mutate `EditionPolicy`, do not create payment records, and do not claim a provider transaction. Product runtime entitlement continues to come from the canonical edition/commercial authorities.
- **Admin grant writes are serialized per process.** Cross-instance simultaneous edits to the shared access document are last-write-wins; this does not affect Founder bootstrap, which uses the atomic storage claim.
- **Legacy runtime state remains uncommitted.** Local runtime files (`data/`, root `admin.json`, root `audit_ledger.json`, `.ade_capability_store.json`, `debug.log`, `run-ade-closeout.ps1`) were intentionally excluded from both commits.

## 7. Rollback

If rollback is required:

1. Revert source commit `b636d0c` on `main`.
2. Rebuild and commit the community artifact for the reverted commit.
3. Confirm `/api/v1/health` returns the reverted deployed SHA, `kernel.status: HEALTHY`, and `degraded: []`.
4. Re-run anonymous access smoke checks (`401`) and `GET /api/v1/awbuli/entry` (`200`, no live claim).

No production data migration was performed, so rollback has no data-schema step.
