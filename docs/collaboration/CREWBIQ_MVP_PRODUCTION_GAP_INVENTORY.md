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
| 2 | PWA and bot communicate only with Orchestrator | **BLOCKED** | Directly disproven by reading production `index.html` at commit `bcfd74a...`: `DEFAULT_SYNC_URL` is a live `script.google.com` endpoint, `getAuthSyncUrl()` has no Orchestrator-aware branch and defaults to it, and the Settings UI itself states "Google Apps Script sync remains primary." The bot's own communication path was not evaluated this session. |
| 3 | Clean-device restoration works | **PROVEN** | Independently confirmed via staging protected missions this session: `AUTH-01`/`RESTORE-01`, the canonical identity journey (run `33550873310`, 1/1 pass), and the full protected suite (run `33550974453`, 18/18 pass), each executed from a clean, unauthenticated starting context. |
| 4 | Offline operations retry safely without duplicates | **PARTIAL** | `OFFLINE-01` ("failed authenticated mutation retries with one durable operation identity") passed in every full protected suite run read directly this session. This is real, reproduced evidence for that one scenario — not evidence of universal idempotent-retry coverage across every entity/domain, which was not separately tested. |
| 5 | Authorization and tenant isolation are tested | **PROVEN** | `TENANT-01` (cross-tenant read/write substitution) confirmed passing in staging protected runs read this session. Production CORS hardening (`resolve_cors_origins`, fail-closed, no wildcard, HTTPS-required in production) independently verified via live preflight checks against the exact allowed and an unlisted origin. |
| 6 | Google sync endpoints receive no production traffic | **BLOCKED** | Same direct evidence as item 2: the production PWA's default sync path is a live Apps Script URL, reachable by default whenever no other `syncUrl` is configured. This is evidence of an executable path capable of producing such traffic, not direct proof of current live request volume — but it is sufficient to block declaring zero production traffic, since the code that would generate it is confirmed live and default-enabled. |
| 7 | Google Apps Script/Sheets removed from executable production paths | **BLOCKED** | Directly disproven — see item 2/6 evidence. The code is present, referenced by UI copy as primary, and reachable via the default fallback chain in the exact current production commit. |
| 8 | Production monitoring can identify failed writes, pending queues, and restore errors | **PARTIAL** | `/health` (unconditional liveness) and `/ready` (DB connectivity + required-migration presence) are live and confirmed green in production. No evidence was found or sought this session for dedicated failed-write, pending-queue-depth, or restore-error observability beyond what those two endpoints provide. |

## Section 10 — "Legacy independence" acceptance subsection

| Criterion | Status | Evidence |
|---|---|---|
| Remove/disable Apps Script URL; perform all tests successfully; confirm no network request to Google sync endpoints | **BLOCKED** | Same direct evidence as Definition-of-Done items 2/6/7: the Apps Script URL is not removed or disabled in production — it is the confirmed default. This criterion cannot be met without a real code/product change, which is out of scope for this documentation-only inventory. |

## Overall assessment

The corrected picture is materially different from the first draft: this is
not primarily a set of unanswered questions requiring more evidence-gathering
— it is a **confirmed, executable legacy dependency still live in the exact
current production commit**, contradicting the architecture document's own
non-negotiable decision that PostgreSQL/Orchestrator is the sole source of
truth. `PROVEN` items (clean-device restore, tenant isolation/CORS) and the
narrowed `PARTIAL` items (entity coverage, offline retry scope, monitoring
depth) stand as independently verified. The three `BLOCKED` items (PWA-only-
Orchestrator, zero Google traffic, legacy-path removal) all trace to the
single same root cause: `DEFAULT_SYNC_URL` and `getAuthSyncUrl()`'s
Apps-Script-only fallback logic in `index.html`.

## Recommended single safest bounded follow-up

A staging-only configuration test cannot resolve this, since the legacy path
lives in the production PWA's own shipped code, not in an environment
variable. The safest next step is **read-only**: trace every call site of
`getAuthSyncUrl()` and `DEFAULT_SYNC_URL` in the exact production `main`
source, and for each one, document (a) the exact condition under which the
Apps Script fallback is reached versus an Orchestrator-resolved URL is used,
and (b) whether any live telemetry, log, or request-count evidence already
exists (without adding new instrumentation) that could establish how often
the fallback actually fires in current production usage, as opposed to being
merely reachable in code. This produces the precise, evidence-backed call-
path map a future de-risked removal PR would need, without touching any
runtime file, configuration, or production system.

No implementation, legacy-path removal, migration, merge, deployment, or
production mutation is proposed or authorized by this document.
