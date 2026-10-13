# ADE-APEX Route & Capability Integration Matrix

**Branch:** `enterprise/product-experience-redesign` · **Base:** `046f29a` (main)
**Generated:** 2026-10-13 · **Status:** living document — update when routes change.

Governing rule: **server/kernel/EventBus state is authoritative; UI is never
authoritative for security, identity, permissions, sessions, capabilities,
presence, or audit** (MASTER_ARCHITECTURAL_LOCK §2).

## 1. Document routes (static shells served by Express)

| URL | File | Surface | Load auth | Data auth inside |
|---|---|---|---|---|
| `/` | `public/index.html` | Public platform + 11 sections + Workspace + Command Center | none | per-endpoint (see §3) |
| `/admin` | `public/admin/index.html` | Admin control plane | none (shell) | L2 token `ade_admin_token` + `ade_token`/`ade_elevated` cookies |
| `/founder` | `public/founder.html` | Founder control plane | none (shell) | L2/L3 token `ade_founder_token`, PIN step-up |
| `/market-lab`, `/lab` | `public/market-lab.html` | Market & simulation lab | none (shell) | public reads; L2 for analyze/paper/ingest |
| `/procarta-onboarding` | `public/procarta-onboarding.html` | PROCARTA onboarding | none | via canonical intake endpoints |
| `/api/*` | `src/app.js` → `api/index.js` | JSON API (404 `API_ENDPOINT_NOT_FOUND` for unknown) | per-route | `HttpSecurityBoundary` L1/L2/L3 |

## 2. Canonical SPA sections (`public/index.html`, 11 views)

| Section | Canonical paths (aliases) | Role visibility |
|---|---|---|
| Home | `/home` | public |
| Products | `/products`, `/awbuli`, `/connect`, `/connect/platforms`, `/payments`, `/commerce`, `/financial`, `/products/*` | public |
| PROCARTA | `/procarta` | public (submit) / session (cases) |
| Product Theater | `/product-theater` | public |
| Try ADE | `/try-ade` | public |
| Architecture | `/how-it-works`, `/architecture` | public |
| Community | `/community`, `/pilot`, `/join`, `/partners`, `/eventos` | public |
| Feedback | `/feedback` | public |
| Account | `/account`, `/signin` | public (login) / session (manage) |
| Workspace | `/workspace`, `/workflows`, `/workforce`, `/invitations`, `/ai-workers`, `/knowledge`, `/decisions`, `/audit`, `/notifications`, `/settings`, `/markets*`, `/gaming*`, `/sports` | hidden without token; PARTNER sees subset |
| Command Center | `/command-center`, `/operations`, `/operations/live` | hidden without token (non-partner) |

Hash contract preserved: `#/section` deep links, `pushState` on section
navigation only (modals never push history), `popstate` restores section.

## 3. Section → backend source of truth

| Section | Endpoint(s) | Contract | Auth | States |
|---|---|---|---|---|
| Home | `GET /api/v1/health` | `{status, kernel{status,subsystemCount}, runtime{uptimeSeconds}}` | none | LIVE / degraded list |
| Home | `GET /api/v1/capabilities` | `{authoritative:true, capabilities[], subsystems[]}` | none | LIVE |
| Home | `GET /api/v1/products` + `GET /api/v1/product-surface` | product catalog + entitlement states | none | LIVE |
| Home | `GET /api/v1/procarta/status` | engine status | none | LIVE |
| Home | `GET /api/v1/announcements` | public announcements | none | LIVE / empty |
| PROCARTA | `POST /api/v1/intake/API {kind:BUSINESS_PROCESS,…}` | creates case, raises internal notification | none | LIVE |
| PROCARTA | `GET /api/v1/cases`, `PATCH /api/v1/cases/:id` | case list / attach | session | LIVE / empty |
| Product Theater | `GET /api/v1/media/providers`, `…/media/registry/stats` | provider truth | none | LIVE / PROVIDER_REQUIRED |
| Product Theater | `POST /api/v1/media/request` | media request, fail-closed | session | validation errors explicit |
| Try ADE | `GET /api/v1/demo/scenarios`, `POST /api/v1/demo/run` | sandboxed demo | none | SIMULATED (labeled) |
| Architecture | `GET /api/v1/runtime`, `/api/v1/edition`, `/api/v1/metrics` | runtime truth | none | LIVE |
| Community | `POST /api/v1/community/intake` | plain-language intake | none | LIVE |
| Community | `POST /api/v1/account/accept-invitation` | invitation accept | none + code | LIVE / invalid-code error |
| Feedback | `POST /api/v1/feedback` | feedback pipeline | none | LIVE |
| Account | `POST /api/v1/account/login` → `POST /api/v1/account/pin` | workforce login + PIN elevation | credentials | LIVE |
| Account | `POST /api/v1/auth/pin` | legacy admin PIN (sets `ade_token`+`ade_elevated` cookies) | PIN | LIVE / 503 AUTH_NOT_CONFIGURED |
| Account | `GET /api/v1/account/session` | session truth | session | LIVE / 401 |
| Workspace | `GET /api/v1/ops/graph` | role-scoped operational graph | session (never in boot path) | LIVE / opt-in explorer, degrades gracefully |
| Workspace | `GET /api/v1/cases`, `/api/v1/workforce` (L2), `/api/v1/inbox` | ops data | session/L2 | LIVE / RBAC 403 explicit |
| Workspace | `POST /api/command/execute {action, payload}` | capability execution (RBAC + edition gates) | session | EXECUTED / COMMAND_RBAC_BLOCKED / EDITION_GATED |
| Command Center | `GET /api/v1/events/stream` (SSE) | live EventBus bridge + `:heartbeat` comments | none (stream) | LIVE / reconnecting |
| Command Center | `GET /api/v1/admin/overview` (L2), `/api/v1/system/diagnostics` (L2) | control-plane truth | L2 | LIVE / 401 |
| Search | `GET /api/command/search?q=` | capability discovery | none | LIVE |

