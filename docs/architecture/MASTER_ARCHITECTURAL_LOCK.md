# ADE-APEX MASTER ARCHITECTURAL LOCK

**Document Ref:** ADE-ARCH-MASTER-LOCK  
**Status:** LOCKED  
**Authority:** ADE-APEX Architecture / Engineering Governance  
**Repository:** ADE-APP-SYS  
**Canonical Branch:** main

---

## 1. AUTHORITY MODEL

This document is the authoritative architectural lock record for the ADE-APEX repository.

It governs:

- canonical architecture
- canonical runtime authorities
- phase/gate progression
- engineering status classification
- architectural compatibility decisions
- acceptance-state recording

The following authority hierarchy applies:

1. **Master Architectural Lock** — architectural and governance authority.
2. **Master Implementation Contract** — binding engineering implementation contract.
3. **Phase / Gate Acceptance Records** — evidence for completion of individual gates.
4. **Repository and runtime evidence** — ultimate physical proof.
5. Reports, generated summaries, filenames, and previous claims are NOT proof by themselves.

No feature may be declared implemented, operational, production-ready, or closed without repository/runtime evidence.

---

## 2. CORE ENGINEERING PRINCIPLES

ADE-APEX follows:

**Reality → Evidence → Reconciliation → Controlled Implementation → Validation → Acceptance**

Hard rules:

- Git is the source of truth.
- Existing useful dirty work must be preserved.
- No destructive reset/clean/restore operations.
- No architectural fork without an explicit compatibility reason.
- UI is never authoritative for security, identity, permissions, sessions, capabilities, presence, or audit.
- Server/kernel/EventBus state is authoritative.
- Security is deny-by-default.
- Dynamic capabilities require persistence and revocation.
- Simulation/demo state must remain distinct from production state.
- Hardware/provider integrations remain deferred until their dedicated implementation phase.
- Every accepted capability requires automated regression coverage.
- Final claims must be reproducible.

---

## 3. CANONICAL ADE-APEX RUNTIME

### Kernel
`src/kernel/EnterpriseKernelMaster.js`

### EventBus
`src/kernel/EnterpriseEventBus.js`

### Capability Registry
`src/core/CapabilityRegistry.js`

### Plugin Registry
`src/kernel/PluginRegistry.js`

### Identity / Session Authority
`src/kernel/IdentityOnboarding.js`

### Security HTTP Boundary
`src/security/HttpSecurityBoundary.js`

### Credential Lifecycle
`src/security/CredentialLifecycleStore.js`

### Key Authority
`src/security/KeyManager.js`

These authorities must not be duplicated by UI-only or legacy implementations.

---

## 4. SECURITY / CREDENTIAL LIFECYCLE LOCK

**Requirement:** G18-SEC-CRL-01  
**Scope:** Credential lifecycle and administrative recovery

Required capabilities:

1. Initial credential provisioning
2. Server-side PIN authentication
3. Cryptographically verifiable sessions
4. Session revocation
5. Credential rotation
6. Forced invalidation after rotation
7. Forgotten-PIN administrative recovery

Required properties:

- no hardcoded administrative PIN
- no plaintext persisted credentials
- bcrypt server-side credential verification
- server-authoritative authentication
- session expiry
- explicit session revocation
- credential-version invalidation
- recovery changes the credential without requiring plaintext of the old credential
- recovery invalidates existing sessions
- security events are auditable
- missing recovery configuration must be explicit
- no production bypass in tests

---

## 5. G18 / R18 ACCEPTANCE LEDGER

### R18-A
**Status:** PASS

Privileged unversioned-session rejection behavior verified.

### R18-B
**Status:** PASS

Credential rotation security-event behavior verified.

### R18-C
**Status:** PASS

Credential recovery security-event behavior verified.

### R18-D
**Status:** PASS

Credential/revocation runtime artifacts are excluded from Git tracking.

### R18-E
**Status:** PASS / VERIFIED

Recovery credential hashing/configuration was provisioned without plaintext persistence.

### R18-F
**Status:** PASS

Permanent R18-A/B/C regression: 3/3.

### R18-G
**Status:** PASS

HTTP credential lifecycle regression: 1/1.

Acceptance regression: 6/6.

Verified flow includes:

- unauthenticated rejection
- valid PIN authentication
- authorized command access
- revoke
- rotation
- invalidation of pre-rotation session
- new credential acceptance
- recovery
- invalidation of recovered/previous sessions
- rejection of invalid recovery authorization

### R18-H
**Status:** PASS

Repository integrity checks:

- `git diff --check` = PASS
- sensitive credential store ignored
- session revocation artifact ignored
- environment file ignored/untracked
- temporary R17 artifact removed

The working tree remains intentionally dirty and must be preserved unless a later cleanup phase explicitly governs it.

### R18-I
**Status:** PASS

The repository previously lacked a valid explicit authoritative G18/R18 architectural lock record.

This document repairs that governance gap.

R18-I is NOT considered closed merely because this document exists.

Final G18 closure requires:

1. final whole-G18 verification,
2. reproduction of the R18 acceptance evidence,
3. confirmation that this lock record is present and versioned,
4. explicit G18 closure entry.

---

## 6. CURRENT GATE STATE

**G18 — SECURITY / CREDENTIAL LIFECYCLE**

**Status:** CLOSED / ACCEPTED

No G19 implementation may be declared started until the final G18 closure gate is recorded.

---

## 7. G19 ENTRY CONDITION

G18 is now **CLOSED / ACCEPTED**.

G19 is therefore authorized to begin, subject to its phase-specific engineering contract and acceptance criteria.

G19 must continue to follow:

**Reality → Evidence → Reconciliation → Controlled Implementation → Validation → Acceptance**.

No G19 completion claim is valid without reproducible repository/runtime evidence.

---

## 8. CHANGE CONTROL

Any future change to this document must:

- preserve the authority hierarchy,
- preserve historical acceptance evidence,
- state the reason for the change,
- remain reproducible from Git,
- never silently invalidate an existing architectural decision.

This file is an architectural lock record, not a substitute for runtime evidence.

---

## 9. CURRENT REPOSITORY BASELINE

The authoritative baseline for the currently reconciled repository is the actual Git state observed during the G18 engineering cycle.

Repository claims must always be reconciled against the physical working tree and actual runtime behavior before acceptance.

---

# END OF MASTER ARCHITECTURAL LOCK

