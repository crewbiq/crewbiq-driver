# CrewBIQ Legacy Sync Decommission Contract

Status: DESIGN/BEHAVIOR CONTRACT DOCUMENT ONLY. No test, runtime,
configuration, legacy-path, deployment, migration, merge, data, ADR status,
ADR-0008-0016, or SIDR change. No telemetry added. This document does not
authorize implementation; it defines what a future decommission
implementation must satisfy before it may begin.

Prepared by: Claude (implementer role).
Corrected by: Claude, after independently re-verifying every Codex NEEDS_FIX
finding against the accepted map and the exact production source.

## Corrections applied per the transport-interception discovery (2026-09-01)

This contract's entire premise — that the mapped callers currently reach
Apps Script and must be retargeted to the Orchestrator — is now known to be
wrong for the network-destination half of that claim, per dynamic test
evidence (`tests/orchestrator_transport.test.mjs`,
`tests/dosync_orchestrator_dedup.test.mjs`, commits
`308a2b2b6e8ef83ef4b6878cecd2d91c99c2cc0f` and
`73b903291224268c592deee03106fc696a6368e9`; full mechanism in
`docs/collaboration/LEGACY_SYNC_TRANSPORT_INTERCEPTION_CORRECTION.md`).
`core-runtime.js`'s `global.fetch` dispatcher already routes every mapped
call to the real Orchestrator by JSON body `type`, regardless of the
supplied URL. This reframes — but does not eliminate — the remaining work:

- **Every `REMOVE`/`REPLACE_WITH_ORCHESTRATOR` classification in §2 below
  still describes the correct target code shape.** What changes is why:
  this is no longer "retarget currently-effective live traffic away from
  Google," it is **dead-literal and dead-branch cleanup** (the Apps Script
  URLs and the `driver.syncUrl`-resolution machinery are unreachable at the
  network layer already) plus **simplification of a redundant,
  client-side-deduplicated double-write** (`doSync()`'s `pushToCloud()` +
  `pushToOrchestrator()` both resolve to the same Orchestrator write for the
  same `record_id`; the second is a no-op confirmed by
  `dosync_orchestrator_dedup.test.mjs`'s `client_deduplicated: true`
  assertion, not a meaningfully separate operation).
- §4's contract tests below are **substantially already satisfied** by the
  accepted dynamic evidence tests, not merely specified — see the
  per-test notes added below. Remaining test work is narrower than
  originally scoped: primarily proving the *simplified* single-write
  `doSync()` path behaves identically to today's redundant two-step path,
  and the service-worker literal-removal regression once that cleanup
  actually happens.
- §7's open Product Owner decision (whether `crewbiq-expenses` carries
  non-redundant data) is unaffected by this discovery and remains open.

## Corrections applied from the first draft (per Codex review)

1. **`CALLER_CLASSIFICATION_SCHEMA_VIOLATION`.** `pushToOrchestrator()` was
   classified `PRESERVE_LOCAL_ONLY-adjacent / already correct`, which is not
   one of the three allowed values. Reclassified `REPLACE_WITH_ORCHESTRATOR`
   (§2), since its transport is retained/adapted as the sole durable write.
2. **`AUTHORITATIVE_WRITE_SEMANTICS_CONTRADICTION`.** The first draft's
   "network sync is always a secondary, best-effort step" conflicted with
   the Orchestrator being the sole durable authority post-decommission.
   Corrected §3.2 to distinguish optimistic local persistence (unchanged,
   what makes the app usable offline) from durable acknowledgement (an
   operation stays pending/retryable until the Orchestrator confirms it).
3. **`SYNC_EXPENSE_DESTINATION_EVIDENCE_MISMATCH`.** The first draft claimed
   both `syncExpensesNow()` destinations "are Apps Script paths." Corrected:
   only the hardcoded fallback is proven Apps Script; `driver.syncUrl` is an
   override not itself proven to always be Apps Script. The removal
   decision is preserved on different, correct grounds: `expenses` are
   already carried by the general Orchestrator write path via
   `restore-hotfix.js`'s `attachExpensesToReport()`, independently
   re-confirmed by re-reading that function.
