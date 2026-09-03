# Driver own-current-assignment read prerequisite

Status: PROPOSED / AWAITING CLAUDE REVIEW
Scope: documentation/design only; no runtime authorization change
Release readiness: NOT_READY_FOR_PRODUCTION

## Evidence and authority

- Accepted IA-3 client: `c0ec7d884f59f4eca91fee311a8b11cbfa98f628`.
- Independent IA-3 acceptance: `15e2d4f6900e7d5577a2d1fb5e71a5f659cabd77`.
- Design authorization: `7dd427c64f6fb6e77887b33963736b85db4a0524`.
- Orchestrator source inspected: `4c85fd41d90ec542b7b1c0c15c9e1ca80ec1dda1`, branch `agent/account-driver-link-read`; fetch confirmed local and remote matched.
- Accepted ADR-0007 inspected from `crewbiq/crewbiq-docs` at `d62cb51702d9007d7a289dc9c2b4330b2e95e3c8`, `architecture/ADR/ADR-0007-organization-roles-and-delegated-scope-for-crewbiq-mvp.md`. Sections 1, 3, 5 and Validation establish membership authority, own Driver scope and mandatory cross-tenant tests. ADR acceptance is not implementation certification.

The source observations below are static evidence, not live production evidence.

## Existing composition

`app/routers/auth.py::current_user` authenticates the bearer token through
`app/services/auth_service.py::authenticate_token`. It checks expiry,
revocation and active Account, then builds database-derived memberships.
`workspace_context` puts roles/capabilities on each membership. Account
identity for links is the authenticated `crewbiq_id`, not the legacy
`effective_owner_crewbiq_id` or a supplied account identifier.

`app/routers/account_driver_links.py` authorizes active workspace membership
and ACCOUNT_DRIVER_LINK_READ. Its query constrains workspace and authenticated
Account, joins Driver/workspace ownership, and validates link provenance,
schema version and temporal values. It returns link history; it does NOT
select a single currently effective link server-side.

`app/routers/driver_truck_assignments.py` currently requires
DRIVER_TRUCK_ASSIGNMENT_READ for current/history/as-of. Driver/truck query
parameters are optional filters, not own-scope authorization. `_read` filters
by workspace and time and validates records, but does not establish the
authenticated Account's Driver relationship.

`app/services/capabilities.py` grants canonical `driver` only
ACCOUNT_DRIVER_LINK_READ. Granting its existing broad assignment-read
capability would also open unfiltered workspace, history and as-of reads.
That is explicitly NOT this proposal.

The PWA's `core-runtime.js::adaptDriverTruckAssignmentRead` already sends
bearer authentication and `driver_id` to the current endpoint.
`driver-truck-assignment.js` validates workspace/Driver identity, timestamps
and uniqueness and rejects ambiguous current assignments.

## Proposed smallest compatible server change

Retain GET `/v1/workspaces/{workspace_id}/driver-truck-assignments/current`.
Retain the existing broad-capability path for its existing authorized roles.
Add a separate proposed capability
`canonical.driver_truck_assignment.read_own_current` for canonical `driver`
membership only. This name is a proposal, not an existing implementation.

The new capability must not authorize history, as-of, list, create, close,
revoke, or any generic `_authorized_workspace_id` fallback. Do not add
DRIVER_TRUCK_ASSIGNMENT_READ or MANAGE to driver. Do not change role vocabulary,
Carrier scope, legacy aliases or the global authentication/session mechanism.

For a request lacking the existing broad capability, the current endpoint
must use this own-only path:

