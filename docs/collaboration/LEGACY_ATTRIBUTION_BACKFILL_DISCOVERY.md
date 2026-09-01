# Legacy Attribution Backfill — Dry-Run Discovery

Status: DISCOVERY ONLY — NO MUTATION. Corrected per Codex independent review
(`CLAUDE_REVIEW.md`, "2026-09-01 - Codex independent review - Legacy
Attribution Backfill Dry-Run Discovery", verdict `NEEDS_FIX`).

Prepared by: Claude (implementer role, per role-swap effective 2026-09-01).
Corrected by: Claude, incorporating Codex's independently-executed staging
dry-run counts.

Scope: read-only schema/code analysis per `IDENTITY_ATTRIBUTION_CONTRACT.md`'s
bounded step **4B.1b.4 — Legacy attribution tooling: dry-run inventory,
`PROVEN`-only idempotent backfill, ambiguous/unresolvable queues, audit export,
and rollback metadata.** This document covers only the dry-run inventory
design and Codex's measured results. No backfill write, migration,
deployment, or data mutation was performed by either agent.

## Corrections applied from the first draft

The first draft (commit `3e733021...`) contained four defects, each verified
against the actual migration source before correcting this revision:

1. **Wrong `account_driver_links` columns.** The table has `account_id`,
   `driver_id`, `workspace_id` — there is no `person_id` or
   `driver_profile_id` column on this table. The original query's join
   through `person_accounts.person_id` does not correspond to any real
   column and could not execute. Confirmed by reading
   `011_account_driver_links.sql` directly.
2. **Wrong cardinality mechanism.** Migration 011 does not use a partial
   unique index; overlap is rejected by `enforce_account_driver_link_integrity()`,
   a `BEFORE INSERT OR UPDATE` trigger under an advisory lock scoped to
   `(workspace_id, account_id)`. A single account can hold links in more
   than one workspace, so a correct classifier must treat distinct
   `(workspace_id, driver_id)` pairs as the ambiguity signal, not driver ID
   alone.
3. **Date/timestamptz mismatch.** `driver_loads.pickup`, `pti_log.pti_date`,
   and `fleet_loads.pickup` are plain `date`; canonical intervals are
   `timestamptz`. A naive comparison does not prove which instant within
   that day the event actually occurred. The correct, conservative rule is
   to require the candidate link/assignment to cover the **entire UTC day**
   of the legacy event before treating it as a match — matching unit
   number or truck text is a conflict *veto* only, never a promotion to
   `PROVEN`, exactly as `IDENTITY_ATTRIBUTION_CONTRACT.md` requires.
4. **Overgeneralized "universally empty" claim.** The first draft claimed
   `driver_truck_assignments` was empty "in every environment this track
   has touched." That was stale: this session's own earlier canonical
   staging journey work (`CANONICAL_STAGING_JOURNEY_EVIDENCE.md`)
   provisioned exactly one `account_driver_links` row and one
   `driver_truck_assignments` row in staging as a test fixture. The
   accurate claim is narrower and still true: migrations 010/011 are
   additive with **no built-in historical backfill mechanism** — any rows
   that exist came from either live application use or this track's own
   test-fixture provisioning, not from a backfill process. Row counts must
   be measured, not assumed.

## 1. Legacy schema inventory (source: orchestrator migrations 001–002, main)

Unchanged from the first draft — independently re-confirmed correct by
Codex's review, which did not flag this section:

| Table | Driver identity today | Truck identity today | Canonical FK present? |
| --- | --- | --- | --- |
| `driver_loads` | `crewbiq_id`, `crew_id`, `driver_email`, `driver_name` (denormalized) | `unit_number` (text, no FK) | None |
| `pti_log` | `crewbiq_id`, `crew_id`, `driver_email`, `driver_name` | `unit_number` (text, no FK) | None |
| `fleet_loads` | `driver_crewbiq_id`, `driver_name` | `truck_id` (text, references legacy `trucks.truck_id` by convention, no FK constraint) | None |
| `trucks` | n/a | `truck_id` (stable local text ID, e.g. `t_...`) | n/a |

## 2. Corrected canonical evidence sources

| Source | Real columns | What it proves | Cardinality mechanism |
| --- | --- | --- | --- |
| `account_driver_links` | `account_id` (→ `auth_users.crewbiq_id`), `driver_id` (→ `fleet_driver_profiles.driver_profile_id`), `workspace_id`, `effective_from`/`effective_to` | Which `driver_id` an account resolves to, per workspace, for an effective interval | `enforce_account_driver_link_integrity()` trigger + advisory lock reject overlapping *active* rows for one `(workspace_id, account_id)`; an account may still hold links across multiple workspaces |
| `driver_truck_assignments` | `driver_id`, `truck_id` (→ `trucks.truck_id` directly, confirmed by reading `010_driver_truck_assignments.sql`), `workspace_id`, `effective_from`/`effective_to` | Which Driver was assigned to which Truck, per workspace, for an effective interval | Equivalent trigger-based overlap rejection per `(workspace_id, driver_id)` and `(workspace_id, truck_id)` |

## 3. Measured staging dry-run results (executed by Codex, read-only)

Codex independently executed a corrected classifier (SHA-256
`F9177ABCB91A19CB4397B67E5B065B714FB5396A7FD2DE538FD557BED2A06FC7`) against
Railway environment `crewbiq-orchestrator-staging`, requiring full UTC-day
coverage before any `PROVEN` result:

| Domain | Total | Driver PROVEN | Driver AMBIGUOUS | Driver UNRESOLVABLE | Truck PROVEN | Truck AMBIGUOUS | Truck UNRESOLVABLE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `driver_loads` | 44,177 | 0 | 0 | 44,177 | 0 | 0 | 44,177 |
| `pti_log` | 44,183 | 0 | 0 | 44,183 | 0 | 0 | 44,183 |
| `fleet_loads` | 2 | 0 | 0 | 2 | 0 | 0 | 2 |

Before and after canonical table counts were identical
(`account_driver_links=1`, `driver_truck_assignments=1`) — the run performed
zero writes, confirmed by Codex's own before/after count comparison.

**Every legacy record in staging is currently `UNRESOLVABLE`** for both
`driverId` and `truckId`. This is not because the underlying `unit_number`/
`crewbiq_id` data is messy — it is because staging holds exactly one
`AccountDriverLink` and one `DriverTruckAssignment` row (both test fixtures
from this session's earlier canonical-journey work, not real historical
coverage), so no full-UTC-day interval currently covers any of the 44,000+
legacy event dates. The finding from the first draft — that assignment
history is the bottleneck, not data quality — holds, but is now grounded in
measured staging evidence rather than an inferred "universally empty" claim.

## 4. What this discovery does NOT do

- No `driverId`/`truckId` column, backfill write, or migration was added to
  any table.
- No legacy business record was modified. Codex's dry-run was read-only,
  proven by identical before/after canonical-table counts.
- No production action, deployment, or data mutation occurred by either
  agent.

## 5. Product Owner decision for CrewBIQ MVP

The Product Owner closed historical attribution reconstruction for the
CrewBIQ MVP release cycle. Canonical attribution applies to new records going
forward. Existing legacy records remain unchanged, and any record that cannot
be proven from authoritative effective-dated evidence is classified
`UNRESOLVABLE`.

`UNRESOLVABLE` does not mean permanently unrecoverable. Historical attribution
reconstruction is deferred to the post-production backlog and may be revisited
if future business, analytics, compliance, or audit requirements justify it.
No backfill implementation, reconstruction design, migration, production
query, or historical data mutation is authorized now.