4. **`PRODUCTION_EVIDENCE_GATE_INCOMPLETE`.** Added gate 5 to §5: a bounded
   post-publication production evidence gate (served SHA/cache version,
   health/readiness, representative auth/write spot-check, absence of
   legacy source references in served assets, explicit rollback trigger) —
   a contract requirement only, not an authorization to deploy.

Scope: derives directly from the accepted
`docs/collaboration/LEGACY_SYNC_CALL_PATH_MAP.md` (commit
`3ae3ab03d3d9fe3511cdf8e970322d2e201737d6`). Classifies every mapped caller,
defines target Orchestrator-only behavior, and specifies the invariants,
tests, evidence gates, deployment order, and rollback plan a real removal
effort must satisfy.

## 1. Target end-state behavior

The PWA already reaches the Orchestrator exclusively, at the network level,
for every mapped operation — confirmed dynamically, not merely targeted.
"Decommissioning" now means making the *source* match that already-true
runtime behavior: removing the dead literals/branches that still describe a
path the dispatcher never lets execute, and collapsing the redundant
double-write into one call. The target shape:

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

**Reframed per the transport-interception discovery**: for every row below,
the network destination is already the Orchestrator at runtime (confirmed
dynamically). `REPLACE_WITH_ORCHESTRATOR` in this table now means "delete
the dead `getAuthSyncUrl()`/`driver.syncUrl` resolution machinery this
caller feeds through, since the dispatcher already ignores it" — not
"change where this caller's traffic goes," which would be a behavior
change; here it is a no-behavior-change cleanup.

