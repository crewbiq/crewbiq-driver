# CrewBIQ Presentation Context Contract (IA-1)

## Status and boundary

This is IA-1 of the Safe production integration sequence in
`MVP_INFORMATION_ARCHITECTURE_PRODUCTION_UI_PREPARATION.md`. It defines a
fail-closed, pure resolver contract that maps existing authenticated
membership/capability/relationship evidence to a canonical
`PresentationContext`. It does not implement the resolver, does not
change DOM, endpoint authorization, persisted roles, or navigation, and
does not introduce a carrier UI. `PresentationContext` is a read hint for
the shell; it never substitutes for server-side request authorization,
which ADR-0007 already requires independently on every request.

Role (`driver`/`fleet`/`carrier`, ADR-0007) and Scope (`SELF`/`DRIVER`/
`TRUCK`/`FLEET`/`CARRIER`, `ANALYTICS_SCOPE_CONTRACT.md`) remain the two
authoritative sources this contract composes, not duplicates. This
document is authoritative for **PresentationContext** — the fail-closed,
read-only resolution of an account's current Role plus relationship
evidence, before any Scope is selected. Scope selection (which subject an
already-resolved actor views) is a separate, later concern layered on top
of a resolved `PresentationContext`, per `ANALYTICS_SCOPE_CONTRACT.md`;
this contract does not define or gate scope selection.

## Value object

Formalizes the preparation shape already sketched in
`MVP_INFORMATION_ARCHITECTURE_PRODUCTION_UI_PREPARATION.md`:

```js
PresentationContext = {
  status: 'resolved' | 'unavailable' | 'unauthorized' | 'ambiguous',
  workspaceId: null | 'canonical-workspace-id',
  membershipRole: null | 'driver' | 'fleet' | 'carrier',
  capabilities: [],
  relationshipScope: {
    carrierAssignmentIds: [],
    accountDriverLinkId: null | 'stable-link-id',
    truckOwnershipIds: [],
    currentDriverTruckAssignment: null | {
      truckId: 'stable-truck-id',
      driverId: 'stable-driver-id',
      effectiveFrom: 'ISO-8601-timestamp'
    }
  },
  legacyPersona: null | 'driver' | 'owner_op' | 'fleet'
}
```

`relationshipScope` is extended here (from the IA-0 preparation shape)
with `accountDriverLinkId`, `truckOwnershipIds`, and
`currentDriverTruckAssignment`, since the owner-who-drives scenario
(ADR-0007 §7 scenario A) requires the resolver to surface all three
alongside `membershipRole` for the shell to reason about which Scope
selections it may later offer — without itself granting or computing
authority for any of them. `truckOwnershipIds` alone is insufficient for
this scenario: it identifies which trucks the account owns/has fleet
authority over (Trucks A, B, C), but not which one, if any, the account's
linked Driver profile is *currently assigned to drive* (Truck A) — that
is a distinct fact carried only by the current effective
`DriverTruckAssignment`, per `ANALYTICS_SCOPE_CONTRACT.md`'s own
effective-dated-assignment model, and it is what the shell needs to
default or highlight a `SELF`/`TRUCK` presentation correctly. This
remains a preparation shape, not a frozen wire format: exact field names
may be refined when IA-1's resolver is actually implemented against real
endpoint responses.

## Multi-membership accounts

An account may hold more than one active `WorkspaceMembership` (e.g. a
`driver`-role membership in one workspace and a `fleet`-role membership in
its own workspace). `PresentationContext` resolves for exactly one
`workspaceId` at a time — the currently active session workspace, per
existing session/workspace resolution. Switching active workspace
re-resolves a new `PresentationContext`; it never merges memberships from
different workspaces into one context, and it never promotes a `driver`
membership using capabilities visible only through a different
workspace's `fleet` membership.

## Pure resolver contract

```js
resolvePresentationContext(sessionEvidence) -> PresentationContext
```

