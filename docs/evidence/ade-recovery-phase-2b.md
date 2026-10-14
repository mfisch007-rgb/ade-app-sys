# ADE Recovery — Phase 2B Evidence (Founder Fix Verification & Release Candidate)

Date: 2026-10-13 (UTC). Verification + release-prep only. No commit, push, merge,
deploy, credential/provider/env change. No tracked file edited in this run.

Base: `docs/evidence/ade-recovery-phase-1.md`, `docs/evidence/ade-recovery-phase-2a.md`
(both read before acting; all cited logs verified present).

## STEP 1 — State reconfirmed

- Branch `enterprise/product-experience-redesign`; HEAD `e5b77f0`
  (full `e5b77f08a48072fb7d7ec0f351f4b78847e57f74`).
- `git diff --cached -- public/founder.html`: empty (nothing staged, before or after).
- Unstaged: same 12 tracked files as Phases 1/2A (`git diff --name-only` identical
  set). `git status --short`: 79 lines, unchanged count.
- HEAD version of both fix sites confirmed DEFECTIVE
  (`git show HEAD:public/founder.html`: `}}}),'Refresh live feeds')` and
  `kernStatus),`) — i.e. the fix exists only in the working tree.
- Production fresh read-only check (`ade-phase2b-prod-health.json`, HTTP 200,
  kernel HEALTHY, 11 subsystems): still
  `build.commit = 046f29a3116a8fde79e5a85674061e54eb0b5a1d`. No change; assumed nothing.
- No reset/clean/restore/add (`git add .`/`-A` never run), no data-file
  clearing, no untracked-file deletion/move/overwrite. (Note: full
  `git diff --stat` timed out once under load due to the megabyte-scale
  runtime-data diffs; file-scoped diffs used instead. Nothing was modified.)

## STEP 2 — The two fixes: ALREADY PRESENT, no edit made

Per instruction 2E, neither expression was touched.

- Fix 1 — `public/founder.html:1421` (TAB_LIVE Refresh-feeds button):
  `…notify(e.message);}}},'Refresh live feeds')` — label child inside the
  `h('button',…)` call; line-level paren count balanced (10v10, re-verified
  in 2A). Defective HEAD/prod form `…;}}}),'Refresh live feeds')` absent
  from the worktree (programmatic check: defect1-absent true).
- Fix 2 — `public/founder.html:1490` (header topRight status pill):
  `…kernLive?'ONLINE':kernStatus)),` — outer `((…)()||h(…))` group closed.
  Single-close defective form count in worktree: 0.
- Comparison worktree vs HEAD vs production: HEAD == production form (both
  defective); worktree == corrected form (both sites). Production therefore
  still serves the parse-failing page; the fix is entirely uncommitted and
  undeployed.

## STEP 3 — Verification

1. **Extraction + syntax check.** Fresh extract of the current worktree inline
   script (`ade-phase2b-founder-inline.js`, 133,703 chars — identical length to
   the 2A worktree extract; file untouched since): `node --check` exit success,
   empty output (`ade-phase2b-syntax-check.log`, 0 bytes).
2. **Parse-gate test.** `tests/product-discovery-visibility.test.js` (contains
   the DISCOVERY-7 inline-script parse assertion for all three consoles):
   **7/7 pass** (`ade-phase2b-product-discovery.log`).
3. **Founder/auth tests** (`--test-concurrency=1`):
   `tests/founder-elevation-persistence.test.js` +
   `tests/founder-identity-closure.test.js`: **19/19 pass, 0 fail, 0 skipped**
   (`ade-phase2b-founder-auth.log`, 54.7s under memory pressure).
4. **Local routes (worktree server).** `GET /founder` → HTTP 200, 150,950 bytes
   (`ade-phase2b-local-founder.html`); both corrected expressions grep-verified
   present (1 match each). `GET /api/v1/health` → 200
   (`ade-phase2b-local-health.json`). Kernel booted (subsystems initialising in
   `ade-phase2b-local-boot.log`; note: this run's server bound port 3000, not
   the intended 4599 — `$env:PORT` did not propagate to the child process; the
   verified instance was PID 7336 on 3000, stopped afterwards, port confirmed
   closed). Server-stopped cleanup done; an unrelated older node process
   (PID 8976) was deliberately left untouched.
5. **Fail-closed session.** `GET /api/v1/account/session` without credentials →
   HTTP 401 `{"success":false,"error":"Authentication required"}`
   (`ade-phase2b-local-session.json`). No secrets in any log.
