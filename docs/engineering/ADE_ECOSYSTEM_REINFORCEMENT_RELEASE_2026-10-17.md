# ADE ECOSYSTEM REINFORCEMENT — RELEASE EVIDENCE

Date: 2026-10-17
Baseline commit: `2f8d0968632e06b9cb1f2b34b08c9d80dc15a11f` (branch `main`, verified local + `origin/main`)
Public deployment: `https://ade-apex-community.vercel.app/` (Vercel project `ade-apex-community`)

## 1. Baseline and deployment revision

- Local HEAD at audit start: `2f8d096` — remote `origin/main` identical (`git ls-remote`).
- Latest production deployment inspected: `dpl_3b2APjYDMTQd1MxPxt9GQDwz2DDW`, status **Ready**,
  created 2026-10-17 15:30 GMT+1 (minutes after the `2f8d096` push).
- Deployed revision confirmed as `2f8d096` by content markers unique to that commit on the live URL:
  `operating-philosophy`, `sysview-`, `/api/v1/onboarding/claim`, `CONFIGURED — AWAITING VERIFICATION`.
- Live `/api/v1/runtime` reports **production runtime Node v24.21.0** (`process.node`),
  edition COMMUNITY, storage `SupabaseStorageAdapter` (configured).

## 2. Canonical product/capability inventory (one source: ProductSurfaceMatrix)

24 declared surfaces, each with a canonical server-side `summary` (added this release) alongside its
existing activation/connection/entitlement evidence. Classifications:

| Class | Surfaces |
|---|---|
| Customer-facing products | PROCARTA, AWBULI, NEXUS, EVENTOS, ADE Oracle, ADE-AIBOS/AIOPS |
| Community & market pathways | FOUNDERS CIRCLE, ADE-MARKET CIRCLE, Pilot Pathway, Partner Pathway |
| Roadmap / experimental / preview | ADE-TIDES (future), BIZ WATCH (in development), FRAUD WATCH (experimental), AGRICULTURE (preview), GOV/NGO/GRANTS (roadmap) |
| Shared platform surfaces | ADE Platform, Connection Grip, Durable Storage, Announcements, Audit Ledger, Account & Security, Workforce & Admin Console |
| Public capability surfaces | Try ADE Demos, Feedback |

Shared kernel capabilities are documented as capabilities (not products) on the homepage:
Decision Engine, Workflow Engine, Knowledge Service, Rules & Confidence, Guardian Policy,
Capability Registry, Connection Fabric, Audit Ledger, Universal AI Gateway, Event Bus,
Identity & PIN Elevation, Durable Storage.

## 3. Corrections made in this release (all verified)

1. **Canonical product summaries (server)** — `src/products/ProductSurfaceMatrix.js`: every
   `SURFACE_DECLARATION` now carries a business-first `summary`, passed through `build()`.
   Consumed by: public product-detail modal, Products surface matrix, workspace product panel,
   Founder PRODUCT VISIBILITY card. No duplicated drifting copy — one server source.
2. **Homepage explainability** — `public/index.html`: hero now expands the acronym
   ("ADE — AUTOMATED ALPHA ALIPH DIGITAL ECOSYSTEMS · THE DIGITAL OPERATING LAYER FOR AFRICA") and
   explains what ADE is building (interconnected, AI-powered business operating ecosystem; African
   businesses first, beyond Africa next); new "One kernel — shared by every product" section
   (12 shared capabilities, explicitly not standalone products); product-detail modal now renders
   canonical server truth: summary, WHO IT SERVES, ACTIVATION detail, WHAT IS NEEDED (honest
   "nothing — live on this runtime" fallback), TECHNICAL API list, and a canonical NEXT ACTION
   that routes through the real surface action resolver.
3. **O-L-D-E-I framing** — one operating philosophy with the full sequence written first
   ("Observe, Learn, Decide, Execute, Improve (O-L-D-E-I)"), explicit "not five separate
   products", the running example labelled illustrative, and an explicit statement that no
   product is assigned to a single stage.
4. **Node 24 parity in CI** — both GitHub Actions workflows moved `node-version: 22 → 24`,
   matching `engines.node >=24`, `.nvmrc` = 24, `Dockerfile` `node:24-alpine`, and the verified
   production runtime v24.21.0.