`sessionEvidence` is the existing authenticated membership/capability/
relationship evidence already available to the runtime (session,
active `WorkspaceMembership`, granted capabilities, `CarrierAssignment`
records, `AccountDriverLink`, `TruckOwnership`, and effective-dated
`DriverTruckAssignment` records for the linked Driver profile, per
`ANALYTICS_SCOPE_CONTRACT.md`'s effective-dated-assignment model) — this
contract fixes the resolver's fail-closed behavior over that evidence; it
does not invent new evidence sources or endpoints.

The resolver is pure: given the same `sessionEvidence`, it always returns
the same `PresentationContext`. It performs no network calls, no
persistence writes, and no DOM access. It is safe to call repeatedly and
safe to memoize per session snapshot.

### Resolution rules

0. **Fail-closed payload rule (applies to every rule below).** Whenever
   `status` is anything other than `'resolved'`, every other field is
   reset to its empty/absent value, with no exception:
   `workspaceId: null`, `membershipRole: null`, `capabilities: []`,
   `relationshipScope: { carrierAssignmentIds: [], accountDriverLinkId:
   null, truckOwnershipIds: [], currentDriverTruckAssignment: null }`.
   `legacyPersona` is the sole exception (rule 6) and may still be
   populated for informational rendering even when `status` is not
   `'resolved'`. A resolver implementation that leaves any other field
   populated from a partial/stale evidence read while `status` is
   `'unavailable'`/`'unauthorized'`/`'ambiguous'` violates this contract,
   regardless of which specific rule below produced that `status`.
1. No active session or no resolvable active `WorkspaceMembership` ->
   `status: 'unavailable'`; every other field per rule 0. The shell must
   present its existing graceful-degradation/unauthenticated state, not
   a canonical role UI.
2. Exactly one active `WorkspaceMembership` for the active `workspaceId`,
   with a role in the closed ADR-0007 set (`driver`/`fleet`/`carrier`) ->
   `status: 'resolved'`, `membershipRole` set to that exact role,
   `capabilities` populated from the existing granted-capability
   evidence — this is the only rule that may populate any field beyond
   `status` and `legacyPersona`. `relationshipScope` is populated per
   2a-2c below; the "within that workspace" qualifier applies only to
   `AccountDriverLink` and `TruckOwnership`, which are workspace-scoped
   relationships by definition (ADR-0007 §2), never to
   `CarrierAssignment`, which by definition (ADR-0007 §4) targets trucks
   in *other* fleet workspaces than the carrier's own home workspace
   being resolved here.
2a. `relationshipScope.accountDriverLinkId` and `.truckOwnershipIds` are
   populated from `AccountDriverLink`/`TruckOwnership` evidence scoped to
   this same `workspaceId` only — never from another workspace's
   records, even if the account also holds relationships there (see
   Multi-membership accounts).
2b. `relationshipScope.carrierAssignmentIds` is populated from active
   `CarrierAssignment` records belonging to this account's `carrier`-role
   membership, regardless of which *other* workspace(s) each assignment's
   target truck/fleet resides in — that cross-workspace reach is the
   entire point of `CarrierAssignment` (ADR-0007 §4) and must not be
   narrowed to "same workspace only." Surfacing these IDs in
   `relationshipScope` is evidence only: it grants no fleet
   `WorkspaceMembership`, no full delegated-workspace authority, and no
   read access to any field the assignment does not itself authorize —
   every actual read against a target workspace/truck/driver remains
   independently authorized server-side per request (rule 7, ADR-0007
   §3-§4), exactly as if this evidence had never been surfaced.
2c. `relationshipScope.currentDriverTruckAssignment` is populated only
   from a `DriverTruckAssignment` record that is: linked to this
   account's own `AccountDriverLink`; currently effective (its
   `effectiveFrom` is not in the future and its `effectiveTo` is null or
   not yet past); and unambiguous (at most one such record; team/co-driver
   assignments producing more than one simultaneously effective record
   for this driver resolve `currentDriverTruckAssignment: null`, not a
   guessed pick). Missing, malformed (unparsable dates, absent required
   IDs), ended (`effectiveTo` in the past), future-dated
   (`effectiveFrom` in the future), or ambiguous assignment evidence all
   resolve `currentDriverTruckAssignment: null` — never a stale, partial,
   or best-guessed value. A `null` here does not change `status`: the
   overall context can still be `'resolved'` with a real
   `membershipRole` while `currentDriverTruckAssignment` is `null` (e.g.
   a `fleet`-role owner who is linked to a Driver profile but not
   currently assigned to any truck).
3. More than one active `WorkspaceMembership` resolves for the same
   `workspaceId` (a data inconsistency ADR-0007 does not permit in
   steady state — see ADR-0007 §1) -> `status: 'ambiguous'`; every other
   field per rule 0. The shell must present an explicit ambiguous state;
   it must never guess by picking the first result, the highest-rank
   role, or any other heuristic.
4. An active `WorkspaceMembership` resolves with a role outside the
   closed ADR-0007 set (any legacy/unexpected value) -> `status:
   'unauthorized'`; every other field per rule 0. The resolver must not
   attempt to coerce, map, or "best-guess" an unrecognized role value
   onto `driver`/`fleet`/`carrier`.
