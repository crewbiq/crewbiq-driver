# Slice 4B.1b.3 - Effective-Dated DriverTruckAssignment Discovery

Status: DISCOVERY COMPLETE / READY FOR INDEPENDENT REVIEW  
Scope: documentation and coordination only  
Runtime, UI, migration, merge, and deployment changes: NONE

## Purpose

Define the smallest safe server-owned foundation for historical Driver-to-Truck attribution without treating mutable legacy profile fields as canonical history.

This document refines the `DriverTruckAssignment` direction in `IDENTITY_ATTRIBUTION_CONTRACT.md`. Existing CrewBIQ business logic, canonical identifiers, workspace authorization, and server architecture remain authoritative.

## Evidence and current state

- The orchestrator has no dedicated Driver-to-Truck assignment relation.
- `fleet_driver_profiles.driver_profile_id` is the stable roster Driver identifier used by the authorized workspace roster.
- `fleet_driver_profiles.truck_id` and `team_driver` are mutable current-configuration fields. They cannot prove who was assigned to a Truck at an earlier time.
- The PWA's `driverProfiles[].truckId` and `teamMateDriverId` are likewise current configuration, not historical truth.
- Legacy Driver and Truck rows are scoped by `owner_crewbiq_id`, while canonical authorization is scoped by `workspaces.id`.
- The current compatibility bridge is `workspaces.legacy_owner_crewbiq_id` to the legacy Driver/Truck owner key.
- Existing canonical relationship commands derive capabilities from active workspace membership, require idempotency keys, and append immutable relationship audit events.

## Proposed server-owned relation

Conceptual shape only; no migration is authorized in this slice.

| Field | Contract |
| --- | --- |
| `id` | Server-generated stable UUID for the assignment record. |
| `workspaceId` | Canonical `workspaces.id`; mandatory authorization and isolation boundary. |
| `driverId` | Stable `fleet_driver_profiles.driver_profile_id`; never inferred from Account, Crew, Truck, or display name. |
| `truckId` | Stable `trucks.truck_id`; never selected by list order or inferred from Driver. |
| `effectiveFrom` | UTC timestamp, inclusive. |
| `effectiveTo` | UTC timestamp, exclusive; `null` means open-ended. |
| `assignmentType` | `solo`, `team`, `temporary`, or `other`. |
| `status` | `active`, `closed`, or `revoked`. |
| `version` | Positive optimistic-concurrency version. |
| `createdAt` / `updatedAt` | Server timestamps. |
| `createdByAccountId` | Internal authenticated actor identifier; not exposed as a public Driver identity. |
| `provenance` | Evidence type, evidence identifier, and schema version when available. |
| `reason` | Required for close, revoke, or correction commands. |

The effective interval is always half-open: `[effectiveFrom, effectiveTo)`. Adjacent assignments where one ends exactly when the next begins do not overlap.

## Workspace integrity

Every read and command must derive the authorized Workspace from the canonical session and active membership. Client-supplied `workspaceId` may narrow a request but may never grant access.

The server must prove, in the same transaction, that:

- the Driver exists and belongs to the authorized Workspace;
- the Truck exists and belongs to the authorized Workspace; and
- the assignment row's `workspaceId` equals that authorized Workspace.

The current legacy tables do not carry canonical `workspace_id`. A foreign key proving only that `driverId` or `truckId` exists is insufficient. Until those entities are workspace-native, the proof must use the established bridge:

`workspaces.legacy_owner_crewbiq_id = fleet_driver_profiles.owner_crewbiq_id = trucks.owner_crewbiq_id`

Missing, malformed, ambiguous, inactive, or cross-workspace source rows fail closed. No AccountDriverLink inference, local-profile fallback, first-record fallback, or name matching is allowed.

## Overlap and team-operation rules

The database and command service must evaluate non-revoked intervals, including open-ended intervals, transactionally.

| Situation | Result |
| --- | --- |
| Same Driver overlaps assignments to different Trucks | Reject. A Driver cannot be canonically assigned to two Trucks at the same instant. |
| Same Truck has overlapping `solo` plus any other assignment | Reject. |
| Same Truck has overlapping assignments and every overlap is `team` | Allow. This is the approved team-operation case. |
| Same Truck has overlapping `temporary` or `other` assignments | Reject unless a later product contract explicitly defines compatible overlap semantics. |
| Exact duplicate command retried with the same idempotency key and payload | Replay the original result. |
| Same idempotency key used with different payload | Reject as an idempotency conflict. |
| New interval begins exactly at an existing interval's exclusive end | Allow if all other rules pass. |

No maximum team size is invented here. If a finite team-size limit is required, that is a separate product-policy decision; absence of such a limit does not permit cross-workspace or mixed-type overlap.

