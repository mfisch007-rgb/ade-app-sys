# ADE-APEX Founder Operations Runbook

This is the post-engineering, mobile-friendly operational guide for the ADE Community/MVP.

## 1. How Founder Logs In

- Open `https://ade-apex-community.vercel.app/founder.html` (or `/admin` legacy).
- Enter your 6-digit PIN → `Authenticate`.
- Success → `✓ FOUNDER SESSION AUTHENTICATED` and identity pill `@admin · ADMIN · L2` appears in header.
- No username/password is required for the founder. Workforce accounts (if provisioned) use username/password + step-up PIN.

**Wrong PIN** → `INVALID_CREDENTIALS`. No lockout, retry.  
**Session expiry** → re-authenticate. The header shows `Session expired — re-authentication required` and clears token.

## 2. Where to See Operational Records

All visible from **Founder Command Center** (authenticated):

| What | Where in Command Center | Source |
|------|------------------------|--------|
| New leads / intakes (USE_CASE, PILOT_INTEREST, etc.) | **INBOX → Community Intakes** + **OVERVIEW → Production Readiness** counts | `CommunityProgression` via `POST /api/v1/community/intake` (public) |
| Pilot requests → candidates | **INBOX → Pilot Candidates** and **PILOTS → Candidates** (`GET /procarta/pilot-candidates`) | PROCARTA-qualified intakes |
| Partners / partner interests | **INBOX → Partner Interests** and **PARTNERS** (`GET /admin/partners`) | `PartnerRegistry` |
| Feedback | **COMMUNITY → Feedback** (public) and audit/attention | `FeedbackIntelligence` |
| Workers / agents | **WORKFORCE → Agent Identities** | `WorkforceManager` |
| Pilots / pilot registry | **INBOX → Pilot Registry** and **PILOTS → Registry** | `PilotRegistry` |
| Integrations / connections | **INTEGRATIONS** (`GET /admin/connections`) | `ConnectionManager` |
| System health, runtime, events | **OVERVIEW → System Health + Live Event Stream** | Kernel / EventBus / SSE |
| Notifications / attention counts | **INBOX → Attention Summary** + `GET /attention` + `GET /notifications/recent` | `ProductNotificationEngine` + audit |

No second CRM, no duplicate intake database. Public CTAs (`REQUEST A PILOT`, `PARTNER WITH ADE`, `REQUEST AN INTEGRATION`, `CONTACT`, `FEEDBACK`) all reuse the existing intake/registry.

## 3. What Each Status Means

- **Intake**: `CAPTURED` — recorded, awaiting qualification.
- **Pilot candidate**: engine-qualified (`metadata.procarta === true`) — requires Founder `Approve` with reason.
- **Pilot registry**: `EVALUATION` → `PROMOTED` or `ARCHIVED`. `PROMOTED/ARCHIVED` is terminal — cannot be re-verdict.
- **Partner**: `EVALUATION` by default — human onboarding required before `ACTIVE`.
- **Connection**: `CONFIGURED` (metadata stored), `READY` after `/test` URL check, `NOT CONFIGURED` when no provider, never `CONNECTED` without real credential.
- **Agent/worker**: `ACTIVE` / `SUSPENDED` (toggle in WORKFORCE → Agent Identities).
- **Storage**: `DURABLE` (Supabase) vs `EPHEMERAL - CONFIGURATION REQUIRED` (local file on Vercel serverless).

## 4. What Requires Founder Judgment

- Approve pilot candidate → pilot registry (reason required).
- Verdict a pilot (`PROMOTED` / `ARCHIVED`) with evidence reason — terminal.
- Promote/demote/suspend workforce members (not founder-protected).
- Approve inviting a new workforce person (role, expiry).
- Any commercial pricing, legal acceptance, partnership commitment.

ADE does **not** auto-approve pilots, auto-set prices, or auto-execute irreversible external actions.

## 5. What ADE Handles Automatically

- Intake classification (deterministic), case creation, decision confidence, `progressionCaptured` flag, audit event publishing.
- `OBSERVE → UNDERSTAND → DECIDE → EXECUTE → MONITOR → IMPROVE` loop bookkeeping.
- EventBus fan-out, SSE streaming (`/api/v1/events/stream`), health metrics.
- Session expiry (10s check), toast feedback, bounded retries.
- Build manifest SHA generation, capability gating by `EditionPolicy`.

## 6. What an Admin/Worker Can Handle Without Founder

- With `level 2 ADMIN` or `OPERATOR` + elevated PIN (`pinVerified`): invite, list workforce, manage agents, manage partners/connections, toggle features (if `FOUNDER`/`ADMIN`), post announcements, audit read.

