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
every legacy action-envelope type this session mapped (`auth_login`,
`auth_signup`, `auth_restore`, `auth_logout`, `driver_report`, `pti_report`,
and the workspace/roster/assignment reads) to the real Orchestrator via
`nativeFetch`, discarding the supplied URL entirely. This is proven by
`tests/orchestrator_transport.test.mjs` and
`tests/dosync_orchestrator_dedup.test.mjs` (commits
`308a2b2b6e8ef83ef4b6878cecd2d91c99c2cc0f` and
`73b903291224268c592deee03106fc696a6368e9`), both passing against the exact
production source. Full mechanism trace in
`docs/collaboration/LEGACY_SYNC_TRANSPORT_INTERCEPTION_CORRECTION.md`.

This is a **partial** reversal, not a full one, for two reasons this
correction preserves precisely:
1. The dynamic evidence proves every *mapped* call site is routed
   correctly, not that no other, unmapped code path in the entire PWA could
   ever reach Google — the map's own completeness is itself static-review-
   based, not exhaustively fuzzed.
2. Even for mapped call sites, this proves what the *code* does under
   test, not live production traffic. Orchestrator-side logs structurally
   cannot observe direct browser-to-`script.google.com` requests (this
   limitation is unchanged from the original map), and `driver.syncUrl`
   remains a free-form, persisted, overridable field — nothing in the code
   prevents a misconfigured or manually-overridden `getOrchestratorBase()`
   from resolving elsewhere. `PROVEN` is not yet warranted; `PARTIAL` — real
   evidence the current code does not route matched traffic to Apps
   Script, without a claim of exhaustive completeness or live-traffic
   proof — is.

The literal Apps Script URLs (`DEFAULT_SYNC_URL`,
`.../crewbiq-expenses/exec`) and the `sw.js` Apps Script hostname clause
remain present and unremoved in the exact source reviewed. They are now
understood to be **dead source-level compatibility literals** — reachable
as strings, but never actually dispatched to, for every call site this
session traced — rather than a live executable path. This distinction is
why item 7 and the Legacy Independence criterion are `PARTIAL`, not
`PROVEN`: the literal removal itself has not happened, only evidence that
it would currently be safe/low-risk cleanup rather than a behavior change.

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
| 2 | PWA and bot communicate only with Orchestrator | **PARTIAL** | Dynamically proven for every mapped PWA call site (`tests/orchestrator_transport.test.mjs`, `tests/dosync_orchestrator_dedup.test.mjs`): `core-runtime.js`'s `global.fetch` dispatcher routes every legacy action-envelope type to the Orchestrator, regardless of the supplied URL — `DEFAULT_SYNC_URL`/`getAuthSyncUrl()`'s Apps-Script-only fallback is dead code for these paths, not a live executable one. Not `PROVEN`: completeness of the caller map itself is static-review-based, and the bot's own communication path was not evaluated this session. |
| 3 | Clean-device restoration works | **PROVEN** | Independently confirmed via staging protected missions this session: `AUTH-01`/`RESTORE-01`, the canonical identity journey (run `33550873310`, 1/1 pass), and the full protected suite (run `33550974453`, 18/18 pass), each executed from a clean, unauthenticated starting context. |
| 4 | Offline operations retry safely without duplicates | **PARTIAL** | `OFFLINE-01` ("failed authenticated mutation retries with one durable operation identity") passed in every full protected suite run read directly this session. This is real, reproduced evidence for that one scenario — not evidence of universal idempotent-retry coverage across every entity/domain, which was not separately tested. |
| 5 | Authorization and tenant isolation are tested | **PROVEN** | `TENANT-01` (cross-tenant read/write substitution) confirmed passing in staging protected runs read this session. Production CORS hardening (`resolve_cors_origins`, fail-closed, no wildcard, HTTPS-required in production) independently verified via live preflight checks against the exact allowed and an unlisted origin. |
| 6 | Google sync endpoints receive no production traffic | **PARTIAL** | The dynamic evidence proves current code does not *generate* Google-bound requests for any mapped call site — the transport dispatcher intercepts before `nativeFetch` is ever called with the legacy URL. This is materially different from item 6's original `BLOCKED` framing (a live, reachable path confirmed to produce such traffic). It remains `PARTIAL`, not `PROVEN`: Orchestrator-side logs structurally cannot observe direct browser-to-Google traffic under any circumstance (unchanged limitation), so live zero-traffic cannot be independently confirmed one way or the other — only that the code, as currently written and tested, does not send it. |
| 7 | Google Apps Script/Sheets removed from executable production paths | **PARTIAL** | The literal URLs (`DEFAULT_SYNC_URL`, `.../crewbiq-expenses/exec`) and the `sw.js` Apps Script hostname clause are still present in source — not removed, so this criterion is not literally met. However, dynamic evidence now shows they are dead source-level compatibility literals for every mapped call site, not a live executable path as the first correction concluded. Upgraded from `BLOCKED` (contradicted, dangerous) to `PARTIAL` (not yet done, but low-risk cleanup rather than a behavior change). |
| 8 | Production monitoring can identify failed writes, pending queues, and restore errors | **PARTIAL** | `/health` (unconditional liveness) and `/ready` (DB connectivity + required-migration presence) are live and confirmed green in production. No evidence was found or sought this session for dedicated failed-write, pending-queue-depth, or restore-error observability beyond what those two endpoints provide. |

