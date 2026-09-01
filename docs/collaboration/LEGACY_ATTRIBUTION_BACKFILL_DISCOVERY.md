# Legacy Attribution Backfill — Dry-Run Discovery

Status: DISCOVERY ONLY — NO MUTATION, NO EXECUTION AGAINST LIVE DATA

Prepared by: Claude (implementer role, per role-swap effective 2026-09-01)

Scope: read-only schema/code analysis per `IDENTITY_ATTRIBUTION_CONTRACT.md`'s
bounded step **4B.1b.4 — Legacy attribution tooling: dry-run inventory,
`PROVEN`-only idempotent backfill, ambiguous/unresolvable queues, audit export,
and rollback metadata.** This document covers only the dry-run inventory
design. No backfill write, migration, deployment, or production/staging data
access was performed — I do not hold Railway/database credentials in this
session; only GitHub repository read access was used.

## 1. Legacy schema inventory (source: orchestrator migrations 001–002, main)

Tables holding legacy, pre-canonical Load/PTI/Truck data:

| Table | Driver identity today | Truck identity today | Canonical FK present? |
| --- | --- | --- | --- |
| `driver_loads` | `crewbiq_id`, `crew_id`, `driver_email`, `driver_name` (denormalized) | `unit_number` (text, no FK) | None |
| `pti_log` | `crewbiq_id`, `crew_id`, `driver_email`, `driver_name` | `unit_number` (text, no FK) | None |
| `fleet_loads` | `driver_crewbiq_id`, `driver_name` | `truck_id` (text, references legacy `trucks.truck_id` by convention, no FK constraint) | None |
| `trucks` | n/a | `truck_id` (stable local text ID, e.g. `t_...`) | n/a |

None of these tables carry a `driver_id` (roster `fleet_driver_profiles.driver_profile_id`)
or a constrained `truck_id` FK today. All identity is denormalized text
(`crewbiq_id`, `unit_number`, `driver_name`) — exactly the shape
`IDENTITY_ATTRIBUTION_CONTRACT.md` requires proof before trusting.

## 2. Canonical evidence sources available for classification (source: migrations 007–011, accepted branch)

| Source | What it proves | Constraint |
| --- | --- | --- |
| `account_driver_links` | Which `driver_profile_id` an authenticated Account (`crewbiq_id`) resolves to, for an effective interval, within one workspace | One active link per Account per workspace (partial unique index) |
| `driver_truck_assignments` | Which `driver_profile_id` was assigned to which `trucks.truck_id`, for an effective interval | **Currently contains zero historical rows in every environment this track has touched — the schema was deployed additively with no backfill of assignment history** |
| `fleet_driver_profiles` | Driver roster entity, `owner_crewbiq_id` | Legacy table, already exists, no canonical ID beyond `driver_profile_id` itself |
| `trucks` | Truck's own stable `truck_id`, `owner_crewbiq_id` | Legacy table; `driver_truck_assignments.truck_id` references this natural key directly (confirmed by reading `010_driver_truck_assignments.sql` — no separate `canonical_trucks.id` indirection for this specific FK) |

## 3. Key finding: the assignment-history gap, not data ambiguity, is the current bottleneck

Per `IDENTITY_ATTRIBUTION_CONTRACT.md`'s classification rules, a record's
`truckId`/`driverId` may only become `PROVEN` via "one deterministic
authorized relation/effective assignment [that] matches the record event time
with no conflicting evidence" — explicitly **not** via matching unit number,
current assignment, or any inference ("Single available Driver/truck, current
assignment, matching name/email/unit, role, likely route, or array order never
upgrades a record to `PROVEN`").

Because `driver_truck_assignments` has never been backfilled with historical
rows (only the schema exists, confirmed empty at every staging/production
readiness check performed earlier in this track), **no existing legacy
Load/PTI record can currently satisfy the `truckId` `PROVEN` test via that
table**, regardless of how clean the underlying `unit_number` data is. This is
a real constraint discovered by inspection, not an assumption: the classifier
described below will return `AMBIGUOUS` or `UNRESOLVABLE` for `truckId` on
essentially the entire legacy corpus until a **separate, explicitly-scoped
decision** is made about whether historical assignment intervals themselves
will ever be backfilled (a decision this document does not make and is out of
scope for a read-only discovery step).

`driverId` classification is less constrained: `account_driver_links` can
independently prove which `driver_profile_id` a `crewbiq_id` resolves to for
an effective interval, without needing assignment history — so `driverId` may
reach `PROVEN` today for records whose `crewbiq_id` has a stable, dateable
`AccountDriverLink` covering the record's event time, even while `truckId`
cannot.

## 4. Proposed dry-run classification query (design only — not executed)

For `driver_loads` (the same shape applies to `pti_log` with `pti_date`
substituted for `pickup`, and to `fleet_loads` with `driver_crewbiq_id`
substituted for `crewbiq_id`):

```sql
-- Read-only. Produces counts only; writes nothing.
with candidate as (
  select
    dl.record_id,
    dl.crewbiq_id,
    dl.unit_number,
    dl.pickup as event_date,
    (
      select adl.driver_profile_id
        from account_driver_links adl
        join auth_users au on au.crewbiq_id = dl.crewbiq_id
        join person_accounts pa on pa.auth_user_id = au.id
       where adl.person_id = pa.person_id
         and adl.effective_from <= dl.pickup
         and (adl.effective_to is null or adl.effective_to > dl.pickup)
    ) as candidate_driver_ids -- aggregate/count distinct in the real query;
                              -- more than one distinct value => AMBIGUOUS
  from driver_loads dl
)
select
  count(*) filter (where candidate_driver_ids is not null)  as driver_id_proven_candidates,
  count(*) filter (where candidate_driver_ids is null)      as driver_id_unresolved,
  count(*)                                                   as total_legacy_loads
from candidate;
```

This is a sketch, not a final tool: the real implementation must (a) detect
and separately count the `AMBIGUOUS` case (more than one candidate resolves
for the same record), (b) apply the identical pattern to `pti_log` and
`fleet_loads`, and (c) compute the `truckId` side of the query against
`driver_truck_assignments` — which, per Section 3, is expected to return
`unresolved` for effectively the entire corpus until assignment history is
addressed.

## 5. What this discovery does NOT do

- No query above has been executed against staging or production data. This
  session's implementer role has GitHub repository access only, not
  Railway/database credentials.
- No `driverId`/`truckId` column, backfill write, or migration was added to
  any table.
- No legacy business record was read, exported, or modified.
- No production or staging action, deployment, or data mutation occurred.

## 6. Recommended next bounded step

Whoever holds staging read access should execute the Section 4 query pattern
(completed for all three domains: `driver_loads`, `pti_log`, `fleet_loads`)
against the staging database only, read-only, and report the exact
`PROVEN` / `AMBIGUOUS` / `UNRESOLVABLE` counts per domain. That result — not
this design alone — is what would let a Product Owner decide whether the
`driver_truck_assignments` historical-backfill question (Section 3) needs to
be resolved before any `PROVEN`-only backfill tooling is built, or whether
`driverId`-only backfill (leaving `truckId` unresolved) is an acceptable first
increment.

No backfill implementation, migration, or data mutation is proposed or
authorized by this document.
