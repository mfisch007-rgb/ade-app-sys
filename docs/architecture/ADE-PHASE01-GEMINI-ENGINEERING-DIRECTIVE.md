# ADE PHASE 01 — GEMINI ENGINEERING DIRECTIVE

## Authority

Architectural Director: ChatGPT
Implementation Engine: Gemini
Repository Authority: User

## Operating Model

This is a BATCH ENGINEERING / PHASE-SPAN operation.

Do NOT artificially stop after one file or one block.

You may traverse multiple related architectural areas during this
engineering stretch.

However, every modification must remain inside the authorized change
surface and satisfy the acceptance criteria below.

---

# 1. VERIFIED REPOSITORY REALITY

The repository is currently a JavaScript / Node.js application.

Known package scripts:

- `npm run dev` -> `node --watch src/server.js`
- `npm start` -> `node src/server.js`

Known runtime:

- Node.js v20.x observed
- npm 11.x observed

Known repository facts:

- No `type-check` npm script exists.
- No local TypeScript compiler was detected.
- No Jest configuration was detected.
- No Vitest configuration was detected.
- No Next.js configuration was detected.
- The repository contains a large existing JavaScript architecture.
- Block 01 TypeScript files currently exist but are untracked.
- Do NOT interpret the existence of `.ts` files as evidence that ADE is a
  TypeScript application.

---

# 2. NON-NEGOTIABLE RUNTIME RULE

Preserve the existing ADE runtime architecture.

DO NOT:

- migrate JavaScript to TypeScript
- introduce Next.js
- replace Express
- introduce Jest solely for validation
- introduce Vitest solely for validation
- install TypeScript solely to satisfy a previous command
- invent npm scripts whose only purpose is passing a gate
- replace existing ADE verification infrastructure

If a new tool is genuinely required, STOP and report the architectural
reason before introducing it.

---

# 3. ARCHITECTURAL RECONCILIATION OBJECTIVE

Reconcile the following Block 01 artifacts against the existing ADE system:

    types/ade/design.ts
    types/ade/execution.ts
    types/ade/edition.ts
    types/ade/onboarding.ts
    types/ade/verification.ts

    lib/core/demoGuard.ts
    lib/core/edition.ts
    lib/core/mediaRegistry.ts

    tests/core/block01-foundation.test.ts

Do not assume these files are authoritative merely because they were
generated previously.

Determine whether equivalent or superior existing ADE mechanisms already
exist.

---

# 4. DUPLICATION RULE

Before creating a new engine, search for existing implementations of:

- capability
- edition
- plan
- authorization
- RBAC
- onboarding
- verification
- compliance
- demo mode
- simulation
- telemetry
- execution state
- runtime state
- media registry
- security policy

If an existing ADE engine already owns the responsibility:

    EXTEND / ADAPT / RECONCILE

instead of creating a competing parallel implementation.

---

# 5. ALLOWED CHANGE SURFACE

