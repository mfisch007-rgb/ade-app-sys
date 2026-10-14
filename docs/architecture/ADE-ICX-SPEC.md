# ADE Internal Communications Exchange (ADE-ICX)
## Architecture Specification

**Version:** 1.0  
**Date:** 2026-09-03  
**Status:** First-Class Kernel Subsystem  

---

## 1. Purpose

ADE-ICX is the internal staff communications and organizational coordination system for the ADE ecosystem. It is a **first-class kernel subsystem** operating under the canonical `EnterpriseKernelMaster` and the canonical `EnterpriseEventBus`.

It covers staff operating across:

- ADE Core
- AWBULI
- PROCARTA
- ADE Infrastructure
- ADE ecosystem/platform units
- Future ADE products and operational subsidiaries/units

---

## 2. Canonical Authority

ADE-ICX does **not** own identity, security, event bus, or capability registry authority. It consumes those services from the canonical kernel:

| Authority | Canonical Source |
|---|---|
| Identity / Session | `src/kernel/IdentityOnboarding.js` |
| EventBus | `src/kernel/EnterpriseEventBus.js` |
| CapabilityRegistry | `src/core/CapabilityRegistry.js` |
| Security / RBAC | `src/security/CommunityEditionGuard.js` |
| Kernel | `src/kernel/EnterpriseKernelMaster.js` |

ADE-ICX is **never** an alternate authority for any of these concerns.

---

## 3. Staff Identity Model

### 3.1 Required Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique staff identifier |
| `fullName` | string | Full name |
| `role` | enum | One of the defined ICX_ROLES |
| `previousRoles` | array | Historical role/portfolio metadata |
| `unit` | string | Organizational unit (ADE Core, AWBULI, etc.) |
| `department` | string | Department within unit |
| `branch` | string | Office branch (default: "HQ") |
| `city` | string | City |
| `country` | string | Country |
| `workEmail` | string | Work email |
| `workContactNumber` | string | Work contact |
| `active` | boolean | Employment/engagement status |
| `lastSeen` | ISO timestamp | Last presence evidence |
| `lastActive` | ISO timestamp | Last active timestamp |
| `presence` | enum | ONLINE, AWAY, BUSY, OFFLINE |
| `managerId` | string | Direct manager's staff ID |
| `teamId` | string | Team identifier |

### 3.2 Organizational Roles (Data-Driven)

The role hierarchy is enforced by data, not by hard-coded person identities:

| Role | Rank | Description |
|---|---|---|
| Founder | 6 | Platform founder/executive |
| Executive | 5 | Senior executive leadership |
| Department Head | 4 | Department-level leadership |
| Manager | 3 | Managerial responsibility |
| Team Lead | 2 | Team-level coordination |
| Operational Staff | 1 | Operational execution |

---

## 4. Communication Channels

| Channel | Authorization Rule |
|---|---|
| `DIRECT` | Self, manager-subordinate, same department, or 2+ rank advantage |
| `TEAM` | Same `teamId` |
| `DEPARTMENT` | Same `department` |
| `PRODUCT` | Same `unit` |
| `ESCALATION` | Always allowed (subject to escalation policy) |
| `ANNOUNCEMENT` | Department Head rank or above |

### 4.1 Message Types

| Type | Description |
|---|---|
| `TEXT` | Plain text message |
| `FILE` | File attachment |
| `DOCUMENT` | Document attachment |
| `IMAGE` | Image attachment |
| `VIDEO` | Video attachment |
| `VOICE` | Voice message |
| `SYSTEM_EVENT` | System-generated event |
| `ESCALATION_REQUEST` | Escalation request |

### 4.2 Media Security Rules

- MIME type validation against allowed list
- Maximum size: 25 MB
- Executable extensions blocked (`.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.msi`, `.com`, `.scr`)
- Extension/content consistency enforced where practical

---

## 5. Presence Model

Presence is **server-derived**, not client-declared.

| State | Description |
|---|---|
| `ONLINE` | Actively connected |
| `AWAY` | Idle/away from keyboard |
| `BUSY` | Do not disturb |
| `OFFLINE` | Not connected |

### 5.1 Presence Rules

- Only the staff member themselves (or a user with level 3+ authority) can change presence
- `lastSeen` and `lastActive` are updated automatically on state changes
- Presence is stored server-side; client may signal activity but cannot declare itself ONLINE
- Stale sessions are handled by server-side expiry