5. `owner` never appears as a `membershipRole` value under any input,
   by construction — there is no code path in this resolver that
   produces it, since ADR-0007 §2 does not recognize it as a
   `WorkspaceMembership` role at all.
6. `legacyPersona` is populated only from existing local presentation
   state (`fiqD_userRole` or equivalent) for backward-compatible
   rendering during migration. It is informational only: no resolution
   rule above may read `legacyPersona` as an input, and no rule may
   change its own output based on what `legacyPersona` holds. A
   `legacyPersona` of `owner_op` must never influence, upgrade, or
   substitute for `membershipRole`.
7. `relationshipScope.carrierAssignmentIds` is populated only from
   currently-active `CarrierAssignment` records for the resolved
   account; an ended/revoked assignment is never included, matching
   ADR-0007 §4's forward-visibility-only rule. This resolver does not
   itself enforce that rule against read requests — it only surfaces
   accurate relationship evidence for the shell's presentation
   decisions; live enforcement remains the server's independent
   authorization responsibility on every request (§3).
8. Every resolution outcome (`resolved`/`unavailable`/`unauthorized`/
   `ambiguous`) must be reachable by the shell's existing
   graceful-degradation and unavailable-state rendering paths already
   accepted for Driver SELF composition — no new failure-presentation
   pattern is introduced by this contract.

## Explicit non-goals (unchanged from IA-0, restated for this contract)

- No DOM change: this contract defines a function signature and a value
  object, not a rendering change.
- No endpoint authorization change: `PresentationContext` is a
  presentation hint; every request remains independently authorized
  server-side per ADR-0007 §3, unconditionally.
- No persisted-role migration: existing persisted `fiqD_userRole` (or
  equivalent) storage is read here only as `legacyPersona`, informational
  only, and is not written, renamed, or reinterpreted by this contract.
- No navigation change: `navigation-model.js`, `ROLE_CONFIG`, and
  `FUNCTION_GROUPS` are untouched; IA-2 (Navigation projection adapter)
  is a separate, later, not-yet-authorized slice.
- No carrier UI: `carrier`-role accounts resolve a `PresentationContext`
  exactly like any other role under this contract, but no carrier
  presentation surface is introduced here (IA-5 remains the gate for
  that).
- No scope-selector UI or scope-authorization implementation: those
  belong to `ANALYTICS_SCOPE_CONTRACT.md`/`PRODUCTION_UI_INTEGRATION_CONTRACT.md`
  and a separate future slice.

## Validation scenarios

These scenarios validate the resolver contract above; they extend, and
do not replace, the ADR-0007 Validation and Role-vs-Scope acceptance
scenarios.

**V1. No session.** `sessionEvidence` has no authenticated session ->
`status: 'unavailable'`, and every other field is exactly the rule-0
empty payload: `workspaceId: null`, `membershipRole: null`,
`capabilities: []`, `relationshipScope` with all four sub-fields
empty/null. A resolver that leaks a stale `workspaceId` or cached
`capabilities` from a prior session under this input fails this
scenario, even if `status` is correctly `'unavailable'`.

**V2. Clean single-role resolution.** One active `driver` (or `fleet`,
or `carrier`) `WorkspaceMembership` for the active workspace, no
ambiguity -> `status: 'resolved'`, correct `membershipRole`.

**V3. Owner-who-drives (matches ADR-0007 §7 scenario A).** An account
with an active `fleet` `WorkspaceMembership`, a `TruckOwnership`/fleet
authority over Trucks A, B, and C, an `AccountDriverLink`, and a current
effective `DriverTruckAssignment` of the linked Driver to Truck A
resolves `status: 'resolved'`, `membershipRole: 'fleet'`, with
`relationshipScope.accountDriverLinkId` set,
`relationshipScope.truckOwnershipIds` containing all three trucks (A, B,
C), and `relationshipScope.currentDriverTruckAssignment` set to exactly
`{ truckId: A, driverId: <linked driver>, effectiveFrom: ... }` — not
merely implied by `truckOwnershipIds` containing A. `membershipRole` is
never `'owner'` and is never anything other than `'fleet'` for this
workspace, regardless of how many relationships are present.