1. Authenticate using the existing canonical dependency. Require exactly one active membership for the requested active workspace, the new own-current capability, and canonical driver membership role. Never use global legacy user roles for this branch.
2. Derive Account from the authenticated server context. Reject missing canonical Account. Request workspace is a lookup key checked against membership, never a grant. Reject cross-workspace requests before assignment queries.
3. Capture one aware UTC server instant T. Resolve the Account's links and read assignments in one read-only repeatable-read database transaction (or an equivalent single-statement snapshot). Do not call two HTTP routes or open independent pooled read snapshots for the proof chain.
4. Scope the link query to this workspace and Account. Preserve the existing link validation, including provenance and Driver/workspace ownership consistency. Validate candidate records before treating them as evidence; malformed or orphaned scoped links cannot silently become permission. Use LEFT JOIN plus validation where needed so a missing referenced source is rejected rather than lost by an inner join.
5. Select active links with `effective_from <= T` and `effective_to IS NULL OR T < effective_to`. Exactly one is required, including when duplicate links point to the same Driver. No link means unavailable, never fallback. Multiple effective links mean ambiguous, never first/latest selection.
6. The selected link supplies the only authorized Driver ID. If the request supplies `driver_id`, it must exactly match that ID after the existing boundary normalization. Reject a mismatch without querying that other Driver. Omitting the filter must still return only the server-derived own Driver, never broaden scope.
7. Reject `truck_id` on the own-only branch. It is not used by this PWA chain and must not filter away assignment ambiguity. Client `at` or history/as-of requests must not alter server-current authorization.
8. Query assignments with mandatory workspace AND derived Driver predicates at the same T. Preserve half-open intervals and existing non-revoked semantics; validate returned IDs, referenced Driver/Truck workspace consistency, temporal structure, uniqueness and shape before emitting any result. A malformed row fails the request, not a partial filtered response.
9. Zero assignments returns the existing successful empty assignments envelope; the client already maps it to not-found. Exactly one is success. Multiple effective assignments return an ambiguity error even if they share a truck. A team assignment must never expand the query to other Drivers assigned to that truck.
10. No business writes, link creation, assignment repair, inference or migration. Existing authentication's `auth_sessions.last_seen_at` update is unchanged and is the only existing session-bookkeeping write; do not claim the entire authenticated request makes zero database writes.

Concurrent revocation semantics: authorization represents the coherent request
snapshot, not a permanent grant. A later request must recompute it and observe
committed link changes; never cache the server authorization result across
requests. No new business policy about historical access is introduced.

## Response and error contract

Success retains `{ok:true, workspace_id, view:"current", as_of, assignments}`.
`as_of` is T. Assignment IDs and canonical workspace/Driver/Truck IDs remain
the database values. Existing adapter-required version, status, type and time
fields remain. The own-only response uses `provenance: {}` rather than exposing
arbitrary administrative provenance; this remains valid for the current PWA
normalizer. The broad authorized response remains unchanged.

| Condition | Proposed behavior |
| --- | --- |
| Missing/invalid/expired/revoked session | Existing 401 convention |
| Missing active workspace | Existing 409 active_workspace_required |
| Missing/cross-workspace membership | Existing 403 workspace_membership_required |
| Multiple matching memberships | Existing 409 workspace_membership_ambiguous |
| Missing own capability or unsuitable role | 403 capability_required |
| Missing canonical Account | 409 canonical_account_required |
| No effective AccountDriverLink | 409 account_driver_link_not_found |
| Multiple effective AccountDriverLinks | 409 account_driver_link_ambiguous |
| Supplied other Driver | 403 driver_scope_required, no foreign data |
| truck_id or temporal override on own path | 400 own_current_filter_invalid |
| Malformed scoped link/assignment | Existing 502 malformed_account_driver_link / malformed_driver_truck_assignment |
| Multiple effective assignments | 409 driver_truck_assignment_ambiguous |
| Database/schema/service unavailable | Existing 503 family |

These new detail codes require tests; they are not claimed as currently
implemented. Client adapters already degrade for non-success bodies. No client
error-code rewrite is required to obtain safe behavior in this prerequisite.
No IDs, row contents or candidate lists belonging to another principal may
appear in error bodies.

## Proposed implementation boundary, only after independent review

