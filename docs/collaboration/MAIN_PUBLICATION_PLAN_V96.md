# CrewBIQ Main Publication Plan — v96 (Legacy Sync Decommission)

Result: MAIN_PUBLICATION_PLAN_V96_READY

Status: DESIGN ONLY — NO MERGE / NO DEPLOY / NO WORKFLOW OR SETTINGS CHANGE

Prepared: 2026-09-02

Repository: `crewbiq/crewbiq-driver`

This document reconciles the already-executed
`docs/collaboration/MAIN_PUBLICATION_PLAN.md` (the v95 promotion, PR #101,
merged and live — see §2) with the accepted Legacy Sync Decommission work
and current Pages/CI state, into one exact procedure for promoting the
accepted `v96` candidate to `main` by the same proven method. It does not
supersede the v95 document as history; it is the next dated instance of
the same pattern.

## 1. Decision summary

Same decision as the v95 plan, reaffirmed: the accepted candidate must NOT
be merged or fast-forwarded directly into `main` — `main` and the
collaboration branch `agent/pre-base44-audit` are unrelated commit graphs
below their common ancestor's descendants (see §4), and a direct merge
would place 400+ collaboration/documentation/prototype commits onto `main`.

The proven procedure is unchanged: a curated promotion branch created from
the exact current `main` commit, carrying accepted product and validation
files by content, not by branch ancestry. All active production runtime
files must be byte-identical to the accepted v96 candidate. One CI-only
correction is mandatory before merge: update the stale PWA workflow cache
assertion from `v95` to the accepted service-worker cache `v96` (the same
class of correction the v95 plan required, one version further).

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
- Accepted v96 candidate (last commit touching anything relevant to this
  promotion — product, test, or the one required workflow correction):
  `e8bcafa865e1169c7f0f0dd20e8556db211cc27f`. This is one commit past the
  `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc` implementation tip: that later
  commit contains only the `pwa-auth-contract.yml` cache-assertion
  correction (v95→v96, itself requested and reviewed by Codex) plus
  `docs/collaboration/`-only changes; it introduces no other product/test
  difference (confirmed via `git diff --stat 5c6cfdaa e8bcafa8`).
- Accepted v96 candidate cache: `crewbiq-driver-v96`.
- Main branch protection: unconfirmed by this design pass (not re-checked;
  assume absent as the v95 plan found, until re-verified at execution time).
- Worktree at discovery: clean (scratch clone hard-reset to
  `origin/agent/pre-base44-audit` immediately before this analysis).

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
is `v96`).

## 4. Ancestry and divergence

- Merge base: `86b8b4dd7e9496833a021319167589b49f0ac418` — the **same**
  merge base the v95 plan found, confirmed unchanged: `main` has not
  diverged from that point independently of the v95 promotion itself.
- `main...candidate` (`origin/main...e8bcafa8`): `2` commits left-only
  (main-only), `452` commits right-only (candidate-only).
  - The 2 main-only commits are exactly the v95 promotion's own prep and
    merge commits (`e6ea4418`, `bcfd74a2`) — expected, since `main` moved
    forward by exactly that promotion after the merge base.
  - The candidate-only commits are the full collaboration-branch history
    since the merge base, including this decommission's implementation,
    corrections, and coordination documentation.
- `git merge-tree --write-tree origin/main e8bcafa8`: **not clean this
  time** (exit 1) — a real, single-file conflict in
  `.github/workflows/pwa-auth-contract.yml` (`main` independently carries
  the v94→v95 correction from its own promotion; the candidate branch
  independently carries a v94→v96 correction (later folded to v95→v96) —
  both sides edited the same line differently since the merge base). This
  is expected and is exactly why §1's curated-content procedure — which
  never performs a literal `git merge` — remains mandatory, not merely
  preferred: a literal merge attempt would conflict on this one line.

## 5. Complete main-to-candidate diff

Total: 91 files, 19,929 insertions, 397 deletions
(`git diff --shortstat origin/main e8bcafa8`).

### Workflow and package

- `A .github/workflows/deploy-accepted-pages-v95.yml` (excluded — §3, §6)
- `M .github/workflows/e2e-harness-manual.yml` (excluded this cycle — §6)
- `M .github/workflows/pwa-auth-contract.yml` (the one mandatory
  correction — §7)
- `M package.json`

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
- `A tests/e2e/pages-deployment-workflow-contract.test.mjs`
- `M tests/e2e/pr-workflow-contract.test.mjs`
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

- `docs/collaboration/**` (25 files, all `A`)
- `docs/product/**` (6 files, all `A`)
- `prototype/crewbiq-next/**` (5 files, all `A`)
- Prototype-only tests: `tests/charts-prototype.test.mjs`,
  `tests/e2e/ui-shell-standalone.spec.mjs`,
  `tests/ui-shell-prototype.test.mjs`

## 6. Curated main-promotion content

The future promotion branch must start from the exact current `main` SHA
(`bcfd74a2`) and must not be branched from the collaboration branch or
candidate SHA — identical procedure to the v95 promotion.

### Product files to restore byte-for-byte from accepted candidate `e8bcafa8`

- `core.js`
- `index.html`
- `restore-hotfix.js`
- `startup-session.js`
- `sw.js`
- `sync.js`

Each must have the same Git blob ID as candidate `e8bcafa8` before merge.
Unlike the v95 promotion (which added 14 new product files), this cycle's
active production composition is unchanged in file count — only these 6
files' contents change.

### Validation files to restore from candidate

- `.github/workflows/pwa-auth-contract.yml` (with the v95→v96 correction
  already applied on the candidate branch — §7)
