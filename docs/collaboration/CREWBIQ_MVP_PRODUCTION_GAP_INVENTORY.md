# CrewBIQ MVP Production Gap Inventory

Status: EVIDENCE INVENTORY ONLY — no implementation, migration, merge,
deployment, legacy-path change, or production mutation. Documentation only.

Prepared by: Claude (implementer role, per role-swap effective 2026-09-01).

Scope: evaluate current CrewBIQ production state against
`CREWBIQ_ARCHITECTURE_V1.md` (crewbiq-docs, `main`) section 14 (Definition of
Done for PostgreSQL cutover) and section 10's "Legacy independence"
subsection. Evidence is drawn from this session's own independently-verified
production/staging findings (live endpoint checks, CI runs read directly, and
source reads), not from the architecture document's own now-stale section 6
entity table, which predates this session's canonical-identity and
production-deployment work.

Current production revision at time of this inventory: orchestrator commit
`27e3463220a2022ea1adf074d7131ec69eb32fe5` (migrations 003–011 applied
exactly once); PWA `main` commit `bcfd74a22449b974755b8b48bc01a3b261107b93`
(cache `v95`).

## Section 14 — Definition of Done for PostgreSQL cutover

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | All persistent business entities stored and restored from PostgreSQL | **PARTIAL** | `driver_loads`, `pti_log`, `trucks`, `fleet_driver_profiles`, `fuel_logs`, `service_logs`, `deduction_templates`, `weekly_deductions` are live PostgreSQL tables with confirmed write/restore paths (independently read via migrations 001–002 this session). Canonical identity attribution (`driverId`/`truckId`) for these entities' *historical* rows is explicitly deferred per the Product Owner's MVP-close decision on legacy attribution — a separate axis from raw persistence, not blocking this criterion. `Expenses`, `Disputes`, `Reports`, `Links`, `Experience/points`, `Notifications` remain "Audit required" per the architecture document's own section 6 table; this session did not independently verify their PostgreSQL persistence and restore behavior. |
| 2 | PWA and bot communicate only with Orchestrator | **PARTIAL** | PWA↔Orchestrator communication is well-established and independently verified this session (`/v1/sync`, `/health`, `/ready`, canonical roster/AccountDriverLink/DriverTruckAssignment endpoints all confirmed live). The Telegram bot's current communication path was **not evaluated** in this session's scope — no evidence either way. |
| 3 | Clean-device restoration works | **PROVEN** | Independently confirmed via staging protected missions this session: `AUTH-01`/`RESTORE-01` (clean context restores active trucks/driver profiles), the canonical identity journey (`CANONICAL-IDENTITY-01`, run `33550873310`, 1/1 pass), and the full protected suite (run `33550974453`, 18/18 pass) — all executed against a clean, unauthenticated starting browser context per the harness's own design. |
| 4 | Offline operations retry safely without duplicates | **PROVEN** | `OFFLINE-01` ("failed authenticated mutation retries with one durable operation identity") passed in every full protected suite run read directly this session, including the most recent (run `33550974453`). The `_syncInProgress`-guarded retry pattern was independently reviewed in `loads.js`/staging test comments this session. |
| 5 | Authorization and tenant isolation are tested | **PROVEN** | `TENANT-01` (cross-tenant read/write substitution) confirmed passing in staging protected runs reviewed this session. Production CORS hardening (`resolve_cors_origins`, fail-closed, no wildcard, HTTPS-required in production) independently verified via live preflight checks against the exact allowed and an unlisted origin (B3, earlier this session). |
| 6 | Google sync endpoints receive no production traffic | **NOT_VERIFIED** | No evidence gathered this session either way. This requires a dedicated read-only traffic/log check against the live orchestrator (or Apps Script side) that was not part of this session's scope. |
| 7 | Google Apps Script/Sheets removed from executable production paths | **NOT_VERIFIED** | Not evaluated this session. The architecture document's own section 2.2/6 still describe Apps Script as a currently-referenced legacy path as of when that document was written; no evidence was gathered this session on whether that has since changed. |
| 8 | Production monitoring can identify failed writes, pending queues, and restore errors | **PARTIAL** | Basic liveness/readiness monitoring exists and is independently verified (`/health` unconditional liveness, `/ready` checking DB connectivity and required-migration presence — both confirmed green in production this session). No evidence was found or sought this session for dedicated failed-write, pending-queue-depth, or restore-error observability beyond what `/health`/`/ready` provide. |

## Section 10 — "Legacy independence" acceptance subsection

| Criterion | Status | Evidence |
|---|---|---|
| Remove/disable Apps Script URL; perform all tests successfully; confirm no network request to Google sync endpoints | **NOT_VERIFIED** | This is the same evidence gap as Definition-of-Done items 6–7 above. No test was run this session with the Apps Script URL disabled; no confirmation exists either way. |

## Overall assessment

The criteria this session's own work directly exercised and re-verified —
clean-device restore, offline idempotent retry, tenant isolation/CORS, and
canonical-identity read paths — are **PROVEN** with specific, independently
reproduced evidence (live CI runs read directly, not summaries). The
remaining gaps are not evidence of failure; they are **areas this session's
scope never touched**: the Telegram bot's persistence path, the six
"Audit required" entities from the architecture document's own inventory,
and — most materially for declaring the PostgreSQL cutover itself
complete — whether Google Apps Script/Sheets traffic has actually stopped in
production. That last item is the single most consequential unresolved
question, because it is the literal Definition-of-Done criterion that
defines "cutover," and no one has yet run the specific test the architecture
document itself prescribes (disable the Apps Script URL, run the full
acceptance suite, confirm zero Google-bound requests).

## Recommended single safest bounded follow-up

Run the architecture document's own prescribed **Legacy independence** test
(section 10) as a **staging-only, reversible** exercise: temporarily point
staging's Apps Script URL configuration to an invalid/unreachable value (not
production), run the full accepted staging acceptance suite, and confirm
zero Google-bound network requests occur while the suite still passes. This
directly answers Definition-of-Done items 6, 7, and the Legacy Independence
subsection with real evidence, uses only the reversible staging-configuration
pattern already established throughout this project's staging work, and
requires no schema change, no production access, and no new code.

No implementation, legacy-path removal, migration, merge, deployment, or
production mutation is proposed or authorized by this document.