Anonymous Home boot set (must all answer 200 without auth — guarded by
`tests/home-surface.test.js` HOME-5): `health, capabilities, runtime,
edition, demo/scenarios, media/providers, media/registry/stats,
procarta/status, products, metrics, announcements, connectivity/inventory,
product-surface, notifications/recent?limit=5, ops/graph`. `icx/status`
stays 401-gated (L2).

## 4. Truthfulness boundaries (never claim LIVE without proof)

| Capability | Status | Evidence |
|---|---|---|
| FOREX paper execution | AVAILABLE (paper) | `tests/trading-paper.test.js`, ledger + closePaper |
| BINARY defense | LIVE (defense) / execution PROVIDER_REQUIRED | `tests/trading-hardening.test.js`; `BROKER_NOT_CONFIGURED` truthful |
| AVIATOR analytics | AVAILABLE (analytics only, honest disclaimer) | `AviatorAnalyticsEngine` + history store |
| Sports odds | PAPER fallback, live PROVIDER_REQUIRED | `SportsDataBus` odds aggregation |
| AWBULI live send | SIMULATED-ONLY until real provider integration | `AwbuliChannelAdapter` + `ProviderGate`; UI must label simulated |
| AI providers (Gemini/Groq/DeepSeek/Qwen) | FALLBACK LIVE (`OFFLINE_LEXICAL_ENGINE`), external PROVIDER AUTH REQUIRED | `tests/ai/g20-provider-neutral.test.js` |
| Resend email | local NOT CONFIGURED (honest), production CONFIGURED | connector status endpoint |
| UptimeRobot | endpoint LIVE, external monitor NOT VERIFIED | `GET /api/v1/health` public |
| Durable storage | local filesystem fallback; production durable when configured; 503 `STORAGE_NOT_CONFIGURED` guard in prod-ephemeral | `tests/storage/*` |

## 5. Shared frontend integration layer (this branch)

| File | Purpose | Contract |
|---|---|---|
| `public/ade-design-system.css` | Enterprise tokens + components, light/dark (`[data-theme=dark]`), responsive, reduced-motion | presentation only, additive |
| `public/js/ade-api-client.js` | `window.ADE`: per-surface token clients (`ade_token` / `ade_admin_token` / `ade_founder_token`), humanized errors, SSE reconnect, theme init | transport only; server authoritative |
| `public/js/ade-route-registry.js` | `window.ADE_ROUTES`: canonical `PATH_SECTION`, document routes, section→endpoint map, truth states | must mirror `PATH_SECTION` in `public/index.html` |

## 6. Verification per surface

| Surface | Method | Guard |
|---|---|---|
| `public/index.html` | `tests/public-ux.test.js`, `tests/home-surface.test.js` (incl. live boot HOME-5), `tests/ux-cohesion-overhaul.test.js` | 18/18 baseline green on base commit |
| `public/admin/index.html`, `public/founder.html` | `tests/home-surface.test.js` HOME-1 (inline JS parses) | node `--check` on inline blocks |
| Backend contracts | `npm test` full suite (50+ files) | compare before/after |
| Responsive | `@media` + `overflow-x:clip` + touch targets (static guards) + manual check at 390px / 1280px | where browser tooling available |
