# Slice 4B.2 - Driver SELF UI Discovery

Status: `NOT_READY_FOR_SELF_UI_RUNTIME`  
Scope: discovery and coordination only  
Runtime, UI, migration, merge, and deployment changes: NONE

## Product sequence

The Product Owner selected this order:

1. DriverTruckAssignment client integration.
2. Driver SELF UI.
3. Legacy attribution/backfill tooling.

The first item is accepted. The Driver SELF UI must now use only the canonical evidence chain; backfill remains queued until the SELF path is proven.

## Required evidence chain

```text
authenticated server Account
  -> authorized active Workspace
  -> exactly one effective AccountDriverLink
  -> canonical roster Driver ID
  -> exactly one effective DriverTruckAssignment for that Driver
  -> canonical current Truck ID
  -> read-only SELF scope and presentation
```

Each arrow is server-authoritative. No name, email, role, local account ID, roster size, Driver order, Truck order, unit number, current profile Truck field, or Account identity alias may replace a missing relation.

## Accepted foundations

- `analytics.js` already defines fail-closed SELF outcomes: `self_not_linked`, `self_ambiguous`, and `self_unauthorized`.
- `account-driver-link.js` is an accepted disconnected client validator for one effective Account-to-Driver relation.
- `workspace-driver-roster.js` is an accepted authorized roster reader.
- `driver-truck-assignment.js` is an accepted disconnected reader for Driver-scoped current, history, and as-of assignments.
- The orchestrator DriverTruckAssignment read and mutation foundations are accepted and independently PostgreSQL-verified.

## Authoritative discovery result

The current orchestrator branch contains no `AccountDriverLink` table, migration, router, read endpoint, or server tests. The client contract explicitly identifies these as server-owned and forbids local simulation.

The current PWA also intentionally does not load or compose `account-driver-link.js`, because no authenticated server route exists behind its semantic action.

Therefore the canonical Account-to-Driver step is absent. The existing roster and DriverTruckAssignment endpoints cannot repair this gap: selecting a Driver by first/only record, matching Account name/email/role, matching current Truck, or reinterpreting `crewId`/device-local `accountId` as roster `driverId` would violate the accepted identity contract.

## Blocking finding

`CANONICAL_ACCOUNT_DRIVER_LINK_SERVER_SOURCE_MISSING`

This is a bounded technical prerequisite, not a new product-policy decision. Driver SELF UI runtime must not begin until an independently accepted server source can return zero, one, or multiple effective links without guessing.

## Smallest safe next bounded slice

Implement an orchestrator-only AccountDriverLink read foundation using the existing `ACCOUNT_DRIVER_LINK_API_CONTRACT.md` handoff:

- additive workspace-scoped effective-dated relation schema;
- stable relation, Account, Workspace, and roster Driver IDs;
- server-derived Account identity from the Bearer session;
- active Workspace membership authorization;
- database-enforced same-workspace integrity and non-overlap for one Account at an instant;
- authenticated read endpoint compatible with `account_driver_link_read`;
- zero/one/multiple, boundary, malformed, revoked, unauthorized, and cross-workspace tests;
- genuine PostgreSQL execution coverage for relation constraints; and
- no admin mutation endpoint, inferred link creation, data migration, backfill, merge, deployment, or production-data mutation.

An empty authoritative relation is a valid `self_not_linked` result. This slice must not auto-create a link from existing profile similarity.

## Subsequent bounded PWA slice

Only after independent acceptance of the server read foundation:

- load and lazily compose the accepted AccountDriverLink adapter;
- map `account_driver_link_read` through existing authenticated transport;
- resolve canonical Driver ID before calling DriverTruckAssignment current read;
- render a minimal read-only SELF state for success, not-linked, ambiguous, unauthorized, and unavailable outcomes; and
- keep all legacy screens and records unchanged.

That UI slice must remain read-only. AccountDriverLink administration, assignment mutation UI, fleet ranking, legacy backfill, migration execution, merge, and deployment remain outside it.

