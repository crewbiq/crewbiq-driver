# CrewBIQ Main Publication Plan — v96 (Legacy Sync Decommission)

Result: MAIN_PUBLICATION_PLAN_V96_BLOCKED

Status: DESIGN ONLY — NO MERGE / NO DEPLOY / NO WORKFLOW OR SETTINGS CHANGE

Prepared: 2026-09-02 (twice corrected)

Repository: `crewbiq/crewbiq-driver`

This document reconciles the already-executed
`docs/collaboration/MAIN_PUBLICATION_PLAN.md` (the v95 promotion, PR #101,
merged and live — see §2) with the accepted Legacy Sync Decommission work
and current Pages/CI state, into one exact procedure for promoting the
accepted `v96` candidate to `main` by the same proven method. It does not
supersede the v95 document as history; it is the next dated instance of
the same pattern.

## 0. Correction record (this revision)

The prior revision (`ffcf4e11`) was reviewed by Codex and found NEEDS_FIX
on four points. All four are addressed in this revision; none was
accepted without independent re-verification against live repository
state, per this session's standing discipline of never trusting a
reported result — reviewer or otherwise — at face value:

1. **`PROMOTION_ALLOWLIST_BREAKS_REQUIRED_CI`** — confirmed real by
   directly reading `tests/e2e/pages-deployment-workflow-contract.test.mjs`
   at the candidate tip: its module top level unconditionally calls
   `fs.readFileSync(new URL('../../.github/workflows/deploy-accepted-pages-v95.yml', ...))`.
   The prior revision's allowlist restored this test (via `package.json`'s
   `test:e2e:tooling` script and the test file itself) while excluding the
   workflow file it reads — guaranteeing an `ENOENT` crash of
   `npm run test:e2e:tooling` on the promoted branch, since that workflow
   file does not exist on `main` (confirmed) and is deliberately not being
   promoted (§3). Disposition fixed in §6/§7 below: the test file is now
   also excluded, and the promoted `package.json` requires one explicit,
   documented deviation from byte-for-byte candidate content.
2. **`GATE1_PREMERGE_CI_HAS_NO_PROMOTED_EXECUTION_PATH`** — confirmed real:
   the accepted 9-file/15-subtest Legacy Sync Decommission contract set
   currently runs only as a step added to
   `.github/workflows/e2e-harness-manual.yml` (this session, on the
   collaboration branch), which §6 deliberately excludes from promotion.
   None of the 9 files are referenced by `package.json`'s
   `test:e2e:tooling` script either (independently checked, all 9 absent).
   §7 below now *defines* (does not implement) a promoted execution path:
   the same step, added to `pwa-auth-contract.yml` instead, since that
   workflow is already being promoted and already carries one mandatory
   correction.
3. **`ANCESTRY_AND_MERGE_CONFLICT_EVIDENCE_INACCURATE`** — confirmed and
   corrected. Re-run fresh against the current branch tip
   `b5e36f4ac897cd6e34a2dd5b7c2858fa3f92bfe6` (not copied from Codex's
   review, which itself was already one snapshot behind by the time of
   this correction — the branch is being actively appended to):
   divergence is `2/488` (not `2/451`/`2/452`), and
   `git merge-tree --write-tree origin/main <tip>` reports **16** conflicting
   paths (not 1) — see corrected §4.
4. **`CANDIDATE_AND_DIFF_INVENTORY_MISSTATED`** — the candidate reference
   point is updated to the current branch tip `b5e36f4a` (37 commits past
   the `5c6cfdaa` implementation tip at the time of this correction, of
   which exactly **two are non-doc**: the `e2e-harness-manual.yml` gate-1
   step and the `pwa-auth-contract.yml` cache correction — both already
   accounted for in this plan). Independently verified: the product/test
   diff between `main` and `b5e36f4a` is **byte-identical** to the diff
   against the earlier `e8bcafa8` reference — every one of the 35 commits
   between them touched only `docs/collaboration/**`. The
   `docs/collaboration/**` file count is **40** (not 25/39 — recomputed
   directly via `git diff --name-only`, not carried over from any prior
   count). Total main-to-candidate diff is **92 files** (not 91).

A fifth issue, `PR_WORKFLOW_CONTRACT_TEST_ASSERTS_UNPROMOTED_WORKFLOW_CAPABILITY`,
was found during a subsequent local execution attempt of §8 (steps 1-9,
never pushed) and is fixed by this same revision:

5. **`PR_WORKFLOW_CONTRACT_TEST_ASSERTS_UNPROMOTED_WORKFLOW_CAPABILITY`** —
   confirmed real by actually running `npm run test:e2e:tooling` against
   the fully-restored promotion tree (not merely reasoning about it):
   candidate `tests/e2e/pr-workflow-contract.test.mjs` asserts
   `.github/workflows/e2e-harness-manual.yml` exposes a `canonical`
   `mission_role` option (`assert.match(manual, /- all\s+- fleet\s+-
   driver\s+- canonical\s+- recovery\s+- security/)`); the candidate's
   `e2e-harness-manual.yml` has this role, `main`'s does not, and that
   workflow is deliberately excluded from promotion (§6, unchanged).
   Restoring the candidate's test while leaving `main`'s
   `e2e-harness-manual.yml` in place reproduces the failure
   deterministically; reverting only this one test file to `main`'s own
   current content (independently confirmed to make no other assertion
   this promotion needs) makes all 318 `test:e2e:tooling` tests pass.
   Disposition fixed in §6/§7/§8/§9/§14 below: this test file joins
   `tests/e2e/pages-deployment-workflow-contract.test.mjs` as excluded
   from the restore allowlist, so `main`'s own current, self-consistent
   version is retained untouched — the same "exclude the test whose
   assertions outrun what's actually promoted" pattern already used for
   finding 1, applied to a second, independently-discovered file pair.

## 1. Decision summary

Same decision as the v95 plan, reaffirmed: the accepted candidate must NOT
be merged or fast-forwarded directly into `main` — `main` and the
collaboration branch `agent/pre-base44-audit` are unrelated commit graphs
below their common ancestor's descendants (see §4), and a direct merge
would place 480+ collaboration/documentation/prototype commits onto
`main`.

The proven procedure is unchanged: a curated promotion branch created from
the exact current `main` commit, carrying accepted product and validation
files by content, not by branch ancestry. All active production runtime
files must be byte-identical to the accepted v96 candidate. Two CI-only
corrections are mandatory before merge (§7): the PWA workflow cache
assertion update (`v95` → `v96`, already present on the candidate) and a
newly defined gate-1 execution step; one content deviation is mandatory in
`package.json` (§6/§7).

No execution is authorized by this plan.

## 2. Authoritative current state

- `origin/main`: `bcfd74a22449b974755b8b48bc01a3b261107b93` — this **is**
  the v95 promotion's own merge commit (PR #101), confirmed still current.
- Pages API: `build_type=legacy`, source `main`, path `/`, status `built`.
- Latest Pages build commit: `bcfd74a22449b974755b8b48bc01a3b261107b93`
  (matches `origin/main` exactly).
- Live `index.html`: HTTP 200.
- Live `sw.js`: HTTP 200.
- Live cache: `crewbiq-driver-v95`.
- Accepted v96 candidate reference (**updated this revision**):
  `b5e36f4ac897cd6e34a2dd5b7c2858fa3f92bfe6` — the current collaboration
  branch tip at the time of this correction. Superseding the prior
  revision's `e8bcafa8` reference is safe and required: independently
  verified via `git diff --stat e8bcafa8 b5e36f4a -- . ':!docs/collaboration'`
  that **zero** product, test, or non-collaboration-doc files differ
  between the two — every intervening commit touched only
  `docs/collaboration/**` (state/review/evidence documents from this same
  coordination process). The candidate branch continues to move forward
  as a live coordination artifact; any future reviewer of this plan should
  re-run the same check against the then-current tip before relying on
  file-level facts, per this document's own §0 discipline.
- Accepted v96 candidate cache: `crewbiq-driver-v96`.
- Main branch protection: unconfirmed by this design pass (not re-checked;
  assume absent as the v95 plan found, until re-verified at execution
  time).
- Worktree at discovery: clean (scratch clone hard-reset to
  `origin/agent/pre-base44-audit` immediately before this analysis; the
  clone required a one-time unshallow in an earlier session cycle, noted
  here only because it materially affected ancestry results before being
  fixed — see `COLLABORATION_STATE.md` HISTORY).

## 3. Why main serves and non-main publication did not (unchanged precedent, reaffirmed)

Unchanged from the v95 plan. The proven, and only, publication path for
this project site remains a normal human-created merge/push to the
configured legacy Pages source branch `main:/`. Separately, GitHub
Discussion `crewbiq/crewbiq-driver#206480` (opened after this document's
v95 predecessor) documents four *further* independent attempts at
Actions/artifact-based publication (2026-09-01, all reverted within their
observation windows) — this is additional, later confirmation of the same
conclusion, not a new investigation. Per explicit Product Owner direction
recorded in `COLLABORATION_STATE.md`, that discussion is tracked as a
known non-blocking platform issue and is not reopened by this plan.