Gemini may modify:

    src/**
    lib/**
    types/ade/**
    tests/**
    docs/architecture/**
    scripts/**

`package.json` may only change if a native repository validation command
is genuinely required and justified.

Do not modify unrelated systems merely because they are nearby.

---

# 6. FORBIDDEN CHANGE SURFACE

Do not modify:

    .git/**
    .keys/**
    auth_info/**
    existing secrets
    credentials
    unrelated infrastructure
    unrelated historical verification suites

Do not delete existing verification artifacts.

Do not rewrite the repository wholesale.

---

# 7. EXECUTION STATE INTEGRITY

ADE execution claims must distinguish:

    LIVE
    SIMULATED
    CONCEPT

Never label conceptual functionality LIVE.

Never label a simulated external boundary LIVE.

Never remove state semantics merely to simplify UI or testing.

---

# 8. DEMO SAFETY

The demo guard must not become a cosmetic UI mechanism.

It must remain server/runtime authoritative.

Do not weaken:

    DEMO_BLOCKED
    PRODUCTION_POLICY

Do not introduce a fake generic "SAFE" state.

Before integrating the guard, identify the actual ADE execution boundaries
where side effects can occur.

---

# 9. CAPABILITY / ENTITLEMENT

Capability authorization must ultimately belong to an authoritative
runtime decision layer rather than React/UI strings.

If an existing capability registry, plan engine, role system, or policy
engine exists, reconcile Block 01 with it.

Do not create two independent authorization systems.

---

# 10. VERIFICATION / COMPLIANCE

Keep verification progressive.

Do NOT introduce blanket KYC/KYB/AML friction for:

- public exploration
- low-risk demos
- community access
- conceptual workflows

Verification depth should remain dependent upon:

- persona
- capability
- risk
- financial activity
- jurisdiction
- organization
- partner requirements

---

# 11. MEDIA

Do not fabricate production media URLs.

The media registry must only expose assets that actually exist.

If no physical asset exists:

    CONCEPT / INCOMPLETE

is preferable to a fictional production URL.

---

# 12. VALIDATION

Use the repository's REAL validation infrastructure.

Prioritize existing:

    CLI validators
    doctor commands
    runtime integrity probes
    reachability audits
    phase verification suites
    integration suites
    ecosystem tests
    executable smoke tests

Do not call:

    npm run type-check

unless such a script has actually been established and is legitimately
part of the repository.

Do not call Jest unless Jest actually exists.

Do not call Vitest unless Vitest actually exists.

Do not call Next.js build commands.

---

# 13. ENGINEERING STRETCH

Within this phase Gemini MAY proceed through multiple related tasks without
waiting for a separate approval after every file.

The intended flow is:

    RECONCILE
        ↓
    MAP
        ↓
    IDENTIFY DUPLICATES
        ↓
    INTEGRATE
        ↓
    HARDEN
        ↓
    VALIDATE
        ↓
    AUDIT
        ↓
    PHASE GATE

Do not artificially divide this into Block 01 -> wait -> Block 02 -> wait.

---

# 14. ACCEPTANCE CRITERIA

Phase 01 may only reach:

    READY_FOR_ARCHITECTURAL_REVIEW

when all applicable conditions are true:

1. Existing Node/JavaScript runtime remains intact.
2. No unauthorized framework migration occurred.
3. No fake validation infrastructure was introduced.
4. Block 01 contracts are reconciled with existing architecture.
5. Duplicate engines are identified and either reconciled or explicitly
   documented.
6. Demo safety remains server/runtime authoritative.
7. Capability authorization has a coherent ownership boundary.
8. Verification remains progressive.
9. Media registry contains no fabricated production assets.
10. Existing runtime starts successfully.
11. Appropriate repository-native validation suites execute.
12. No unrelated regressions are detected.
13. Git change surface is explicitly reported.
14. Every changed file is reported.
15. Every skipped/rejected architectural change is reported.
16. LIVE/SIMULATED/CONCEPT claims are evidence-backed.

---

# 15. GIT SAFETY

Do NOT commit automatically.

Do NOT push automatically.

At the beginning and end report:

    branch
    HEAD
    status
    changed files
    diff statistics

The user remains repository authority.

---

# 16. FINAL MACHINE EVIDENCE

Produce a final report containing:

    PHASE
    PHASE_STATUS

    BASE_RUNTIME
    NODE_VERSION
    PACKAGE_MANAGER

    EXISTING_VALIDATION_SYSTEMS

    BLOCK01_RECONCILIATION_STATUS

    DUPLICATE_SYSTEMS_FOUND

    SYSTEMS_EXTENDED
    SYSTEMS_CREATED
    SYSTEMS_REJECTED

    FILES_CREATED
    FILES_MODIFIED
    FILES_DELETED

    RUNTIME_SMOKE_TEST
    NATIVE_VALIDATION
    INTEGRATION_VALIDATION
    SECURITY_CHECK

    LIVE_CLAIMS
    SIMULATED_CLAIMS
    CONCEPT_CLAIMS

    GIT_BRANCH
    GIT_HEAD
    GIT_STATUS

    UNRELATED_REGRESSIONS

    PHASE_GATE

Do not report PASS merely because a command returned zero.

The evidence must correspond to actual execution.

---

# FINAL COMMANDMENT

ADE must evolve from the architecture that actually exists.

Do not force ADE to conform to an imagined architecture.

Observe first.

Reconcile second.

Engineer third.

Validate fourth.

Claim success only when the repository proves it.
