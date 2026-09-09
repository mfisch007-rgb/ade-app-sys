# ADE-APEX — FOUNDER EXTERNAL CONFIGURATION RUNBOOK

| | |
|---|---|
| **Document** | ADE_FOUNDER_EXTERNAL_CONFIGURATION_RUNBOOK.md |
| **Date** | 2026-09-04 |
| **Audience** | ADE-APEX founder / operator configuring a local, VPS, or Vercel deployment |
| **Contract authority** | `.env.example` (repository root) — this runbook mirrors it |
| **Companion gate** | MASTER_ENGINEERING_FINAL_INTEGRATION_CTO_GATE.md |

This runbook explains **what each external value is, what it enables, and how
to set it safely** — so that no operation is performed with a half-understood
environment contract, and no false "connected" state is created accidentally.

---

## 1. Two second summary

- Copy `.env.example` to `.env`, edit the four *decision* variables
  (`PORT`, `ADE_RUNTIME_MODE`, `ADE_DEMO_MODE`, `ADE_EDITION`), and start with
  the canonical launcher `node src/server.js`.
- Everything else is **optional**. The Community runtime boots, runs all tests,
  executes demo scenarios, ingests intake, processes cases, captures feedback,
  records media requests, and serves telemetry with **no keys configured**.
- Configure a key **only** when you intend to use that service, and never
  commit real keys.

---

## 2. Runtime identity & edition (decide first)

### `ADE_RUNTIME_MODE`
- Contract: `FULL | COMMUNITY | PILOT | PROFESSIONAL | ENTERPRISE | SYSTEM | DEMO`.
- `FULL` is a compatibility alias for `COMMUNITY` (mapping in
  `src/core/EditionPolicy.js`). The badge/enforcement layer reports `COMMUNITY`
  when the alias resolves.
- The server accepts all seven values; `EditionPolicy` derives the enforced
  entitlement set (17 capabilities, per-edition limits).
- Leave unset for the default `FULL` → `COMMUNITY` Community behavior.

### `ADE_DEMO_MODE`
- `true` arm the **DemoSafetyBoundary**: controlled operating limits (no
  production credentials fabrications, no irreversible actions, traceable demo
  execution IDs). `false` (default) means demo runs execute as plain
  deterministic simulations.
- Also activated automatically when `ADE_EDITION=DEMO`.

### `ADE_EDITION`
- Explicit edition override consumed by `CommunityEditionGuard` and
  `DemoSafetyBoundary`, and used as the edition label in feedback payloads.
- Follows the same value contract as `ADE_RUNTIME_MODE`.

---

## 3. Storage (G17)

### Default — `local`
- `ADE_STORAGE_PROVIDER=local` → filesystem adapter. Suitable for local dev and
  persistent container volumes. No configuration keys required.

### Durable — `supabase`
- For external durable KV storage. Requires all three:
  - `SUPABASE_URL` — project URL.
  - `SUPABASE_STORAGE_KEY` — service-role or anon key with table access.
  - `SUPABASE_STORAGE_TABLE` — table with columns `k` (text primary key) and
    `v` (jsonb).
- The adapter **fails safe** (`STORAGE_NOT_CONFIGURED`) when values are missing
  or a live call fails. It never silently "connects".

### Registry state
- `ADE_CAPABILITY_STORE` — filesystem path for the capability registry state
  (default `.ade_capability_store.json`). Note `data/snapshots/` is reserved for
  kernel shutdown snapshots and is gitignored.

---

## 4. HTTP admin authentication (G18)

### Generation
```
node scripts/generate-admin-pin-hash.mjs
```
The script produces a bcrypt hash of your admin PIN. Copy the hash — never the
raw PIN — into the environment.

### Variables
- `ADE_ADMIN_PIN_HASH` — bcrypt hash used by `/api/v1/auth/*`.
- `ADE_ADMIN_SESSION_LEVEL` — required session authority level (default `2`;
  `2` is the standard admin level).
- `ADE_ADMIN_RECOVERY_KEY_HASH` — optional bcrypt recovery credential hash used
  by the recovery flow.

### Signed sessions
- `ADE_PUBLIC_KEY` / `ADE_PRIVATE_KEY` — RSA PEM keypair for signing admin
  sessions. Supported in **two modes**:
  1. **Env-var mode** (preferred on serverless): both PEM strings as single
     lines (escape `\n` when embedding into JSON). When set, filesystem keys
     are ignored.
  2. **Filesystem mode** (local default): place keys at the path resolved by
     `src/security/KeyManager.js`; the private key file is enforced at mode
     `0o600`.
- `ADE_SESSION_TTL_SECONDS` — signed-session lifetime (default `3600`).
- `ADE_SESSION_REVOCATION_FILE` — revocation list path.
- `ADE_TOKEN_ISSUER` / `ADE_TOKEN_AUDIENCE` — claim identity validated on every
  session verification (defaults `ADE-APEX` / `ADE-APEX-RUNTIME`).
- `ADE_CREDENTIAL_STORE_FILE` — credential lifecycle/rotation state path.

---

## 5. Feedback pipeline (G19)

### `ADE_FEEDBACK_QUEUE`
- Filesystem path for the kernel feedback queue
  (default `.ade_feedback_queue.json`).
- Persistence is **atomic** (tmp + rename) and **non-fatal**: a failure to
  persist never breaks intake or kernel boot, and the in-memory queue keeps
  working.

---

## 6. AI providers (G20)

