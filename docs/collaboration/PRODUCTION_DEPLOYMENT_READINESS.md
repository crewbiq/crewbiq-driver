# CrewBIQ Production / Deployment Readiness Evidence

Date: 2026-08-31

Status: **BLOCKED**

Scope: evidence-only validation of the accepted CrewBIQ Driver and CrewBIQ
Orchestrator work. This document does not authorize a deployment, merge,
production-data mutation, migration execution, or legacy attribution/backfill.

## 1. Evaluated artifacts

| Artifact | Evaluated ref | Relationship to current main |
| --- | --- | --- |
| Driver PWA runtime | `crewbiq/crewbiq-driver` `agent/pre-base44-audit`, implementation `b151d7d6d0b27545a0819d71f5b1468d215c710c` | accepted branch is 194 commits ahead of `origin/main` (`86b8b4dd7e9496833a021319167589b49f0ac418`) |
| Orchestrator integrated server | `crewbiq/crewbiq-orchestrator` `agent/account-driver-link-read`, `ac98b111753c1e1119e94d00095bd618addcc439` | branch is 7 commits ahead of `origin/main` (`8bc3214070670d79b5d1f8c419b2a992991b9024`) |
| Orchestrator CI | GitHub Actions run `33429494328` | exact SHA `ac98b111753c1e1119e94d00095bd618addcc439`; `314 passed`; conclusion `success` |
| Currently published PWA | GitHub Pages from `main` | cache `crewbiq-driver-v79`; no `driver-self.js` or `account-driver-link.js` |
| Currently published Orchestrator | Railway production URL used by the PWA default | healthy production service, but its OpenAPI contains none of the six accepted roster/assignment/AccountDriverLink paths |

The evaluated Orchestrator branch contains all accepted prerequisite commits as
ancestors, in one deployable branch artifact:

- normalized ID round-trip: `1fc10575239ac55a1aefa02ba7cd55d14fbd3cab`
- workspace Driver roster read: `412c39d94f357dcbf04f356fc9b210deb84abb8f`
- DriverTruckAssignment reads: `d8aae153f65228906f467bd141fa62651b56dc14`
- DriverTruckAssignment commands: `c4ac01d1b106a9570b24df0ffacec7855aaee57e`
- AccountDriverLink read: `ac98b111753c1e1119e94d00095bd618addcc439`

## 2. Classification model

- **READY**: implementation and bounded evidence are sufficient for the next
  controlled deployment stage.
- **PARTIAL**: implementation exists, but environment/integration evidence must
  be completed in staging.
- **BLOCKED**: a concrete defect or missing mandatory gate prevents staging or
  production promotion.
- **NOT REQUIRED**: intentionally outside this readiness slice or not needed for
  the accepted architecture.

## 3. Deployment dependency matrix

