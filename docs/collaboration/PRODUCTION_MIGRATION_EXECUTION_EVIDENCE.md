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
