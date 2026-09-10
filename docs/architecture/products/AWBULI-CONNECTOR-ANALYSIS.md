# AWBULI CONNECTOR ANALYSIS

**Date:** 2026-09-10
**Status:** TRUTHFUL — external connection NOT established; in-repo engine only
**Author:** ADE APEX AIOPS Community/MVP Final Production Closure pass

---

## Executive Summary

AWBULI ("ADE-AWBULI System Controller & Automation Engine") exists inside the ADE
repository as a **pluggable product suite** (`products/awbuli/`). No external AWBULI
repository, deployment, database, API, webhook, or credentials are legitimately
accessible from this environment. ADE therefore operates AWBULI in **ADE Native
Integration** mode using the in-repo engine, and does NOT claim an external connection.

> **Never pretend connection success.** Connection is only ESTABLISHED when
> `AWBULI_API_URL` and `AWBULI_API_KEY` are configured and verified.

---

## Application

| Item | Finding |
|------|---------|
| Name | AWBULI Suite (ADE-AWBULI System Controller & Automation Engine) |
| Purpose | Messaging automation; lead capture; broadcast queue |
| In-repo engine | `products/awbuli/AwbuliEngine.js` — `captureLead()`, `broadcastMessage()` (QUEUED) |
| Data layer | In-memory `Map` (lead records) |
| Vision notes | `PROJECT AWBULI START.txt` (WhatsApp business-intelligence ledger: credits/debits/invoices/defaulters, KPI comparison, business-suggestion insight) |

## Repository

| Item | Finding |
|------|---------|
| Location | `products/awbuli/` (adapter.js, index.js, manifest.json, AwbuliEngine.js) |
| External repository | NONE accessible/configured |
| Version | 1.0.0 (`manifest.json`) |

## Deployment

| Item | Finding |
|------|---------|
| External deployment | NONE — no deployment URL, platform, or identifier configured |
| Local surface | AWBULI is registered as a product in `ProductRegistry` and referenced as the
  WhatsApp channel label (`WHATSAPP / AWBULI`) and feature `AWBULI_MESSAGING`
  (COMMUNITY, `requiresExternal: true`, currently `available: false`) |

## Database

| Item | Finding |
|------|---------|
| External database | NONE accessible |
| In-repo storage | In-memory Map (not durable) |
| Supabase option | ADE Supabase migration (`database/supabase-production-schema.sql`) provides a
  durable home if/when a Supabase project is configured (human-owned credentials) |

## Authentication

| Item | Finding |
|------|---------|
| External auth | NONE configured |
| Required env vars | `AWBULI_API_KEY` (absent) |
| Secret handling | ADE `ConnectionManager` redacts secrets server-side |

## Storage

NONE durable today. AwbuliEngine leads live in process memory only.

## API

NONE external. The in-repo engine exposes JavaScript methods only, no HTTP surface.

## Webhooks / Events

NONE external. ADE EventBus does not currently proxy AWBULI inbound events.

## Environment Variables

| Variable | Status |
|----------|--------|
| `AWBULI_API_URL` | ABSENT |
| `AWBULI_API_KEY` | ABSENT |
| `AWBULI_*` (any) | ABSENT |

## ADE-Compatible Interfaces

| Interface | Status |
|-----------|--------|
| ProductRegistry entry (`AWBULI`) | PRESENT |
| Channel `WHATSAPP / AWBULI` | PRESENT (inbound) |
| Feature `AWBULI_MESSAGING` | PRESENT (COMMUNITY, blocked pending external dependency) |
| Adapter (`AwbuliAdapter`) | FIXED to truthful status (no fabricated connection) |

## Missing Requirements (to establish a real external connection)

1. `AWBULI_API_URL` — a reachable, HTTPS external AWBULI deployment endpoint
2. `AWBULI_API_KEY` — a real secret issued by that deployment
3. Optional: `AWBULI_WEBHOOK_SECRET` for inbound event verification

## Potential Conflicts

- Fabricated connection claims (the old adapter logged "Connected to external
  AWBULI repository" with no actual check) — **removed**.
- In-memory data must not be presented as durable.
- Real-money / unattended messaging automation must not run unauthenticated.

## Recommended Integration Mode

**Primary: ADE Native Integration (ACTIVE today)**
- Use `AwbuliEngine` for lead capture + queued broadcast in-memory.
- Register AWBULI as a real product; route messages through the WhatsApp channel.

**Forward: API/Webhook Bridge (when external endpoint exists)**
- When `AWBULI_API_URL` + `AWBULI_API_KEY` are configured, ADE bridges via REST
  and verifies readiness with the existing `ConnectionManager.test()` (HTTPS-only).
- Inbound events verified via webhook secret before ADE EventBus publish.

**Discarded routes (not viable today):**
- Shared ADE-managed database — no Supabase project configured (`SUPABASE_URL` absent).
- PostgREST / direct SQL — no database credentials accessible.
- Read/analyze-only sync — no external repository/deployment metadata reachable.
- Vercel integration / git synchronization — no AWBULI repo/deployment on Vercel accessible.

> **DATABASE CONTROL NOT AVAILABLE.** No external AWBULI database is reachable from this
> environment. Required external configuration (human-owned):
> 1. Provide an AWBULI deployment URL + API key, OR
> 2. Provide a Supabase project URL + service/anon keys to host AWBULI state, OR
> 3. Declare AWBULI in-repo native mode sufficient for MVP (no external data).