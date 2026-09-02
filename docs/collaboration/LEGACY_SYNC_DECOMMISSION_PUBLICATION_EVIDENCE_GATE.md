# Legacy Sync Decommission — Pre-Publication Evidence Gate

Status: **READY** (documentation/validation only — no deploy, merge, migration,
data mutation, or ADR/SIDR status change authorized by this document)

This gate inventories what a future publication decision for the accepted
Legacy Sync Decommission would need, per
`LEGACY_SYNC_DECOMMISSION_CONTRACT.md` §5 (staging/production evidence
gates) and §6 (deployment/cache order and rollback). It does not authorize
or schedule a deploy; it names what must be true before one is considered.

## 1. Candidate

- **Candidate commit (code):** `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc`
  on branch `agent/pre-base44-audit`.
- This is the last commit that touched runtime/product/test files. All
  commits after it on the branch (`b4ef4601`, `00aaa883`, `e00216f1`, …)
  are `docs/collaboration/COLLABORATION_STATE.md`-only coordination
  publishes and do not change candidate content.
- **Baseline it decommissions:** `c47ea8d30aa2618afb1f00c19688c5212ae913d6`
  (the branch state immediately before the first cleanup commit).
- **Currently live production commit** (per the locked deploy workflow,
  unrelated to this branch): `66a7985765b76e0702d015ca1e300390156f8ad6`,
  cache `crewbiq-driver-v95`, deployed via
  `.github/workflows/deploy-accepted-pages-v95.yml`. That workflow only
  triggers from the exact branch `pages-actions-v95-66a7985` — nothing on
  `agent/pre-base44-audit` can execute it, by design.

## 2. Implementation history (5 commits, all on `agent/pre-base44-audit`)

| Commit | Summary |
|---|---|
| `a6800954e206b787a3f83fecc191f9a03b92e188` | Initial atomic cleanup: dead literal URLs retargeted to the Orchestrator base, `sw.js` Apps Script hostname clause removed. Corrected in-place after a self-caught Windows CRLF publishing incident (see HISTORY for full account). |
| `d6de6802b4d600c671b4ce28d2737eeb25c7c46c` | Round 1 correction: `doSync()` collapsed to a single Orchestrator write, `pullFromCloud()` retargeted onto `fullRestore()`, `sw.js` cache rotated v95→v96, `SW-NO-LEGACY-01`/`DOSYNC-SIMPLIFY-01` added. |
| `8e0c181ec7dbb723ceb63c1be5bc07a9ea750458` | Round 2 correction: `getAuthSyncUrl()` and its resolution machinery removed from `index.html`/`startup-session.js`; `doSync()` failure semantics fixed (a failed sole write now stops before pull and emits `sync:error` instead of a masked partial success). |
| `aeaee2d6ad300edec642d2a1694e5385464cdc00` | Round 3 correction: `DEFAULT_SYNC_URL` renamed to `ORCHESTRATOR_BASE_URL` and `authPost()`'s override parameter removed entirely; `syncExpensesNow()` deleted outright (redundant with the general Orchestrator write path); `syncPTIEntry()` retargeted off `driver.syncUrl`; stale "Google Apps Script sync remains primary" UI copy fixed; `SW-NO-LEGACY-01` broadened to 5 constructs. |
| `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc` | Round 4 correction: added `DEFAULT_SYNC_URL` to `SW-NO-LEGACY-01`'s construct list (test-only, no runtime change). |

Each commit's diff was independently verified via the GitHub Compare API
against its immediate parent before publishing, and cross-checked
byte-for-byte (after CRLF normalization) against an independently-tested
local build, per the recurring encoding-safety discipline documented in
this project's own HISTORY log.

## 3. Test evidence

- **Accepted contract regression set** (9 files, 15 subtests, specified in
  `LEGACY_SYNC_DECOMMISSION_CONTRACT.md` §4): `orchestrator_transport`,
  `dosync_orchestrator_dedup` (DOSYNC-SIMPLIFY-01, success + failure path),
  `pti_lockout_orchestrator_unavailable` (PTI-LOCKOUT-01),
  `offline_orchestrator_retry` (OFFLINE-ORCH-01),
  `restore_orchestrator_transport` (RESTORE-ORCH-01),
  `write_orchestrator_load_save`/`write_orchestrator_expense_save`/
  `write_orchestrator_owner_entity_save` (WRITE-ORCH-01/03/04),
  `sw_no_legacy_hostname` (SW-NO-LEGACY-01, PWA-wide static + representative
  dynamic flow). **15/15 passing** at `5c6cfdaa`.
- **Full CI-wired tooling suite** (`npm run test:e2e:tooling`, 40 files,
  325 individual tests spanning navigation, identity/attribution,
  workspace/roster/assignment adapters, fleet mutation, deduction/settlement
  logic, and the locked deployment-workflow contract test itself):
  **325/325 passing** at `5c6cfdaa`.
- **Static-source completeness gate** (contract §5 gate 3): `SW-NO-LEGACY-01`'s
  PWA-wide scan confirms none of the ~30 files in `sw.js`'s own `APP_SHELL`
  list contain `script.google.com`, `googleapis.com`, the `crewbiq-expenses`
  literal, or the `getAuthSyncUrl()`/`syncExpensesNow()`/`DEFAULT_SYNC_URL`
  definitions — the complete accepted REMOVE surface, not just the two
  hostname strings.