| Deployment dependency | Status | Evidence / required closure |
| --- | --- | --- |
| Accepted Driver runtime composition | **PARTIAL** | AccountDriverLink, DriverTruckAssignment, workspace resolution, SELF UI, Loads, PTI and startup contracts execute on the accepted branch. The canonical aggregate tooling command is red; see B1. |
| Accepted Orchestrator endpoints | **READY** | The integrated branch contains roster, assignment read/write and AccountDriverLink routers; exact-SHA CI passed 314 tests with PostgreSQL 16. |
| Client/server endpoint compatibility | **PARTIAL** | Client adapters and transport tests match the server paths and accepted response shapes. No deployed integrated environment currently exposes both accepted artifacts. |
| Authentication/session propagation | **PARTIAL** | Driver auth/restore and transport contracts pass; server auth tests pass in exact-SHA CI. Bearer propagation still requires live staging confirmation. |
| Workspace authorization boundaries | **READY** | Server roster/assignment/link tests cover unauthorized and cross-workspace access; client resolvers fail closed. Staging tenant isolation remains a live smoke requirement. |
| Workspace Driver roster read | **READY** | Accepted client adapter and server endpoint are on the evaluated refs; malformed, empty, multiple and cross-workspace cases are covered. |
| DriverTruckAssignment read paths | **READY** | Current/history/as-of paths and effective-dated validation are covered on client and server. |
| DriverTruckAssignment write paths | **READY** | Create/close/revoke commands and PostgreSQL overlap/concurrency constraints passed server CI. No PWA mutation UI is required or present. |
| Load normalized `workspaceId`/`driverId`/`truckId` round-trip | **READY** | Client attribution/serialization contracts and server normalized-ID round-trip tests pass. Live staging sync/restore remains required before production. |
| PTI normalized `workspaceId`/`driverId`/`truckId` round-trip | **READY** | Client explicit attribution/graceful-degradation contracts and server normalized-ID round-trip tests pass. Live staging sync/restore remains required before production. |
| Driver SELF dependencies | **READY** | Canonical Account -> Driver proof is composed before current DriverTruckAssignment read; Claude accepted the real-adapter composition. |
| Graceful degradation without Orchestrator authority | **READY** | PTI authority-unavailable tests prove submission remains usable without fabricated canonical IDs or local-profile fallback. |
| Offline queue and terminal conflict handling | **READY** | `offline_sync_queue.test.mjs` and `offline_sync_terminal_409.test.mjs` pass. |
| Restore/startup behavior | **READY** | Authenticated restore, startup coordinator and inline parse/composition contracts pass. |
| Service-worker/cache consistency | **BLOCKED** | Runtime is v94, the aggregate SIDR contract still asserts v88, and `pwa-auth-contract.yml` still asserts v85. See B1/B2. |
| Driver branch CI coverage | **BLOCKED** | No workflow run exists for this branch. Runtime path filters omit the new canonical modules, and the workflow's cache assertion is stale. See B2. |
| Orchestrator branch CI coverage | **READY** | Exact branch-tip run succeeded with PostgreSQL service and all 314 tests. |
| Orchestrator CORS policy | **BLOCKED** | `allow_origins=['*']` and `allow_credentials=True` are hard-coded with the source comment `tighten before production`; no environment allowlist exists. See B3. |
| Environment/config requirements | **BLOCKED** | Required DB and secret settings can be supplied, but CORS is not configurable and `/health` can report OK while DB-backed canonical endpoints are unusable. See B3/B4. |
| Database migration artifacts | **READY** | Additive migrations 010 and 011 exist and have real PostgreSQL constraint/concurrency coverage. |
| Database migration execution | **PARTIAL** | Migration runner is manual and explicitly never runs at startup. All pending migrations must be applied before the new server artifact receives traffic. |
| Database readiness signal | **BLOCKED** | Public `/health` does not test DB connectivity or required migration presence. See B4. |
| Backward compatibility | **READY** | Legacy records remain unchanged; new IDs are written only when proven; accountless/PTI/offline paths retain legacy-compatible behavior. |
| Deployment ordering | **PARTIAL** | Safe order is defined below but has not been executed in staging. Server and migrations must precede PWA. |
| Rollback procedure | **PARTIAL** | Application rollback is feasible because migrations are additive, but no down migrations exist; backup and explicit no-drop policy are mandatory. |
| Staging smoke-test plan | **READY** | Bounded plan is specified below; execution requires Product Owner authorization after blocker closure/review. |
| Production smoke-test plan | **READY** | Read-only-first plan is specified below; execution is not authorized in this slice. |
| Production deployment | **NOT REQUIRED** | Explicitly not authorized. |
| Merge to main | **NOT REQUIRED** | Explicitly not authorized. |
| Legacy attribution/backfill | **NOT REQUIRED** | Explicitly queued until integrated deployment validation is accepted. |

## 4. Concrete blockers

### B1 - DRIVER_CANONICAL_TEST_GATE_RED

Command:

```text
npm run test:e2e:tooling
```

Result: **316 passed, 1 failed**.

