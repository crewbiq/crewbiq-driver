# Production Prerequisite Migration Readiness

## Result

`PRODUCTION_PREREQUISITE_MIGRATION_READINESS_PASS`

This is read-only production validation evidence. No production migration,
deployment, data mutation, merge, cleanup, or legacy backfill was performed.

Validated orchestrator revision: `27e3463220a2022ea1adf074d7131ec69eb32fe5`

## Production schema trace

- Target: Railway production PostgreSQL service `Postgres-IFbZ`, database
  `railway`, PostgreSQL `18.6`.
- Existing successful legacy migration names are `001_init.sql`,
  `002_business.sql`, `003_pay_config.sql`, `004_auth.sql`,
  `004_fleet_restore_config.sql`, and `005_auth_owner_mappings.sql`.
- The current runner recognizes only `migration_runs.status = 'applied'`.
  Existing legacy records therefore do not mark the prerequisite files as
  applied.
- DDL equivalent to `003_effective_dated_deductions.sql`,
  `004_service_invoice_lineage.sql`, and `006_truck_vin.sql` already exists in
  production, including their columns and indexes, but their migration names
  are not recorded as applied.
- `persons`, `person_accounts`, `workspaces`, `workspace_memberships`,
  `membership_roles`, the canonical Company/Truck objects, canonical claim
  objects, `driver_truck_assignments`, and `account_driver_links` do not exist.
- Production row counts relevant to risk are: 1 auth user, 1 owner mapping,
  2 role rows, 7 trucks, 9 deduction templates, 16 weekly deductions, and
  11 service logs.
- Identity preconditions are clean: no blank CrewBIQ ID, email, owner mapping,
  role CrewBIQ ID, truck ID, or truck owner; no duplicate role/mapping pairs;
  one mapping per account.
- All seven trucks belong to the one covered owner. Six produce private
  Company candidates, two have syntactically plausible VINs, five produce
  private Truck candidates, and there are no duplicate normalized VIN groups.

No equivalent `007-011` objects were found outside migration tracking.

## Per-migration classification

### 003_effective_dated_deductions: READY

- Prerequisites: existing `deduction_templates` and `weekly_deductions`.
- Objects: nullable policy/truck/unit/company/effective-date columns; JSON
  payload and `updated_at` columns with defaults; three template indexes; one
  weekly-deduction index plus company/payload/update columns.
- Behavior: additive. It contains no explicit data backfill, FK, uniqueness,
  destructive DDL, or new business-row mutation.
- Existing rows: defaults would populate new non-null columns on a genuinely
  old schema. Production already has equivalent columns/indexes, so execution
  is an idempotent DDL no-op followed by one `applied` ledger row.
- Lock/rewrite risk: `ALTER TABLE` takes metadata locks. A table rewrite could
  matter on an old schema because of defaults, but is not expected against the
  traced production schema. Tables contain only 9 and 16 rows.
- Re-run: column/index `IF NOT EXISTS`; runner skips after the first `applied`
  ledger row.
- Recovery: transaction rollback before commit; after commit use forward fix
  or restore the required pre-migration backup rather than destructive column
  removal.
- Later dependency: none of `007-011` depends on these deduction fields.

### 004_service_invoice_lineage: READY

- Prerequisite: existing `service_logs`.
- Objects: nullable invoice/source/unit/vendor/location/numeric lineage fields;
  non-null JSON arrays/objects and `updated_at`; partial unique source-invoice
  index and invoice lookup index.
- Behavior: additive. New source keys are null for existing rows, so the
  partial unique index cannot reject the 11 existing rows.
- Production already has the equivalent columns and indexes, making execution
  an idempotent DDL no-op plus one ledger row.
- Lock/rewrite risk: metadata lock only on the traced schema. An actually old
  schema could rewrite defaults; that is not the production state observed.
- Re-run/recovery: `IF NOT EXISTS`, transactional rollback before commit, then
  forward fix or backup restore after commit.
- Later dependency: no direct DDL dependency from `007-011`.

### 006_truck_vin: READY

- Prerequisite: existing `trucks`.
- Objects: nullable `trucks.vin` and a partial non-unique VIN index.
- Behavior: additive, with no backfill, uniqueness, FK, or NOT NULL constraint.
- Production already has the exact nullable column/index; execution is a no-op
  plus one ledger row.
- Re-run/recovery: `IF NOT EXISTS`, transactional rollback, then forward fix or
  backup restore.