## 7. External Configuration Still Required (truthful diagnostics)

Check **OVERVIEW → Production Readiness** (or `GET /api/v1/system/diagnostics`):

| Component | Required Env (exact) | Current in prod (2026-09-11) |
|-----------|---------------------|------------------------------|
| Storage (durable) | `ADE_STORAGE_PROVIDER=supabase` + `SUPABASE_URL` + `SUPABASE_STORAGE_KEY` + `SUPABASE_STORAGE_TABLE` | **NOT CONFIGURED** — `Local/EPHEMERAL`, partners/intakes/connections survive only within one serverless instance. Configure Supabase to make them survive cold start. No secrets invented. |
| Email | `RESEND_API_KEY` or `SMTP_HOST/SMTP_USER/SMTP_PASS` + `EMAIL_SENDER` | **NOT CONFIGURED** — invitations shown as codes in Command Center, no fake email sent. |
| AI providers | `GEMINI_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` / `QWEN_API_KEY` (any one) | **NOT CONFIGURED** — fallback `OFFLINE LEXICAL ENGINE` active. Shows `PROVIDER NOT CONFIGURED` honest status, never `CONNECTED`. |
| Integrations | per provider `baseUrl` + `secret/apiKey` via `POST /admin/connections` | **NOT CONFIGURED** until you add one. Status `NOT CONFIGURED / READY FOR CONNECTION` honest. |
| Monitoring | UptimeRobot → target `https://ade-apex-community.vercel.app/api/v1/health` expect `200`, interval `5 min` | **NOT CONFIGURED** — endpoint is ready for monitor, account not yet created. |

Diagnostics never expose key values, only `configured: true/false` and required names.

## 8. Setup Sequence (post-engineering)

1. Ensure Vercel prod env has `ADE_ADMIN_PIN_HASH`, `ADE_PRIVATE_KEY`, `ADE_PUBLIC_KEY` (already present) — do not rotate without runbook.
2. Optionally add Supabase vars for durable partner/pilot/connection persistence.
3. Optionally add Resend/SMTP vars for email.
4. Optionally add AI provider keys for augmented PROCARTA.
5. Redeploy (`vercel --prod`). Verify `GET /api/v1/system/diagnostics` shows `DURABLE` where configured.
6. Test: create test partner → terminate → new process → GET partner still there.

## 9. Daily Founder Routine (mobile-friendly, 2 min)

1. Open Command Center → **OVERVIEW** glance: `Kernel Status ONLINE`, `Storage` (durable/ephemeral), `AI OFFLINE LEXICAL FALLBACK` honest.
2. Open **INBOX**: scan `Attention Summary` counts. If `Candidates >0` → review and `Approve` with reason. If `Pending Pilots >0` → add evidence and `Promote/Archive`.
3. Check **PARTNERS** / **INTEGRATIONS** if any new interests.
4. Watch **Live Event Stream** for `STREAM_CONNECTED` + recent `PROGRESSION_INTAKE_CAPTURED` / `PILOT` events.
5. No action needed if empty states say `No candidates` / `No partner interests` — that is honest.

## 10. Troubleshooting

- **Session expired** → re-enter PIN. If `Session has been revoked` → same.
- **Storage not configured** → see OVERVIEW diagnostics `EPHEMERAL - CONFIGURATION REQUIRED` — add Supabase vars then redeploy. Local file (`data/runtime-config/admin.json`) is durable only on laptop, not on Vercel serverless.
- **Email not configured** → diagnostics `NOT CONFIGURED` is expected. Deliver invite codes manually from `WORKFORCE → INVITATION CODE`.
- **Provider not configured** → `ConnectionManager.test` will say `INCOMPLETE/INVALID` until `baseUrl` + credential supplied. `secretConfigured` will stay false until you save a secret — secret never appears in `GET` responses.
- **Worker suspended** → `WORKFORCE → Agent Identities → Activate`.
- **Pilot awaiting decision** → `PILOTS → Candidates → Approve` (needs reason), then later `PILOTS → Registry → Promote/Archive` (needs evidence reason). Terminal verdict cannot be undone — honest `PILOT_VERDICT_TERMINAL 409`.

---

Generated: 2026-09-11 from canonical source `src/app.js`, `RuntimeConfigStore`, `CommunityProgression`, `PartnerRegistry`, `PilotGate/Registry`, `ConnectionManager`, `UniversalAIGateway`, `ProductNotificationEngine`. No secrets, no fabrications, no new G-phase.