The failing protected contract
`sidr-contract-resolver-integration-v1.test.mjs` requires exactly
`crewbiq-driver-v88`, while the accepted cache-first runtime correctly uses
v94. This is a stale gate, not a failure in the SELF composition, but a
deployable artifact cannot be promoted with its canonical test command red.

Required closure: reconcile the protected contract with the accepted cache
version without weakening its one-version/cache-shell assertion, then obtain a
zero-failure aggregate run.

### B2 - DRIVER_CI_GATE_STALE_AND_INCOMPLETE

`.github/workflows/pwa-auth-contract.yml` still checks
`crewbiq-driver-v85`. It also does not list the accepted canonical modules and
their tests in its path filters or execution steps:

- `workspace-attribution.js`
- `workspace-driver-roster.js`
- `driver-truck-assignment.js`
- `account-driver-link.js`
- `driver-self.js`

The collaboration branch has no GitHub Actions run. A PR touching `index.html`
would trigger the workflow and encounter the stale v85 assertion; a future
change isolated to one of the omitted modules could bypass this contract
workflow entirely.

Required closure: update the existing workflow only, preserve the exact cache
assertion at v94, include all accepted canonical runtime/test paths, run the
same aggregate contract command, and obtain a green branch/PR check.

### B3 - ORCHESTRATOR_PRODUCTION_CORS_UNHARDENED

`app/main.py` currently has:

```text
allow_origins=['*']  # tighten before production
allow_credentials=True
allow_methods=['*']
allow_headers=['*']
```

This is explicitly unfinished production configuration and cannot be narrowed
by environment variables. The PWA uses cross-origin authenticated requests, so
the exact staging and production PWA origins must be allowlisted and preflight
behavior must be tested before promotion.

Required closure: introduce a fail-closed, environment-driven origin allowlist;
reject wildcard configuration in production; retain only required methods and
headers or document why broader values are necessary; test allowed and denied
origins.

### B4 - ORCHESTRATOR_HEALTH_CAN_BE_FALSE_GREEN

`/health` reports service/env/secret only. It returns `ok: true` without checking:

- `CREWBIQ_DB_ENABLED=true`
- `DATABASE_URL` connectivity
- migrations 010 and 011
- availability of the DB-backed roster/assignment/link dependencies

The accepted endpoints return unavailable when DB support is disabled, while
`.env.example` defaults DB support to false. A deployment platform can
therefore mark the service healthy even when every new canonical endpoint is
unusable.

Required closure: add or configure a deployment readiness check that fails when
mandatory DB connectivity or required migration versions are absent. Preserve
a separate liveness check if needed. Do not expose credentials or secret values.

## 5. Validation evidence

### Driver

```text
npm run test:e2e:tooling
317 tests: 316 passed, 1 failed (B1)

canonical transformed orchestrator transport contract
PASS

offline_sync_queue.test.mjs
PASS

offline_sync_terminal_409.test.mjs
PASS

full_restore_transport.test.mjs
PASS
```

The aggregate run includes and passed the accepted SELF, AccountDriverLink,
DriverTruckAssignment, roster, workspace attribution, Load attribution, PTI
attribution, auth/startup, service-worker path, staging prerequisite and
graceful-degradation contracts. The one failure is the stale cache-version
assertion described in B1.

### Orchestrator

GitHub Actions run `33429494328` on exact SHA
`ac98b111753c1e1119e94d00095bd618addcc439` completed successfully:

```text
314 passed in 14.62s
```

The workflow provisioned PostgreSQL 16 and includes normalized-ID, workspace
roster, DriverTruckAssignment command/read/PostgreSQL, AccountDriverLink
read/PostgreSQL, auth, tenant, restore and migration tests.

### Read-only current-production observations

No deployment or mutation was performed.

- Railway `/health`: `ok=true`, `env=production`, `secret_configured=true`.
- Railway `/openapi.json`: none of the six accepted roster, assignment or
  AccountDriverLink paths are present.