---

## 6. Escalation Chain

### 6.1 Default Chain

```
Operational Staff → Team Lead → Manager → Department Head → Executive → Founder
```

### 6.2 Escalation Properties

| Field | Description |
|---|---|
| `id` | Unique escalation identifier |
| `requesterId` | Initiating staff member |
| `targetId` | Target escalation level staff member |
| `reason` | Reason for escalation (max 5000 chars) |
| `category` | Escalation category |
| `state` | OPEN / ACKNOWLEDGED / RESOLVED |
| `route` | Chain of escalation levels |
| `createdAt` | Timestamp |

### 6.3 Emergency/Security Bypass

Emergency/security pathways may bypass ordinary routing only under explicit policy and must generate an audit record.

---

## 7. Authorization Model (RBAC + ABAC)

### 7.1 RBAC

Role determines baseline permissions. The kernel's `CommunityEditionGuard` enforces:

- Level 0 (GUEST): `PING`, `PUBLIC_INFO`
- Level 1 (COMMUNITY): `WATCH_ASSET`, `TELEMETRY_SSE`, `UNIVERSAL_AI_GATEWAY`
- Level 2 (PRO): All Community + `MULTI_STREAM`
- Level 3+ (ENTERPRISE/SYSTEM): All capabilities

### 7.2 ABAC

Context attributes evaluate whether a specific action is allowed:

- Staff identity and role
- Department and organizational unit
- Reporting relationship
- Message channel
- Resource sensitivity
- Employment/engagement status
- Escalation state
- Security policy

Authorization is evaluated **server-side**.

---

## 8. EventBus Integration

All ADE-ICX actions flow through the canonical `EnterpriseEventBus`. Required events:

| Event | Trigger |
|---|---|
| `ICX_STAFF_UPSERTED` | Staff profile created or updated |
| `ICX_PRESENCE_CHANGED` | Presence state change |
| `ICX_MESSAGE_SENT` | Message dispatched |
| `ICX_ESCALATION_CREATED` | Escalation initiated |
| `ICX_ESCALATION_ACKNOWLEDGED` | Escalation acknowledged |
| `ICX_ESCALATION_RESOLVED` | Escalation resolved |
| `ICX_MEDIA_UPLOADED` | Media attachment uploaded |
| `ICX_MEDIA_ACCESSED` | Media attachment accessed |
| `ICX_OFFBOARDED` | Staff deprovisioned |

Events must never bypass the canonical EventBus.

---

## 9. Deprovisioning

When employment/access ends:

1. Active sessions are revoked
2. Communication privileges are revoked
3. Directory visibility is adjusted
4. Outstanding access is reviewed
5. Audit records are preserved
6. Staff record is marked inactive

No stale employee access may remain active indefinitely.

---

## 10. Audit Trail

All important ICX actions generate audit records:

- Staff onboarding/offboarding
- Message delivery
- Presence changes
- Escalation lifecycle
- Media access
- Authorization decisions

Audit records are published as EventBus events and persisted through the canonical audit logging pipeline.

---

## 11. Telematics Boundary

ADE-ICX operates within the ADE platform. GPS/GNSS/GSM/IMEI/IMSI/ICCID/SIM/cell-tower/MQTT/OBD-II/CAN/J1939/fleet/geofence integrations are **explicitly UNIMPLEMENTED** and must remain so until their dedicated hardware/provider phase.

Allowed for future integration:
- Provider-neutral interfaces
- Schemas/contracts
- Adapters/interfaces
- Capability declarations
- Simulation-only fixtures

Not allowed:
- Fake GPS coordinates presented as real telemetry
- Generated IMEI presented as device IMEI
- Simulated data presented as production hardware state

---

## 12. Implementation Location

| Component | File |
|---|---|
| ICX Engine | `src/kernel/ADE_ICX_Engine.js` |
| Identity | `src/kernel/IdentityOnboarding.js` |
| EventBus | `src/kernel/EnterpriseEventBus.js` |
| CapabilityRegistry | `src/core/CapabilityRegistry.js` |
| Security | `src/security/HttpSecurityBoundary.js` |
| Tests | `tests/wave1-contract.test.js` |
| Contract Tests | `tests/acceptance.test.js` |
