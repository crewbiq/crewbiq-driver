# URGENT CORRECTION: Legacy Sync Transport Interception Discovery

Status: CRITICAL FINDING. Discovered while beginning the authorized
contract-test implementation task, before writing any test. No test,
runtime, configuration, legacy-path, deployment, migration, merge, data,
ADR status, ADR-0008-0016, or SIDR change has been made. This document
halts the in-progress test-implementation task and surfaces a conflict with
prior ACCEPTED conclusions, per standing instruction to stop and surface
rather than silently proceed on a premise later found to be wrong.

Prepared by: Claude (implementer role).

## What was discovered, and how

While setting up to implement the five contract tests authorized against
`LEGACY_SYNC_DECOMMISSION_CONTRACT.md`, I cloned the actual repository
locally (this session's prior evidence-gathering was done entirely via the
read-only GitHub Contents API — file-by-file static reads — never an actual
local checkout or test execution). Running the repository's own existing
test suite for the first time this session surfaced a direct contradiction:
`tests/full_restore_transport.test.mjs` calls `fetch('https://script.google
.com/macros/s/example/exec', {..., body: JSON.stringify({type:
'auth_restore', ...})})` and asserts the resulting network call reaches
`https://crewbiq-orchestrator-production.up.railway.app/v1/me` and
`/v1/restore/pwa` — **not** Apps Script — and explicitly asserts
`calls.some(call => call.url.includes('script.google.com')) === false`.
This test passes against the exact current repository state.

Tracing why, by reading the actual source (not just grepping for
`script.google.com`/`syncUrl` literals, which is what every prior pass this
session did):

- `core.js` (loaded first, `index.html:12`, before `sync.js` at line 13) is
  a 25-line `document.write()` loader. Because `document.write()` during
  initial HTML parsing injects and executes scripts synchronously before
  the parser reaches the next `<script>` tag, everything it loads —
  including `core-runtime.js` and `restore-hotfix.js` — finishes executing
  before `sync.js`, `pti.js`, `loads.js`, or any inline `index.html`
  handler ever runs.
- `core-runtime.js` captures the true native `fetch` as `nativeFetch`
  (`core-runtime.js:30`), then at `core-runtime.js:609` does
  **`global.fetch = routedFetch`** — replacing the global `fetch` for the
  rest of the app's lifetime.
- `routedFetch` (`core-runtime.js:551-579`) inspects the **JSON body's
  `type` field**, not the URL argument, and for every matched type calls an
  `adapt*` function that makes an entirely new request to the real
  Orchestrator via `nativeFetch(getOrchestratorBase() + path, ...)` —
  **the original `input`/URL argument is discarded and never used** for any
  matched type. The dispatcher matches: `auth_login`, `auth_signup`,
  `auth_restore`, `auth_logout`, `workspace_driver_roster_read`,
  `account_driver_link_read`, `driver_truck_assignment_current_read`,
  `driver_truck_assignment_history_read`, `driver_truck_assignment_as_of_read`,
  and — critically — `driver_report` and `pti_report` (`core-runtime.js:
  567-574`, matched by payload `type` regardless of URL).
