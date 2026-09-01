# Production Migration Execution Evidence

## Result

`PRODUCTION_VALIDATION_BLOCKED`

Execution stopped at the mandatory fresh-backup gate. No production migration,
deployment, write quiescence, database mutation, merge, backfill, cleanup, or
rollback was performed.

## Authorized scope

The Product Owner authorized the exact ordered production sequence:

`003_effective_dated_deductions -> 004_service_invoice_lineage -> 006_truck_vin -> 007_identity_workspace -> 008_canonical_company_truck -> 009_canonical_claim_approval -> 010_driver_truck_assignments -> 011_account_driver_links`

Authorization remained conditional on target separation, hash and schema
preflight, a fresh verified backup before mutation, write quiescence, exact
runner ordering, and stop on the first mismatch.

## Completed preflight evidence

- Driver collaboration branch tip before execution: `e3a96f28673e6e248433aefac63958866b08b1ab`.
- Accepted orchestrator branch/revision:
  `agent/account-driver-link-read` at
  `27e3463220a2022ea1adf074d7131ec69eb32fe5`.
- Production Railway project: `happy-sparkle`, project ID
  `89eb12bf-57ee-4228-a841-4008ef7a0e59`, environment `production`.
- Production orchestrator service: `crewbiq-orchestrator`, service ID
  `dd23479b-f6b1-48ba-9d7c-27f4e0c01ba2`, one configured/running `sfo`
  replica, deployment `adeeb19b-4178-4e28-bc44-9358b153a538`, status SUCCESS.
- Production PostgreSQL service: `Postgres-IFbZ`, service ID
  `19637ac7-6ba2-4524-b802-466a2cb241f7`, image
  `ghcr.io/railwayapp-templates/postgres-ssl:18`, one configured/running `sfo`
  replica, deployment `5f03b0f4-cccc-4ed3-a77a-63aff693342c`, status SUCCESS.
- Production volume: `postgres-volume-7PVl`, mount
  `/var/lib/postgresql/data`, state READY, 50,000 MB capacity and approximately
  1,133.79 MB used.
- Live production `/health`: HTTP success with `ok=true`,
  `service=crewbiq-orchestrator`, `version=0.1.0`, and `env=production`.
- Orchestrator worktree contained no tracked changes; the pre-existing
  unreadable `.tmp-pytest-pr55` warning was not altered.

Migration hashes reconfirmed at the accepted orchestrator revision:

| File | SHA-256 |
|---|---|
| `003_effective_dated_deductions.sql` | `c1d0b6d38c57d611286476fc090ce54f2c4d2bd3d19e8708e03c012d12cc8680` |
| `004_service_invoice_lineage.sql` | `76a8d7b205a7e704427f2f003ea41d10e5f1ebcc55e3d14159f41d16e66643ff` |
| `006_truck_vin.sql` | `59a9eb826d2408435087f9583568a3d927559a90b44cf592a34c905fe37b22df` |
| `007_identity_workspace.sql` | `4533ae750db56520e1c1b1f26d5958e720a1bdf8517844dc2af588a4e1bd6fa0` |
| `008_canonical_company_truck.sql` | `27f2b317837a537d2c9c736544d34291e6de8eebac1ad797c0c29ccce7500e` |
| `009_canonical_claim_approval.sql` | `3260ec29056dbac50840a1bc4391972ebb2d4e4f903722658bc74ff1de7c4bfc` |
| `010_driver_truck_assignments.sql` | `c890905446f2b06d3d4d273ec1bc9d20c4eddd40d382331e9f0fad9da3a5bd91` |
| `011_account_driver_links.sql` | `2f055b2f3d7bbe0378d82a909622bb24e92471c0494d3f64dda3db9080edd737` |

## Blocking backup evidence

The accepted gate requires a newly created and verified production backup
before any production mutation. No fresh backup was created.

Attempted non-mutating paths:

1. Railway CLI `5.27.0` exposes volume list/file operations but no snapshot or
   backup creation command.
2. Two Railway SSH attempts to the production PostgreSQL service, including an
   explicit existing private key, did not complete the handshake and executed
   no remote command. Therefore no server-side `pg_dump` artifact exists.
3. The authenticated Railway dashboard project page failed to render its
   dynamic application module (`Failed to fetch dynamically imported module`),
   so no native volume snapshot action was available or submitted.
4. The matching Railway PostgreSQL 18 Docker client image downloaded most
   layers but did not complete.
5. The smaller official `postgres:18-alpine` client also failed to complete;
   after cached progress, five layers remained pending with no progress for the
   bounded ten-minute wait. The pull was terminated locally.

An older PostgreSQL 16 client was deliberately not used against production
PostgreSQL 18.6. Backup compatibility was not weakened to force continuation.

## Stop boundary

Because a fresh backup could not be created and verified:

- production write traffic was not quiesced;
- the production migration runner was not invoked;
- `migration_runs` and production schema/data were not changed;
- orchestrator and PWA deployments were not changed;
- no rollback was needed.

## Required recovery action

Before resumption, an authorized operator must complete one of these bounded
actions:

1. Create a fresh Railway snapshot of `postgres-volume-7PVl` in the production
   environment and provide its exact snapshot ID/timestamp/status; or
2. Provide a working PostgreSQL 18 `pg_dump` execution path, after which Codex
   must create a custom-format dump, record its SHA-256, list it successfully
   with PostgreSQL 18 `pg_restore`, and rehearse restoration in a disposable
   database.

After either path is proven, Codex must restart the full read-only production
preflight. Prior health, hashes, row counts, and schema observations must not be
assumed current.

`CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remains queued and unchanged.

## Authorized snapshot creation and verification — 2026-09-01

Result: `SNAPSHOT_PASS`

Railway's authenticated GraphQL API was used after the coordinator explicitly
authorized one new production snapshot. The target was resolved through the
public project/environment graph before mutation; no admin-only identity or
guessed ID was used.

- Project: `happy-sparkle`, `89eb12bf-57ee-4228-a841-4008ef7a0e59`.
- Environment: `production`, `0aa6a57a-2655-46e4-bd9a-0cf4cc9ce46c`.
- Service: `Postgres-IFbZ`, `19637ac7-6ba2-4524-b802-466a2cb241f7`.
- Volume: `postgres-volume-7PVl`,
  `20b2a03e-192d-4874-8952-7106ff466626`.
- Volume instance: `71905c96-7499-470a-bb63-b8866048ef25`, state READY,
  mount `/var/lib/postgresql/data`.
- Snapshot name: `Pre-Migrations-003-011-20260901T081328Z`.
- Snapshot ID: `f8dcd2e7-825e-41de-8394-d25bb125885d`.
- External snapshot ID: `vs_1788250411822_68ql429lhwk98wn2`.
- Request time: `2026-09-01T08:13:28.851Z`.
- Railway creation time: `2026-09-01T08:13:31.866Z`.
- Completion/availability observed: `2026-09-01T08:14:33.7054495Z`.
- Referenced size: 1,133 MB.
- Source volume capacity: 50,000 MB.
- Incremental `usedMB`: not yet reported; Railway documents that incremental
  size can be cached/stale for hours.
- Expiry: none reported for this manual snapshot.
- Final state: AVAILABLE in the authoritative
  `volumeInstanceBackupList`, stable across repeated observations, with a
  distinct backup ID/external ID and referenced size. The backup object schema
  exposes no separate status field.

The create mutation returned workflow ID
`createVolumeInstanceBackup/71905c96-7499-470a-bb63-b8866048ef25`.
`workflowStatus` was not authorized for this account token, so it was not used
as evidence. A mere workflow request was not accepted as completion; only the
new stable backup-list object was accepted. Railway exposes the corresponding
`volumeInstanceBackupRestore` mutation for this backup and volume instance.
Restore was not invoked against production.

Recovery path: select snapshot
`f8dcd2e7-825e-41de-8394-d25bb125885d` for the same project/environment;
Railway stages a replacement volume and requires review/deploy to complete a
restore. Any restore remains a separately authorized recovery action.

## Complete fresh production preflight after snapshot

Result: `PREFLIGHT_PASS`

- Live `/health`: `ok=true`, service `crewbiq-orchestrator`, version `0.1.0`,
  `env=production`.
- Database: `railway`, PostgreSQL `18.6`, primary/non-standby.
- Production orchestrator revision remained deployment
  `adeeb19b-4178-4e28-bc44-9358b153a538` before quiescence work.
- Production PWA remained deployment
  `0b129997-0a83-4311-bf6d-d85078a7f728`, commit
  `86b8b4dd7e9496833a021319167589b49f0ac418`.
- Applied migration names remained exactly `001_init`, `002_business`,
  `003_pay_config`, `004_auth`, `004_fleet_restore_config`, and
  `005_auth_owner_mappings`, all with status `applied`.
- Pending set remained exactly the authorized eight-file sequence.
- `007-011` target objects remained absent. Equivalent `003/004/006` DDL
  remained present but untracked by those migration names.
- Counts remained: 1 auth user, 1 owner mapping, 2 roles, 7 trucks,
  9 deduction templates, 16 weekly deductions, 11 service logs, and
  13 migration ledger rows.
- Identity, mapping, role, owner-coverage, and Truck/VIN risk aggregates all
  remained clean and matched the accepted readiness evidence.
- All eight SHA-256 values matched the accepted evidence exactly.
- Exact order remained:
  `003_effective_dated_deductions -> 004_service_invoice_lineage -> 006_truck_vin -> 007_identity_workspace -> 008_canonical_company_truck -> 009_canonical_claim_approval -> 010_driver_truck_assignments -> 011_account_driver_links`.
- Rollback remained the single runner transaction before commit and snapshot
  `f8dcd2e7-825e-41de-8394-d25bb125885d` after commit.

## Write-quiescence blocker

Result: `PRODUCTION_VALIDATION_BLOCKED`

The accepted plan required the sole production orchestrator replica to stop
before migration while the PostgreSQL service remained running.

Commanded through Railway CLI `5.27.0` with exact project, production
environment, service, and region selectors: service scale `sfo=0`.

Railway returned `{"regions":{"sfo":null}}` and created configuration
deployment `d0b20599-112d-4cfe-8b77-fc84b8a76244`. That deployment reached
SUCCESS, but authoritative service state remained continuously:

- configured replicas: 1;
- running replicas: 1;
- total replicas: 1.

The state was polled from `2026-09-01T08:16:03Z` through
`2026-09-01T08:18:01Z`. It never reached `running=0`; therefore write
quiescence was not achieved. The configuration deployment did not stop the old
runtime and introduced no code revision.

Stop-on-first-failure was applied immediately:

- migration runner invocation: NONE;
- production schema/data mutation: NONE;
- migration ledger mutation: NONE;
- orchestrator code deployment: NONE;
- PWA deployment: NONE;
- ad-hoc `railway down`, service deletion, maintenance implementation, or
  table-lock workaround: NONE.

The fresh snapshot remains available, but a later resume must repeat the full
preflight because production state can change. The next coordinator decision
must specify an exact supported write-quiescence mechanism rather than treating
the unsuccessful scale request as sufficient.
