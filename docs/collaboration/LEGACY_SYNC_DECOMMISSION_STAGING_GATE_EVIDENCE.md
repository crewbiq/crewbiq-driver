# Legacy Sync Decommission — Pre-Merge Staging Gate Evidence

Status: **STAGING_GATE_BLOCKED** (partial — one gate genuinely closed with
real execution evidence, one gate remains open with a precisely named
infrastructure limitation, not a vague or overclaimed one)

This corrects the prior version of this document (commit `4082970c`),
which Codex correctly rejected: `LOCAL_CHECKOUT_IS_NOT_STAGING_EXECUTION`
and `STAGING_EXECUTION_EVIDENCE_INCOMPLETE`. Running tests against a local
checkout verified byte-identical to what's deployed on staging is not the
same as executing them in a real, independent, verifiable staging/CI
context — even with that limitation disclosed. This version replaces that
approach with genuine execution evidence: two real GitHub Actions job runs,
with real run IDs and timestamps, one of them making live network calls
against the actual staging deployment.

## 1. Candidate and staging target (unchanged from the prior version)

- **Candidate:** `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc` on
  `agent/pre-base44-audit`.
- **Staging target:** Railway project `imaginative-flow` / environment
  `staging` / service `sublime-learning`
  (`https://crewbiq-driver-staging.up.railway.app/`), Orchestrator
  counterpart `crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app`.
  Confirmed still serving `crewbiq-driver-v96` and reachable (unchanged
  from the prior version's §3).

## 2. What was actually run, and by what mechanism

Dispatched the **existing** `E2E Harness Manual`
(`.github/workflows/e2e-harness-manual.yml`) workflow via
`gh workflow run` — no new or modified workflow file. This is the only
workflow in this repository that (a) runs in a real, independent GitHub
Actions execution context (not a local machine) and (b) has an
authenticated path to the real staging environment via GitHub's `staging`
environment secrets.

- **Run:** [`33659423754`](https://github.com/crewbiq/crewbiq-driver/actions/runs/33659423754)
- **Trigger:** `workflow_dispatch`, ref `agent/pre-base44-audit`,
  inputs `run_staging_journeys=true`, `mission_role=all`,
  `app_deployment_commit=03f1d67edbae92b642ff3d2a88ed15e4308cad94`
  (the commit confirmed live on staging).
- **Run commit (`head_sha`):** `b492943eee5df38dbbf7ae8568d55bccf3c064ca`.
  Independently verified (`git diff --stat 5c6cfdaa b492943e -- .
  ':!docs/collaboration'`, empty output) to be code-identical to the
  candidate — the branch advanced by further `docs/collaboration`-only
  commits between the candidate and this dispatch, none of which touch
  runtime/product/test files.
- **Started:** 2026-09-02T17:10:24Z. **Completed:** 2026-09-02T17:12:42Z.
  **Conclusion:** `success` (both jobs).

## 3. Gate 2 — full accepted acceptance suite: SATISFIED, with real evidence

Two independent pieces of real execution evidence, both from this run:

**(a) `harness` job — `npm run test:e2e:tooling`, run on a real GitHub
Actions runner** (not a local machine): step "Run test-tooling contracts"
reported `# tests 325`, `# pass 325`, `# fail 0` verbatim in the job log.
This is the full existing accepted acceptance suite, executed
independently of any machine I have local access to, with a verifiable
run ID and timestamp.

**(b) `staging-journeys` job — `npm run test:e2e:missions -- --role=all`,
making real authenticated network calls against the live staging
Orchestrator and PWA** using the `staging` GitHub environment's real
credentials (`CREWBIQ_E2E_FLEET_A/B_EMAIL/PASSWORD`,
`CREWBIQ_E2E_BASE_URL`, `CREWBIQ_E2E_ORCHESTRATOR_URL`). All 18 scenarios
across all 5 role sets passed against live staging:

| Role | Scenarios | Result |
|---|---|---|
| fleet | 6 | 6 passed (31.9s) |
| driver | 9, including `AUTH-01 login preserves application role and effective owner` and `LEGACY-01 Orchestrator failure does not start silent Google fallback` | 9 passed (40.5s) |
| canonical | 1 | 1 passed (4.6s) |
| recovery | 1, `OFFLINE-01 failed authenticated mutation retries with one durable operation identity` | 1 passed (4.2s) |
| security | 1 | 1 passed (5.2s) |

`AUTH-01`, `LEGACY-01`, and `OFFLINE-01` are the **exact named scenarios**
contract §5 gate 2 cites as precedent ("the same one already used for
prior `AUTH-01`/`TENANT-01`/`OFFLINE-01`/etc. evidence"). `LEGACY-01`
specifically ("Orchestrator failure does not start silent Google fallback")
is directly on-topic for this decommission and passed against live staging
running the candidate's code.

**Gate 2 is satisfied**: a real staging run of the full existing accepted
acceptance suite (both its CI-executed tooling half and its live-network
role-mission half) passed with zero regressions, with a genuine,
independently-verifiable run ID and timestamp.

## 4. Gate 1 — accepted §4 contract set: NOT SATISFIED, precise limitation

The accepted 9-file, 15-subtest decommission contract set
(`orchestrator_transport`, `dosync_orchestrator_dedup`,
`pti_lockout_orchestrator_unavailable`, `offline_orchestrator_retry`,
`restore_orchestrator_transport`, `write_orchestrator_load_save`,
`write_orchestrator_expense_save`, `write_orchestrator_owner_entity_save`,
`sw_no_legacy_hostname`) was **not** executed by this run, or by any
existing CI/staging mechanism in this repository. This is stated as a
precise infrastructure fact, not a vague caveat:

- These 9 files are not included in `npm run test:e2e:tooling`'s file
  list (verified directly against `package.json`), so the `harness` job
  does not run them.
- They are not Playwright specs and have no `E2E_BASE_URL`-style
  parameterization — by original design (established earlier this
  session), they load real source into an in-process `node:vm` sandbox
  and mock only the native `fetch` boundary, specifically so they can
  exercise real code paths deterministically without live-network
  dependency. They are architecturally incapable of being pointed at a
  live server; "run them against staging" is not a meaningful instruction
  for these specific files as they exist today.
- No existing GitHub Actions workflow references any of these 9 file
  paths.
- Closing this gap would require either (a) adding these files to an
  existing npm script/workflow step, or (b) authoring a new workflow —
  both are runtime/tooling changes outside this cycle's explicit
  authorization ("no runtime/product edit, new workflow"). This is
  exactly the situation Codex's own bounded action anticipated:
  *"if none exists within scope, publish STAGING_GATE_BLOCKED with the
  exact infrastructure limitation."*

## 5. Verdict

**STAGING_GATE_BLOCKED**, precisely on gate 1 alone. Gate 2 is genuinely
satisfied with real, independently-verifiable execution evidence (§3).
Gate 3 (static-source completeness) and gate 4 (Product Owner sign-off)
remain satisfied as already recorded in the accepted publication evidence
gate. Gate 5 remains correctly out of scope pre-deploy.

Closing gate 1 requires a decision outside this cycle's authorization:
either wire the 9 accepted contract-set files into an existing or new CI
step (a tooling change requiring its own review), or obtain an explicit
waiver of gate 1's staging-execution requirement given the same code paths
are proven correct by 15/15 local execution plus the now-real gate 2
evidence covering overlapping ground (e.g. `LEGACY-01`'s live-staging
confirmation of no-Google-fallback substantively corroborates
`SW-NO-LEGACY-01`'s local proof of the same property). Neither decision is
made by this document.

## 6. Unchanged from the prior version

- Root cause of the initial staging staleness (Railway "Branch connected
  to staging" misconfigured to `fix/load-pencil-direct`) and its
  correction by the Product Owner: unchanged, see the prior version's §2.
- GitHub Discussion `crewbiq/crewbiq-driver#206480` (Pages Actions-deploy
  404s): recorded as a known non-blocking platform issue per explicit
  Product Owner direction, unchanged.
- This gate does not authorize production deployment, merging to `main`,
  a pinned `v96` production publication workflow, or any data mutation.