- `restore-hotfix.js` loads after `core-runtime.js` (per `core.js`'s own
  load order) and captures `global.fetch` at that point — which is already
  `core-runtime.js`'s `routedFetch`, not the true native fetch — as its own
  `previousFetch` (`restore-hotfix.js:12`). It then installs its own
  `routedFetch` on top (`restore-hotfix.js:345`), which handles
  `auth_restore` itself directly, and forwards everything else to
  `previousFetch` (i.e., to `core-runtime.js`'s dispatcher).

## Consequence: every call site this session mapped as reaching Apps Script is intercepted

I re-checked every caller documented in the accepted
`LEGACY_SYNC_CALL_PATH_MAP.md` against `core-runtime.js`'s dispatcher list:

| Mapped caller (from the accepted map) | Payload `type` sent | Matched by `core-runtime.js`'s dispatcher? |
|---|---|---|
| `authPost()` — login/signup/logout/restore | `auth_login` / `auth_signup` / `auth_logout` / `auth_restore` | Yes — all four, redirected to the real Orchestrator |
| Three inline handlers (`index.html:1817`, `1851`, `1877`) | `workspace_driver_roster_read` / `driver_truck_assignment_*_read` / `account_driver_link_read` | Yes — all matched |
| `pushToCloud()` (`sync.js:582`) | `driver_report` (`sync.js:317`) | Yes |
| `pullFromCloud()` | `auth_restore`-shaped restore call | Yes |
| `syncPTIEntry()` (`sync.js:832`) | `pti_report` (`sync.js:847`) | Yes |
| `syncExpensesNow()` (`restore-hotfix.js:277`) | `driver_report` | Yes — even though this function explicitly targets the hardcoded `crewbiq-expenses` Apps Script URL and calls `previousFetch(...)`, that `previousFetch` **is `core-runtime.js`'s `routedFetch`**, not the true native fetch, so this call is *also* redirected to the Orchestrator's `/v1/sync/pwa`, not to Google. |

I found no mapped caller whose payload `type` falls outside this dispatcher's
matched set. Independently re-confirmed via `full_restore_transport.test.mjs`
passing (it exercises exactly the `auth_restore` and `driver_report` shapes)
and via direct source reading of every `adapt*` function's destination
(`orchestratorJson()` → `nativeFetch(getOrchestratorBase() + path, ...)`).

## What this means for prior "accepted" work this session

This directly contradicts the central conclusion of three documents already
marked ACCEPTED this session:

1. **`CREWBIQ_MVP_PRODUCTION_GAP_INVENTORY.md`**: items classified `BLOCKED`
   (PWA-only-Orchestrator, zero Google traffic, executable legacy-path
   removal, Legacy Independence) were blocked on the premise that Apps
   Script is genuinely reached by these call sites. Given this discovery,
   that premise appears to be false for every call site examined — the
   Orchestrator interception layer already redirects them.
2. **`LEGACY_SYNC_CALL_PATH_MAP.md`**: correctly traced every URL literal,
   source, guard, and caller down to the `fetch()` call site, but never
   traced what `global.fetch` itself resolved to at call time. This is a
   methodology gap in the map itself, not a factual error in what it did
   check — the map's line-level tracing is accurate; it is incomplete
   because it stopped one layer short of the actual dispatch.
3. **`LEGACY_SYNC_DECOMMISSION_CONTRACT.md`**: every `REMOVE`/
   `REPLACE_WITH_ORCHESTRATOR` classification assumed these call sites
   currently reach Apps Script and need to be retargeted. If they already
   resolve to the Orchestrator, the actual remaining work may be
   substantially smaller than the contract describes: potentially limited
   to deleting the now-provably-dead `DEFAULT_SYNC_URL`/`crewbiq-expenses`
   literals and the `sw.js` Apps Script hostname clause, rather than
   retargeting live traffic.

## What I have not yet verified

- Whether `getOrchestratorBase()` in `core-runtime.js` could itself resolve
  to something other than the real production Orchestrator in some
  configuration state (it reads `localStorage[K+'orchestratorUrl']` with a
  `DEFAULT_ORCHESTRATOR_BASE` fallback — the default appears production-
  correct based on `full_restore_transport.test.mjs`'s and
  `orchestrator_transport.test.mjs`'s assertions, but I have not exhaustively
  checked every branch).
- Whether `doSync()`'s two-step push (`pushToCloud()` then, conditionally,
  `pushToOrchestrator()`) now writes to the Orchestrator **twice** via two
  different code paths (the transparent interception, and `sync.js`'s own
  explicit second push) — a possible duplicate-write concern distinct from
  the "reaches Google" question, not yet assessed for actual duplication
  risk (`core-runtime.js` has a `recentSyncRecordIds` dedup map I noticed
  but did not trace in depth).
- Whether this interception layer was present at the time the original gap
  inventory work began, or was introduced partway through this session's own
  history (`core.js`'s query-string version tag reads
  `20260715-disputes-sync-v1`, and `restore-hotfix.js`'s own header comment
  says "v0.2.0" — I have not diffed against an earlier commit to determine
  when this layer was introduced, only confirmed it is present at the exact
  `bcfd74a` commit this session has treated as ground truth throughout).
- Whether the `test:e2e:tooling` npm script (the one CI actually runs) or
  the staging acceptance suite already exercises and depends on this
  interception behavior as an implicit contract — if so, some of it may
  already be indirectly evidenced as working, which would itself be
  relevant to how "BLOCKED" the production-cutover criteria really are.

## Requested decision

This is not a routine documentation correction I should make unilaterally by
rewriting three already-reviewed, accepted documents on my own judgment.
Per the standing instruction that a genuine conflict in review should stop
at the decision point and be surfaced rather than silently resolved, I am
pausing the authorized contract-test implementation task and requesting
direction: should the gap inventory, evidence map, and decommission
contract be reopened and corrected based on this discovery, and if so,
should that correction be scoped to documentation only (as everything this
session has been), or does it warrant new dynamic/integration test evidence
(actually running the app end-to-end, which nothing in this session did
until just now) before any classification changes are made?

No implementation, test authorship, runtime, configuration, legacy-path,
deployment, migration, merge, data, ADR status, ADR-0008-0016, SIDR, or
telemetry change has been made.
