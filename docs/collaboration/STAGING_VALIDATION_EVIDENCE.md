# CrewBIQ Staging Validation Evidence

Date: 2026-08-31

Result: **STAGING_VALIDATION_BLOCKED**

Scope: isolated Railway staging provisioning, additive migrations 010-011,
accepted Orchestrator and Driver staging artifacts, and bounded integration and
smoke evidence. This publication does not authorize production deployment,
production migrations, merge to main, legacy backfill, destructive rollback,
or production-data mutation.

## 1. Exact staging targets and artifacts

| Component | Isolated staging target | Evaluated artifact |
| --- | --- | --- |
| Orchestrator | Railway project `happy-sparkle`, environment `crewbiq-orchestrator-staging`, service `crewbiq-orchestrator` | branch `agent/account-driver-link-read`, commit `f00532a3437e14354748ef23a7827687797baa4f`, deployment `fb0f4104-9f72-4193-9ecb-254edab2ac49` |
| PostgreSQL | Railway project `happy-sparkle`, environment `crewbiq-orchestrator-staging`, service `Postgres` | database `railway`; separate staging resource |
| Driver PWA | Railway project `imaginative-flow`, environment `staging`, service `sublime-learning` | branch `agent/pre-base44-audit`, state tip `996ac660df602d7cbaed5df1a7dfa69ee651022d`, accepted runtime ancestor `b151d7d6d0b27545a0819d71f5b1468d215c710c`, deployment `c098fbb6-dd98-4b19-b954-41988cdb258c` |
| Protected browser validation | GitHub environment `staging` | Actions run `33450671715`, exact workflow/app commit `996ac660df602d7cbaed5df1a7dfa69ee651022d` |

The staging CORS allowlist contains the exact PWA staging origin. The
collaboration branch was added as one custom branch policy to the existing
GitHub `staging` environment; other environment protections were not removed.

## 2. Migration safety and execution

### Pre-application evidence

- Environment identity was explicitly checked as
  `crewbiq-orchestrator-staging`; application environment was `staging`.
- The staging database was `railway`.
- `driver_truck_assignments` and `account_driver_links` did not exist.
- `migration_runs` recorded every repository migration through
  `009_canonical_claim_approval.sql` as applied.
- The computed pending set was exactly
  `010_driver_truck_assignments.sql` and
  `011_account_driver_links.sql`.
- Both migrations use additive table/index creation. Neither drops a table,
  column, constraint, or data. Each uses `DROP TRIGGER IF EXISTS` only to
  replace its own integrity trigger inside the transactional runner.
- Ordering is explicit by filename: 010 before 011.

### Application result

The canonical command was run against the staging-only public database proxy:

```text
python -m app.db.migrations
```

Result:

```text
ok: true
applied: 010_driver_truck_assignments.sql, 011_account_driver_links.sql
all migrations 001-009: already_applied
```

Post-application verification proved:

- both migration ledger rows have status `applied`;
- both tables, expected columns, primary/foreign/check constraints, indexes,
  and integrity triggers exist;
- both new tables had zero rows immediately after migration;
- `/ready` returned HTTP 200 with `missing_migrations=[]`;
- a safe re-run returned `applied=[]` and skipped every migration 001-011.

## 3. Service and compatibility evidence

- Orchestrator `/health`: HTTP 200, environment `staging`.
- Orchestrator `/ready`: HTTP 200, database enabled/configured/connected.
- Allowed-origin preflight from the exact Driver staging origin: HTTP 200 with
  the matching `Access-Control-Allow-Origin` value.
- Unlisted-origin preflight: HTTP 400 without an allow-origin response header.
- Live OpenAPI exposes workspace Driver roster, AccountDriverLink read, and all
  accepted DriverTruckAssignment current/history/as-of/create/close/revoke
  paths.
- Driver `index.html` and `sw.js`: HTTP 200; live cache is
  `crewbiq-driver-v94`.
- Live Driver composition loads workspace attribution, workspace Driver roster,
  DriverTruckAssignment, AccountDriverLink, Driver SELF, Loads, PTI, and startup
  coordinator assets.
- Full canonical Orchestrator suite after migration: `318 passed, 2 skipped,
  0 failed`.

## 4. Deployment dependency matrix

