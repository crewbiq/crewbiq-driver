# CrewBIQ Production Validation Evidence

Date: 2026-09-01

Result: **PRODUCTION_VALIDATION_BLOCKED / PREFLIGHT STOP**

This document records the production preflight performed under explicit Product
Owner authorization for production deployment and exact migrations
`010_driver_truck_assignments.sql` and `011_account_driver_links.sql`. No
production mutation occurred.

## 1. Exact production targets

| Component | Production target | Pre-rollout artifact |
| --- | --- | --- |
| Orchestrator | Railway project `happy-sparkle`, environment `production`, service `crewbiq-orchestrator` | deployment `adeeb19b-4178-4e28-bc44-9358b153a538`, commit `8bc3214070670d79b5d1f8c419b2a992991b9024` |
| PostgreSQL | project `happy-sparkle`, environment `production`, service `Postgres-IFbZ`, database `railway` | volume `postgres-volume-7PVl`, state `READY` |
| Driver PWA | Railway project `imaginative-flow`, environment `production`, service `crewbiq-driver` | deployment `0b129997-0a83-4311-bf6d-d85078a7f728`, commit `86b8b4dd7e9496833a021319167589b49f0ac418` |

These project, environment, service and database identities differ from the
validated staging targets. Production health before rollout was HTTP 200 at
`/health`, reporting `env=production`. The old production runtime does not yet
expose `/ready`; that path returned HTTP 404.

## 2. Authorized migration artifacts

The locally inspected files are the same accepted files validated in staging.
Both are additive: they create new tables, indexes, functions and integrity
triggers; they contain no legacy backfill or destructive table/column DDL.

```text
010_driver_truck_assignments.sql
SHA-256 c890905446f2b06d3d4d273ec1bc9d20c4eddd40d382331e9f0fad9da3a5bd91

011_account_driver_links.sql
SHA-256 2f055b2f3d7bbe0378d82a909622bb24e92471c0494d3f64dda3db9080edd737
```

## 3. Production migration state

Distinct applied repository migrations:

```text
001_init.sql
002_business.sql
003_pay_config.sql
004_auth.sql
004_fleet_restore_config.sql
005_auth_owner_mappings.sql
```

Actual pending set:

```text
003_effective_dated_deductions.sql
004_service_invoice_lineage.sql
006_truck_vin.sql
007_identity_workspace.sql
008_canonical_company_truck.sql
009_canonical_claim_approval.sql
010_driver_truck_assignments.sql
011_account_driver_links.sql
```

The actual pending set is not the authorized exact set 010-011. The production
database also lacks `workspaces`, which migration 010 references directly.
Applying 010-011 alone would therefore be invalid and the canonical runner
would apply six unauthorized migrations first.

Pre-migration target-table state:

```text
driver_truck_assignments: absent
account_driver_links: absent
workspaces: absent
```

Existing aggregate record counts were captured read-only:

```text
auth_users: 1
fleet_driver_profiles: 4
trucks: 7
migration_runs rows: 13
```

## 4. Backup and recovery gate

The production PostgreSQL volume is `READY`, has 50 GB capacity and
approximately 1.13 GB in use. Railway supports manual/scheduled volume
snapshots and portable logical `pg_dump` recovery. The intended pre-migration
logical dump was not started because the pending-set gate failed before any
mutation. No backup is required to recover from this attempt because nothing
was changed.

References:

- https://docs.railway.com/guides/postgres-backups-restores
- https://docs.railway.com/volumes/backups

## 5. Failure policy result

The rollout stopped at the first material production failure: unexpected
pending migrations and a missing required prerequisite schema.

Not performed:

- migrations 010-011 or any other migration;
- orchestrator production deployment;
- PWA production deployment;
- production smoke involving authentication or record creation;
- production data mutation, backfill, cleanup, merge or rollback.

Rollback is not needed because production application revisions, schema and
data remain unchanged.

## 6. Decision required

Authorize a separate production prerequisite-migration readiness and validation
plan for these six unapplied files before reconsidering 010-011:

```text
003_effective_dated_deductions.sql
004_service_invoice_lineage.sql
006_truck_vin.sql
007_identity_workspace.sql
008_canonical_company_truck.sql
009_canonical_claim_approval.sql
```

Until then, production rollout remains paused.