- **GitHub Actions CI: not yet run.** `pwa-auth-contract.yml` and
  `e2e-pr-smoke.yml` both trigger only on `pull_request`; no PR has been
  opened against these commits this session (all publishing was direct
  commits to `agent/pre-base44-audit` via the coordination workflow). All
  test evidence above is from direct `node --test` / `npm run
  test:e2e:tooling` execution against the exact published bytes in a local
  checkout, not from a GitHub Actions run. **If publication proceeds via a
  PR, both PR-triggered workflows must be confirmed green before merge —
  this has not happened yet and is not claimed as already satisfied.**

## 4. Cache/version implications

- `sw.js`'s `CACHE_NAME` was rotated `crewbiq-driver-v95` → `crewbiq-driver-v96`
  in the same commit (`d6de6802`) that first changed `index.html`/`sync.js`/
  `restore-hotfix.js`'s legacy-facing code, per contract §6's atomic-bump
  requirement — no commit in this branch's history ships changed
  transport code under an unrotated cache version.
- The **currently deployed** production artifact is pinned to a *different*
  cache version (`v95`) and a *different* commit (`66a79857…`) via a
  locked, single-SHA deploy workflow. Publishing this decommission to
  production is **not** "push this branch" — it requires authoring a new
  pinned deploy workflow (e.g. `deploy-accepted-pages-v96.yml`) following
  the same locked pattern as `deploy-accepted-pages-v95.yml`: exact `ref:`
  pin to the accepted commit, exact pinned action SHAs, an app-shell
  existence/cache-grep guard, and a new single-purpose trigger branch. That
  new workflow file does not exist yet and creating one is itself a
  reviewable change, not something this evidence gate authorizes.

## 5. Staging validation requirements (contract §5 gate 5)

Before any real production deploy of this decommission may be considered
complete, someone must confirm, against the **actually served** production
assets (not just the reviewed commit):

- (a) the exact served commit SHA and service-worker cache version match
  what was deployed;
- (b) `/health` and `/ready` on the Orchestrator are green;
- (c) a representative auth/restore and a representative write (e.g. one
  load save) succeed end-to-end against production;
- (d) the served `index.html`, `sync.js`, `restore-hotfix.js`, `sw.js`
  contain no remaining source reference to `script.google.com`/
  `googleapis.com`/`DEFAULT_SYNC_URL`/`crewbiq-expenses` — mirroring §5
  gate 3's static-source check but against production, not the branch;
- (e) an explicit rollback trigger condition and the exact rollback
  procedure below are pre-agreed before the deploy, not decided during an
  incident.

None of (a)–(e) can be satisfied before a production deploy exists; they
are named here as the bounded checklist a future deploy must clear, not as
already-passed evidence.

## 6. Rollback trigger and target

- **Trigger:** any of staging-validation checks (a)–(d) above failing post-
  deploy, or an elevated write-failure rate observed in the first bounded
  observation window after deploy (exact window/threshold to be set by
  whoever authorizes the deploy — not fixed by this document).
- **Immediate rollback target:** the currently-live production commit
  `66a7985765b76e0702d015ca1e300390156f8ad6` / cache `v95` — i.e., simply
  not promoting the new pinned workflow, or reverting to the existing
  `deploy-accepted-pages-v95.yml` trigger if the new one already ran.
- **Rollback mechanics, per contract §6:** revert the commit set and roll
  the cache version back down in the same revert. No server-side Apps
  Script endpoint or data is touched by this contract (§6), and every
  write in the reverted code path remains local-first per invariant §3.2,
  so a client-side revert alone is sufficient — no data loss, no data
  migration to undo.
- **Deeper fallback already on record** (independent of this decommission,
  pre-existing in the locked workflow's own header comment): if `v95`
  itself needs reverting, the documented next fallback is Pages
  `build_type=legacy`, source `main` at `/`, rebuild
  `86b8b4dd7e9496833a021319167589b49f0ac418`, live cache `v79`. This
  decommission does not touch or invalidate that deeper fallback.

## 7. Open items / not claimed as resolved

- No new pinned deploy workflow exists yet for the `v96` candidate (§4).
- No PR-triggered CI run exists yet for these commits (§3).
- The staging validation checklist (§5) is unexercised — this is a gate
  specification, not a passed gate.
- `tests/ui-shell-prototype.test.mjs`'s `SAFETY_CONTRACT` hash-pin for
  `core.js`/`index.html` is stale/broken independent of this project's
  work (confirmed against both the pre-cleanup baseline and the current
  tip — matches neither). It is not part of the accepted contract set or
  `npm run test:e2e:tooling`, and remains flagged for its owning
  (`crewbiq-next` prototype) track, not fixed here.

Given the above, this evidence gate is published as **READY**: the
implementation itself is complete and independently accepted (Codex ACCEPT,
review commit `ce3fa90b700c7436e9d9d00efca76a7f9fd98546`), and everything
that can be verified pre-deploy (contract test evidence, static-source
completeness, cache-rotation discipline, rollback procedure) is verified
and documented. Items in §7 are the explicit, named remainder that only a
real deploy attempt — separately authorized — can close.