## Section 10 — "Legacy independence" acceptance subsection

| Criterion | Status | Evidence |
|---|---|---|
| Remove/disable Apps Script URL; perform all tests successfully; confirm no network request to Google sync endpoints | **PARTIAL** | The Apps Script URL literals are not yet removed from source (criterion not literally met), but `tests/orchestrator_transport.test.mjs` now dynamically confirms zero requests reach any `script.google.com` URL for every mapped action type even *without* removing the literals — the interception layer already achieves the network-isolation outcome this criterion is checking for, at the code level. Actual literal removal remains a documentation/code-cleanup task, not a behavior-risk one. |

## Overall assessment (reconciled 2026-09-01)

The picture from the first two corrections was itself incomplete: static
source reading (grepping URL literals, tracing individual `fetch()` call
sites) never traced what `global.fetch` actually resolved to at call time,
missing that `core-runtime.js` loads first and silently redirects every
mapped legacy call to the Orchestrator. Dynamic test execution — running
the actual code for the first time this session — proved this directly.
The current, reconciled picture: `PROVEN` items (clean-device restore,
tenant isolation/CORS) stand unchanged. Items 1, 4, 8, and now 2, 6, 7, and
Legacy Independence are `PARTIAL` — real, code-level evidence that the
current source does not route mapped traffic to Apps Script, without a
claim of exhaustive completeness or live-production-traffic proof (which
remains structurally unobservable via Orchestrator-side logs). No item in
this inventory is `BLOCKED` as of this reconciliation.

## Recommended single safest bounded follow-up (reconciled 2026-09-01)

The original staging-config-test and read-only-map recommendations are
superseded — both were designed to investigate whether Apps Script is
reached, which dynamic evidence now answers directly for every mapped call
site. The remaining safest bounded follow-up is **cleanup, not
investigation**: remove the now-confirmed-dead Apps Script URL literals
(`DEFAULT_SYNC_URL`, `.../crewbiq-expenses/exec`) and the `sw.js` Apps
Script hostname bypass clause, and simplify `doSync()`'s redundant two-step
push (`pushToCloud()` then a conditional `pushToOrchestrator()` copy, both
of which resolve to the same Orchestrator write and are only kept distinct
by client-side deduplication) into a single direct call. This is detailed
in `docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md`, itself
reconciled alongside this document.

No implementation, legacy-path removal, migration, merge, deployment, or
production mutation is proposed or authorized by this document.