The stray workflow file `.github/workflows/deploy-accepted-pages-v95.yml`,
present on the collaboration branch, is the artifact of those Actions-based
attempts. It is explicitly excluded from the v96 promotion (§6) — it
represents the non-working publication method, not the one this plan uses,
and its filename is itself now stale (names `v95` while the accepted cache
is `v96`). Its exclusion is the direct cause of Correction §0 item 1 and is
now fully accounted for by also excluding the one test file that depends
on its presence (§6).

## 4. Ancestry and divergence (corrected this revision)

- Merge base: `86b8b4dd7e9496833a021319167589b49f0ac418` — the **same**
  merge base the v95 plan found, confirmed unchanged: `main` has not
  diverged from that point independently of the v95 promotion itself.
- `main...candidate` (`origin/main...b5e36f4a`, freshly recomputed via
  `git rev-list --left-right --count`): **`2`** commits left-only
  (main-only), **`488`** commits right-only (candidate-only).
  - The 2 main-only commits are exactly the v95 promotion's own prep and
    merge commits (`e6ea4418`, `bcfd74a2`) — expected, since `main` moved
    forward by exactly that promotion after the merge base.
  - The candidate-only commits are the full collaboration-branch history
    since the merge base, including this decommission's implementation,
    corrections, and coordination documentation (which continues to grow
    with every review/publish cycle).
