# IA-1 Presentation Context Implementation Evidence

## Result

`BLOCKED_BEFORE_IMPLEMENTATION`

The accepted IA-1 contract requires `resolvePresentationContext()` to be
implemented against the exact current evidence shapes and to prove V1-V9.
Repository discovery found that only part of that authoritative evidence is
currently available to the PWA.

No resolver or test was added because fabricating the missing evidence shapes,
or substituting legacy local records, would violate the accepted contract.

## Evidence inventory

| Contract evidence | Current authoritative source | Classification |
| --- | --- | --- |
| authenticated session and active workspace | `/v1/me`; PWA session shape uses `sessionToken`, `me.active_workspace_id`, and `me.memberships[]` | `AVAILABLE` |
| `WorkspaceMembership` role/capabilities | `/v1/me` membership shape: `status`, `roles[]`, `capabilities[]`, `workspace.id` | `AVAILABLE` |
| `AccountDriverLink` | `account-driver-link.js` normalized `read()` result | `AVAILABLE` |
| current effective `DriverTruckAssignment` | `driver-truck-assignment.js` normalized `readCurrent()` result | `AVAILABLE` |
| canonical `CarrierAssignment` | no server schema/router/read adapter or canonical response shape | `BLOCKED` |
| canonical `TruckOwnership` | no server schema/router/read adapter or canonical response shape | `BLOCKED` |

## Blocking findings

### `CANONICAL_CARRIER_ASSIGNMENT_EVIDENCE_NOT_AVAILABLE`

The PWA contains legacy `truck.carrierAssignment` and
`truck.carrierAssignmentHistory` presentation/business records. They are local
truck snapshots with company names, MC numbers, rates, and effective dates.
They are not the ADR-0007 canonical, authorization-scoped
`CarrierAssignment` relationship and cannot establish cross-workspace carrier
authority. The orchestrator has no canonical CarrierAssignment table, router,
or read endpoint, and the PWA has no corresponding adapter.

Using the legacy records would let mutable client data influence relationship
scope and would violate the contract's server-authoritative, no-inference rule.
Consequently V7 and the carrier portion of rule 2b cannot be implemented or
proved against a real evidence shape.

### `TRUCK_OWNERSHIP_EVIDENCE_NOT_AVAILABLE`

Neither repository currently exposes a canonical `TruckOwnership` datastore,
read endpoint, or PWA adapter. The accepted owner-who-drives scenario V3
requires `truckOwnershipIds` to contain the full proven set independently of
`currentDriverTruckAssignment`.

Deriving ownership from the local truck list, company/name fields, current
assignment, or fleet membership would be guessing. Therefore V3 cannot be
implemented or proved as written against a real evidence shape.

## Available shapes confirmed

- Active workspace resolution already fails closed over `sessionToken`,
  `me.active_workspace_id`, and memberships matching `workspace.id`.
- Membership records expose `roles[]` and `capabilities[]` from server-derived
  `/v1/me` context.
- `account-driver-link.js` returns a normalized canonical link with `linkId`,
  `workspaceId`, `accountId`, `driverId`, effective interval, and provenance.
- `driver-truck-assignment.js` returns one normalized current assignment or a
  structured not-found/ambiguous/invalid failure without selecting a fallback.

These available shapes are insufficient to satisfy the complete accepted
resolver contract. A partial resolver would create a second, weaker end state
and is not published.

## Required prerequisite

Before IA-1 implementation resumes, define and independently accept the
smallest server-authoritative, read-only evidence path for:

1. active canonical CarrierAssignment relationships available to a carrier's
   home-workspace membership, including authorized cross-workspace subject IDs;
2. canonical TruckOwnership relationships scoped to the authenticated account
   and active workspace;
3. PWA read adapters that validate those response shapes fail closed.

This evidence discovery does not authorize schema changes, endpoints, runtime
integration, migration, deployment, or data mutation. The prerequisite must be
separately bounded and reviewed before implementation.

## Changes and validation

- Runtime/product files changed: none.
- Tests run: none; no executable implementation was created.
- Production/staging changes: none.
- IA-2 started: no.