- Orchestrator `app/services/capabilities.py`: add separate own-current constant and driver grant only.
- Orchestrator `app/routers/driver_truck_assignments.py`: dispatch current-only scope and preserve existing broad/history/as-of/command behavior.
- Orchestrator `app/services/driver_self_assignment.py` (new): bounded snapshot-scoped own proof/read helper. Reuse existing validation without changing existing link-route behavior; avoid a router import cycle.
- Orchestrator `tests/test_driver_truck_assignments.py` and `tests/test_driver_truck_assignments_postgres.py`: endpoint and real-database security/temporal checks. A dedicated `tests/test_driver_self_assignment.py` is allowed if isolating the helper is clearer.
- Collaboration contract/evidence/state only in driver repository. No PWA runtime, service worker, package, CI, schema or deployment changes expected.

If implementation requires changing shared auth selection, role migration,
extra endpoints, broad capability semantics or an unavailable authoritative
source, return to coordination with the concrete dependency instead of
quietly expanding this allowlist.

## Required future proof matrix

1. Real canonical driver membership plus own link/assignment succeeds; empty assignment roster is non-fabricated not-found.
2. Driver B in same workspace, another workspace, forged account ID, legacy owner ID and global role injection never authorize or leak data.
3. Multiple memberships for one workspace fail closed; driver in A/fleet in B keeps independent scope and cannot borrow B capabilities in A.
4. Missing, expired, revoked sessions; absent/inactive membership; missing link; revoked/inactive/future/expired link; duplicate active links; malformed/orphaned links are explicitly tested.
5. Half-open start/end boundaries for both relationships use one T. Closed assignment with a still-effective interval retains existing semantics; expired/revoked assignment does not resolve.
6. Multiple effective assignments fail even with a truck filter; two team Drivers sharing a truck never see each other's rows.
7. Missing/wrong-workspace referenced Driver or Truck, malformed timestamps, duplicate assignment IDs and unavailable schema fail closed.
8. Driver requests to history/as-of, unfiltered wide access and assignment mutations remain denied. Fleet broad reads/commands and Carrier denials remain unchanged.
9. PostgreSQL test demonstrates a coherent proof snapshot during link reassignment/revocation and denial or new scope on a subsequent request. Mock-only tests cannot prove transaction isolation.
10. Assert parameterized SQL includes workspace and derived Driver predicates; no business UPDATE/INSERT/DELETE occurs. Distinguish existing session bookkeeping from business mutation.
11. Validate the real own-only wire envelope through the existing PWA assignment adapter, Driver SELF and IA-3 coordinator, including denied/unavailable graceful degradation. Success must not require local profiles or first-record inference.

Implementation validation: focused own-read/assignment/link tests, then the
canonical full backend suite `pytest -q --tb=short`; real PostgreSQL tests must
actually run or be disclosed as coverage gaps, not silently counted as pass.
Run the relevant PWA assignment/SELF/presentation contract tests against the
server envelope. Authenticated browser/mobile/offline evidence remains a later
explicitly bounded validation task, not proof supplied by this document.

## Decision and handoff

No new product-policy choice is needed for own current assignment: it follows
the accepted Driver assigned-Truck scope. The endpoint dispatch, separate
capability, snapshot strategy and minimal output projection need Claude's
independent security/compatibility review before implementation is authorized.

This design does not close CANONICAL_DRIVER_ASSIGNMENT_READ_NOT_AUTHORIZED.
No tests were executed for this documentation-only step. No runtime, server
permission, production/staging state or data was changed. Historical attribution
and CANONICAL_STAGING_JOURNEYS_NOT_EXECUTED remain deferred/queued unchanged.

Next required actor: Claude. Review this design against exact source and ADR;
publish ACCEPT or precise NEEDS_FIX. After ACCEPT, Codex may authorize only the
bounded implementation above under standing delegation. No deployment or IA-4.