- `git merge-tree --write-tree origin/main b5e36f4a`: **not clean** (exit
  1) — freshly recomputed and found **16 conflicting paths** (corrected
  from the prior revision's undercount of 1):
  - `.github/workflows/pwa-auth-contract.yml` (content — `main`
    independently carries its own v94→v95 correction from the v95
    promotion; the candidate independently carries a v94→v96 correction;
    both sides edited the same line differently since the merge base —
    the same single-file conflict the prior revision reported, still
    present and still the reason §7's correction is carried by content,
    never by merge)
  - `index.html` (content)
  - `package.json` (content)
  - `sidr-contract-resolver-integration-v1.test.mjs` (content)
  - `startup-session.js` (add/add — both sides independently added a file
    at this path since the merge base)
  - `sw.js` (content)
  - `tests/auth-session-startup-contract.test.mjs` (add/add)
  - `tests/driver-self-ui.test.mjs` (add/add)
  - `tests/driver-truck-assignment.test.mjs` (add/add)
  - `tests/hotfix-load-order-contract.test.mjs` (add/add)
  - `tests/index-startup-composition.test.mjs` (add/add)
  - `tests/load-driver-attribution.test.mjs` (add/add)
  - `tests/pti-attribution-context.test.mjs` (add/add)
  - `tests/startup-session-coordinator.test.mjs` (add/add)
  - `tests/workspace-attribution.test.mjs` (add/add)
  - `tests/workspace-driver-roster.test.mjs` (add/add)

  This is expected, and it is a *stronger*, not weaker, confirmation of
  §1's conclusion than the prior revision's single-conflict figure
  suggested: 16 independent paths would collide under a literal `git
  merge`, most of them `add/add` conflicts (both branches independently
  created the same-named file after the v95 promotion's own file
  additions, from unrelated starting content). The curated-content
  procedure — restore by content from an explicit allowlist, never a
  literal merge — is the only correct mechanism regardless of whether the
  true conflict count is 1 or 16; this correction changes the evidence,
  not the conclusion it supports.

## 5. Complete main-to-candidate diff (corrected this revision)

Total: **92** files, 20,476 insertions, 397 deletions
(`git diff --shortstat origin/main b5e36f4a`; corrected from the prior
revision's `91 files, 19,929 insertions`).

### Workflow and package

- `A .github/workflows/deploy-accepted-pages-v95.yml` (excluded — §3, §6)
- `M .github/workflows/e2e-harness-manual.yml` (excluded this cycle — §6)
- `M .github/workflows/pwa-auth-contract.yml` (two mandatory corrections
  carried by content, not candidate-identical — §7)
- `M package.json` (one mandatory content deviation from candidate — §7)

### Product/runtime modules (all `M` — no new product files this cycle;
the v95 promotion already added every product file the original plan
introduced)

- `core.js`
- `index.html`
- `restore-hotfix.js`
- `startup-session.js`
- `sw.js`
- `sync.js`

### Validation files

- `M sidr-contract-issue20b-ui-v2.test.mjs`
- `M sidr-contract-resolver-integration-v1.test.mjs`
- `M tests/auth-session-startup-contract.test.mjs`
- `A tests/dosync_orchestrator_dedup.test.mjs`
- `M tests/driver-self-ui.test.mjs`
- `M tests/driver-truck-assignment.test.mjs`
- `M tests/driver_projections.test.mjs`
- `M tests/e2e/missions/role-missions.mjs`
- `A tests/e2e/pages-deployment-workflow-contract.test.mjs` (**excluded
  this revision — §6, Correction §0 item 1**)
- `M tests/e2e/pr-workflow-contract.test.mjs` (**excluded this revision —
  §6, Correction §0 item 5**)
- `M tests/e2e/role-mission-runner.test.mjs`
- `A tests/e2e/staging-canonical-identity.spec.mjs`
- `M tests/e2e/staging-expenses-lifecycle.spec.mjs`
- `M tests/hotfix-load-order-contract.test.mjs`
- `M tests/index-startup-composition.test.mjs`
- `M tests/load-driver-attribution.test.mjs`
- `A tests/offline_orchestrator_retry.test.mjs`
- `M tests/orchestrator_transport.test.mjs`
- `M tests/pti-attribution-context.test.mjs`
- `A tests/pti_lockout_orchestrator_unavailable.test.mjs`
- `A tests/restore_orchestrator_transport.test.mjs`
- `M tests/startup-session-coordinator.test.mjs`
- `A tests/sw_no_legacy_hostname.test.mjs`
- `M tests/workspace-attribution.test.mjs`
- `M tests/workspace-driver-roster.test.mjs`
- `A tests/write_orchestrator_expense_save.test.mjs`
- `A tests/write_orchestrator_load_save.test.mjs`
- `A tests/write_orchestrator_owner_entity_save.test.mjs`

### Prototype and documentation (all excluded — §6, unchanged posture)

- `docs/collaboration/**` (**40 files**, all `A` — corrected from 25;
  recomputed directly via `git diff --name-only origin/main b5e36f4a --
  docs/collaboration`, not carried over from any prior count. The delta
  from 25 reflects continued growth of `COLLABORATION_STATE.md` history
  plus new review/evidence documents published across this session's
  cycles, including this document's own prior revision.)
- `docs/product/**` (6 files, all `A`)
- `prototype/crewbiq-next/**` (5 files, all `A`)
- Prototype-only tests: `tests/charts-prototype.test.mjs`,
  `tests/e2e/ui-shell-standalone.spec.mjs`,
  `tests/ui-shell-prototype.test.mjs`

## 6. Curated main-promotion content (corrected this revision)

The future promotion branch must start from the exact current `main` SHA
(`bcfd74a2`) and must not be branched from the collaboration branch or
candidate SHA — identical procedure to the v95 promotion.

### Product files to restore byte-for-byte from accepted candidate `b5e36f4a`

- `core.js`
- `index.html`
- `restore-hotfix.js`
- `startup-session.js`
- `sw.js`
- `sync.js`

Each must have the same Git blob ID as candidate `b5e36f4a` before merge
(identical blobs to the prior `e8bcafa8` reference — confirmed unchanged,
§2). Unlike the v95 promotion (which added 14 new product files), this
cycle's active production composition is unchanged in file count — only
these 6 files' contents change.

### Validation files to restore from candidate byte-for-byte

- `.github/workflows/pwa-auth-contract.yml` — **not** restored
  byte-for-byte; restored from candidate content and then the §7 gate-1
  step is added on top, as a documented deviation.
- `package.json` — **not** restored byte-for-byte; restored from
  candidate content and then one script-list token is removed, as a
  documented deviation (§7).
- `sidr-contract-issue20b-ui-v2.test.mjs`
- `sidr-contract-resolver-integration-v1.test.mjs`
- `tests/auth-session-startup-contract.test.mjs`
- `tests/dosync_orchestrator_dedup.test.mjs`
- `tests/driver-self-ui.test.mjs`
- `tests/driver-truck-assignment.test.mjs`
- `tests/driver_projections.test.mjs`
- `tests/e2e/missions/role-missions.mjs`
- `tests/e2e/role-mission-runner.test.mjs`
- `tests/e2e/staging-canonical-identity.spec.mjs`
- `tests/e2e/staging-expenses-lifecycle.spec.mjs`
- `tests/hotfix-load-order-contract.test.mjs`
- `tests/index-startup-composition.test.mjs`
- `tests/load-driver-attribution.test.mjs`
- `tests/offline_orchestrator_retry.test.mjs`
- `tests/orchestrator_transport.test.mjs`
- `tests/pti-attribution-context.test.mjs`
- `tests/pti_lockout_orchestrator_unavailable.test.mjs`
- `tests/restore_orchestrator_transport.test.mjs`
- `tests/startup-session-coordinator.test.mjs`
- `tests/sw_no_legacy_hostname.test.mjs`
- `tests/workspace-attribution.test.mjs`
- `tests/workspace-driver-roster.test.mjs`
- `tests/write_orchestrator_expense_save.test.mjs`
- `tests/write_orchestrator_load_save.test.mjs`
- `tests/write_orchestrator_owner_entity_save.test.mjs`

### Files explicitly excluded

- All `docs/collaboration/**` files.
- All `docs/product/**` files.
- All `prototype/crewbiq-next/**` files.
- The three prototype-only tests named in §5.
- `.github/workflows/deploy-accepted-pages-v95.yml` — the non-working,
  now-doubly-stale Actions-deployment artifact (§3). Its exclusion is a
  correctness decision, not merely a minimalism preference: including it
  would place a broken, misleadingly-named publication mechanism on
  `main` alongside the one that actually works.
- `.github/workflows/e2e-harness-manual.yml` — a genuine CI capability
  improvement (the accepted 9-file/15-subtest decommission contract set
  runs as a dedicated step there, per Codex's own authorization this
  session), but **deliberately not bundled into this promotion**. It was
  authorized and reviewed specifically for the collaboration branch's own
  staging-gate evidence purpose
  (`docs/collaboration/LEGACY_SYNC_DECOMMISSION_STAGING_GATE_EVIDENCE.md`),
  not evaluated as a `main`-branch CI asset. Promoting `main`'s CI
  configuration is a separate decision with its own blast radius
  (`workflow_dispatch` inputs, secrets exposure surface) and deserves its
  own review, not a silent ride-along inside a product-code promotion.
  Flagged here as a suggested follow-up, not performed by this plan. The
  gate-1 coverage this workflow provides on the collaboration branch is
  instead carried onto the promoted branch via the §7 `pwa-auth-contract.yml`
  addition, so its exclusion does not leave gate 1 uncovered on `main`.
- **`tests/e2e/pages-deployment-workflow-contract.test.mjs`** (excluded —
  **new this revision**, Correction §0 item 1). This test's module scope
  unconditionally `fs.readFileSync`s
  `.github/workflows/deploy-accepted-pages-v95.yml`, which is excluded
  immediately above. Restoring the test while excluding the file it reads
  guarantees an `ENOENT` crash the instant the promoted branch's
  `npm run test:e2e:tooling` runs. Its own asserted purpose — verifying
  the shape of the excluded, non-working Actions-deployment workflow — is
  meaningless on a branch that doesn't carry that workflow at all, so
  exclusion is the correct disposition, not merely a workaround.
- **`tests/e2e/pr-workflow-contract.test.mjs`** (excluded — **new this
  revision**, Correction §0 item 5, discovered by actually running
  `npm run test:e2e:tooling` against the fully-restored promotion tree).
  Candidate's version of this test asserts `.github/workflows/e2e-harness-manual.yml`
  exposes a `canonical` `mission_role` option; that workflow is excluded
  from promotion immediately above and `main`'s own copy does not have
  that role, so restoring candidate's test reproduces a deterministic
  failure. `main`'s own current version of this test does not make that
  assertion and is independently confirmed (by running the full
  `test:e2e:tooling` suite with only this one file left at `main`'s
  content and every other allowlisted file restored from candidate) to
  pass cleanly alongside every other required check. Disposition: `main`'s
  existing test file and its existing `package.json` invocation are
  retained untouched by this promotion — this is not a content deviation
  requiring restoration-then-edit (unlike the two §7 deviations), it is
  simply not restoring this one file at all, so `main`'s current,
  self-consistent content stands. The test's coverage of
  `.github/workflows/e2e-pr-smoke.yml` (the other file it reads) is
  unaffected, since that workflow is identical between `main` and the
  candidate (independently reverified this revision).
- Any file not present in this section's allowlist.

## 7. Mandatory CI-only corrections and content deviations (corrected this revision)

Three items, all CI-configuration or manifest content only — no product
runtime file is touched by any of them:

**1. Cache assertion (unchanged from prior revision).** Candidate `sw.js`
declares `crewbiq-driver-v96`, and candidate
`.github/workflows/pwa-auth-contract.yml` (at the current candidate tip,
per the Codex-authorized correction applied earlier this session) already
contains the matching `grep -q "crewbiq-driver-v96" sw.js` assertion —
meaning, unlike the v95 cycle, this correction is already present on the
candidate branch and only needs to be *carried over* by the §6 restore
step.

**2. Gate-1 execution path (new this revision — defines, does not
implement, per the correction's bounded scope).** The promoted
`pwa-auth-contract.yml` must additionally carry the same step
`e2e-harness-manual.yml` runs on the collaboration branch, verbatim:

```yaml
- name: Run legacy sync decommission contract set
  run: node --test tests/orchestrator_transport.test.mjs tests/dosync_orchestrator_dedup.test.mjs tests/pti_lockout_orchestrator_unavailable.test.mjs tests/offline_orchestrator_retry.test.mjs tests/restore_orchestrator_transport.test.mjs tests/write_orchestrator_load_save.test.mjs tests/write_orchestrator_expense_save.test.mjs tests/write_orchestrator_owner_entity_save.test.mjs tests/sw_no_legacy_hostname.test.mjs
```

placed as an additional step in `pwa-auth-contract.yml`'s existing job,
alongside the cache-assertion step. `pwa-auth-contract.yml` is chosen as
the carrier because it is already part of the curated allowlist and
already requires one content correction, so adding a second, independently
justified step to the same file does not expand the set of files promoted
with content deviating from the candidate. This is a **design decision to
be executed as part of the future promotion-preparation procedure (§8)**,
not a change made by this document. All 9 files are independently
confirmed (via direct inspection this revision) to be absent from
`package.json`'s `test:e2e:tooling` script, so this is genuinely net-new
coverage on `main`, not a duplicate of an existing check.

**3. `package.json` script-list deviation (new this revision, required by
Correction §0 item 1).** The promoted `package.json`'s `test:e2e:tooling`
script value must have the token
`tests/e2e/pages-deployment-workflow-contract.test.mjs` removed, since
that test file is excluded from promotion (§6) and every other file in the
script value is either promoted or already present on `main`. No other
part of `package.json` (or the `test:e2e:tooling` script's other entries)
is affected. This is the single documented departure from
"`package.json` restored byte-for-byte from candidate" — mirroring the
same class of planned, explicit, single-line deviation the v95 plan
required for `pwa-auth-contract.yml`'s cache assertion, just applied to a
different file this cycle.

Before merge, assert (identical structure to the v95 plan's §7, extended
for the two new deviations):

1. The `pwa-auth-contract.yml` diff versus candidate contains no
   unexpected delta beyond the §6 restore plus the one added gate-1 step
   above.
2. The `package.json` diff versus candidate contains no unexpected delta
   beyond the §6 restore minus the one removed script token above.
3. No runtime file differs from candidate `b5e36f4a`.
4. The workflow and cache assertion agree on `v96`.
5. `tests/e2e/pages-deployment-workflow-contract.test.mjs` is absent from
   the promoted tree.
6. `tests/e2e/pr-workflow-contract.test.mjs` is byte-identical to `main`'s
   pre-promotion content, not candidate `b5e36f4a`'s.

## 8. Exact future preparation procedure

This procedure is NOT authorized for execution yet. Identical structure
to the v95 plan, updated for this cycle's SHAs and the two new §7
deviations.

1. Fetch `origin/main` and candidate `b5e36f4a` (or the then-current
   candidate tip, after re-running the §2 identity check against it).
2. Abort unless `origin/main` remains exactly
   `bcfd74a22449b974755b8b48bc01a3b261107b93`.
3. Create a new release branch from that exact main SHA using a normal
   branch creation; never force-push or rewrite it.
4. Restore the §6 allowlist from the candidate (which does **not**
   include `tests/e2e/pr-workflow-contract.test.mjs` — leave `main`'s own
   current copy untouched), applying the two §7 content deviations (add
   the gate-1 step to `pwa-auth-contract.yml`; remove the one script
   token from `package.json`) as part of the same preparation commit, not
   as a follow-up.
5. Confirm the §7 item 1 cache assertion (`v95 -> v96`) is present
   (already true on the candidate; verify, do not re-author).
6. Require `git diff --check` clean.
7. Require the changed-file set to equal the allowlist exactly (§6, minus
   the two excluded test files, plus the two §7 deviations) — this is 35
   files: 6 product, 2 workflow/package (each carrying a documented
   deviation), 27 validation files.
8. Require every active runtime file's blob ID to equal candidate
   `b5e36f4a`.
9. Require no `docs/**` or `prototype/**` path in the promotion diff,
   confirm neither excluded workflow file (§6) nor either excluded test
   file (`tests/e2e/pages-deployment-workflow-contract.test.mjs`,
   `tests/e2e/pr-workflow-contract.test.mjs`) is present, and confirm
   `tests/e2e/pr-workflow-contract.test.mjs`'s blob ID equals `main`'s
   pre-promotion blob, not candidate's.
10. Commit the curated change as one normal promotion commit.
11. Push the new release branch normally.
12. Open a PR to `main`; do not merge it.
13. Obtain an independent Claude review of the actual PR diff and CI
    results.
14. Obtain explicit coordinator authorization for the exact PR/commit.
15. Re-fetch `main` immediately before merge; abort on any movement.
16. Merge through a normal PR merge commit to create an explicit rollback
    boundary. Do not squash, rebase, force-push, or reset `main`.

## 9. Required pre-merge CI (corrected this revision)

No CI was run during this design-only slice because no promotion branch
or code change was created.

The future PR must require all of the following green:

1. `PWA Auth Contract`, including the corrected cache `v96` assertion
   (§7 item 1) **and** the newly added gate-1 step (§7 item 2) — this is
   the promoted execution path for the 9-file/15-subtest Legacy Sync
   Decommission contract set, replacing the collaboration-branch-only
   `e2e-harness-manual.yml` step which is not promoted (§6).
2. `E2E PR Smoke`:
   - `npm ci`
   - `npm run test:e2e:tooling` (with the §7 item 3 `package.json`
     deviation applied — otherwise this step is guaranteed to fail per
     Correction §0 item 1 — and with `tests/e2e/pr-workflow-contract.test.mjs`
     left at `main`'s content, not candidate's — otherwise this step is
     guaranteed to fail per Correction §0 item 5. Independently confirmed
     by actually running the full 318-test suite against the fully
     restored promotion tree this revision: all 318 pass with both
     dispositions applied.)
   - `npm run test:e2e:self`
   - fail-closed parse of `npm run test:e2e:staging`
   - evidence-policy checks
   - `git diff --check`
3. `RESTORE-ORCH-01`, `WRITE-ORCH-01/03/04`, `PTI-LOCKOUT-01`,
   `OFFLINE-ORCH-01`, `SW-NO-LEGACY-01`, `DOSYNC-SIMPLIFY-01` — already
   proven 15/15 in the staging gate evidence (see
   `docs/collaboration/LEGACY_SYNC_DECOMMISSION_STAGING_GATE_EVIDENCE.md`)
   and now given a defined promoted execution path via item 1 above.
4. Static inline-script parse/startup-composition smoke.
5. Exact changed-file and candidate-blob allowlist checks (§6, §8),
   including confirmation that `tests/e2e/pages-deployment-workflow-contract.test.mjs`
   is absent, that `package.json`'s `test:e2e:tooling` value does not
   contain that path, and that `tests/e2e/pr-workflow-contract.test.mjs`
   is byte-identical to `main`'s pre-promotion content.

Because `main` has no confirmed branch protection or rulesets (unconfirmed
this cycle — re-verify at execution time), green status must be checked
manually and recorded before merge authorization, exactly as the v95 plan
required.

## 10. Expected publication behavior

Identical mechanics to the v95 plan, unchanged:

1. The merge commit becomes the new `main` tip.
2. Legacy Pages observes a change on configured source `main:/` and starts
   a Pages build/deployment.
3. Publication may take up to ten minutes per GitHub documentation.
4. The Pages API latest-build record must reach `built` with no error and
   its `commit` must equal the exact merge commit, not the candidate SHA.
5. The project site must then serve the accepted runtime bytes from that
   merge tree.

## 11. Cache and service-worker gates

- Pre-promotion live cache: `crewbiq-driver-v95`.
- Promoted cache: `crewbiq-driver-v96`.
- `sw.js` bytes change, so installed clients can detect a new worker.
- Install caches the complete v96 `APP_SHELL` (unchanged file list from
  v95 — this cycle changed cache-relevant code, not the shell's file
  membership).
- Activate deletes caches whose key is not v96 and calls
  `clients.claim()`.

Required validation (identical structure to the v95 plan):

1. Fresh browser loads the v96 shell.
2. Existing installed/controlled client detects and activates v96.
3. Every v96 `APP_SHELL` URL returns HTTP 200 before offline smoke.
4. Offline restart works after v96 activation.
5. No required module is served from stale v95 cache.
6. The specific decommissioned behavior this cycle exists to prove is
   re-confirmed against the *served* production bytes post-publication:
   no request from the live PWA ever targets `script.google.com`/
   `googleapis.com`/`crewbiq-expenses`/`DEFAULT_SYNC_URL` — mirroring
   contract §5 gate 5(d) against production rather than staging.

## 12. Exact post-publication verification

Poll for no more than ten minutes:

1. `GET /repos/crewbiq/crewbiq-driver/pages` remains `build_type=legacy`,
   source `main:/`, status `built`.
2. `GET /repos/crewbiq/crewbiq-driver/pages/builds/latest` reports the
   exact main merge commit and no error.
3. Every `APP_SHELL` URL returns HTTP 200.
4. Downloaded bytes for every curated product file hash exactly to the
   corresponding Git object in the authorized promotion merge tree.
5. The 6 active changed runtime files also match candidate `b5e36f4a`
   exactly.
6. Live `sw.js` declares `crewbiq-driver-v96`.
7. Startup/auth/restore, workspace isolation, roster, assignments, Load,
   PTI, Driver SELF, graceful degradation, and offline restore smoke are
   green (same categories the v95 plan required).
8. No cross-workspace or cross-tenant leakage is observed.
9. Production Orchestrator `/health` and `/ready` remain green (same
   checks the v95 plan's execution evidence recorded).
10. The static no-legacy-reference check (§11.6) passes against the
    served bytes.

At the first material failure, stop smoke and execute rollback only.

## 13. Rollback to stable main/v95

Do not reset, force-push, or repoint Pages to a non-main branch. Identical
mechanics to the v95 plan, with the stable target now being the current
live state rather than `v79`:

1. Record the failed merge SHA and Pages build state.
2. Create a rollback branch from the failed current `main`.
3. Revert the promotion merge using a normal revert commit with the
   correct mainline parent.
4. Open/merge the bounded rollback PR, or use the pre-authorized emergency
   normal revert path if separately approved.
5. Require the resulting tree's production files to equal stable main
   `bcfd74a2` and `sw.js` to declare `v95`.
6. Wait for the legacy Pages build to report `built` at the revert commit.
7. Require live `index.html` and `sw.js` HTTP 200 and live cache `v95`.
8. Verify `v95` installed-client recovery and orchestrator health/readiness
   (both already proven working live — §2, and the v95 plan's own
   execution evidence).

The rollback SHA will be a new revert commit; stable content equality is
verified against `bcfd74a2` (the current live `v95` state).

Note on the deeper fallback layer: `main` itself has no pinned deploy
workflow file (confirmed: `.github/workflows/deploy-accepted-pages-v95.yml`
returns 404 against `main` — it exists only on the collaboration branch,
as the excluded artifact of the failed Actions-based attempts, §3/§6, and
must not be confused with any production mechanism). If `v95` itself ever
needs reverting past this plan's own rollback target, that is a second,
independent revert one step further back on `main`'s own linear history —
reverting `bcfd74a2` (the v95 promotion merge commit) — which returns
`main` to `86b8b4dd`/`v79`, exactly as the v95 plan's own §13 described.
That deeper fallback is unrelated to, and not re-authorized or re-examined
by, this document.

## 14. Readiness gates and stop conditions

The plan is **BLOCKED**, not yet ready for re-review sign-off — this
revision closes the four findings from the prior review, but has not yet
itself been independently re-reviewed.

Stop before merge if any condition is true:

- `main` moved from `bcfd74a2`.
- The promotion diff contains a path outside the curated allowlist (§6).
- Any active runtime blob differs from the candidate tip in use.
- The cache assertion is not exactly `v96`.
- The gate-1 step (§7 item 2) is missing from the promoted
  `pwa-auth-contract.yml`.
- `package.json`'s `test:e2e:tooling` still references
  `tests/e2e/pages-deployment-workflow-contract.test.mjs`.
- `tests/e2e/pages-deployment-workflow-contract.test.mjs` is present in
  the promotion diff.
- `tests/e2e/pr-workflow-contract.test.mjs` differs from `main`'s
  pre-promotion content (i.e. candidate's version was restored instead
  of being left excluded).
- Any required CI/check is missing, skipped, or red.
- Claude has not accepted the actual promotion PR.
- Exact coordinator merge authorization is absent.
- Pages configuration is no longer legacy `main:/`.
- Production health/readiness is not green.
- Either excluded workflow file (§6) is present in the promotion diff.

## 15. Parallel external and queued work

- GitHub Community Discussion `#206480` remains open, recorded as a known
  non-blocking platform issue per explicit Product Owner direction; it
  does not block independent review of this plan.
- `CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remains queued as a coverage
  task (unchanged from the v95 plan).
- `.github/workflows/e2e-harness-manual.yml`'s promotion to `main` is a
  separate, not-yet-started decision (§6) — now explicitly not required
  for gate-1 coverage, since §7 item 2 provides an independent promoted
  path.
- No alternate-hosting redesign is part of this plan.

## 16. Preparation-through-PR execution evidence

Not yet started. This section will be completed only after §8's procedure
is authorized and executed, mirroring the v95 plan's own §16/§"Production
publication execution evidence" structure exactly.