Concurrent commands must serialize conflict checks for the affected Driver and Truck. Application-only prechecks without a database-enforced transaction boundary are insufficient.

## Read contract

The future server foundation should expose read-only projections through existing orchestrator transport and auth conventions:

- current assignments for the authorized Workspace;
- assignment history for a proven Driver within that Workspace;
- assignment history for a proven Truck within that Workspace; and
- an `asOf` projection using `effectiveFrom <= asOf` and `effectiveTo is null or asOf < effectiveTo`.

Reads must return stable IDs, normalized UTC timestamps, deterministic ordering, and no internal Account primary keys. Empty results are valid. Malformed or contradictory active rows must not be silently resolved by first-row selection; the affected projection fails closed and reports a server-owned error.

## Mutation contract

Mutation implementation is not authorized in this discovery slice. A later bounded server slice must use existing canonical command conventions:

- authenticate through the canonical session;
- authorize the active Workspace and a server-derived assignment-management capability;
- forbid extra request fields;
- require an idempotency key;
- validate expected version where an existing relation is affected;
- validate Driver, Truck, Workspace, interval, and overlap rules inside one transaction;
- append an immutable audit event containing actor, Workspace, action, reason, and before/after references; and
- never hard-delete or overwrite historical intervals.

Reassignment closes the previous interval and inserts a new assignment. Revocation preserves the relation and evidence. Corrections must be audit-preserving commands, not direct row edits.

The exact capability name and role mapping must be added deliberately to the orchestrator's server-owned capability vocabulary. Client-provided roles or capabilities are never trusted.

## Legacy current projections

After the canonical relation is implemented and accepted, mutable fields such as `fleet_driver_profiles.truck_id`, `team_driver`, PWA `driverProfiles[].truckId`, and `teamMateDriverId` may remain compatibility projections of the current effective relation only.

They must not be used to reconstruct assignment history. This discovery authorizes no dual-write. A later integration contract must choose one transactional projection mechanism, define rebuild and drift detection, and keep `DriverTruckAssignment` authoritative.

## Failure model

- Missing session or active Workspace: fail closed.
- Missing assignment-management capability: fail closed.
- Unknown, inactive, malformed, or cross-workspace Driver/Truck: fail closed.
- Ambiguous legacy-owner-to-Workspace mapping: fail closed.
- Overlap-rule violation or stale version: fail closed.
- Canonical relation schema unavailable: return a bounded service-unavailable error; do not fall back to mutable profile fields.
- Reads never mutate; failed commands leave no partial assignment or projection update.

## Required tests for a future implementation

- authorized and unauthorized Workspace reads;
- cross-workspace Driver and Truck rejection;
- empty, single, and multiple assignment histories;
- inclusive `effectiveFrom` and exclusive `effectiveTo` boundaries;
- open-ended current assignment resolution;
- same-Driver overlap rejection;
- solo/mixed overlap rejection on one Truck;
- team/team overlap acceptance on one Truck;
- malformed and contradictory rows fail closed;
- deterministic IDs and ordering;
- idempotent replay and conflicting-key rejection;
- optimistic-concurrency conflict;
- immutable audit event creation;
- no mutation on validation or authorization failure; and
- no derivation from AccountDriverLink, local Driver profiles, Truck order, or names.

## Readiness and blockers

Discovery readiness: `READY_FOR_INDEPENDENT_REVIEW`.

Runtime readiness: `NOT_READY_FOR_DRIVER_TRUCK_ASSIGNMENT_RUNTIME`.

Technical blockers to close in bounded server work:

1. `WORKSPACE_NATIVE_RELATION_SCHEMA_MISSING` - no assignment table or interval constraints exist.
2. `LEGACY_ENTITY_WORKSPACE_PROOF_REQUIRED` - Driver and Truck tables use legacy owner keys rather than canonical `workspace_id`.
3. `ASSIGNMENT_CAPABILITY_NOT_DEFINED` - the server capability vocabulary has no DriverTruckAssignment command capability.
4. `TRANSACTIONAL_OVERLAP_ENFORCEMENT_MISSING` - team-compatible and conflicting intervals are not yet serialized or constrained.
5. `CURRENT_PROJECTION_STRATEGY_UNDEFINED` - legacy mutable fields cannot be dual-written until atomicity, rebuild, and drift handling are specified.

None of these blockers requires changing current PWA behavior during discovery.

## Safest next bounded slice

After independent acceptance, implement an orchestrator-only foundation slice containing:

- the workspace-scoped effective-dated relation schema;
- database-supported interval and workspace-integrity enforcement;
- authorized current/history/as-of reads; and
- focused server tests.

Exclude mutations, legacy projection writes, PWA/UI integration, data migration, merge, and deployment. Mutation capability, commands, audit integration, and projection strategy should follow only after the read foundation is independently accepted.
