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

## 8. Blocker classification follow-up

Date: 2026-09-01

Test-harness commits:

- `0735d29fb8a3865884301844de2f995ea933fde9` - disposable identity isolation,
  explicit Load attribution selection, and date-complete PTI coverage.
- `590e4cd408d9da48ae1c72cde1d682c53e10ce56` - fail-closed LOAD-01 canonical
  workspace/roster prerequisite evidence.

### DRIVER-CRUD-01

Classification: **GENUINE RUNTIME/PERSISTENCE DEFECT**.

The scenario registered a new staging account, verified an empty owner snapshot,
created a new Driver profile at rate `0.65`, then edited that same fresh profile
through the real form to rate `0.91`. An explicit authenticated owner-data sync
returned HTTP 200, but a second-session restore returned `0.65`. No shared
`config.fleetA` identity or pre-existing profile participated. Shared-identity
contamination is therefore excluded.

### PTI-01

Classification: **SHARED-IDENTITY CONTAMINATION PLUS DATE-DEPENDENT TEST DRIFT;
NO RUNTIME DEFECT PROVEN**.

A new staging account correctly showed the mandatory PTI gate with no prior
record. The old mission selected only eight daily checks; on the Monday staging
date the UI correctly required six additional weekly checks. After the harness
selected every rendered daily/weekly item and used the fresh identity's scoped
PTI storage key, PTI-01 passed both locally in isolation (`1 passed`) and in the
protected driver mission runs. The record submitted, unblocked the app, synced,
and restored in a second session.

### LOAD-01

Classification: **GENUINE CLIENT COMPOSITION DEFECT; ORIGINAL MISSING-SELECTION
FAILURE ALSO CONTAINED TEST DRIFT**.

The updated mission explicitly selects the manifest-owned Truck and attempts to
select a concrete canonical Driver. Protected runs `33454247250` and
`33454495762` each completed the other eight driver missions, including PTI-01,
but LOAD-01 remained red. The final redacted evidence proves:

- active canonical workspace: present;
- direct authorized roster read: HTTP 200;
- canonical Driver count: 26;
- Truck selector: enabled and explicit manifest Truck selected;
- Driver selector: remained disabled with no non-empty option;
- no runtime roster request was emitted while composing the selector.

This excludes an absent workspace/roster fixture. The client composition does
not carry the already-proven canonical authority into the Load Driver selector.
No runtime correction is included in this classification task.

### Canonical journey coverage

`CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remains a **COVERAGE GAP ONLY**. The
protected suite still lacks bounded roster, DriverTruckAssignment,
AccountDriverLink, and Driver SELF journeys. It is not used to reclassify the
two genuine runtime findings above.

Follow-up verdict: **STAGING_VALIDATION_BLOCKED** pending independent Claude
review of the two genuine defects. No production action, merge, migration,
destructive rollback, legacy backfill, or runtime fix was performed.

## 9. Blocker correction execution and malformed roster evidence

Date: 2026-09-01

### Published corrections

- Driver commit `b947191f32b8750ce78263a7d4db1e6584848392` refreshes NEW-Load
  attribution after Loads initialization, Orchestrator login, and active
  workspace changes. Runtime files are `loads.js`, `index.html`, and `sw.js`;
  cache rotation is `crewbiq-driver-v95`. Railway staging deployment
  `b2490fe7-6c2a-48e8-837d-655b9bdae0af` reached `SUCCESS`.
- Orchestrator branch `agent/account-driver-link-read`, commit
  `ef2738a0cb011af43ecdc709fdd7d3b23d8c1ad6`, normalizes roster effective
  dates to the accepted calendar-date wire form. Runtime file is
  `app/routers/workspace_drivers.py`. Railway staging deployment
  `84470091-9c43-4d32-9628-47dd113f34e4` reached `SUCCESS`.
- Driver test-harness diagnostics are published through
  `e6837a8291864ae4aba1f6206c8d4a3c4ca07d5` and contain no Driver ID or name.

### Regression evidence

- Orchestrator roster contract: `8 passed, 0 failed`.
- Full Orchestrator suite: `318 passed, 2 skipped, 0 failed`.
- Driver E2E tooling contracts: `318 passed, 0 failed`.
- Isolated Fleet run `33456785849`: `6 passed, 0 failed`. The disposable
  identity's CPM edit was locally `0.91`, calculated gross was `27.5`, and the
  authenticated restored value persisted. The prior mismatch was a harness
  race with startup restore, not an Orchestrator persistence defect.
- Isolated Driver run `33457815938`: `8 passed, 1 failed`. PTI-01 passed; only
  LOAD-01 remained red.
- A full all-role run was not started after the isolated prerequisite remained
  red. Claiming a zero-failure full regression would be inaccurate.

### Remaining LOAD-01 blocker

The corrected PWA composition issued the authorized workspace roster request.
The server returned HTTP 200 with 26 workspace-scoped Drivers. The PWA adapter
then failed closed at roster index 14. Sanitized evidence for that record is:

```text
driverId present: true
workspaceId present and matches requested workspace: true
name present: true
status: inactive
effectiveFrom: 2026-07-17
effectiveTo: 2026-07-14
```

The record's effective interval is impossible because its end precedes its
start. This is a genuine authoritative-source/legacy-data defect, not shared
identity contamination and not a client composition defect. The accepted PWA
contract correctly rejects the entire malformed authoritative response.

The bounded task cannot safely make LOAD-01 green by skipping the record,
weakening date validation, fabricating a start date, inferring another Driver,
or mutating the legacy profile. Those actions violate the accepted fail-closed
contract or the explicit no-legacy-mutation constraint.

### Result and handoff

Result: **STAGING_VALIDATION_BLOCKED**.

`CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remains a coverage gap only and is not
used as a functional blocker. Production deploy, production migrations,
production-data mutation, merge, legacy backfill, destructive rollback, and
scope expansion were not performed.