| Dependency | Status | Staging evidence |
| --- | --- | --- |
| Accepted Driver runtime composition | **READY** | Exact accepted branch artifact is live; canonical modules return HTTP 200 and compose in `index.html`. |
| Accepted Orchestrator endpoints | **READY** | Exact correction SHA is live; readiness is green and accepted paths are present in OpenAPI. |
| Client/server endpoint compatibility | **PARTIAL** | Static contracts and live route composition match, but the protected mission set does not exercise the new roster/link/assignment/SELF chain. |
| Authentication/session propagation | **READY** | `AUTH-01`, `AUTH-02`, and `RESTORE-01` passed against the live staging pair. |
| Workspace authorization boundaries | **READY** | `TENANT-01` passed for cross-tenant read/write substitution; CORS allowed/denied origins behaved fail closed. |
| Workspace Driver roster read | **PARTIAL** | Route is live and server contracts are green; no authorized live roster scenario was executed in run `33450671715`. |
| DriverTruckAssignment read/write paths | **PARTIAL** | Routes and migrated constraints are live; no manifest-owned assignment read/create/close/revoke journey was executed. |
| AccountDriverLink read path | **PARTIAL** | Route and empty-by-default schema are live; no authorized link/no-link/ambiguous live journey was executed. |
| Load normalized-ID round-trip | **BLOCKED** | `LOAD-01` failed before a local Load ID existed and issued no sync write; exact normalized IDs were not proven through staging restore. |
| PTI normalized-ID round-trip | **BLOCKED** | `PTI-01` found the gate already satisfied but restored zero current-day PTIs; exact normalized IDs were not proven. |
| Driver SELF dependencies | **PARTIAL** | Accepted assets and server routes are live, but linked/not-linked/ambiguous/unavailable live SELF states were not exercised. |
| Graceful degradation without Orchestrator authority | **PARTIAL** | `LEGACY-01` proved no silent Google fallback. Accountless/network-unavailable PTI completion without fabricated IDs was not exercised by the staging missions. |
| Offline/restore behavior | **PARTIAL** | `OFFLINE-01`, general restore, dispute, expense, and tenant flows passed; Load and PTI restore remain red. |
| Service-worker/cache consistency | **PARTIAL** | Live worker bytes identify v94. The Playwright harness intentionally blocks worker registration, so upgrade/activation from the prior staged worker was not proven. |
| Environment/config requirements | **READY** | Staging DB, secret, explicit CORS, readiness, PWA/orchestrator URLs, host allowlist, protected credentials, and fixture manifest were present. |
| Database migrations 010-011 | **READY** | Additive safety, exact pending set, application, post-schema, readiness, and idempotent re-run were proven. |
| Backward compatibility | **PARTIAL** | Legacy network-failure behavior and existing restore paths passed; failed Load/PTI journeys prevent full promotion evidence. |
| Rollback/recovery | **PARTIAL** | Exact prior/new deployment IDs and immutable source SHAs are recorded; application rollback is by redeploying the prior archive. No destructive DB rollback is needed or authorized. Failed fleet/driver mission cleanup reported incomplete. |
| Production deployment/migrations | **NOT REQUIRED** | Explicitly unauthorized and not performed. |
| Merge to main | **NOT REQUIRED** | Explicitly unauthorized and not performed. |
| Legacy attribution/backfill | **NOT REQUIRED** | Explicitly deferred and not performed. |

## 5. Protected staging run

GitHub Actions run: `33450671715`

Harness/tooling job: **PASS**. The controlled intentional-failure step failed as
designed and its redacted artifact validation passed.

Authenticated role missions:

```text
fleet:    5 passed, 1 failed
driver:   7 passed, 2 failed
recovery: 1 passed, 0 failed
security: 1 passed, 0 failed
total:   14 passed, 3 failed
```

Passed evidence includes auth/login/logout, clean restore, tenant isolation,
offline idempotent retry, legacy fallback suppression, disputes, expenses,
deduction periods, fleet cross-device edit, conflict handling, and inactive
restore.

### Blocking failures

1. `STAGING_DRIVER_CRUD_RATE_MISMATCH`
   `DRIVER-CRUD-01` expected restored CPM rate `0.91` and received `0.65`.
   The evidence classifies this as reproducible; cleanup was incomplete.
2. `STAGING_LOAD_CREATION_NOT_COMPLETED`
   `LOAD-01` clicked Add Load but found no new local record ID and made no Load
   sync request. The accepted UI now requires explicit canonical selections;
   whether this is stale mission composition or a runtime defect requires
   bounded independent diagnosis.
3. `STAGING_PTI_RESTORE_MISSING_CURRENT_DAY_RECORD`
   `PTI-01` observed the gate as already satisfied, then a clean restore found
   zero PTI records for the current UTC date. The accepted normalized-ID and
   graceful-degradation paths therefore remain unproven in staging.
4. `CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED`
   The protected suite contains no live authorized roster,
   DriverTruckAssignment, AccountDriverLink, Driver SELF, or exact normalized-ID
   assertion. Route presence and local/server contracts cannot replace this
   integration evidence.

## 6. Recovery plan

- Do not drop or reverse tables 010-011. They are additive and empty by default;
  older application artifacts ignore them.
- If the Orchestrator artifact must be rolled back, deploy the recorded prior
  source artifact associated with deployment
  `5a01dd9a-0ffc-409c-8015-8961acd42861`; retain migrations 010-011.
- If the Driver artifact must be rolled back, deploy commit
  `6b05f84a2321202004b96db3b4814e22d3740255`, the prior staging artifact
  associated with deployment `0fb24182-d2d2-470b-b3ba-12ac2aa47c77`, and verify
  its service-worker bytes become authoritative.
- Migration runner failure recovery is transaction rollback plus ledger/schema
  verification before routing traffic.
- Failed browser cleanup must be reconciled only by exact manifest-owned IDs;
  never bulk-delete by name/date and never touch production/customer records.
- No destructive rollback was executed because no destructive recovery was
  required or authorized.

## 7. Verdict and handoff

Verdict: **STAGING_VALIDATION_BLOCKED**.

The staging environment, migrations, backend readiness, CORS, accepted artifact
composition, auth/session, tenant isolation, and offline retry are proven. The
three reproducible mission failures and missing canonical integration journeys
prevent `STAGING_VALIDATION_PASS` and any production authorization request.

Next required actor: **Claude**.

Next bounded action: independently review this staging evidence and classify
each blocker as runtime, fixture/test drift, or missing bounded staging coverage.
No implementation, production action, merge, destructive rollback, or legacy
backfill is authorized by this handoff.
