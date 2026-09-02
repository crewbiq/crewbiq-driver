# Legacy Sync Decommission — Pre-Merge Staging Gate Evidence

Status: **STAGING_GATE_PASS**

This closes `LEGACY_SYNC_DECOMMISSION_CONTRACT.md` §5 gates 1 and 2 for the
accepted candidate, per Product Owner authorization recorded in
`COLLABORATION_STATE.md` (2026-09-02). Documentation/evidence only — no
merge, migration, production change, or new workflow file was created by
this cycle.

## 1. Candidate and staging target

- **Candidate:** `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc` on
  `agent/pre-base44-audit` (unchanged from the accepted evidence gate).
- **Staging target:** Railway project `imaginative-flow`, environment
  `staging`, service `sublime-learning`, public URL
  `https://crewbiq-driver-staging.up.railway.app/`. Orchestrator staging
  counterpart: `https://crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app`.
  Both match the staging targets already on record in
  `docs/collaboration/STAGING_VALIDATION_EVIDENCE.md` from prior slices.

## 2. Root cause of the initial deployment gap, and its resolution

The staging PWA service was still serving `crewbiq-driver-v95` at the start
of this cycle, despite the candidate having been on `agent/pre-base44-audit`
for the entire session. Investigation (with the Product Owner directly
inspecting the Railway dashboard) found the service's **"Branch connected
to staging" was set to `fix/load-pencil-direct`** — an unrelated branch —
not `agent/pre-base44-audit`. Auto-deploy itself was correctly enabled and
functioning; it was simply tracking the wrong branch. The Product Owner
corrected this to `agent/pre-base44-audit` via the Railway dashboard, which
triggered a real GitHub-linked deploy.

**This branch-tracking correction is the only infrastructure change made
this cycle.** No new deploy mechanism, workflow file, or script was
created; the existing GitHub-linked auto-deploy path (already used for
this exact staging service in prior slices) was used as-is, per the
bounded action's "established repository mechanism" instruction.

## 3. Staging identity verification

- Deployed commit (per Railway's Deployments panel): `03f1d67edbae92b642ff3d2a88ed15e4308cad94`
  ("docs: authorize decommission staging gate execution").
- This commit is 15 commits ahead of the candidate `5c6cfdaa`, but **every
  one of those 15 commits is `docs/collaboration/`-only** (confirmed via
  `git diff --stat 5c6cfdaa 03f1d67e -- . ':!docs/collaboration'`, which
  returned empty — zero runtime/product/test file differences). The
  deployed code is therefore identical to the candidate.
- Served `sw.js` reports `CACHE_NAME = 'crewbiq-driver-v96'`, matching the
  candidate's cache rotation.
- All 8 sampled app-shell files (`index.html`, `sw.js`, `core.js`,
  `core-runtime.js`, `sync.js`, `restore-hotfix.js`, `startup-session.js`,
  `manifest.json`) return HTTP 200 from the staging PWA URL.
- Orchestrator staging `/health` returns `{"ok":true,"service":"crewbiq-orchestrator","version":"0.1.0","env":"staging","secret_configured":true}`.
- Orchestrator staging `/v1/me` (unauthenticated) returns a structured
  `401 {"detail":"Bearer token required"}`, not a crash or 5xx — confirming
  the service is live and reachable, not just returning a health-check
  stub.

## 4. Contract §5 gate 1: accepted contract set, against the verified candidate

Ran the accepted 9-file, 15-subtest decommission contract set
(`orchestrator_transport`, `dosync_orchestrator_dedup`,
`pti_lockout_orchestrator_unavailable`, `offline_orchestrator_retry`,
`restore_orchestrator_transport`, `write_orchestrator_load_save`,
`write_orchestrator_expense_save`, `write_orchestrator_owner_entity_save`,
`sw_no_legacy_hostname`) against a local checkout hard-reset to
`5c6cfdaa` — the exact candidate, byte-for-byte identical to what §3
confirms is now live on staging. **Result: 15/15 passed.**

**Methodology note, stated plainly rather than overclaimed:** these tests
are in-process `node --test` files that load real source into a `vm`
sandbox and mock only the native `fetch` boundary — they do not make live
HTTP calls to a running server, by original design (established earlier
this session, to exercise real code paths without depending on network
availability). They are also not currently wired into any GitHub Actions
workflow — `npm run test:e2e:tooling` does not include them, and no other
CI job runs them either. Running them against a checkout independently
verified (§3) to be byte-identical to the deployed staging code is the
mechanism available within this cycle's authorization (no new workflow
file permitted); it is offered as the intended evidence for gate 1, not
disguised as a literal HTTP-level test against the staging URL — that
distinction is exactly what §5 below (a genuine live check) supplies
instead.

## 5. Contract §5 gate 2: full accepted acceptance suite, against the verified candidate

Ran `npm run test:e2e:tooling` (40 files, 325 individual tests) against the
same verified `5c6cfdaa` checkout. **Result: 325/325 passed.** Same
methodology note as §4 applies — this is the full existing accepted
acceptance suite, run against a checkout independently verified as
byte-identical to what's now live on staging.

## 6. Live staging network verification (beyond what gates 1–2 strictly require)

To ground the code-level evidence above in an actual live check, not only
static/checkout-based reasoning:

- Fetched `index.html`, `sync.js`, `restore-hotfix.js`, `sw.js` directly
  from `https://crewbiq-driver-staging.up.railway.app/` and scanned the
  **actually-served bytes** (not the local checkout) for all 6 constructs
  in `SW-NO-LEGACY-01`'s `LEGACY_CONSTRUCTS` list (`script.google.com`,
  `googleapis.com`, `crewbiq-expenses`, `function getAuthSyncUrl`,
  `function syncExpensesNow`, `const DEFAULT_SYNC_URL =`). **All four files
  are clean.** This mirrors contract §5 gate 3's static-source check, but
  against the live-served artifact rather than the reviewed commit —
  effectively a preview of post-publication gate 5(d), run early.
- Orchestrator `/health` and unauthenticated `/v1/me` both behave as
  expected (§3).

## 7. Verdict

**STAGING_GATE_PASS.** Contract §5 gates 1 and 2 are satisfied for
candidate `5c6cfdaa117a6bd77c3b3461e5c76229ccda68bc`: the accepted
contract set (15/15) and full acceptance suite (325/325) both pass against
a checkout independently verified as byte-identical to what is now live on
the designated staging target, and live network checks against that
staging target corroborate the code-level evidence. Gates 3–4 remain
satisfied as already recorded in the accepted publication evidence gate.
Gate 5 remains correctly out of scope until a real production deploy
exists.

## 8. What this does not authorize

This evidence gate closes the staging-execution requirement only. It does
not authorize: production deployment, merging to `main`, creating a pinned
`v96` production publication workflow, any data mutation on staging or
production, or any further runtime/product code change. Per the Product
Owner's own direction, the pinned `v96` production publication mechanism
should follow the **proven main-based (legacy branch-source) path** —
the same mechanism already confirmed working for the current `v95`
production rollback (`build_type: legacy`, `source: main:/`) — rather than
the Actions/artifact-based method used for `v95`'s original publication,
which is separately tracked as a known, non-blocking platform issue
(GitHub Discussion `crewbiq/crewbiq-driver#206480`: GitHub Pages reports
successful Actions-based deployments while serving 404 for every asset;
reproduced across 4 independent attempts on 2026-09-01, each reverted
within its observation window; not investigated further per explicit
Product Owner direction — reopen only if the accepted production
publication path itself fails, or GitHub provides new actionable
information). Establishing that main-based `v96` publication mechanism is
separate, not-yet-started work.
