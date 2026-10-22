# Founder Configuration Runbook — Community Start

- **Purpose:** Configure only the external services that are intentionally enabled, verify them truthfully, and avoid turning “configured” into “live” by assertion.
- **Authority:** `.env.example` and the runtime’s server-reported state. This runbook never substitutes for the product-surface or health endpoints.
- **Do not commit** API keys, provider secrets, PINs, hashes, bearer tokens, or `.env` files.

## 1. Prerequisites

- An authorized Founder/operator account with L2 elevation.
- The deployment environment (Vercel project `ade-apex-community`) or a local `.env` that is never committed.
- A maintenance window and a recorded pre-change deployment ID.
- A secure channel for sharing credentials with the operator; never paste them into chat, code, screenshots, or ticket comments.
- The current release report: `ADE-COMMUNITY-READINESS-REPORT.md` in this directory.

## 2. Decide the runtime contract first

Set these non-secret values deliberately:

```text
ADE_RUNTIME_MODE=COMMUNITY
ADE_DEMO_MODE=false
ADE_STORAGE_PROVIDER=local
ADE_ADMIN_SESSION_LEVEL=2
ADE_TRUST_PROXY=false
```

Rules:

- Keep `ADE_TRUST_PROXY=false` unless the runtime is genuinely behind a trusted reverse proxy with a known subnet. Trusting arbitrary forwarded headers weakens rate-limit and audit identity.
- Use `ADE_RUNTIME_MODE=COMMUNITY` for the Community launch. Do not use `FULL` as a marketing label; the runtime maps it to Community behavior where applicable.
- Use `ADE_DEMO_MODE=false` for production. Demo mode is not a security substitute.

## 3. Configure AWBULI (only if live WhatsApp is intended)

AWBULI is currently `CONFIGURATION_REQUIRED`, not live. Configuration alone does not prove a working bridge.

### 3.1 Set server-side variables

```text
AWBULI_API_URL=https://<reachable-https-endpoint>
AWBULI_API_KEY=<secret-from-the-provider>
# Optional, only after confirming the bridge verifies inbound events:
# AWBULI_WEBHOOK_SECRET=<secret>
```

- Set these in the hosting provider’s server-side environment, not in `public/`.
- `AWBULI_API_URL` must be HTTPS and reachable from the deployment.
- Never expose `AWBULI_API_KEY` to the browser, logs, or error payloads.
- If the external bridge is not intended, leave both values unset. The local AWBULI engine and ledger still work as local/simulated functionality, but live WhatsApp remains unavailable.

### 3.2 Register and verify the provider gate

In the Admin/Connect surfaces:

1. Open the provider/channel configuration for `AWBULI_WHATSAPP`.
2. Register the provider descriptor with the credential names only — never the secret values.
3. Configure the HTTPS base URL.
4. Run **Verify**. Verification is syntactic/contract verification; it does not create live traffic.
5. Enable the provider only after verification and only with an explicit actor/reason.
6. Add the WhatsApp sender identity as metadata through Admin → AWBULI WhatsApp numbers. Numbers are masked and never make a bridge live by themselves.

### 3.3 Confirm server truth

```powershell
$base='https://ade-apex-community.vercel.app'
Invoke-RestMethod "$base/api/v1/awbuli/entry"
Invoke-RestMethod "$base/api/v1/connectivity/products/awbuli"
Invoke-RestMethod "$base/api/v1/product-surface" |
  Select-Object -ExpandProperty surfaces |
  Where-Object id -eq 'awbuli'
```

Expected transition:

- Before configuration: `configured:false`, `live:false`, `providerState:"NOT_CONFIGURED"`, connection grip `0`.
- After a verified and enabled bridge: the server may report configured/live only when its own evidence says so.
- Never move AWBULI to `ACTIVATED` or claim a live number from UI copy alone.

### 3.4 Public entry behavior

- Trigger words are `START` / `STAR`.
- The public page must show “No public WhatsApp number is configured” until the server publishes one.
- Do not publish a number, QR code, or `wa.me` link manually.
- AWBULI status must remain on the product surface (`#/products`), not Product Theater.

## 4. Storage (choose one)

### Local

```text
ADE_STORAGE_PROVIDER=local
ADE_CAPABILITY_STORE=.ade_capability_store.json
```

Suitable for local/dev or a persistent volume. Not durable across ephemeral serverless instances.

### Supabase

Use the names defined in `.env.example`:

```text
ADE_STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<server-side secret>
SUPABASE_STORAGE_TABLE=ade_kv_store
```

