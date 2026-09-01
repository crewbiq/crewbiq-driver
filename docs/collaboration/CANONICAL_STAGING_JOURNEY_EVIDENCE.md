# Canonical Staging Journey Evidence

## Result

`STAGING_CANONICAL_IDENTITY_COVERAGE_BLOCKED`

Date: 2026-09-01

Test implementation commit: `a2639d8ce7bf0d040a3d22b3e76269bb53032496`

Protected workflow run: `33544063949`

Staging PWA evidence revision: `b947191f32b8750ce78263a7d4db1e6584848392`

Staging targets:

- PWA: `https://crewbiq-driver-staging.up.railway.app/`
- Orchestrator: `https://crewbiq-orchestrator-crewbiq-orchestrator-staging.up.railway.app`

## Bounded implementation

The coverage commit adds one read-only protected Playwright journey and wires it into the existing `driver` mission set. It covers:

- `ROSTER-01`: authorized workspace Driver roster;
- `ACCOUNT-LINK-01`: canonical AccountDriverLink read;
- `ASSIGNMENT-READ-01`: current DriverTruckAssignment read;
- `DRIVER-SELF-01`: composed read-only Driver SELF card.

The journey obtains `workspaceId` and `accountId` only from authenticated `/v1/me`, compares the direct server roster with the PWA adapter, and does not infer or select a first Driver/Truck. It has no business-record write path. Cleanup only revokes the authenticated session.

Changed test files:

- `tests/e2e/staging-canonical-identity.spec.mjs`
- `tests/e2e/missions/role-missions.mjs`
- `tests/e2e/role-mission-runner.test.mjs`

Runtime/product files changed: `NONE`.

## Local contract evidence

- Narrow Node contracts: `32 passed, 0 failed`.
- Playwright discovery: `1 test in 1 file`; no parse/configuration failure.

## Protected run evidence

- Harness job `99977131988`: `SUCCESS` in 56 seconds. Its controlled intentional failure occurred as designed and its evidence validation/upload passed.
- Staging journey job `99977132107`: `FAILURE` in 1 minute 51 seconds.
- Existing protected journeys: `17 passed, 0 failed`.
- New canonical identity journey: `1 failed`.
- Aggregate staging journeys: `17 passed, 1 failed`.

The new journey proved:

- authenticated `/v1/me` returned canonical workspace/account context;
- authorized direct Driver roster read returned HTTP 200;
- roster was non-empty, workspace-scoped, and had deterministic unique IDs;
- the PWA roster adapter succeeded and matched the direct server IDs.

The first blocking assertion was exact:

`AccountDriverLink: account_driver_link_not_found`

The accepted AccountDriverLink adapter therefore failed closed. The protected Fleet A staging account has no current canonical AccountDriverLink fixture. Because DriverTruckAssignment and Driver SELF depend on a proven link-selected `driverId`, they were not normalized through any fallback and cannot yet be proven by this journey.

## Classification

Blocker: `STAGING_CANONICAL_ACCOUNT_DRIVER_LINK_FIXTURE_MISSING`

Classification: missing bounded staging fixture, not a runtime regression.

Evidence supporting the classification:

- roster transport and adapter succeeded in the same authenticated workspace;
- server returned the domain-specific `account_driver_link_not_found`, not network, authorization, malformed-response, or server failure;
- all 17 previously protected missions remained green;
- no assertion was weakened and no fallback was introduced.

## Mutation statement

The new canonical journey performed no Driver, AccountDriverLink, DriverTruckAssignment, Truck, Load, PTI, or other business-record mutation. The full protected suite executed only its established fixture-owned mutation/rollback paths. No production request, deployment, migration, merge, backfill, or data mutation occurred.

## Safest next bounded action

After independent Claude review, provision only the missing canonical AccountDriverLink and, if absent, one effective current DriverTruckAssignment for the exact protected Fleet A staging fixture using an explicit, reversible, provenance-recorded staging fixture procedure. Abort unless the target account, workspace, Driver, and Truck resolve uniquely from the protected fixture contract. Then rerun the isolated canonical identity journey and the full protected suite.

No runtime change is indicated by the current evidence.