- GitHub Pages is built from `main`, publishes cache v79, and does not publish
  `driver-self.js` or `account-driver-link.js`.

These observations do not imply a defect in the currently deployed legacy
system. They prove that the accepted server must be deployed and validated
before the accepted PWA; deploying the PWA first would point canonical reads at
a server that does not expose them.

## 6. Mandatory environment and migration requirements

### Orchestrator staging/production

- `CREWBIQ_ENV`: explicit `staging` or `production` value.
- `CREWBIQ_ORCHESTRATOR_SECRET`: unique non-default secret supplied by the
  platform secret store.
- `DATABASE_URL`: PostgreSQL DSN from the platform secret store.
- `CREWBIQ_DB_ENABLED=true`: mandatory for auth, restore, roster, assignment and
  AccountDriverLink paths.
- `CREWBIQ_DB_DUAL_WRITE` and `CREWBIQ_DB_STRICT`: preserve the accepted current
  operational mode; record their chosen staging/production values in deployment
  evidence rather than relying on `.env.example` defaults.
- CORS origin allowlist: exact HTTPS PWA staging/production origins after B3.
- Python 3.12 and pinned `requirements.txt` dependencies.

Migration execution is a separate pre-deploy step:

```text
python -m app.db.migrations
```

The runner is transaction-scoped and advisory-lock protected. Verify
`migration_runs` records every migration through
`011_account_driver_links.sql`. Do not route traffic to the new server artifact
before this verification. Do not call the mutation-capable admin migration
endpoint from an untrusted or browser context.

### Driver staging

- HTTPS PWA host and HTTPS Orchestrator host.
- Exact deployed PWA and Orchestrator commit SHAs recorded separately.
- Service worker activation proves cache `crewbiq-driver-v94` and both canonical
  modules in `APP_SHELL`.
- Protected workflow variables: `CREWBIQ_E2E_BASE_URL`,
  `CREWBIQ_E2E_ORCHESTRATOR_URL`, `CREWBIQ_E2E_ALLOWED_HOSTS`.
- Protected disposable credentials for Fleet A/Fleet B and a fixture manifest
  schema 1.1 with distinct tenants and manifest-owned records.
- Staging browser transport override must point to the staging Orchestrator;
  never allow the staging run to fall through to the hard-coded production URL.

## 7. Required deployment order

1. Close B1-B4 and obtain independent review.
2. Obtain Product Owner authorization for staging validation.
3. Provision isolated staging PostgreSQL and take a baseline snapshot.
4. Apply every pending Orchestrator migration through 011 and verify
   `migration_runs`.
5. Deploy Orchestrator SHA
   `ac98b111753c1e1119e94d00095bd618addcc439` (or its reviewed blocker-only
   correction descendant) to staging.
6. Verify liveness, DB readiness, CORS preflight, auth and all accepted OpenAPI
   paths before deploying the PWA.
7. Deploy Driver implementation
   `b151d7d6d0b27545a0819d71f5b1468d215c710c` (or its reviewed blocker-only
   correction descendant) to staging.
8. Verify service-worker cache v94 and execute the staging plan below.
9. Publish redacted evidence with both deployed SHAs. Do not infer deployed app
   SHAs from workflow SHAs.
10. Return to Product Owner for any production authorization. Do not auto-deploy.

## 8. Staging smoke-test plan

All writes must use manifest-owned disposable staging fixtures and documented
rollback paths.

1. **Artifact identity**: record PWA/server SHA, OpenAPI path set, cache name,
   migration versions and environment label.
2. **CORS**: allowed PWA origin succeeds through preflight and authenticated
   request; an unlisted origin is denied.
3. **Auth/session**: login, `/v1/me`, session restore, logout/revocation and
   invalid/missing token behavior.
4. **Workspace isolation**: Fleet A can read only A; Fleet B can read only B;
   cross-workspace roster/link/assignment requests fail before data exposure.
