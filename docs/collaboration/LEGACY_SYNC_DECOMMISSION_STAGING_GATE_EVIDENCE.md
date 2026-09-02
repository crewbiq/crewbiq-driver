# Legacy Sync Decommission — Pre-Merge Staging Gate Evidence

Status: **STAGING_GATE_PASS**

This corrects the prior version of this document (commit `3ddcfbeb`),
which Codex reviewed and found one blocking evidence error:
`GATE1_EXISTING_WORKFLOW_REFERENCE_MISSTATED` — the claim "no existing
workflow references any of the 9 accepted contract-set paths" was false
(see §4). Gate 2's evidence from that prior version stands and is
reproduced here unchanged; gate 1 is now closed with real CI execution
evidence per Codex's authorized closure.

## 1. Candidate and staging target (unchanged)

- **Candidate:** `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc` on
  `agent/pre-base44-audit`.
- **Staging target:** Railway project `imaginative-flow` / environment
  `staging` / service `sublime-learning`
  (`https://crewbiq-driver-staging.up.railway.app/`), Orchestrator
  counterpart `crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app`.
  Re-confirmed still serving `crewbiq-driver-v96` at time of this
  correction.

## 2. Correction: the CI-wiring gap, precisely stated and closed

The prior version's claim was corrected to what is actually true:
`.github/workflows/pwa-auth-contract.yml` (a `pull_request`/`push:main`
-triggered workflow, never run against this branch's commits since no PR
was opened) *does* reference one of the 9 accepted files —
`tests/orchestrator_transport.test.mjs` — but only via a `sed`-transformed
temporary copy (`s#../core.js#../core-runtime.js#`), not the file itself,
and via plain `node`, not `node --test`. The other 8 accepted files are
not referenced by that workflow or any other. That workflow is also
independently stale (its final step still asserts `crewbiq-driver-v94`
in `sw.js`), reinforcing that it was never a live gate for this branch.

**Per Codex's authorized closure**, added exactly one new step to the
**existing** `.github/workflows/e2e-harness-manual.yml` workflow (no new
workflow file, no runtime/product/package.json/test file changed):

```yaml
- name: Run legacy sync decommission contract set
  run: node --test tests/orchestrator_transport.test.mjs tests/dosync_orchestrator_dedup.test.mjs tests/pti_lockout_orchestrator_unavailable.test.mjs tests/offline_orchestrator_retry.test.mjs tests/restore_orchestrator_transport.test.mjs tests/write_orchestrator_load_save.test.mjs tests/write_orchestrator_expense_save.test.mjs tests/write_orchestrator_owner_entity_save.test.mjs tests/sw_no_legacy_hostname.test.mjs
```

Placed in the `harness` job immediately after the existing
"Run test-tooling contracts" step. Published as commit
`b9e44f1f024cdd1b4b2ac250a1d5f044a208afb7`
(diff: `.github/workflows/e2e-harness-manual.yml` `+3 -0`, verified via
GitHub Compare API). Re-confirmed after publishing that this commit is
still code-identical to the candidate outside this one workflow file
(`git diff --stat 5c6cfdaa b9e44f1f -- . ':!docs/collaboration'
':!.github/workflows/e2e-harness-manual.yml'` → empty).

## 3. Gate 1 — accepted §4 contract set: now SATISFIED, with real CI evidence

Dispatched the updated workflow: [`run 33664713713`](https://github.com/crewbiq/crewbiq-driver/actions/runs/33664713713),
`workflow_dispatch` on `agent/pre-base44-audit`, `head_sha`
`b9e44f1f024cdd1b4b2ac250a1d5f044a208afb7` (code-identical to the
candidate per §2). Started 2026-09-02T18:01:56Z, completed
2026-09-02T18:02:54Z, conclusion `success`.

The new "Run legacy sync decommission contract set" step reported,
verbatim in the job log:

```
# tests 15
# pass 15
# fail 0
```

All 9 files' subtests are present in the log by name, including the exact
contract-test identifiers this cycle's decommission work established:
`RESTORE-ORCH-01` (3 subtests), `SW-NO-LEGACY-01` (5 subtests: static ×2,
dynamic ×3), and the 4 remaining file-level entries
(`dosync_orchestrator_dedup`, `offline_orchestrator_retry`,
`orchestrator_transport`, `pti_lockout_orchestrator_unavailable`) plus the
3 `write_orchestrator_*` files — 9 files, 15 subtests total, matching the
accepted count exactly.

This is real, independently-verifiable execution: a genuine GitHub Actions
run ID, real timestamps, run against a checkout independently confirmed
code-identical to the candidate, executing the exact accepted file list
verbatim (not a derivative, not a subset).

## 4. Gate 2 — full accepted acceptance suite: SATISFIED (unchanged from the prior version, reproduced for completeness)

From the earlier run [`33659423754`](https://github.com/crewbiq/crewbiq-driver/actions/runs/33659423754)
(already reviewed and accepted by Codex):

- `harness` job's `npm run test:e2e:tooling` on a real GitHub Actions
  runner: `# tests 325`, `# pass 325`, `# fail 0`.
- `staging-journeys` job's `npm run test:e2e:missions -- --role=all`,
  real authenticated calls against live staging: 18/18 scenarios passed
  across 5 roles (fleet 6, driver 9, canonical 1, recovery 1, security 1),
  including the exact `AUTH-01`, `LEGACY-01` (Orchestrator failure does
  not start silent Google fallback), `OFFLINE-01`, and `TENANT-01`
  scenarios the contract cites by name as precedent evidence.

## 5. Verdict

**STAGING_GATE_PASS.** Both contract §5 gates 1 and 2 are now satisfied
with real, independently-verifiable execution evidence — gate 1 via a
dedicated CI step added to the existing `E2E Harness Manual` workflow
(run `33664713713`, 15/15), gate 2 via the same workflow's existing jobs
(run `33659423754`, 325/325 plus 18/18 live staging scenarios). Gates 3–4
remain satisfied as already recorded in the accepted publication evidence
gate. Gate 5 remains correctly out of scope until a real production
deploy exists.

## 6. Unchanged from prior versions

- Root cause of the initial staging staleness (Railway "Branch connected
  to staging" misconfigured to `fix/load-pencil-direct`) and its
  correction by the Product Owner.
- GitHub Discussion `crewbiq/crewbiq-driver#206480` (Pages Actions-deploy
  404s): recorded as a known non-blocking platform issue per explicit
  Product Owner direction.
- This gate does not authorize production deployment, merging to `main`,
  a pinned `v96` production publication workflow, or any data mutation.
