# CrewBIQ MVP Production Gap Inventory

Status: EVIDENCE INVENTORY ONLY — no implementation, migration, merge,
deployment, legacy-path change, or production mutation. Documentation only.
Corrected per Codex independent review (`CLAUDE_REVIEW.md`,
"Codex independent review - CrewBIQ MVP Production Gap Inventory", verdict
`NEEDS_FIX`).

Prepared by: Claude (implementer role, per role-swap effective 2026-09-01).
Corrected by: Claude, after independently re-verifying every Codex finding
against the exact production source.

Scope: evaluate current CrewBIQ production state against
`CREWBIQ_ARCHITECTURE_V1.md` (crewbiq-docs, `main`) section 14 (Definition of
Done for PostgreSQL cutover) and section 10's "Legacy independence"
subsection, using only the classification schema `PROVEN` / `PARTIAL` /
`BLOCKED` / `NOT_REQUIRED`.

Current production revision: orchestrator commit
`27e3463220a2022ea1adf074d7131ec69eb32fe5` (migrations 003–011 applied
exactly once); PWA `main` commit `bcfd74a22449b974755b8b48bc01a3b261107b93`
(cache `v95`).

## Corrections applied per the transport-interception discovery (2026-09-01)

Items 2, 6, 7, and the Legacy Independence criterion below were reclassified
from `BLOCKED` to `PARTIAL` after this session independently discovered,
and then dynamically proved via real test execution (not just source
reading), that `core-runtime.js` installs a `global.fetch` dispatcher —
loaded synchronously before `sync.js`/`restore-hotfix.js`/`pti.js` ever
run — that inspects the JSON body's `type` field (not the URL) and routes
matched legacy action-envelope types to `getOrchestratorBase()`'s currently
configured Orchestrator base via `nativeFetch`, discarding the supplied URL
entirely. Full mechanism trace in
`docs/collaboration/LEGACY_SYNC_TRANSPORT_INTERCEPTION_CORRECTION.md`.

**Corrected per Codex re-review (`1f32824e458d338b03488b8d0ff7719afcf204c3`,
verdict `NEEDS_FIX`) — three overclaims in the first reconciliation pass:**
1. `tests/orchestrator_transport.test.mjs` dynamically proves the
   dispatcher correctly routes every mapped **body-type envelope**
   (`auth_login`, `auth_signup`, `auth_restore`, `auth_logout`,
   `driver_report`, `pti_report`, and the workspace/roster/assignment
   reads) — it constructs those envelopes directly and calls `fetch()`, it
   does not load and invoke the actual caller functions (`authPost()`,
   `pullFromCloud()`, `syncPTIEntry()`, `syncExpensesNow()`, the three
   inline `index.html` handlers). Those callers are linked to their body
   types by **static source tracing** (confirmed in the accepted map), not
   independent dynamic execution. The one exception is `doSync()`:
   `tests/dosync_orchestrator_dedup.test.mjs` loads real `sync.js` and
   calls the actual `doSync()`/`pushToCloud()`/`pushToOrchestrator()`
   functions end-to-end. The claim "dynamically proven for every mapped
   call site" (used in this document's first reconciliation) was
   overstated; the accurate claim is "dynamic body-type coverage plus
   static caller/load-order linkage, and one fully end-to-end dynamic
   caller path (`doSync()`)."
2. The tests exercise `getOrchestratorBase()`'s **default** value
   (`DEFAULT_ORCHESTRATOR_BASE`, the production Orchestrator) because no
   test set a persisted override. `getOrchestratorBase()` reads a
   `localStorage`-persisted `orchestratorUrl` override with **no host
   validation** in `normalizeOrchestratorBase()` — it strips known path
   suffixes but does not check the resulting host against an allowlist.
   The accurate claim is: matched envelopes route to whatever
   `getOrchestratorBase()` currently resolves to; under the tested/default
   configuration that is the production Orchestrator, but a misconfigured
   or overridden value is not ruled out by this evidence.
3. "Dead," "safe," and "no behavior change" language was scoped too
   broadly. The evidence covers mapped, matched envelopes under the exact
   load composition the tests exercise (`core-runtime.js` loaded before
   `sync.js`/etc., as production does) — not a claim that the literals are
   globally unreachable in every possible composition, nor that literal
   removal carries zero behavior risk in general. The dedup evidence
   specifically proves **one** native write for **one** `doSync()` run, in
   one test-process runtime instance, within the dispatcher's current
   2-minute `record_id` window — not a universal guarantee across all
   timing/runtime conditions. Also: `pushToCloud()` and
   `pushToOrchestrator()` remain two **sequential function calls in the
   client's own code composition** — `doSync()` still calls both. What the
   test shows is that the *second call's real network write* is suppressed
   by the runtime's dedup check before a second `nativeFetch` occurs, not
   that the client-side call sequence has itself been simplified.

