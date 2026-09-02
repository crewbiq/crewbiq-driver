# CrewBIQ Legacy Sync Decommission Contract

Status: DESIGN/BEHAVIOR CONTRACT DOCUMENT ONLY. No test, runtime,
configuration, legacy-path, deployment, migration, merge, data, ADR status,
ADR-0008-0016, or SIDR change. No telemetry added. This document does not
authorize implementation; it defines what a future decommission
implementation must satisfy before it may begin.

Prepared by: Claude (implementer role).

Scope: derives directly from the accepted
`docs/collaboration/LEGACY_SYNC_CALL_PATH_MAP.md` (commit
`3ae3ab03d3d9fe3511cdf8e970322d2e201737d6`). Classifies every mapped caller,
defines target Orchestrator-only behavior, and specifies the invariants,
tests, evidence gates, deployment order, and rollback plan a real removal
effort must satisfy.

## 1. Target end-state behavior

Once decommissioned, the PWA must reach Orchestrator exclusively for every
operation currently reaching Apps Script:

- **Auth** (`login`, `signup`, `logout`, `auth_restore`): resolved and
  transported via the Orchestrator's own auth endpoints, never
  `getAuthSyncUrl()`/`DEFAULT_SYNC_URL`.
- **Write** (loads, PTI log, disputes, owner-scoped entities — trucks,
  driver profiles, fuel logs, service logs, deduction templates, weekly
  deductions, expenses): written to PostgreSQL via the Orchestrator's
  existing `pushToOrchestrator()`/`/v1/sync` surface as the sole durable
  write path — not as a secondary copy contingent on a legacy push
  succeeding first, as `doSync()` currently orders it.
- **Read/restore**: a clean-device or re-authenticated session restores all
  of the above from the Orchestrator only, never from `driver.syncUrl`/Apps
  Script.
- No code path may construct a request to `script.google.com` or read the
  `DEFAULT_SYNC_URL`/`crewbiq-expenses` literals once decommissioned; this
  contract does not itself remove them.

## 2. Caller classification

Every caller identified in the accepted map (§4A direct sinks, §4B indirect
callers) is classified below. `REMOVE`: delete the call/branch entirely.
`REPLACE_WITH_ORCHESTRATOR`: keep the trigger, retarget its sink to the
Orchestrator's existing (already-implemented) push/pull surface.
`PRESERVE_LOCAL_ONLY`: keep the local-storage/UI behavior unchanged; it does
not need a network destination at all.