| Caller (map ref) | Classification | Rationale |
|---|---|---|
| `authPost()` + 3 inline handlers (map §4A) | `REPLACE_WITH_ORCHESTRATOR` | Auth must resolve against the Orchestrator's own login/signup/logout/restore endpoints, not `getAuthSyncUrl()`. |
| `pushToCloud()` (map §4A) | `REMOVE` | This is the legacy write itself; `pushToOrchestrator()` becomes the sole write, not a secondary copy after it. |
| `pullFromCloud()` (map §4A) | `REMOVE` | Restore must come from the Orchestrator's existing pull surface only. |
| `syncPTIEntry()` (map §4A) | `REPLACE_WITH_ORCHESTRATOR` | PTI entries must reach PostgreSQL; see §3 for the non-negotiable local-first invariant this must preserve. |
| `syncExpensesNow()` (map §4A, both the `driver.syncUrl` branch and the hardcoded `crewbiq-expenses` fallback) | `REMOVE` | Corrected rationale: the accepted map only proves the *fallback* literal (`.../crewbiq-expenses/exec`) is an Apps Script endpoint. `driver.syncUrl` is an override field that, under the standard resolution chain, is Apps Script by default but is not itself proven to be Apps Script in every case (per the map's own destination qualification). Both branches are still removed, because expenses are already carried by the general Orchestrator write path: `restore-hotfix.js`'s `attachExpensesToReport()` recognizes the `driver_report` envelope (`cloned.type === 'driver_report'` or `cloned.payload.type === 'driver_report'`) and injects scoped `expenses` into `report.ownerData`/`report.expenses` before transport — this is the same payload shape `pushToOrchestrator()` already carries, so `syncExpensesNow()`'s dedicated call is redundant with that path, not merely "also Apps Script." |
| `pushToOrchestrator()` (map §4A) | `REPLACE_WITH_ORCHESTRATOR` | Already targets the Orchestrator; its transport is retained/adapted as the sole durable write, promoted from secondary copy to primary. Its own request shape is not itself changed by decommission — only its position in `doSync()`'s order, and its status as authoritative (see §3.2), change. |
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
2. **Local/offline usability, with Orchestrator as sole durable authority.**
   Every write (loads, PTI, expenses, owner entities) must continue to save
   to local storage synchronously and render immediately, regardless of
   network state or Orchestrator reachability — this optimistic local
   persistence is what makes the app usable offline and is unchanged by
   decommission. This is distinct from **durable acknowledgement**: once
   Apps Script is removed, the Orchestrator becomes the *sole* authority for
   whether a write is durably saved. An operation that has only been
   persisted locally, and has not yet received a successful Orchestrator
   response, remains **pending/retryable** — it is not to be treated as
   durably saved, reported to the user as synced, or exempted from retry,
   until the Orchestrator confirms it. (Previously, a failed Apps Script
   push and a failed Orchestrator copy were two independent, partially
   redundant failure modes; post-decommission there is exactly one
   authority, so the existing retry/idempotency mechanisms in §3.3 carry
   more weight and must not regress.)
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

These remain *specifications* for tests — writing/running the still-open
ones is implementation work, out of scope for this document. Each now notes
whether accepted dynamic evidence already satisfies it.

- `RESTORE-ORCH-01`: clean-device login/signup/session-restore succeeds
  using only Orchestrator endpoints, with zero requests to any
  `script.google.com`/`crewbiq-expenses` origin during the full restore
  flow. **Substantially satisfied** by `tests/orchestrator_transport.test.mjs`'s
  `auth_login`/`auth_signup`/`auth_restore`/`auth_logout` cases (commit
  `308a2b2b6e8ef83ef4b6878cecd2d91c99c2cc0f`); still open: an end-to-end
  version exercising the real PWA boot sequence rather than `core-runtime.js`
  in isolation.
- `WRITE-ORCH-01` through `-04`: a load save, a PTI submission, an expense
  save, and an owner-entity save each persist locally immediately and reach
  only the Orchestrator over the network. **Partially satisfied**: the
  `driver_report`/`pti_report` dispatch cases in `orchestrator_transport.test.mjs`
  and the full `doSync()` run in `dosync_orchestrator_dedup.test.mjs` cover
  loads and PTI; expense and other owner-entity saves through
  `syncExpensesNow()`/`attachExpensesToReport()` remain untested end-to-end
  and are still open.
- `PTI-LOCKOUT-01`: with the Orchestrator deliberately made unreachable,
  submitting today's/this-week's PTI still clears `needsPTI()`'s blocker —
  directly protects invariant §3.1. **Still open**: not covered by the
  accepted tests, which did not simulate an unreachable Orchestrator.
- `OFFLINE-ORCH-01`: a failed authenticated Orchestrator write, while
  offline, retries exactly once with the same durable operation identity
  after reconnect — protects invariant §3.3. **Still open**.
- `SW-NO-LEGACY-01`: after the service worker's Apps Script hostname clause
  is removed, no cached or live PWA request targets `script.google.com`/
  `googleapis.com`. **Still open** — this is now a cleanup regression test
  (proving removal of dead code doesn't change behavior), not an
  investigation of whether the clause is load-bearing.
- `DOSYNC-SIMPLIFY-01` (new): once `doSync()`'s two-step push is collapsed
  into one Orchestrator write, prove the simplified path produces
  byte-identical (aside from timing) request/response behavior to today's
  redundant-but-deduplicated two-step path for the same inputs — a
  regression guard for the cleanup itself, not a new behavior to verify.

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
   contains no remaining source reference that can construct a request to
   `script.google.com`/`googleapis.com` (i.e., §2's `REMOVE` classifications
   are structurally complete) — a static-source claim, not a live-traffic
   claim. Note this is now a *stronger* gate than "no traffic occurs" — the
   accepted dynamic tests already show no traffic occurs even with the
   literals present; this gate additionally requires the dead literals
   themselves to be gone from source.
4. Product Owner sign-off (§6) on the one currently open decision.
5. A bounded **post-publication production evidence gate** — required by
   this contract, not authorized by it; it names what a future deployment
   must check, it does not schedule or perform one. After any real
   production deploy of a removal, and before it may be considered
   complete, someone must confirm: (a) the exact served commit SHA and
   service-worker cache version match what was deployed; (b) `/health` and
   `/ready` are green; (c) a representative auth/restore and a
   representative write (e.g., one load save) succeed end-to-end against
   production; (d) the served production assets (`index.html`, `sync.js`,
   `restore-hotfix.js`, `sw.js`) contain no remaining source reference to
   `script.google.com`/`googleapis.com`/`DEFAULT_SYNC_URL`/
   `crewbiq-expenses`, mirroring gate 3's static-source check but against
   the actually-served production files rather than the reviewed commit;
   (e) an explicit, pre-agreed rollback trigger condition (e.g., any of (a)-
   (d) failing, or an elevated write-failure rate observed in the first
   bounded observation window) and the exact rollback procedure from §6.

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