- Later dependency: `008` reads `trucks.vin` to create pending canonical Truck
  proposals or unresolved private candidates.

### 007_identity_workspace: READY_WITH_PRECONDITIONS

- Prerequisites: `auth_users`, `auth_owner_mappings`, and `user_roles`, with
  nonblank stable CrewBIQ/owner IDs and at most one owner mapping per account.
- Objects: `persons`, `person_accounts`, `workspaces`,
  `workspace_memberships`, `membership_roles`, their FKs, uniqueness rules,
  checks, and active/default indexes.
- Backfill: deterministic MD5-derived UUIDs create one Person/account link,
  one workspace for the effective owner, one default active membership, and
  two membership-role rows for the traced production state.
- Existing legacy rows are not altered. `ON CONFLICT (id) DO NOTHING` makes the
  deterministic inserts safe to repeat after a fully successful application.
- Risks: uniqueness/FK checks can reject changed owner/account/role data. Re-run
  the aggregate identity preflight immediately before execution and quiesce
  identity writes for the migration transaction.
- Recovery: the runner transaction rolls back all objects/backfill on failure.
  After commit prefer forward correction or full pre-migration backup restore;
  no destructive down migration is approved.
- Later dependency: `workspaces` is required by `008`, `009`, `010`, and `011`;
  memberships/person accounts are required by canonical authorization and
  AccountDriverLink constraints.

### 008_canonical_company_truck: READY_WITH_PRECONDITIONS

- Prerequisites: `007` workspace identity plus `006` VIN and legacy `trucks`.
- Objects: `companies`, `company_authorities`, `company_candidates`,
  `canonical_trucks`, `truck_candidates`, `legacy_record_links`, constraints,
  and lookup/partial unique indexes.
- Backfill for the traced production shape: 6 private Company candidates,
  2 distinct pending canonical Truck proposals, 5 private Truck candidates,
  and 13 auditable legacy links. No Company is verified, no candidate is
  resolved, and no Truck is merged by unit, plate, name, or duplicate text.
- Risks: inserts require every truck owner to resolve to a workspace. Concurrent
  legacy Truck writes between statements could produce an incomplete snapshot;
  quiesce Truck writes for the migration transaction and repeat owner/VIN
  aggregate checks immediately before execution.
- Idempotency: deterministic IDs and conflict handling make full successful
  re-runs safe. It does not modify legacy truck rows.
- Recovery: transaction rollback before commit; afterward retain additive
  records and forward-fix, or restore the required backup.
- Later dependency: `009` references all candidate/canonical tables.

### 009_canonical_claim_approval: READY_WITH_PRECONDITIONS

- Prerequisites: `007` workspaces/auth users and all `008` canonical/candidate
  objects.
- Objects: `canonical_claim_requests`, immutable
  `relationship_audit_events`, `canonical_command_idempotency`, indexes,
  mutation-rejection function/trigger, and an expanded
  `legacy_record_links.target_entity_type` check.
- Behavior: no data backfill and no relationship creation. The migration drops
  and re-adds one check constraint in the same runner transaction; this is a
  bounded constraint replacement, not business-row deletion.
- Risks: `ALTER TABLE ... DROP/ADD CONSTRAINT` requires a strong table lock and
  validates existing link rows. Disposable replay proves all `008` rows satisfy
  the expanded check. Quiesce canonical writes and retain the transaction-wide
  maintenance window.
- Idempotency: tables/indexes use `IF NOT EXISTS`; trigger and check constraint
  are deliberately recreated. Runner skips once recorded `applied`.
- Recovery: atomic transaction rollback before commit; after commit forward fix
  or backup restore.
- Later dependency: accepted canonical claim commands and the assignment write
  path use `canonical_command_idempotency`; `010` runtime therefore depends on
  `009` even though its table DDL mainly references `007` and legacy tables.

## Exact dependency graph and safe order

Independent compatibility prerequisites:

`003_effective_dated_deductions`

`004_service_invoice_lineage`

Canonical identity/assignment chain:

`006_truck_vin -> 008_canonical_company_truck -> 009_canonical_claim_approval`

`007_identity_workspace -> 008_canonical_company_truck -> 009_canonical_claim_approval`

`007_identity_workspace -> 010_driver_truck_assignments`

`007_identity_workspace -> 011_account_driver_links`

`009_canonical_claim_approval -> accepted 010 assignment write runtime`

The exact authorized future execution order must match the repository runner:

`003_effective_dated_deductions -> 004_service_invoice_lineage -> 006_truck_vin -> 007_identity_workspace -> 008_canonical_company_truck -> 009_canonical_claim_approval -> 010_driver_truck_assignments -> 011_account_driver_links`

Do not execute selected files manually out of this order. The runner uses a
transaction-wide advisory lock and one database transaction for the sequence.

## Disposable replay evidence

- Engine: disposable local PostgreSQL `16.15`; production remains PostgreSQL
  `18.6` and was queried read-only.
- Pre-state reproduced the production ledger names, production row-count shape,
  clean identity/owner conditions, and the untracked equivalent DDL for
  `003/004/006`. Synthetic values were used; no production rows were copied.
- First current-runner execution: exit 0, 1,283 ms, all repository files
  applied atomically. This proves the equivalent `003/004/006` DDL is safe to
  re-execute before `007-011`.
- Second current-runner execution: exit 0, 510 ms, `applied=[]`; all 14 files
  reported already applied.
- Legacy-shaped counts remained 9 deduction templates, 16 weekly deductions,
  11 service logs, and 7 trucks after migration.
- Backfill counts matched the expected shape exactly: 1 Person, 1 account link,
  1 workspace, 1 membership, 2 membership roles, 6 Company candidates,
  2 pending canonical Trucks, 5 Truck candidates, and 13 legacy links.
- Claim, DriverTruckAssignment, and AccountDriverLink tables began empty.
- Targeted suite: `65 passed, 2 skipped in 3.61s`; the two skipped tests require
  the dedicated PostgreSQL env variable.
- Real PostgreSQL constraint suite: initial run exposed only a disposable-seed
  sequence mismatch; after synchronizing that synthetic sequence, unchanged
  tests passed `2 passed in 1.18s`.
- Recovery rehearsal: custom-format dump restored into a new disposable
  database; normalized schema SHA-256 matched exactly
  `e362c0ee5767f63f1a31adcd209145c93f5031c682ff0eaded77ee426fdb7628`,
  with 37 public tables, 14 applied ledger rows, and 3 expected custom triggers.

Migration file SHA-256 values:

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

## Production impact and execution preconditions

Replay duration is evidence, not a production timing guarantee. Given the
traced counts, expected impact is a short metadata/backfill transaction, but
PostgreSQL DDL locks are held until the single runner transaction commits.

Before later authorization can be executed:

1. Reconfirm the exact Railway production project, environment, service, and
   database; staging and production identifiers must be visibly distinct.
2. Recompute and match all eight file hashes above at the deployment revision.
3. Re-run applied-ledger, equivalent-object, identity, owner coverage, VIN, and
   row-count preflight queries; stop on any difference requiring analysis.
4. Confirm no unexpected migration files are pending. Run only the exact
   ordered sequence through the accepted runner.
5. Create and verify a fresh production volume snapshot or PostgreSQL 18
   logical backup before mutation. Backup capability is known, but this
   validation did not create a production backup.
6. Quiesce identity, Truck, and canonical writes for the transaction and use a
   bounded maintenance window with lock monitoring.
7. Record pre-run application revision, schema catalog, ledger, and row counts.

At the first mismatch, lock timeout, constraint failure, unexpected row count,
or object outside the stated diff, rollback the transaction and stop.

## Rollback and recovery

- Before commit: rely on the runner's single transaction; any migration failure
  rolls back the whole ordered sequence and its ledger rows.
- After commit: do not drop canonical tables or columns as an improvised
  rollback. Prefer a compatible forward fix.
- If restoration is required, restore the verified pre-migration snapshot or
  logical backup into a replacement service/database, validate counts and
  health, then switch the orchestrator connection under explicit authorization.
- Migrations have no approved destructive down scripts. Point-in-time/backup
  recovery, not manual delete/backfill, is the safe recovery boundary.

## Recommendation

Later production authorization may safely cover exactly:

`003_effective_dated_deductions`, `004_service_invoice_lineage`,
`006_truck_vin`, `007_identity_workspace`, `008_canonical_company_truck`,
`009_canonical_claim_approval`, `010_driver_truck_assignments`, and
`011_account_driver_links`

in the exact runner order above, only after every production execution
precondition passes. `003/004/006` should remain in the sequence so the runner
records the repository files as applied; they must not be manually marked or
silently omitted.

`CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED` remains queued as a coverage task and
is not silently treated as completed by this migration replay.