6. **Browser verification: NOT ACHIEVED — limitation recorded.** No
   Playwright/Puppeteer (re-confirmed). Edge headless was attempted 3× against
   the local server: attempt 1 hung on `--virtual-time-budget` (the page holds
   a persistent SSE `EventSource`, so virtual time never settles); attempts 2–3
   with `--timeout` produced no screenshot file (one "path not found" run —
   relative screenshot path resolved against Edge's CWD; the absolute-path
   retry still hung). No user browser processes were touched (only
   command-line-matched headless instances; none linger). **A syntax check
   alone is not visual acceptance:** what is proven is parse-pass + HTTP 200 +
   static render-path analysis (no token → `authPhase` initialises `'login'`,
   `founder.html:251`, which returns the login-gate JSX at lines 748–777 via
   `createRoot` at line 1527). Visible render in a real browser remains an
   outstanding manual check.
7. **Full suite: NOT RUN.** Free RAM 0.57–0.84 GB during this run; per the
   resource-control rule the kernel-per-file full suite stays deferred.
   Recorded, not hidden.

## STEP 4 — Isolated release candidate assessment (NOT staged)

Full `public/founder.html` diff: 9 hunks (36+/12−). Only 2 hunks are the fix:

- Hunk 7 (`@@ -1394,7 +1418,7`): fix 1, one-line substitution.
- Hunk 9 (`@@ -1463,7 +1487,7`): fix 2, one-line substitution.

Unrelated hunks in the same file that must NOT ride along silently: CSS link,
TABS `+AWBULI`, `productSurface` state, `refreshAll` `+product-surface` fetch,
`PRODUCT VISIBILITY` card, `TAB_AWBULI` block, `tabContent` `+AWBULI`. Plus 11
other modified files, notably the megabyte-scale runtime-data deltas
(`data/audit_ledger.json` +15,637, `data/runtime-config/admin.json` +14,202 —
must never be committed as part of a code fix).

Staging decision: **nothing was staged** (`git diff --cached` verified empty).
The two hunks are textually separable (index-only patch application is possible
in principle), but staging was deliberately deferred: any staging mistake here
could only be undone with `reset`/`restore`, which are forbidden in this run,
and the review instruction requires the exact staged diff to be inspected
*after* approval. Safest alternative: keep the worktree intact and present the
exact two-line patch spec (Step 2 above) for explicit approval; stage/commit
in a reviewed follow-up that (a) stages hunks 7+9 only, (b) shows
`git diff --cached`, (c) commits with a fix-only message, (d) leaves every
other hunk, file, bundle, backup, evidence log and runtime-data delta
untouched and uncommitted.

## STEP 5 — Release gate report

- Corrections status: **already present** in worktree; newly applied: none.
- Exact diff from this run: **no tracked file changed**. New files only, all
  under `docs/evidence/` with unique names (no Phase 1/2A overwrite):
  `ade-phase2b-prod-health.json`, `ade-phase2b-founder-inline.js`,
  `ade-phase2b-syntax-check.log` (empty = pass),
  `ade-phase2b-product-discovery.log` (7/7),
  `ade-phase2b-founder-auth.log` (19/19),
  `ade-phase2b-local-health.json`, `ade-phase2b-local-founder.html` (200,
  150,950 bytes, both fixes grep-confirmed),
  `ade-phase2b-local-session.json` (401 fail-closed),
  `ade-phase2b-local-boot.log` / `.err`, `ade-phase2b-edge.log` (empty —
  headless produced no log output before hanging).
- Focused tests: syntax pass; 7/7 discovery; 19/19 founder-auth. Full suite
  deferred (RAM 0.57–0.84 GB free).
- Local Founder page: served correctly with both fixes; **visibly renders =
  NOT verified** (Edge headless failed; static login-gate path cited instead).
- Production: `046f29a3116a8fde79e5a85674061e54eb0b5a1d` (fresh check); local
  HEAD `e5b77f0`. Production still serves the broken page — a redeploy is
  required after any approved commit.
- Blockers to a clean commit: 7 unrelated hunks in `founder.html`, 11 other
  modified files, runtime-data deltas; nothing staged by design.
- Verdict: **READY FOR REVIEW** (fix verified to the maximum extent this
  environment permits) — **NOT approved for commit/push/merge/deploy**.
  Remaining gaps before release: (1) real-browser visual load of `/founder`
  incl. console-error check; (2) broader suite when memory allows;
  (3) explicit approval of the two-hunk patch + reviewed staging
  (`git diff --cached`) in a follow-up run.

**Stop.** No commit, push, merge, deploy, or provider/credential action taken.