## Corrections applied from the first draft

1. **Classification schema.** The first draft introduced an unauthorized
   fifth label, `NOT_VERIFIED`. Corrected to use only the four permitted
   labels throughout.
2. **Executable legacy path, independently re-verified.** I fetched
   `index.html` at the exact production commit `bcfd74a...` myself and
   confirmed directly:
   - Line 1443: `const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbxsygN14QcavY70qXGherETIzM_VD8OLNBPL2eUU2GxOroK9D4mHIE8pwW6g5nfHvmDGg/exec';` — a live, hardcoded Google Apps Script endpoint.
   - Line 800 (UI copy, visible to users in Settings): *"Google Apps Script
     sync remains primary."*
   - `getAuthSyncUrl()` (line 1761) — the function that resolves which URL
     every sync call actually uses — has **no Orchestrator-aware logic at
     all**. It reads a manual login field, `localStorage`, or the driver's
     own `syncUrl`, and falls back to `DEFAULT_SYNC_URL` (Apps Script)
     whenever none of those are set. This is not a rare edge case: it is
     the literal default behavior for any device/account that has not
     explicitly configured something else.
   - `DEFAULT_SYNC_URL` is read at four additional call sites (lines 1997,
     2013, 6441, 6487) that construct or restore the driver identity's
     `syncUrl` field.
   This is direct, first-party proof that Google Apps Script sync is
   **executable and live** in the exact current production commit — not
   merely un-investigated. The correct classification is `BLOCKED`, not the
   first draft's `NOT_VERIFIED`.
3. **Staging-config test withdrawn.** The first draft's recommendation
   (disable the Apps Script URL *in staging* and re-run the acceptance
   suite) cannot prove anything about *production* traffic — staging and
   production are separate deployments with independent configuration, a
   distinction this entire project has enforced strictly throughout.
   Withdrawn; replaced with a read-only recommendation below.
4. **Offline-retry scope narrowed.** The first draft's `PROVEN` claim cited
   one staging scenario (`OFFLINE-01`). That is real evidence for that one
   scenario, not "offline operations retry safely" as a universal property
   across every entity/domain. Narrowed to `PARTIAL`, with the original
   evidence preserved and the scope limitation stated explicitly.

## Section 14 — Definition of Done for PostgreSQL cutover

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | All persistent business entities stored and restored from PostgreSQL | **PARTIAL** | `driver_loads`, `pti_log`, `trucks`, `fleet_driver_profiles`, `fuel_logs`, `service_logs`, `deduction_templates`, `weekly_deductions` are live PostgreSQL tables with confirmed write/restore paths. `Expenses`, `Disputes`, `Reports`, `Links`, `Experience/points`, `Notifications` remain unverified for PostgreSQL persistence (no evidence gathered this session). Canonical `driverId`/`truckId` attribution for historical rows is separately and explicitly deferred per the Product Owner's MVP-close decision — a different axis from raw persistence, not counted against this criterion. |
| 2 | PWA and bot communicate only with Orchestrator | **PARTIAL** | `tests/orchestrator_transport.test.mjs` dynamically proves `core-runtime.js`'s `global.fetch` dispatcher routes every mapped body-type envelope to `getOrchestratorBase()`, regardless of the supplied URL; `tests/dosync_orchestrator_dedup.test.mjs` additionally proves this end-to-end for the real `doSync()` caller path. Other individual callers (`authPost`, `pullFromCloud`, `syncPTIEntry`, `syncExpensesNow`, inline handlers) are linked to these body types by static source tracing, not independent dynamic execution. Not `PROVEN`: caller-map completeness is static-review-based, `getOrchestratorBase()`'s configurable override is not host-validated, and the bot's own communication path was not evaluated this session. |
| 3 | Clean-device restoration works | **PROVEN** | Independently confirmed via staging protected missions this session: `AUTH-01`/`RESTORE-01`, the canonical identity journey (run `33550873310`, 1/1 pass), and the full protected suite (run `33550974453`, 18/18 pass), each executed from a clean, unauthenticated starting context. |
| 4 | Offline operations retry safely without duplicates | **PARTIAL** | `OFFLINE-01` ("failed authenticated mutation retries with one durable operation identity") passed in every full protected suite run read directly this session. This is real, reproduced evidence for that one scenario — not evidence of universal idempotent-retry coverage across every entity/domain, which was not separately tested. |
| 5 | Authorization and tenant isolation are tested | **PROVEN** | `TENANT-01` (cross-tenant read/write substitution) confirmed passing in staging protected runs read this session. Production CORS hardening (`resolve_cors_origins`, fail-closed, no wildcard, HTTPS-required in production) independently verified via live preflight checks against the exact allowed and an unlisted origin. |
| 6 | Google sync endpoints receive no production traffic | **PARTIAL** | The dynamic evidence proves the tested code does not generate Google-bound requests for mapped, matched envelopes under the tested load composition and default `getOrchestratorBase()` configuration — the transport dispatcher intercepts before `nativeFetch` is ever called with the legacy URL. This is materially different from item 6's original `BLOCKED` framing (a live, reachable path confirmed to produce such traffic). It remains `PARTIAL`, not `PROVEN`: Orchestrator-side logs structurally cannot observe direct browser-to-Google traffic under any circumstance (unchanged limitation), a misconfigured/overridden Orchestrator base is not ruled out, and only mapped body types (not every possible caller) were dynamically exercised. |
| 7 | Google Apps Script/Sheets removed from executable production paths | **PARTIAL** | The literal URLs (`DEFAULT_SYNC_URL`, `.../crewbiq-expenses/exec`) and the `sw.js` Apps Script hostname clause are still present in source — not removed, so this criterion is not literally met. Dynamic evidence shows they are bypassed for mapped, matched envelopes under the exact tested load composition — not proof they are globally dead in every possible composition, nor that removal is behavior-risk-free in general. Upgraded from `BLOCKED` (contradicted, dangerous) to `PARTIAL` (not yet done; evidence supports treating removal as lower-risk cleanup than originally assumed, scoped to what was actually tested). |
| 8 | Production monitoring can identify failed writes, pending queues, and restore errors | **PARTIAL** | `/health` (unconditional liveness) and `/ready` (DB connectivity + required-migration presence) are live and confirmed green in production. No evidence was found or sought this session for dedicated failed-write, pending-queue-depth, or restore-error observability beyond what those two endpoints provide. |