**V4. Ambiguous membership.** Two active `WorkspaceMembership` records
resolve for the same account and workspace -> `status: 'ambiguous'`, and
every other field is exactly the rule-0 empty payload — not merely
"contains no `membershipRole` guess" but `workspaceId`, `capabilities`,
and every `relationshipScope` sub-field are also empty/null, even though
both candidate memberships may have real relationship evidence attached.

**V5. Unrecognized role value.** An active `WorkspaceMembership` carries
a role value outside `driver`/`fleet`/`carrier` (e.g. stale/legacy data)
-> `status: 'unauthorized'`, and every other field is exactly the rule-0
empty payload — the resolver does not coerce the role to a recognized
value, and it does not surface that membership's `capabilities` or
`relationshipScope` evidence despite the membership record existing.

**V6. Legacy persona never promotes.** `legacyPersona: 'owner_op'` is
present in local state while the actual active `WorkspaceMembership`
role is `driver` -> `status: 'resolved'`, `membershipRole: 'driver'`
(unchanged by `legacyPersona`); `legacyPersona` is carried through in
the output unmodified, for informational rendering only.

**V7. Carrier with ended assignments.** A `carrier`-role account whose
only `CarrierAssignment` records are all ended/revoked resolves
`status: 'resolved'`, `membershipRole: 'carrier'`,
`relationshipScope.carrierAssignmentIds: []` (empty, not the ended
records) — matching ADR-0007 §4's forward-visibility-only rule.

**V8. Multi-workspace account, no cross-contamination.** An account with
a `driver`-role membership in workspace A and a `fleet`-role membership
in workspace B resolves a `PresentationContext` for whichever workspace
is the active session workspace, using only that workspace's membership,
capabilities, and relationship evidence — never a union of both.

**V9. DriverTruckAssignment fail-closed edge cases (matches rule 2c).**
Each of the following independently resolves
`currentDriverTruckAssignment: null` while `status` remains `'resolved'`
with the account's real `membershipRole` — none of them fail the whole
context or drop the account to `'unavailable'`/`'unauthorized'`:
no `DriverTruckAssignment` record exists for the linked driver; the only
record present is malformed (unparsable `effectiveFrom`, or missing
`truckId`/`driverId`); the only record present has an `effectiveTo` in
the past (ended); the only record present has an `effectiveFrom` in the
future (not yet effective); or two or more records are simultaneously
effective for the same driver (ambiguous — e.g. an in-progress
team/co-driver handoff). A resolver that instead returns the most
recent/nearest/first such record for any of these cases fails this
scenario, even though every other field resolves correctly.

## Readiness

| Item | Classification | Notes |
| --- | --- | --- |
| `PresentationContext` value object | `DEFINED_THIS_CONTRACT` | Preparation shape, not a frozen runtime schema. |
| `resolvePresentationContext` resolver | `NOT_YET_IMPLEMENTED` | Contract only; implementation is a separate, future authorized step. |
| Existing session/membership/capability evidence shapes | `ASSUMED_STABLE` | This contract composes existing evidence; it does not require new endpoints to exist before being written, but the resolver's actual implementation will need to pin the exact current response shapes it consumes. |
| Validation scenarios V1-V8 | `DEFINED_THIS_CONTRACT` | Contract-level test scenarios; not yet executed against any implementation, since none exists yet. |

## Next bounded slice

This document defines a contract, not a shipped resolver. Its own
validation scenarios (V1-V8) are not yet executable against anything,
because `resolvePresentationContext` is `NOT_YET_IMPLEMENTED` (see
Readiness). IA-2 (Navigation projection adapter) *consumes* a resolved
`PresentationContext` — it cannot be meaningfully built or reviewed
against a resolver that does not exist yet.

The next slice after this contract is independently accepted is
therefore **IA-1-implementation: build `resolvePresentationContext`
against the real, current session/membership/capability/relationship
evidence shapes, and prove rules 0-8 and scenarios V1-V8 against it** —
not IA-2 directly. This slice must pin the exact current evidence
shapes it reads (superseding the "`ASSUMED_STABLE`" placeholder in
Readiness below with the real shapes), implement the resolver as a pure
function with no DOM/network/persistence side effects, and produce
executable test evidence for every one of V1-V8 before any navigation
work consumes its output. Only after IA-1-implementation is
independently accepted does **IA-2: Navigation projection adapter** —
projecting a resolved `PresentationContext` onto a copy-free navigation
view while retaining existing page IDs, `showPage()` ownership, render
hooks, legacy persona compatibility, and both current model inventories
— become a meaningful next step. Neither IA-1-implementation nor IA-2 is
authorized by this document; each requires its own separate review and
authorization.
