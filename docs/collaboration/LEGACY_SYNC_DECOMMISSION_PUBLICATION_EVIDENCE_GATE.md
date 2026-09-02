# Legacy Sync Decommission — Pre-Publication Evidence Gate

Status: **BLOCKED** (documentation/validation only — no deploy, merge,
migration, data mutation, or ADR/SIDR status change authorized by this
document)

This gate inventories what a future publication decision for the accepted
Legacy Sync Decommission would need, per
`LEGACY_SYNC_DECOMMISSION_CONTRACT.md` §5 (staging/production evidence
gates) and §6 (deployment/cache order and rollback). It does not authorize
or schedule a deploy; it names what must be true before one is considered.

**This gate is BLOCKED, not READY**, because contract §5's mandatory
pre-merge gates 1 and 2 require a **staging** run, and no staging
environment run has occurred — every test result in this project's HISTORY
log, including all evidence cited below, comes from direct `node --test`
execution in a local checkout, not from staging. See §3 for the gate-by-gate
breakdown.

## 1. Candidate

- **Candidate commit (code):** `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc`
  on branch `agent/pre-base44-audit`.
- This is the last commit that touched runtime/product/test files. Every
  commit after it on the branch is documentation-only — coordination
  publishes to `docs/collaboration/COLLABORATION_STATE.md` and/or this
  evidence-gate document itself (listed in full in §2) — and alters no
  deployable PWA asset (`index.html`, `sw.js`, `core.js`, `sync.js`,
  `restore-hotfix.js`, or any other shipped runtime/test file).
- **Baseline it decommissions:** `c47ea8d30aa2618afb1f00c19688c5212ae913d6`
  (the branch state immediately before the first cleanup commit).
- **Currently live production commit** (per the locked deploy workflow,
  unrelated to this branch): `66a7985765b76e0702d015ca1e300390156f8ad6`,
  cache `crewbiq-driver-v95`, deployed via
  `.github/workflows/deploy-accepted-pages-v95.yml`. That workflow only
  triggers from the exact branch `pages-actions-v95-66a7985` — nothing on
  `agent/pre-base44-audit` can execute it, by design.

## 2. Full commit history, `c47ea8d3` → `5c6cfdaa` (candidate) → present