5. **Regression locks** — new `tests/product-narrative-guards.test.js` (9 tests) pins summaries,
   honesty requirements, hero explainability, philosophy framing, shared-capabilities section,
   modal canonical rendering, founder reuse, banned-claim absence and CI Node parity.

## 4. Configuration authority matrix (evidence-backed, unchanged code)

| Actor | Read settings | Configure channels/providers | Enable/verify | Notes |
|---|---|---|---|---|
| Public | Public surface JSON only | — | — | 401 on protected routes (`awbuli-auth-1`, `production-ephemeral`) |
| Authenticated base (any role) | own session | — | — | 403 `ELEVATED_PIN_REQUIRED` without step-up (`awbuli-auth-2/3`) |
| L2 + PIN step-up | yes | yes (write-only secrets) | verify required before enable (`awbuli-auth-5`) | durable-storage enforced; 503 without durable storage (`production-ephemeral`) |
| Founder (FOUNDER L3) | yes | yes | yes | full authority; elevation server-verified (`ELEV-PERSIST-1..7`) |
| Admin levels | per canonical level | L2-owned actions | legacy ADMIN L2 cannot satisfy Founder step-up (`ELEV-PERSIST-4`) | level isolation pinned by APEX-6 |
| Invitation claims | public validation only | — | — | server-validated, `grantsAccess:false`, no session/cookie (`INV-CLAIM-1/2`) |

Durable audit: actor/action/target/outcome/time recorded without sensitive values
(`awbuli-auth-6/8`); secrets never echoed (`CHANNEL-CONFIG-2`); browser storage never grants
authority (`CLIENT-AUTHORITY-1`, `PIN-STATE-1`).

## 5. Deployment architecture (evidence)

- Production path: **Vercel serverless** — `vercel.json` builds `api/index.js` (`@vercel/node`),
  all routes rewritten to it; deployment build log shows `λ api/index.js (17.58MB)`.
- Git-integration auto-deploy observed (push → Ready deployment within minutes).
- `Dockerfile` (`node:24-alpine`) is **not referenced by any supported CI/deploy path**
  (workflows contain no docker step). Decision: documented, kept consistent, untouched otherwise.
- CI (`ci-cd.yml`, `production-verification.yml`): npm ci → npm test → validate →
  verify:release → build:community (now on Node 24).

## 6. Verification evidence (this release)

| Command / suite | Result |
|---|---|
| `tests/product-narrative-guards.test.js` (new) | **9/9 pass** |
| `tests/enterprise-alignment-guards.test.js` | 7/7 pass |
| Batch A (discovery ×2, home-surface, narrative, guards) | **40/40 pass** |
| Batch B (config-contract, production-safety, ELEV-PERSIST, universal-surface, canonical-workspace, apex-closure, awbuli-auth, channel-config, session-precedence) | **61/61 pass** |
| `npm test` (canonical acceptance, 57 files) | **548 pass · 0 fail · 3 skipped** (deliberate credential-safety skips with reasons: g17–g21, g25, g26) |
| `npm run validate` | **FULL GREEN — Level-3 platform health 100% (13/13)** |
| `npm run verify:release` | **3/3 pass** (incl. community build produces verified artifact) |
| Inline-script parse (all 3 consoles) | ALL PARSE OK (5/4/1 scripts) |

## 7. Artifact identity

- `dist/ade-community-edition.zip` — **23,139,723 bytes**,
  sha256 `0c5aea118a3b64cf5e6030dd91f4c379f9e626b4430467f92daeb2143d72b389`
  (matches `dist/build-manifest.json`, built at base commit `2f8d096`, 2026-10-17T16:18:39Z).

## 8. Remaining limitations / not independently verified

- Vercel project-level Node runtime is evidenced by the live `process.node` value (v24.21.0);
  changing project settings was unnecessary and not performed.
- External provider delivery (WhatsApp/Resend/Supabase write paths), GitHub Actions execution
  results for this new commit, and long-running container deployment remain **REQUIRES EXTERNAL
  PROOF** — none is claimed here as verified.
- 3 canonical-suite skips are intentional environment-safety guards, not passes.