| Caller (map ref) | Classification | Rationale |
|---|---|---|
| `authPost()` + 3 inline handlers (map §4A) | `REPLACE_WITH_ORCHESTRATOR` | Auth must resolve against the Orchestrator's own login/signup/logout/restore endpoints, not `getAuthSyncUrl()`. |
| `pushToCloud()` (map §4A) | `REMOVE` | This is the legacy write itself; `pushToOrchestrator()` becomes the sole write, not a secondary copy after it. |
| `pullFromCloud()` (map §4A) | `REMOVE` | Restore must come from the Orchestrator's existing pull surface only. |
| `syncPTIEntry()` (map §4A) | `REPLACE_WITH_ORCHESTRATOR` | PTI entries must reach PostgreSQL; see §3 for the non-negotiable local-first invariant this must preserve. |
| `syncExpensesNow()` (map §4A, both the `driver.syncUrl` branch and the hardcoded `crewbiq-expenses` fallback) | `REMOVE` | Both destinations are Apps Script paths (default or fallback); expenses must route through the same Orchestrator write surface as other owner-scoped entities. |
| `pushToOrchestrator()` (map §4A) | `PRESERVE_LOCAL_ONLY`-adjacent / **already correct** | Already targets the Orchestrator; becomes primary instead of secondary. Not itself changed by decommission — only its position in `doSync()`'s order changes. |
| `doSync()` composite ordering (map §4A) | `REPLACE_WITH_ORCHESTRATOR` | Reorder so the Orchestrator write is the (only) durable push; no legacy push precedes or gates it. |
| `_doSync` alias via `loads.js:495`/`1357` (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Unchanged trigger (fires on load save/edit); its target sink changes with `doSync()`'s retarget. Highest-frequency caller identified — must be covered by contract tests (§5). |
| `scheduleAutoSync()` hourly/midnight (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Unchanged cadence; retargets with `doSync()`. |
| UI buttons — "Sync Now" (`index.html:502`), "Full Sync" (`813`), "Sync" (`819`, `6185`) (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | User-initiated triggers unchanged; sink changes with `doSync()`/`forceFullSync()`. |
| "Pull from Cloud" button / `restoreFromCloud()` (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Retargets with `pullFromCloud()`'s removal. |
| Sign-out `forceFullSync()` (`index.html:6525`) (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Final-sync-before-clear behavior preserved; sink changes. |
| `queueFleetConfigSync()` (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Fleet-config-change trigger unchanged; sink changes. |
| `offline-sync-queue.js` reconnect listener (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Reconnect-triggered retry unchanged; sink changes. This is also the primary mechanism §3's offline/idempotency invariant depends on — must not regress. |
| `dispute-tombstone-hotfix.js` `syncWithBusyRetry()` (map §4B) | `REPLACE_WITH_ORCHESTRATOR` | Retry-on-busy behavior unchanged; sink changes. |
| `owner-snapshot-hotfix.js` `markPending()`/`installHooks()` retry (map §4B, corrected) | `REPLACE_WITH_ORCHESTRATOR` | Both the save-triggered (250ms) and install-time persisted-pending (1800ms) retries are preserved; sink changes. |
| Service-worker Apps Script/Orchestrator hostname bypass (`sw.js:94-102`) | `REMOVE` (Apps Script hostname clause only) | The `script.google.com`/`googleapis.com` clause becomes dead once no code constructs such a request; the `railway.app`/POST clauses (Orchestrator-bound) are unaffected and must remain. |

No caller in the accepted map is classified `PRESERVE_LOCAL_ONLY` outright —
every one of them currently reaches a network sink. The PTI **gating check**
itself (`needsPTI()`, distinct from `syncPTIEntry()`) is the one closely
related mechanism that already is, and must remain, local-only — see §3.

## 3. Invariants that must not regress

1. **Accountless PTI graceful degradation / mandatory-PTI non-lockout.**
   `needsPTI()` (`pti.js:125-138`) decides whether the driver is blocked
   from the app until today's/this-week's PTI is logged, using only the
   locally-held `driver` record and local `ptiLog` — no network call. PTI
   submission (`pti.js`) appends to the local `ptiLog` *before*
   `syncPTIEntry()` is fired fire-and-forget (`pti.js:347-348`). This
   ordering — local write first, network sync second and non-blocking — is
   the mechanism that already prevents a sync failure from locking a driver
   out of the app, and it must be preserved exactly through the
   Orchestrator retarget: `syncPTIEntry()`'s *destination* changes, but its
   fire-and-forget, non-blocking relationship to `needsPTI()`/local
   persistence must not.
2. **Local/offline usability.** Every write (loads, PTI, expenses, owner
   entities) must continue to save to local storage synchronously and
   render immediately, regardless of network state or Orchestrator
   reachability. Network sync is always a secondary, best-effort step.
3. **Durable idempotent retry.** The existing `offline-sync-queue.js`
   reconnect-triggered retry and `dispute-tombstone-hotfix.js`'s
   busy-retry loop are the two mechanisms this project has already
   established (per `CREWBIQ_MVP_PRODUCTION_GAP_INVENTORY.md`'s `OFFLINE-01`
   evidence) for safe retry without duplication. Retargeting their sink to
   the Orchestrator must not weaken the idempotency guarantee already
   proven for that one scenario, and should not be assumed to generalize
   to entity types not covered by that evidence (per the gap inventory's
   own `PARTIAL` classification) without new, explicit test evidence.
4. **No guessed identity or authority.** Per the canonical identity model
   (`ADR-0006`/`ADR-0007`, and this project's own binding
   `IDENTITY_ATTRIBUTION_CONTRACT.md` PROVEN/AMBIGUOUS/UNRESOLVABLE rule),
   the Orchestrator-only write/read/restore path must resolve driver, truck,
   and workspace identity only through server-derived, effective-dated
   relationships (`WorkspaceMembership`, `AccountDriverLink`,
   `DriverTruckAssignment`, `CarrierAssignment`) — never by matching on
   unit numbers, names, current assignment, or any other client-supplied or
   inferred value. This is unchanged by decommission; it is restated here
   because a naive Orchestrator retarget could be tempted to substitute a
   convenient client-supplied identifier for whatever `driver.syncUrl`'s
   resolution chain used to imply.
5. **Rollback safety.** Nothing in an eventual removal PR may be
   irreversible: the Apps Script endpoints themselves are not deleted
   server-side by this contract or by any implementation it authorizes;
   only the PWA's client-side code paths that call them are in scope.

## 4. Narrow contract tests a future implementation must add

These are *specifications* for tests, not tests themselves — writing and
running them is implementation work, out of scope for this document.

- `RESTORE-ORCH-01`: clean-device login/signup/session-restore succeeds
  using only Orchestrator endpoints, with the Apps Script default URL
  reachable-but-never-called (assert zero requests to any
  `script.google.com`/`crewbiq-expenses` origin during the full restore
  flow).
- `WRITE-ORCH-01` through `-04`: a load save, a PTI submission, an expense
  save, and an owner-entity save (truck/driver profile/fuel/service log/
  deduction) each persist locally immediately and reach only the
  Orchestrator over the network, with no Apps Script request observed.
- `PTI-LOCKOUT-01`: with the Orchestrator deliberately made unreachable,
  submitting today's/this-week's PTI still clears `needsPTI()`'s blocker
  (local-first write is unaffected by sync failure) — directly protects
  invariant §3.1.
- `OFFLINE-ORCH-01`: a failed authenticated Orchestrator write, while
  offline, retries exactly once with the same durable operation identity
  after reconnect (extends the existing `OFFLINE-01` evidence to the
  Orchestrator-only path) — protects invariant §3.3.
- `SW-NO-LEGACY-01`: after the service worker's Apps Script hostname clause
  is removed, no cached or live PWA request targets `script.google.com`/
  `googleapis.com` across the full accepted staging acceptance suite.

## 5. Staging/production evidence gates

Before any removal PR may be considered for merge:

1. All tests in §4 pass in staging against the exact commit under review.
2. A staging run of the full existing accepted acceptance suite (the same
   one already used for prior `AUTH-01`/`TENANT-01`/`OFFLINE-01`/etc.
   evidence) passes with zero regressions.
3. Since — per the accepted map's §5 — Orchestrator-side logs structurally
   cannot observe Apps Script traffic, and this project has no other
   accessible telemetry for it, a removal PR must not claim "zero
   production Google traffic" as a pre-condition it can prove. Instead, the
   gate is: the PWA's own shipped code, at the exact commit under review,
   contains no remaining call site that can construct a request to
   `script.google.com`/`googleapis.com` (i.e., §2's `REMOVE` classifications
   are structurally complete) — a static-source claim, not a live-traffic
   claim.
4. Product Owner sign-off (§6) on the one currently open decision.

## 6. Deployment/cache order and rollback

- Follow this project's own established pattern (Slice 2A.0/2B precedent):
  bump the service-worker `CACHE_NAME` version in the same commit that
  changes `index.html`/`sync.js`/`restore-hotfix.js`, so cache-first clients
  cannot serve stale legacy-calling code alongside a rotated cache.
  Sequence: (1) ship the Orchestrator-retargeted `index.html`/`sync.js`/
  `restore-hotfix.js` together with the `sw.js` hostname-clause removal and
  a rotated cache version, atomically, in one deploy — a split deploy risks
  a client running old cached JS against a service worker that no longer
  network-bypasses Apps Script requests, or vice versa.
- Rollback: revert the same commit set and roll the cache version back down
  in the same revert — since no server-side Apps Script endpoint or data is
  touched by this contract, a client-side revert alone is sufficient to
  restore the prior (working, if legacy-dependent) behavior with no data
  loss, because every write in the reverted code path is still local-first
  per invariant §3.2.

## 7. Open Product Owner decision

One decision is not resolvable from existing accepted documents and must be
explicitly made before implementation begins: **whether the `crewbiq-expenses`
Apps Script endpoint (`restore-hotfix.js:283`) currently receives any
distinct, non-duplicated data that the general Orchestrator expense-sync
path (via `pushToOrchestrator()`'s owner-data payload, which the accepted
map confirms already includes `expenses` when `shouldSendOwnerData()`
applies) does not already cover.** If it is fully redundant, its removal is
purely `REMOVE` per §2. If it captures something the general path does not
(e.g., a different schema or an intentionally separate Google Sheet
consumed by another internal process), that must be identified and either
replicated in the Orchestrator path or explicitly accepted as a scope gap
before removal — this contract does not resolve that question and no
implementation should assume an answer either way.

No implementation, test authorship, runtime change, configuration change, or
legacy-path removal is proposed or authorized by this document.
