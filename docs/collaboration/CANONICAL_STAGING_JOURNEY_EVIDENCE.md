# Canonical Staging Journey Evidence

## Result

`STAGING_CANONICAL_IDENTITY_COVERAGE_PASS`

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

## Fixture provisioning resolution - 2026-09-01

Claude independently accepted the initial blocker classification in review commit `8a4a65a165317edc62f08c38f3160a2a6881a9a0` and authorized the bounded fixture continuation through `CURRENT` commit `e8a97f1db2d60053a0ef3a60ac2a215969b2334a`.

### Exact protected fixture proof

The protected run artifact `9814803712` had digest `sha256:f540bdfd8769e3653fd75c318944c5d3ee62d7ce54584fb4cdcd3a0984884ec3` and tied the run to source commit `a2639d8ce7bf0d040a3d22b3e76269bb53032496`. Its redacted LOAD-01 evidence proved the protected manifest Truck was `e2e-staging-20260714-fleet-a-truck-active`. The version-controlled fixture plan deterministically maps that generation to Driver `e2e-staging-20260714-fleet-a-driver-active`.

Read-only staging DB preflight proved:

- exact account `CBQ-E2E-FLEET-A` had exactly one active workspace membership;
- workspace `243289f3-7da8-881d-7773-7dfea2083863` had exact legacy owner `CBQ-E2E-TENANT-A`;
- the exact manifest Driver and Truck each resolved once, were active, had matching owner, exact E2E names, and explicit Driver-to-Truck fixture linkage;
- current AccountDriverLink count was zero;
- current Driver assignment overlap count was zero;
- current Truck assignment overlap count was zero;
- deterministic fixture ID collisions were zero.

### Guarded staging transaction

The staging-only procedure SHA-256 was `742CB201E4EDE93407221AD1FF7EFCA0B5717C10D6AB155A14833D691BFFA4D7`. It failed closed unless the Railway environment was staging and every identity/ownership/count predicate matched exactly.

The transaction inserted exactly:

- AccountDriverLink `d5f4db9b-e2c8-5a5b-9e5e-9bbce2f67d5f`;
- DriverTruckAssignment `8066e9d7-89e4-568c-b01f-b8b6bf817c8d`.

Both use effective timestamp `2026-09-01T19:38:37.797892+00:00`, exact marker `CANONICAL-IDENTITY-01 protected staging fixture run 33544063949`, explicit account attribution, and canonical workspace/Driver/Truck IDs. The assignment is `solo`, active, and carries `e2e_protected_fixture` provenance with workflow run and source commit.

Before counts were all zero. Insert results were exactly `INSERT 0 1` and `INSERT 0 1`. Post-transaction counts were exactly one link and one assignment.

Rollback was prepared but not executed. It requires both deterministic IDs, exact workspace/account/Driver/Truck values, and exact provenance marker to each match once, then deletes assignment before link and requires `DELETE 1` for each.

### Validation

Isolation wiring commit: `b963d317b393d9a6493c76581028870186a490e4`.

- Narrow contracts after wiring: `32 passed, 0 failed`.
- Isolated canonical workflow run `33550873310`: overall `success`; staging job `99999706510` success; harness job `99999706675` success; canonical journey `1 passed, 0 failed`.
- Full protected workflow run `33550974453`: overall `success`; staging job `100000036787` success; harness job `100000036541` success.
- Full protected scenarios: Fleet `6/6`, Driver `9/9`, Canonical `1/1`, Recovery `1/1`, Security `1/1`; aggregate `18 passed, 0 failed`.
- Post-run read-only DB proof found exactly the two expected IDs with the exact provenance marker and no additional AccountDriverLink or DriverTruckAssignment row for this protected account/fixture pair.

Final classification: `STAGING_CANONICAL_IDENTITY_COVERAGE_PASS`. The former `CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` gap is closed.

Production deployment, production data mutation, migration, merge, legacy backfill, runtime change, and destructive rollback: `NONE`.
