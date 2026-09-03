# Canonical Relationship Evidence Population Contract

## Status and boundary

`PROPOSED / AWAITING INDEPENDENT REVIEW`

This contract defines the smallest provenance-preserving population path for
the accepted canonical `truck_ownership` and `carrier_assignments` read models.
It reuses the existing orchestrator command conventions:

- authenticated `current_user` context;
- server-derived active workspace and actor;
- closed role/capability checks;
- strict request models with extra fields forbidden;
- durable per-actor/workspace idempotency;
- expected-version concurrency checks;
- immutable `relationship_audit_events`;
- effective-dated close/revoke rather than deletion.

This document does not implement commands, execute migration `012`, populate
any row, infer a relationship from legacy records, change PWA UI, or integrate
`PresentationContext`.

## Non-negotiable authority rules

1. Roles remain exactly `driver`, `fleet`, and `carrier`. `owner` is not a
   membership role.
2. A client-supplied workspace, account, truck, driver, carrier, assignment,
   or ownership ID is only a requested subject. It never grants authority.
3. Every command derives actor and active workspace from the authenticated
   session and re-authorizes the command server-side.
4. `TruckOwnership` never creates membership or broadens workspace access. It
   is evidence about an account and a truck already inside a workspace where
   the actor has `fleet` authority.
5. `CarrierAssignment` can create forward cross-workspace visibility and
   therefore requires explicit consent from both the target fleet workspace
   and the carrier home workspace before it becomes active.
6. Pending/rejected/ended/revoked relationships are never returned by the
   active evidence readers and cannot authorize forward access.
7. No command may derive IDs from names, email, MC/USDOT, unit number, array
   order, legacy owner IDs, local truck carrier snapshots, AccountDriverLink,
   DriverTruckAssignment, or another relationship.
8. No backfill or historical reconstruction is part of this contract.

## Capability model

| Capability | Canonical role | Meaning |
| --- | --- | --- |
| `canonical.truck_ownership.manage` | `fleet` | Explicitly create/close/revoke ownership evidence inside the actor's active fleet workspace. |
| `canonical.carrier_assignment.propose` | `fleet` | Propose a relationship for a truck already in the actor's active fleet workspace. |
| `canonical.carrier_assignment.accept` | `carrier` | Accept or reject a proposal addressed to the actor's active carrier home workspace. |
| `canonical.carrier_assignment.end` | `fleet`, `carrier` | End forward visibility from either participating workspace, subject to relationship-side validation. |

Read capabilities remain separate. Possessing a manage capability does not
replace the role, workspace, subject, lifecycle, or version checks below.

## TruckOwnership command contract

### Create

Conceptual request:

```json
{
  "accountId": "canonical-account-id",
  "truckId": "stable-truck-id",
  "effectiveFrom": "ISO-8601 timestamp",
  "provenance": {
    "source": "explicit_fleet_attestation",
    "reason": "non-blank bounded reason",
    "evidenceRef": "optional non-secret reference"
  }
}
```

Server requirements:

- actor has exactly one active `fleet` membership in the active workspace and
  `canonical.truck_ownership.manage`;
- `accountId` resolves to exactly one authenticated Account whose Person has
  an active membership in that same workspace;
- `truckId` resolves to exactly one truck belonging to that workspace;
- `effectiveFrom` is timezone-aware and is not silently defaulted by the
  client or guessed from another record;
- there is no overlapping active ownership row for the same
  workspace/account/truck tuple;
- the command uses an `Idempotency-Key`, writes one immutable audit event, and
  returns the stable created relationship ID and version.

The requested `accountId` selects the subject but grants no authority. The
actor's independently proven fleet membership authorizes the command. Because
the target account is already a member and the truck is already a workspace
resource, this evidence does not expand the workspace boundary.

### Close and revoke

- Both operations require relationship ID, non-blank reason,
  `expectedVersion`, idempotency, and the same fleet workspace authority.
- Close requires a timezone-aware `effectiveTo` strictly after
  `effectiveFrom` and preserves history.
- Revoke marks the evidence invalid without deleting it.
- A stale version, wrong workspace, ended/revoked record, invalid interval, or
  missing record fails closed.
- No delete endpoint exists.

## CarrierAssignment command contract

### State machine

```text
fleet proposal: pending
pending + carrier acceptance: active
pending + carrier rejection: rejected
active + either-side close: ended
pending/active + authorized revocation: revoked
```

Only `active` is usable as forward relationship evidence.

### Fleet proposal

Conceptual request:

```json
{
  "carrierWorkspaceId": "canonical-carrier-home-workspace-id",
  "truckId": "stable-truck-id",
  "driverId": "optional stable-driver-id",
  "effectiveFrom": "ISO-8601 timestamp",
  "provenance": {
    "source": "explicit_fleet_proposal",
    "reason": "non-blank bounded reason",
    "evidenceRef": "optional non-secret reference"
  }
}
```

Server requirements:

- actor has exactly one active `fleet` membership in the server-derived active
  fleet workspace and `canonical.carrier_assignment.propose`;
- truck, and optional driver, belong to that same fleet workspace;
- carrier workspace exists, differs from the fleet workspace, is active, and
  has an active canonical `carrier` membership;
- no overlapping pending/active proposal exists for the same truck;
- server stores the actor's fleet workspace as `fleet_workspace_id`; no client
  field may override it;
- result is `pending`, creates no carrier visibility, and is durably
  idempotent/audited.

### Carrier proposal read and decision

- A carrier may list only pending proposals whose `carrier_workspace_id`
  equals its server-derived active carrier home workspace.
- Accept/reject requires relationship ID, non-blank reason,
  `expectedVersion`, and `Idempotency-Key`.
- The server locks and rechecks the pending row, carrier workspace, target
  fleet/truck/driver consistency, interval, and version in one transaction.
- Acceptance records the accepting actor and timestamp, changes status to
  `active`, increments version, and writes an immutable audit event.
- Rejection records the decision but grants no visibility.
- A carrier cannot propose or self-activate access to another workspace.
- A fleet actor cannot accept on behalf of a carrier.

### End and revoke

- Either participating side may end an active relationship from its own
  authenticated active workspace with `canonical.carrier_assignment.end`.
- The server proves that the active workspace equals either the row's
  `fleet_workspace_id` or `carrier_workspace_id`; arbitrary workspace IDs are
  rejected.
- End requires a valid `effectiveTo`, reason, expected version, idempotency,
  and audit. It removes forward visibility immediately at the end boundary.
- Revoke is reserved for invalid evidence, requires a reason and audit, and
  never deletes history.

## Provenance and audit

Every successful transition records:

- canonical relationship ID and type;
- server-derived actor auth ID and active workspace;
- command name and idempotency key result;
- timestamp and non-blank reason;
- explicit source value;
- before/after references containing canonical IDs, status, effective
  interval, and version;
- optional non-secret `evidenceRef` only.

Passwords, tokens, cookies, uploaded documents, and unrestricted free-form
evidence are prohibited from provenance/audit payloads. Audit events remain
immutable under the existing database trigger.

## Failure and transaction semantics

- Validation, authorization, idempotency begin, row lock/recheck, relationship
  mutation, audit write, and idempotency completion occur in one transaction.
- Any failed check rolls back the relationship and command record together.
- Reuse of an idempotency key with a different command/fingerprint returns a
  conflict; an identical completed command replays its stored response.
- Missing migration/schema returns explicit unavailable status and performs no
  partial write.
- Database constraint or integrity mismatch returns a bounded conflict/server
  error without attempting repair or fallback.

## Future implementation acceptance scenarios

1. Fleet creates explicit same-workspace TruckOwnership for a real member and
   truck; read round-trip returns the stable ID.
2. Cross-workspace account or truck request fails before insertion.
3. Duplicate/overlapping ownership fails; idempotent replay does not duplicate.
4. Ownership close removes forward evidence and preserves history/audit.
5. Fleet proposal alone creates no carrier visibility.
6. Only the addressed carrier home workspace can list and accept a proposal.
7. Carrier acceptance creates one active cross-workspace assignment; active
   read returns only its proven target resources.
8. Carrier cannot self-propose/self-activate and fleet cannot self-accept.
9. Wrong workspace, role, capability, version, interval, or subject fails
   closed with no mutation.
10. Either participating side can end forward visibility; unrelated workspace
    cannot.
11. Rejected/ended/revoked evidence never appears in active readers.
12. Audit and idempotency are written exactly once; no delete path exists.
13. Legacy truck carrier snapshots and local arrays are never read by any
    population command.
14. Migration remains additive and performs no backfill.

## Implementation sequencing

After independent acceptance, the smallest implementation slice is
orchestrator-only:

1. extend schema lifecycle/decision metadata additively;
2. add the four manage capabilities;
3. implement strict command/proposal handlers using existing idempotency and
   audit primitives;
4. add focused server tests for scenarios 1-14;
5. publish for independent review.

No PWA mutation UI is required to prove the server population contract. A
client command adapter or UI is a later separately authorized slice. Migration
execution and any staging/production data population remain separately gated.