### The honest-contract rules
- Providers are tried **in a fixed declaration order**, each only when its own
  key is present. Unconfigured providers are skipped and *reported as not
  configured* — never as connected.
- If no provider is configured, or every configured provider fails a real
  network/HTTP call, the gateway falls back to the **ADE offline lexical
  engine**, which is labelled honestly (`OFFLINE_LEXICAL_ENGINE`) and never
  masquerades as live AI.
- Configure **only** the providers you use; leave others empty.

### Variables (all optional)
- `GEMINI_API_KEY` · `GROQ_API_KEY` · `DEEPSEEK_API_KEY` · `QWEN_API_KEY`.
- `ADE_AI_MODE` — optional deterministic routing override
  (`FULL | COMMUNITY | PILOT | PROFESSIONAL | ENTERPRISE | SYSTEM | DEMO`).
- `ADE_AI_CACHE_MAX_SIZE` — semantic-cache entry bound (default `1000`); the
  cache evicts oldest entries at the cap.

---

## 7. Security & rate limiting (G18/G22)

- `ADE_RATE_LIMIT_MAX` (default `20`) / `ADE_RATE_LIMIT_WINDOW_MS`
  (default `60000`) — burst limiter for sensitive endpoints.
- `ADE_AUTH_RATE_LIMIT_MAX` (default `10`) / `ADE_AUTH_RATE_LIMIT_WINDOW_MS`
  (default `60000`) — stricter limiter for the auth endpoints.
- `ADE_TRUST_PROXY=false` — disables trusting `X-Forwarded-For` unless you run
  behind a trusted reverse proxy.

---

## 8. Resource bounds (G7)

- `ADE_MEDIA_MAX_REQUESTS` — bounded in-memory media request registry
  (default `5000`). Evicts oldest requests at the cap.
- `ADE_CAPABILITY_STORE` (see §3) also bounds registry persistence.

---

## 9. Legacy modules — do NOT configure (honesty notice)

The canonical runtime (`src/app.js` + `src/server.js`) does **not** mount the
legacy subscription / redis-queue / whatsapp / stripe route stacks. Variables
those modules would consume (`REDIS_URL`, `ADMIN_SECURITY_PIN`, `JWT_SECRET`,
`PIN_PEPPER`, `SUBSCRIPTION_SALT`, `RATE_LIMIT_MESSAGES`, `ADMIN_PHONE`,
`PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `GCP_*`,
`GOOGLE_ADK_*`, `UNITOOL_`/`HEYGEN_`/`GOOGLE_MEDIA_*`,
`DEFAULT_VIDEO_PROVIDER`, `PAIRING_PHONE`) are **dead configuration** in this
runtime. Setting them creates no connectivity. If a hosted environment template
inherits them, strip them to avoid confusion.

---

## 10. Launch, verify, stop

```
# Local / VPS
node src/server.js          # launcher with graceful shutdown

# Operations safety (recommended, not required)
npx pm2 start src/server.js --name ade-awbuli && npx pm2 save

# Canonical verification
npm test                    # 148/148 is the acceptance authority

# Smoke checks
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health
Invoke-RestMethod http://127.0.0.1:3000/api/v1/edition
```

Clean shutdown: **SIGTERM / SIGINT / uncaughtException** → kernel subsystem
teardown → `KERNEL_SHUTDOWN` snapshot → exit 0.

> Note: the 2026-09-04 acceptance run discovered a leftover **PM2-managed
> `ade-awbuli` app** from a prior session that kept respawning the server on
> port 3000. If you see a port stay occupied after the process is killed, check
> `pm2 list` and stop it (`npx pm2 delete ade-awbuli`), then restart cleanly.

---

## 11. Deployment checklist (copy block)

```
PORT=3000
ADE_RUNTIME_MODE=COMMUNITY      # or PILOT/PROFESSIONAL/ENTERPRISE/SYSTEM/DEMO
ADE_DEMO_MODE=false
# ADE_EDITION=COMMUNITY
ADE_STORAGE_PROVIDER=local
ADE_CAPABILITY_STORE=.ade_capability_store.json
ADE_ADMIN_PIN_HASH=            # node scripts/generate-admin-pin-hash.mjs
ADE_ADMIN_SESSION_LEVEL=2
# ADE_ADMIN_RECOVERY_KEY_HASH=
# ADE_PUBLIC_KEY=   # PEM, single line, \n escaped
# ADE_PRIVATE_KEY=  # PEM, single line, \n escaped
ADE_SESSION_TTL_SECONDS=3600
ADE_SESSION_REVOCATION_FILE=.ade_session_revocations.json
ADE_TOKEN_ISSUER=ADE-APEX
ADE_TOKEN_AUDIENCE=ADE-APEX-RUNTIME
ADE_CREDENTIAL_STORE_FILE=.ade_credential_lifecycle.json
ADE_FEEDBACK_QUEUE=.ade_feedback_queue.json
# GEMINI_API_KEY=  # optional — leave empty to stay honestly offline
# GROQ_API_KEY=
# DEEPSEEK_API_KEY=
# QWEN_API_KEY=
ADE_AI_CACHE_MAX_SIZE=1000
ADE_RATE_LIMIT_MAX=20
ADE_RATE_LIMIT_WINDOW_MS=60000
ADE_AUTH_RATE_LIMIT_MAX=10
ADE_AUTH_RATE_LIMIT_WINDOW_MS=60000
ADE_TRUST_PROXY=false
ADE_MEDIA_MAX_REQUESTS=5000
```