## Section 10 — "Legacy independence" acceptance subsection

| Criterion | Status | Evidence |
|---|---|---|
| Remove/disable Apps Script URL; perform all tests successfully; confirm no network request to Google sync endpoints | **PARTIAL** | The Apps Script URL literals are not yet removed from source (criterion not literally met), but `tests/orchestrator_transport.test.mjs` now dynamically confirms zero requests reach any `script.google.com` URL for every mapped, matched body-type envelope even *without* removing the literals — the interception layer already achieves the network-isolation outcome this criterion is checking for, at the code level, for what was tested. Actual literal removal remains a documentation/code-cleanup task; its behavior risk is bounded by this evidence but not proven zero for every possible composition. |

## Overall assessment (reconciled 2026-09-01)

The picture from the first two corrections was itself incomplete: static
source reading (grepping URL literals, tracing individual `fetch()` call
sites) never traced what `global.fetch` actually resolved to at call time,
missing that `core-runtime.js` loads first and silently redirects matched
legacy calls to `getOrchestratorBase()`'s currently configured Orchestrator.
Dynamic test execution — running the actual code for the first time this
session — proved this for mapped body-type envelopes and, end-to-end, for
`doSync()`. The current, reconciled picture: `PROVEN` items (clean-device
restore, tenant isolation/CORS) stand unchanged. Items 1, 4, 8, and now 2,
6, 7, and Legacy Independence are `PARTIAL` — real, code-level evidence for
mapped/matched envelopes under the tested load composition and default
Orchestrator configuration, without a claim of exhaustive caller coverage,
configuration-independence, or live-production-traffic proof (which remains
structurally unobservable via Orchestrator-side logs). No item in this
inventory is `BLOCKED` as of this reconciliation.

## Recommended single safest bounded follow-up (reconciled 2026-09-01)

The original staging-config-test and read-only-map recommendations are
superseded — both were designed to investigate whether Apps Script is
reached, which dynamic evidence now directly covers for mapped body-type
envelopes, with individual callers linked by static tracing and `doSync()`
as the one end-to-end dynamically executed caller path. The remaining
safest bounded follow-up is **cleanup, not investigation**: remove the Apps Script URL literals (`DEFAULT_SYNC_URL`,
`.../crewbiq-expenses/exec`) and the `sw.js` Apps Script hostname bypass
clause now shown to be bypassed for mapped, matched envelopes under the
tested composition, and simplify `doSync()`'s two-step push (`pushToCloud()`
then a conditional `pushToOrchestrator()` copy — two sequential client-side
calls that, in the tested single-run/single-runtime-instance/current-dedup-
window composition, produced one real Orchestrator write) into a single
direct call. This is detailed
in `docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md`, itself
reconciled alongside this document.

No implementation, legacy-path removal, migration, merge, deployment, or
production mutation is proposed or authorized by this document.