Next required actor: **Claude**.

Next bounded action: independently review the malformed effective-range
classification and determine whether any bounded authoritative-source fix is
possible without changing legacy records, inventing dates, dropping malformed
records, or weakening fail-closed behavior.

## 10. Provenance-gated correction result

Date: 2026-09-01

Claude review commit `5fe70f04ae88d39f59e13186b79e5b288dd6953e`
accepted the data-defect classification and assigned a provenance-gated path.

### Data-free server guard

Orchestrator commit `27e3463220a2022ea1adf074d7131ec69eb32fe5` adds
the missing `effective_to >= effective_from` invariant to
`_driver_response()`. A reversed interval now receives the same fail-closed
`502 malformed_driver_record` response as other malformed roster rows.

Regression results:

```text
workspace Driver roster contract: 8 passed, 0 failed
full orchestrator suite: 318 passed, 2 skipped, 0 failed
```

The guard commit is published on `agent/account-driver-link-read`. It was not
deployed because live CURRENT did not authorize deploy.

### Version-controlled fixture provenance

Repository search found the exact defect source in
`tests/e2e/staging-fleet-integrity.spec.mjs`. The former DRIVER-CRUD scenario
used hardcoded `terminatedAt: 2026-07-14` in its explicit termination and both
rollback paths, even when the profile was created later by the staging run.

Driver commit `297f8b55645caa2f8cd4c3eba3dabe39f18d0b37` replaces
all three hardcoded values with the current run's UTC calendar date. Driver E2E
tooling contracts remain `318 passed, 0 failed`.

Protected Driver run `33458759675` was intentionally executed before any server
redeploy. Its sanitized evidence proves the existing malformed row:

```text
matches_driver_crud_marker: true
workspace matches: true
status: inactive
effectiveFrom: 2026-07-17
effectiveTo: 2026-07-14
result: 8 passed, 1 failed (LOAD-01 only)
```

The row is therefore a persisted synthetic DRIVER-CRUD test artifact, not an
unrelated or replicated legacy business record. Correcting the source fixture
does not automatically alter the already-persisted staging row.

### Decision gate

Result remains **STAGING_VALIDATION_BLOCKED**. No live row was updated or
deleted, and the new server guard was not deployed.

Decision required: authorize a staging-only, version-controlled one-time
remediation of this exact synthetic test row, preserving its ID and all other
fields while setting `terminated_at` no earlier than its proven `created_at`
date, plus staging-only deployment of orchestrator commit
`27e3463220a2022ea1adf074d7131ec69eb32fe5`. If authorized, the bounded follow-up
is isolated LOAD-01 followed by the full protected suite.

No production deployment, production migration, merge, backfill,
legacy-business-record mutation, malformed-record skipping, or weakened
validation is requested or performed.