- `SUPABASE_SECRET_KEY` is preferred; aliases are documented in `.env.example`.
- The table must have `k text primary key` and `v jsonb`; see `database/supabase-production-schema.sql`.
- Verify with the read-only storage status/verify surface. A write failure must report failure; never treat a local fallback as durable production storage.
- If missing configuration, the adapter must fail safely with `STORAGE_NOT_CONFIGURED` rather than silently connecting.

## 5. Founder credentials and sessions

1. Generate the admin PIN hash locally:

```powershell
node scripts/generate-admin-pin-hash.mjs
```

2. Store only the hash in `ADE_ADMIN_PIN_HASH`.
3. Configure signed-session keys only through the supported server-side mechanism (`ADE_PUBLIC_KEY` / `ADE_PRIVATE_KEY` or the managed filesystem path).
4. Keep `ADE_ADMIN_SESSION_LEVEL=2` for normal admin operations. Founder-level operations that require elevation stay distinct.
5. Never rotate credentials by editing a live credential store by hand. Use the supported rotation/recovery flow and record the audit event.
6. Founder login is intentionally password + PIN. Do not remove the PIN step to “fix” a repeat-submit symptom.

## 6. Optional services

### AI provider

Leave unconfigured for Community if lexical fallback is acceptable. If enabling one provider:

```text
GEMINI_API_KEY=<server-side secret>
# or GROQ_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY
```

- Configure only the providers actually used.
- Oracle must report `ACTIVATED` with `OFFLINE_LEXICAL_ENGINE` when no provider is configured, never a fake live provider.
- Test one real query and confirm the provider label/evidence matches the configuration.

### Transactional email

```text
RESEND_API_KEY=<server-side secret>
```

- Use only a verified sender domain.
- An unconfigured connector must report `NOT CONFIGURED`; do not claim delivery.
- Test one internal message before announcing email availability.

## 7. Media privacy verification

The source media and manifest are L2-only. After deployment, verify anonymously:

```powershell
$base='https://ade-apex-community.vercel.app'
try { (Invoke-WebRequest -Method Head "$base/ade-experience/media/Try_again(3).mp4").StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
try { (Invoke-WebRequest -Method Head "$base/ade-experience/media-manifest.json").StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `401` for both. If either returns `200`, stop the launch and remove the public artifact/route before proceeding.

Also confirm:

- No `.bak` files are reachable under `/`.
- `/ade-experience/` does not show a source-video selector or raw filenames.
- Authorized playback uses a Bearer `fetch`/blob path; a bare `<video src>` cannot rely on the session cookie alone.

## 8. Release gate sequence

Run from the repository root on a clean staging branch/checkout:

```powershell
npm test
$env:ADE_HTTP_TEST_PIN='<ephemeral-6-digit-test-pin>'
npm run test:full
Remove-Item Env:ADE_HTTP_TEST_PIN
npm run validate
npm run build:community
npm run verify:release
npm audit --audit-level=high
```

Stop on any failure. Do not deploy through `deploy-enterprise.ps1`, `deploy-evolution.ps1`, or `deploy-complete.ps1`; they are prohibited because they inject fake configuration and directly commit/push.

For the current candidate, the authorized lockfile-only update cleared the audit: both full and production audits report zero vulnerabilities. Rerun the audit on every future lockfile change.

## 9. Post-deployment verification

Record the deployed commit and run:

```powershell
$base='https://ade-apex-community.vercel.app'
Invoke-RestMethod "$base/api/v1/health"
Invoke-RestMethod "$base/api/v1/product-surface"
Invoke-RestMethod "$base/api/v1/awbuli/entry"
(Invoke-WebRequest -Method Head "$base/").StatusCode
(Invoke-WebRequest -Method Head "$base/products").StatusCode
(Invoke-WebRequest -Method Head "$base/founder").StatusCode
```

Required evidence:

- Health reports the intended deployed commit.
- Kernel is `HEALTHY`; subsystem counts match the edition.
- Product surface reports 24 surfaces and AWBULI on `#/products`.
- Media and manifest return 401 anonymously.
- Public sign-in and founder two-step login work in a browser.
- `/admin` and `/founder` remain login-gated shells, not anonymous consoles.
- No `.bak` or internal README is reachable.

## 10. Rollback

1. Redeploy the previous known-good deployment.
2. Revoke any credential added during the change window through the supported rotation flow.
3. Disable the AWBULI provider gate if it was enabled but did not verify.
4. Re-check media/manifest privacy and auth routes.
5. Record the rollback reason and evidence in the release report.

## 11. Evidence to retain

- Deployed commit and deployment ID.
- Health/product-surface/AWBULI JSON snapshots (redact secrets).
- Media/manifest 401 proof.
- Login screenshots or recordings with no credentials visible.
- Audit log entries for provider enable/disable and credential rotation.
- Build artifact SHA-256 and timestamp.
- Any approved exception with owner and expiry.