- `package.json`
- `sidr-contract-issue20b-ui-v2.test.mjs`
- `sidr-contract-resolver-integration-v1.test.mjs`
- `tests/auth-session-startup-contract.test.mjs`
- `tests/dosync_orchestrator_dedup.test.mjs`
- `tests/driver-self-ui.test.mjs`
- `tests/driver-truck-assignment.test.mjs`
- `tests/driver_projections.test.mjs`
- `tests/e2e/missions/role-missions.mjs`
- `tests/e2e/pages-deployment-workflow-contract.test.mjs`
- `tests/e2e/pr-workflow-contract.test.mjs`
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
  now runs as a dedicated step, per Codex's own authorization this
  session), but **deliberately not bundled into this promotion**. It was
  authorized and reviewed specifically for the collaboration branch's own
  staging-gate evidence purpose (`docs/collaboration/LEGACY_SYNC_DECOMMISSION_STAGING_GATE_EVIDENCE.md`),
  not evaluated as a `main`-branch CI asset. Promoting `main`'s CI
  configuration is a separate decision with its own blast radius
  (`workflow_dispatch` inputs, secrets exposure surface) and deserves its
  own review, not a silent ride-along inside a product-code promotion.
  Flagged here as a suggested follow-up, not performed by this plan.
- Any file not present in this section's allowlist.

## 7. Mandatory CI-only correction

Candidate `sw.js` declares `crewbiq-driver-v96`, and candidate
`.github/workflows/pwa-auth-contract.yml` (at `e8bcafa8`, per the
Codex-authorized correction applied this session) already contains the
matching `grep -q "crewbiq-driver-v96" sw.js` assertion — meaning, unlike
the v95 cycle, **the correction is already present on the candidate
branch** and does not need to be freshly authored during promotion; it
only needs to be *carried over* by the restore step in §6.

Before merge, assert (identical structure to the v95 plan's §7):

1. The workflow diff versus candidate contains no unexpected delta beyond
   what §6 already restores.
2. No runtime file differs from candidate `e8bcafa8`.
3. The workflow and cache assertion agree on `v96`.

## 8. Exact future preparation procedure

This procedure is NOT authorized for execution yet. Identical structure
to the v95 plan, updated for this cycle's SHAs.

1. Fetch `origin/main` and candidate `e8bcafa8`.
2. Abort unless `origin/main` remains exactly
   `bcfd74a22449b974755b8b48bc01a3b261107b93`.
3. Create a new release branch from that exact main SHA using a normal
   branch creation; never force-push or rewrite it.
4. Restore only the §6 allowlist from candidate `e8bcafa8`.
5. Confirm the §7 `v95 -> v96` cache assertion is present (already true
   on the candidate; verify, do not re-author).
6. Require `git diff --check` clean.
7. Require the changed-file set to equal the allowlist exactly.
8. Require every active runtime file's blob ID to equal candidate
   `e8bcafa8`.
9. Require no `docs/**` or `prototype/**` path in the promotion diff, and
   confirm neither excluded workflow file (§6) is present.
10. Commit the curated change as one normal promotion commit.
11. Push the new release branch normally.
12. Open a PR to `main`; do not merge it.
13. Obtain an independent Claude review of the actual PR diff and CI
    results.
14. Obtain explicit coordinator authorization for the exact PR/commit.
15. Re-fetch `main` immediately before merge; abort on any movement.
16. Merge through a normal PR merge commit to create an explicit rollback
    boundary. Do not squash, rebase, force-push, or reset `main`.

## 9. Required pre-merge CI

No CI was run during this design-only slice because no promotion branch
or code change was created.

The future PR must require all of the following green — identical
requirement set to the v95 plan, since the workflows and scripts involved
are the same ones (only `pwa-auth-contract.yml`'s one assertion differs):

1. `PWA Auth Contract`, including the corrected cache `v96` assertion.
2. `E2E PR Smoke`:
   - `npm ci`
   - `npm run test:e2e:tooling`
   - `npm run test:e2e:self`
   - fail-closed parse of `npm run test:e2e:staging`
   - evidence-policy checks
   - `git diff --check`
3. The complete accepted narrow runtime contract set (same categories the
   v95 plan named, now also including the accepted Legacy Sync
   Decommission contract set: `RESTORE-ORCH-01`, `WRITE-ORCH-01/03/04`,
   `PTI-LOCKOUT-01`, `OFFLINE-ORCH-01`, `SW-NO-LEGACY-01`,
   `DOSYNC-SIMPLIFY-01`, already proven 15/15 in the staging gate evidence
   — see `docs/collaboration/LEGACY_SYNC_DECOMMISSION_STAGING_GATE_EVIDENCE.md`).
4. Static inline-script parse/startup-composition smoke.
5. Exact changed-file and candidate-blob allowlist checks (§6, §8).

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
   its `commit` must equal the exact merge commit, not candidate
   `e8bcafa8`.
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
5. The 6 active changed runtime files also match candidate `e8bcafa8`
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

The plan is READY for independent review, not execution.

Stop before merge if any condition is true:

- `main` moved from `bcfd74a2`.
- The promotion diff contains a path outside the curated allowlist (§6).
- Any active runtime blob differs from candidate `e8bcafa8`.
- The cache assertion is not exactly `v96`.
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
  separate, not-yet-started decision (§6).
- No alternate-hosting redesign is part of this plan.

## 16. Preparation-through-PR execution evidence

Not yet started. This section will be completed only after §8's procedure
is authorized and executed, mirroring the v95 plan's own §16/§"Production
publication execution evidence" structure exactly.