**Implementation and correction commits (6, not 5 — corrected from this
gate's first draft, which omitted the corrupted first attempt):**

| Commit | Summary |
|---|---|
| `1f29684b749ab9c6f60591e04c5e5561e06f69e1` | First cleanup attempt. **Self-caught as CRLF-corrupted before review**: built by reading changed files from a local git checkout on Windows (`core.autocrlf` silently converts LF-stored blobs to CRLF on checkout), which republished all five touched files with their entire line-ending representation flipped, masking the ~2–9 actually-intended edit lines inside what looked like a full-file rewrite. Detected via GitHub Compare API diff sizes matching each file's full line count rather than the few intended edits. Never reviewed by Codex; superseded immediately by the next commit. |
| `a6800954e206b787a3f83fecc191f9a03b92e188` | Correction of the above: all five files rebuilt from the true pre-corruption GitHub blobs (fetched via the Contents API), verified pure LF, with only the originally-intended edits applied. Dead literal URLs retargeted to the Orchestrator base; `sw.js`'s Apps Script hostname clause removed. This is the commit Codex actually reviewed as the "first cleanup." |
| `d6de6802b4d600c671b4ce28d2737eeb25c7c46c` | Round 1 correction: `doSync()` collapsed to a single Orchestrator write, `pullFromCloud()` retargeted onto `fullRestore()`, `sw.js` cache rotated v95→v96, `SW-NO-LEGACY-01`/`DOSYNC-SIMPLIFY-01` added. |
| `8e0c181ec7dbb723ceb63c1be5bc07a9ea750458` | Round 2 correction: `getAuthSyncUrl()` and its resolution machinery removed from `index.html`/`startup-session.js`; `doSync()` failure semantics fixed (a failed sole write now stops before pull and emits `sync:error` instead of a masked partial success). |
| `aeaee2d6ad300edec642d2a1694e5385464cdc00` | Round 3 correction: `DEFAULT_SYNC_URL` renamed to `ORCHESTRATOR_BASE_URL` and `authPost()`'s override parameter removed entirely; `syncExpensesNow()` deleted outright; `syncPTIEntry()` retargeted off `driver.syncUrl`; stale "Google Apps Script sync remains primary" UI copy fixed; `SW-NO-LEGACY-01` broadened to 5 constructs. |
| `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc` | Round 4 correction (**candidate**): added `DEFAULT_SYNC_URL` to `SW-NO-LEGACY-01`'s construct list (test-only, no runtime change). |

Each implementation/correction commit's diff was independently verified via
the GitHub Compare API against its immediate parent before publishing (or,
for `1f29684`, after publishing — which is exactly how the corruption was
caught), and cross-checked byte-for-byte against an independently-tested
local build.

**Every commit after the candidate is documentation-only** (no runtime,
product, or test file changed by any of them — each either publishes or
updates `docs/collaboration/COLLABORATION_STATE.md`, publishes or corrects
this evidence-gate document itself, or both):

| Commit | Author | Content |
|---|---|---|
| `b4ef4601` | Claude | Hand off round-4 correction for review |
| `b7bef201` | Codex | Review verdict: final legacy sync removal (NEEDS_FIX) |
| `00aaa883` | Claude | Hand off round-4 static-gate correction |
| `ce3fa90b` | Codex | Review verdict: **ACCEPT** — decommission scope complete |
| `e00216f1` | Codex | Authorize decommission publication evidence gate (docs-only next step) |
| `1b023b15` | Claude | Publish this evidence gate document, v1 (incorrectly marked READY) |
| `96c78fc5` | Claude | Hand off v1 evidence gate for review |
| `41286038` | Codex | Review verdict: v1 evidence gate NEEDS_FIX (this correction's cause) |
| `5aca5c53` | Codex | Hand off correction request |

## 3. Test evidence, mapped to contract §5 gates individually

Contract §5 states five numbered items that gate a removal PR's mergeability
(1–4) or name a future post-deploy requirement (5). This gate previously
(v1 of this document) reported aggregate test pass/fail counts without
mapping them to these five items individually, which obscured that gates 1
and 2 specifically require a **staging** run — a materially different, and
unmet, requirement from the local test execution actually performed.

| Gate | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | All §4 contract tests pass **in staging** against the candidate commit | **NOT SATISFIED** | The 9-file, 15-subtest accepted contract set (`orchestrator_transport`, `dosync_orchestrator_dedup`, `pti_lockout_orchestrator_unavailable`, `offline_orchestrator_retry`, `restore_orchestrator_transport`, `write_orchestrator_load_save`, `write_orchestrator_expense_save`, `write_orchestrator_owner_entity_save`, `sw_no_legacy_hostname`) passes 15/15 — but only via direct `node --test` execution against a local checkout of `5c6cfdaa`. No staging environment run has occurred. |
| 2 | A staging run of the full existing accepted acceptance suite passes with zero regressions | **NOT SATISFIED** | `npm run test:e2e:tooling` (40 files, 325 tests) passes 325/325 — again, local execution only, not staging. |
| 3 | The PWA's own shipped code contains no remaining source reference that can construct a request to `script.google.com`/`googleapis.com` (static-source claim) | **SATISFIED** | `SW-NO-LEGACY-01`'s PWA-wide static scan (broadened in round 3 to 6 constructs: both hostnames, the `crewbiq-expenses` literal, and the `getAuthSyncUrl()`/`syncExpensesNow()`/`DEFAULT_SYNC_URL` definitions) confirms none of the ~30 files in `sw.js`'s own `APP_SHELL` list contain any of them. This is a static-source claim by construction, not a live-traffic claim, and does not require staging to verify — it was already verified against the exact candidate commit. |
| 4 | Product Owner sign-off (§6) on the one currently open decision | **SATISFIED** | Recorded in HISTORY (2026-09-02, "Product Owner decision recorded"): asked directly whether `crewbiq-expenses` carries any distinct consumer needing preservation; answer "No, safe to remove," closing `CREWBIQ_EXPENSES_DISTINCT_CONSUMER_UNKNOWN`. |
| 5 | Post-publication production evidence gate (a)–(e) | **N/A pre-merge; unexercised** | This gate is explicitly *required by* the contract but not *authorized by* it before a merge — it names what a future deploy must check, not a pre-merge condition. Named in full in §5 below as the bounded post-deploy checklist. |

**GitHub Actions CI: has not run against these commits.**
`pwa-auth-contract.yml` and `e2e-pr-smoke.yml` both trigger only on
`pull_request`; no PR has been opened against any of the 6 implementation/
correction commits — all were published as direct commits to
`agent/pre-base44-audit` via the coordination workflow. If publication
proceeds via a PR, both PR-triggered workflows would run automatically and
must be confirmed green before merge — this is a distinct requirement from,
and does not substitute for, gates 1–2's staging-run requirement above.

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
  new workflow file **does not exist yet** and creating one is itself a
  reviewable change, not something this evidence gate authorizes.

## 5. Post-publication production evidence requirements (contract §5 gate 5)

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
are named here as the bounded checklist a future deploy must clear. This
item is unaffected by this correction's BLOCKED status change, since gate 5
was already correctly identified as post-publication-only, not pre-merge,
in this document's first draft.

## 6. Rollback trigger and target

- **Trigger:** any of the post-publication production evidence checks (a)–(d) in §5 failing post-
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

- **Contract §5 gates 1 and 2 (staging test runs) are unmet** — this is the
  primary reason this gate is BLOCKED, not a minor caveat. No staging
  environment run of any kind has occurred for this decommission.
- No new pinned deploy workflow exists yet for the `v96` candidate (§4).
- No PR-triggered CI run exists yet for these commits (§3).
- The post-publication production evidence checklist (§5) is unexercised —
  this is a gate specification, not a passed gate (expected; it cannot be
  satisfied before a deploy exists).
- `tests/ui-shell-prototype.test.mjs`'s `SAFETY_CONTRACT` hash-pin for
  `core.js`/`index.html` is stale/broken independent of this project's
  work (confirmed against both the pre-cleanup baseline and the current
  tip — matches neither). It is not part of the accepted contract set or
  `npm run test:e2e:tooling`, and remains flagged for its owning
  (`crewbiq-next` prototype) track, not fixed here.

## 8. What is settled vs. what blocks merge

The **implementation itself** is complete and independently accepted
(Codex ACCEPT, review commit `ce3fa90b700c7436e9d9d00efca76a7f9fd98546`) —
that verdict is not reopened by this correction. What blocks a merge
decision is narrower and specific: contract §5 gates 1–2 require a staging
run that has not happened. Gates 3–4 are genuinely satisfied and gate 5 is
correctly out of scope pre-merge. Closing this BLOCKED status requires
either running the accepted contract set and full acceptance suite in an
actual staging environment, or an explicit, separately-authorized decision
to waive that requirement — neither of which this document performs.
