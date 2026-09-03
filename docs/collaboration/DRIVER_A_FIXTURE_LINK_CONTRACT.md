# Proposed single-row synthetic Driver A link

Status: PROPOSED / AWAITING CLAUDE REVIEW
Execution authorization: NOT GRANTED BY THIS DOCUMENT
Scope: one staging AccountDriverLink only, after independent review and explicit bounded execution authorization.

## Basis

Discovery: `be082771d3b60af13ff71d097f94e31dcbd29787`.
Independent acceptance: `d3896910345b86ff57d2067066c389432973215b`.
Source inspected: orchestrator `ce5a591a48f1733b4e21128dece0e0350ace41c2`,
`app/testing/e2e_provisioning.py::_IDENTITIES`, `_fixture_plan`, and
`migrations/011_account_driver_links.sql`.

Driver A exists with a driver-only membership and no link. The existing
version-controlled generation staging-20260714 defines an active Fleet A
Driver and Truck in tenant A. This proposal deliberately designates that
synthetic Driver as the test subject for Driver A. It is a NEW explicit test
relationship, not a deduction of real identity from names, Truck ownership,
shared workspace, Fleet A's link or historical business records.

Independent review must explicitly accept this subject designation. If it is
not appropriate, return NEEDS_FIX with a replacement fixture design; do not
silently choose another existing Driver or create one during execution.

## Exact proposed record

| Field | Proposed value |
| --- | --- |
| id | f6c7e85d-5f8c-4df0-b43b-20d51b7a9301 (new reserved fixture ID, not an observed row) |
| workspace_id | 243289f3-7da8-881d-7773-7dfea2083863 |
| account_id | CBQ-E2E-DRIVER-A |
| driver_id | e2e-staging-20260714-fleet-a-driver-active |
| status | active |
| effective_from | T, captured once from the database during the authorized transaction |
| effective_to | null |
| provenance_source | explicit |
| attributed_by_account_id | CBQ-E2E-FLEET-A, proposed synthetic fixture sponsor |
| attributed_at | T |
| reason | DRIVER-OWN-CURRENT-01 explicit synthetic Driver A subject designation; include accepted contract SHA, execution approval reference and actual executor Codex |
| schema_version | 1 |

The sponsor field is an explicit fixture convention to be approved, not a
claim that a Fleet A user logged in or performed the operation. Execution
evidence must name the real automation executor and delegated authorization.
Do not forge a session or reset/retrieve Fleet A credentials to implement it.

## Target and atomic guards

Use only Railway project 89eb12bf-57ee-4228-a841-4008ef7a0e59, environment
ce5fe955-2a0c-4fba-8d57-571acbf7bded, Postgres service
59601072-9820-4404-af50-d47e8f2c335c, database railway, schema public.
Production or ambiguous service identity aborts before a write.

1. Revalidate all targets inside one transaction. Lock the exact subject Account, canonical Person/membership/role and workspace rows against concurrent changes. Require one active Account with expected synthetic nickname, one active default driver-only membership in the exact workspace, no effective_to and active Person/workspace. Existing legacy roles do not grant permission.
2. Validate Fleet A sponsor Account and active Fleet membership in that same workspace without modifying them. Record the actual executor separately as described above.
3. Lock exact Driver and Truck rows; require each exactly once, active, with owner CBQ-E2E-TENANT-A and exact generated display names E2E-staging-20260714-FLEET-A-DRIVER-ACTIVE and E2E-staging-20260714-FLEET-A-TRUCK-ACTIVE. Required Truck ID: e2e-staging-20260714-fleet-a-truck-active. Driver's stored fixture truck_id must match. These predicates verify the designated synthetic records, not infer the subject mapping.
4. Require exactly one non-revoked, currently effective canonical DriverTruckAssignment for the chosen Driver/workspace, pointing to that exact Truck, with independently established protected-fixture provenance. Lock it and snapshot its exact fields. Abort on malformed/ambiguous/inconsistent assignment; create no assignment.
5. Acquire the same transaction advisory lock used by migration 011: hashtextextended('account-driver-link:' || workspace_id || ':' || account_id, 0). Require zero links of ANY status for Driver A and zero rows at the reserved UUID before first insertion. Abort on conflicting history rather than deleting, closing or overwriting it.
6. Snapshot Fleet A's existing link d5f4db9b-e2c8-5a5b-9e5e-9bbce2f67d5f and the canonical assignment. Do not copy, update or replace their rows. The new link is distinct and belongs to Driver A.
7. Insert only the record specified above, with T from the transaction. Require INSERT 1 and RETURNING exact values. Existing database FK/check/trigger enforcement stays enabled. On any failed guard or SQL error, rollback the transaction and stop; no repair, retry with different IDs or upsert.
8. Before commit, verify Driver A has exactly one effective link with the reserved ID and exact marker, and that the protected Fleet A link/assignment snapshots are unchanged. Record only redacted fixture IDs, counts and provenance; no credentials or unrelated row contents.

Migration 011 enforces active-link overlap per workspace+Account, not per
Driver across different Accounts. Thus this proposal can coexist structurally
with Fleet A's link without borrowing that Account's authority. Schema
permissibility alone does NOT approve subject semantics; review does that.

## Rerun and rollback

A rerun may return ALREADY_APPLIED only if the sole Driver A row exactly
matches the reserved ID, accepted subject, all marker/actor/status fields and
the original recorded T. It must not refresh timestamps or update a row. Any
other match/count is a conflict and aborts without mutation.

Rollback is not implicitly authorized. If separately requested, remove only
the newly created synthetic link after matching UUID, workspace, Account,
Driver, all provenance fields and original T exactly; require one row and no
unexpected downstream references/new fixture use. Require DELETE 1 in a
transaction; otherwise abort. Never delete Fleet A's original link, Driver,
Truck, membership or assignment. Record the exact rollback result and preserve
the execution evidence. No bulk cleanup or cascade.

## Validation before any staging write

Implement a bounded fixture procedure and run it first against disposable
PostgreSQL with real migration 011 constraints. Prove dry-run is write-free;
zero/multiple/mismatched targets, role drift, bad provenance, UUID collision,
existing Driver A history, ambiguous assignment and concurrent attempts all
fail safely; successful apply inserts exactly one; rerun makes zero changes;
rollback affects only the new row. No new schema, app runtime or deployment.

This contract is not an instruction to execute the general provisioning
module, whose scope includes multiple Accounts and business fixtures.
No login, browser journey, secret handling or harness correction is included.
Once separately implemented, validated, reviewed and authorized, publish
redacted before/after evidence and hand back to Claude.

Complete second-Driver/cross-workspace fixtures, IA-3 harness compatibility,
authenticated browser/mobile/offline evidence and
CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remain separate gaps.
NOT_READY_FOR_PRODUCTION. No data mutation occurred while writing this plan.