5. **Roster**: authorized empty, one and multiple Driver reads preserve stable
   canonical IDs; malformed records fail closed.
6. **Assignment reads**: current/history/as-of return deterministic effective
   records; zero and ambiguous current assignments fail closed.
7. **Assignment commands**: create, close and revoke only disposable assignments;
   prove overlap, cross-workspace and stale-version rejection; clean up fixtures.
8. **Driver SELF**: linked success, not-linked, ambiguous, unauthorized and
   unavailable states; no first-Driver/first-Truck fallback.
9. **Load round-trip**: explicitly select proven Driver/Truck, sync, restore in a
   fresh browser, and compare exact `workspaceId`/`driverId`/`truckId`.
10. **PTI round-trip**: same exact-ID sync/restore proof with canonical authority.
11. **Graceful degradation**: disconnect Orchestrator and simulate network
    unavailable; PTI remains completable and writes no fabricated canonical IDs.
12. **Offline/restore**: queue while offline, reconnect once, prove idempotent
    sync, terminal-409 handling and fresh-session restore.
13. **Cache update**: upgrade from the currently staged prior worker, prove v94
    activation and one current app-shell copy without duplicate startup actions.
14. **Backward compatibility**: open legacy Loads/PTIs without normalized IDs;
    verify no implicit backfill or mutation.
15. **Evidence**: run protected role missions plus explicit Load/PTI/SELF cases,
    redact secrets, and retain exact fixture cleanup observations.

## 9. Production smoke-test plan (not authorized)

If separately authorized after staging acceptance:

1. Snapshot PostgreSQL and record current PWA/server rollback SHAs.
2. Apply migrations before application traffic and verify readiness without
   exposing secrets.
3. Deploy Orchestrator first; verify liveness, DB readiness, CORS and accepted
   OpenAPI paths using read-only probes.
4. Use a specifically authorized synthetic/operational test account for auth and
   workspace-scoped read checks. Do not use arbitrary customer records.
5. Deploy PWA second; verify HTTPS, manifest, cache version and canonical modules.
6. Verify Driver SELF read-only success and unavailable state.
7. Perform Load/PTI writes only if production synthetic-write authorization is
   separately granted; otherwise retain staging evidence and use read-only
   production checks.
8. Monitor auth failures, CORS denials, 5xx responses, DB pool errors, sync
   retries and service-worker activation.
9. Stop rollout and invoke rollback on any identity mismatch, cross-workspace
   exposure, duplicate sync, migration/readiness failure or PTI lockout.

## 10. Rollback requirements

- **Before migrations**: take and verify a database snapshot/restore point.
- **Migration failure**: the manual runner transaction must roll back; do not
  start the new server artifact.
- **Server failure after migration**: roll application code back to the recorded
  prior SHA. Migrations 010/011 are additive; leave their tables in place and do
  not improvise destructive down migrations.
- **PWA failure**: republish the recorded prior PWA artifact, verify the prior
  service-worker bytes activate, and confirm its cache becomes authoritative.
- **Partial rollout**: never leave the accepted PWA pointing at a server without
  the accepted paths. Roll back PWA first if server availability is uncertain.
- **Test records**: close/revoke/delete only manifest-owned staging fixtures by
  their exact IDs. Never bulk-clean by name or date.
- **Production data**: no rollback action may mutate legacy/customer records
  without a separate explicit authorization.

## 11. Readiness verdict and handoff

Verdict: **BLOCKED**.

The accepted architecture is sufficiently integrated on branches to define a
safe staging sequence, and the relevant identity/assignment behavior has strong
contract and PostgreSQL evidence. It is not yet an end-to-end deployable system
because B1-B4 prevent a trustworthy promotion/readiness gate.

Next required actor: **Claude**.

Next bounded action: independently verify this readiness classification,
production observations, blockers B1-B4, and the deployment/smoke/rollback
plans. No blocker correction, deploy, merge, production-data write or legacy
backfill is authorized by this document.
