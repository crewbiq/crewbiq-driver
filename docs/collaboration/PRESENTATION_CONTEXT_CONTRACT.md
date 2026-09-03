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
    truckOwnershipIds: []
  },
  legacyPersona: null | 'driver' | 'owner_op' | 'fleet'
}
```

`relationshipScope` is extended here (from the IA-0 preparation shape)
with `accountDriverLinkId` and `truckOwnershipIds`, since the
owner-who-drives scenario (ADR-0007 §7 scenario A) requires the resolver
to surface these alongside `membershipRole` for the shell to reason about
which Scope selections it may later offer — without itself granting or
computing authority for any of them. This remains a preparation shape,
not a frozen wire format: exact field names may be refined when IA-1 is
actually implemented against real endpoint responses.

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
records, `AccountDriverLink`, `TruckOwnership`) — this contract fixes the
resolver's fail-closed behavior over that evidence; it does not invent
new evidence sources or endpoints.

The resolver is pure: given the same `sessionEvidence`, it always returns
the same `PresentationContext`. It performs no network calls, no
persistence writes, and no DOM access. It is safe to call repeatedly and
safe to memoize per session snapshot.

### Resolution rules

1. No active session or no resolvable active `WorkspaceMembership` ->
   `status: 'unavailable'`, `membershipRole: null`, empty
   `relationshipScope`. The shell must present its existing
   graceful-degradation/unauthenticated state, not a canonical role UI.
2. Exactly one active `WorkspaceMembership` for the active `workspaceId`,
   with a role in the closed ADR-0007 set (`driver`/`fleet`/`carrier`) ->
   `status: 'resolved'`, `membershipRole` set to that exact role,
   `capabilities` populated from the existing granted-capability
   evidence, `relationshipScope` populated from existing
   `CarrierAssignment`/`AccountDriverLink`/`TruckOwnership` evidence for
   that account within that workspace.
3. More than one active `WorkspaceMembership` resolves for the same
   `workspaceId` (a data inconsistency ADR-0007 does not permit in
   steady state — see ADR-0007 §1) -> `status: 'ambiguous'`. The shell
   must present an explicit ambiguous state; it must never guess by
   picking the first result, the highest-rank role, or any other
   heuristic.
4. An active `WorkspaceMembership` resolves with a role outside the
   closed ADR-0007 set (any legacy/unexpected value) -> `status:
   'unauthorized'`, `membershipRole: null`. The resolver must not attempt
   to coerce, map, or "best-guess" an unrecognized role value onto
   `driver`/`fleet`/`carrier`.
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
`status: 'unavailable'`.

**V2. Clean single-role resolution.** One active `driver` (or `fleet`,
or `carrier`) `WorkspaceMembership` for the active workspace, no
ambiguity -> `status: 'resolved'`, correct `membershipRole`.

**V3. Owner-who-drives (matches ADR-0007 §7 scenario A).** An account
with an active `fleet` `WorkspaceMembership`, a `TruckOwnership`/fleet
authority over several trucks, an `AccountDriverLink`, and a current
`DriverTruckAssignment` resolves `status: 'resolved'`,
`membershipRole: 'fleet'`, with `relationshipScope.accountDriverLinkId`
and `truckOwnershipIds` populated — `membershipRole` is never `'owner'`
and is never anything other than `'fleet'` for this workspace, regardless
of how many relationships are present.

**V4. Ambiguous membership.** Two active `WorkspaceMembership` records
resolve for the same account and workspace -> `status: 'ambiguous'`; the
resolver output contains no `membershipRole` guess.

**V5. Unrecognized role value.** An active `WorkspaceMembership` carries
a role value outside `driver`/`fleet`/`carrier` (e.g. stale/legacy data)
-> `status: 'unauthorized'`; the resolver does not coerce it to a
recognized role.

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

## Readiness

| Item | Classification | Notes |
| --- | --- | --- |
| `PresentationContext` value object | `DEFINED_THIS_CONTRACT` | Preparation shape, not a frozen runtime schema. |
| `resolvePresentationContext` resolver | `NOT_YET_IMPLEMENTED` | Contract only; implementation is a separate, future authorized step. |
| Existing session/membership/capability evidence shapes | `ASSUMED_STABLE` | This contract composes existing evidence; it does not require new endpoints to exist before being written, but the resolver's actual implementation will need to pin the exact current response shapes it consumes. |
| Validation scenarios V1-V8 | `DEFINED_THIS_CONTRACT` | Contract-level test scenarios; not yet executed against any implementation, since none exists yet. |

## Next bounded slice

Per `MVP_INFORMATION_ARCHITECTURE_PRODUCTION_UI_PREPARATION.md`, the next
slice after this contract is independently accepted is **IA-2: Navigation
projection adapter** — projecting a resolved `PresentationContext` onto a
copy-free navigation view while retaining existing page IDs, `showPage()`
ownership, render hooks, legacy persona compatibility, and both current
model inventories. IA-2 is not authorized by this document and requires
its own separate review.
