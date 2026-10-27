# ADE-APEX Closure Report

- Date: 2026-10-27
- Branch: `main`
- Source commit: `1a422a9e33fe7e4575b2819dc350865e2a2c9bbb`
- Release artifact commit: `d6896fdc109d6d85606618e6e44ce010a1a40075`
- Production deployment: `https://ade-apex-community.vercel.app`
- Deployment ID verified: `dpl_9rvpNGHYSDUQzfReY8FHmLa3tuE6`
- The final docs-only commit may advance Vercel's reported SHA; runtime source remains `1a422a9`.

## Outcome

The closure is committed, pushed, built, deployed, and smoke-tested. Production reports the expected release commit and a healthy kernel.

## Verification

| Gate | Result |
| --- | --- |
| Full suite (`node@24 scripts/run-tests.mjs`) | 806 tests, 803 pass, 0 fail, 3 skipped |
| Payment suite | 12/12 pass |
| ProCarta assessment contract | 3/3 pass |
| Level-3 behavioral/restart validation | 13/13, 100% |
| Release verification | 3/3 pass |
| `node --check src/server.js` | pass |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Production `/api/v1/health` | HTTP 200, kernel `HEALTHY`, commit `d6896fd` (pre-report deployment) |
| Production homepage | HTTP 200 |
| Production assessment empty-payload guard | HTTP 400 `ASSESSMENT_EMPTY` |
| Production payment availability | `showPayment:false`, state `DISABLED` |

Community artifact: `dist/ade-community-edition.zip`, SHA-256 `1d0bc1ff8262ae618bfe431f0115be38459f10b66c1c144c9d6b9d8988c8f218`, commit `1a422a9`.

## Changes Closed

- Payment start is now a persisted, expiring checkout intent. It reports `PAYMENT_REQUEST_PREPARED`, `providerContacted:false`, `checkoutUrl:null`, and `accessCode:null`; no provider charge is claimed.
- Payment webhooks require a matching intent, tenant, unexpired intent, matching amount, and normalized plan mapping. Duplicate deliveries are idempotent, including late provider retries.
- Payment state hydration is fail-closed; unreadable state cannot be overwritten. Async webhook persistence rolls back entitlement and intent state on failure.
- The public payment route is rate-limited and fixed to the default tenant; client-supplied tenant/admin initiation is not trusted. The customer payment button is server-gated and disappears when payment is disabled.
- ProCarta assessment retains contact, registration, organization size/type, quote context, consent, and signature assertions. Signatures remain explicitly client-asserted and unverified; signature images are not transmitted.
- Assessment dedupe is contact-scoped and includes organization/process context, preventing one lead from overwriting another.
- Deterministic structural projections are labeled as projections, not measured BPMN or guaranteed efficiency outcomes.
- Durable closure work covers audit persistence, case/trading hydration, provider document storage health, runtime config write safety, identity/founder provisioning, and audit/security boundaries.
- Added a canonical full-suite runner and durable-closure regression tests.

## Remaining Risks / Open Work

- **Live payment checkout is not enabled.** The intended payment behavior is a prepared request for follow-up; no Paystack `transaction/initialize` call is made. Real checkout still requires server-authoritative pricing/quote binding and a configured gateway.
- Cross-instance Founder provisioning still relies on a process-local queue; a distributed lock is not implemented.
- `ProviderDocumentStorageAdapter.readSync` can serve the last hydrated cache while the provider is unhealthy; health is fail-closed but callers must honor it.
- Deployment is via Vercel Git integration; there is no checked-in deploy workflow. Production identity was verified by `/api/v1/health`.
- No live payment credentials were used or tested.

## Production Smoke Notes

The production health endpoint reported:

```json
{
  "success": true,
  "status": "OK",
  "service": "ADE-APEX EOS",
  "build": { "commitShort": "d6896fd" },
  "kernel": { "status": "HEALTHY", "booted": true, "subsystemCount": 11 },
  "degraded": []
}
```

The payment availability endpoint truthfully returned `showPayment:false` while payments are disabled.
