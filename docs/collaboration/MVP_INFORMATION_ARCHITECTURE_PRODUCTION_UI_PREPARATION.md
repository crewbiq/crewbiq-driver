# CrewBIQ MVP Information Architecture / Production UI Integration Preparation

Status: `IA_PREPARATION_READY / AWAITING_INDEPENDENT_REVIEW`

Scope: documentation and sequencing only. No runtime, navigation, authorization, workflow, deployment, migration, or business-data change is included.

## Accepted product and architecture boundary

ADR-0007 is `Accepted` at `crewbiq/crewbiq-docs` commit `d62cb51702d9007d7a289dc9c2b4330b2e95e3c8` and was independently accepted in CrewBIQ coordination review `3943058`.

The frozen MVP authority roles are exactly:

- `driver`
- `fleet`
- `carrier`

`owner` is not a role. Ownership is represented by explicit relationships. Authority is attached to active `WorkspaceMembership` records and computed server-side. Client-supplied workspace, driver, truck, fleet, or carrier identifiers are lookup inputs, never authority grants. A carrier has one `carrier` membership in its home workspace; visibility into other fleets derives only from active `CarrierAssignment` relationships. Dispatcher, Safety, Mechanic, and other Phase-4 roles remain deferred.

ADR acceptance does not certify an implementation. Every implementation governed by ADR-0007 remains not production-ready until all ADR authorization and cross-tenant validation requirements pass.

## Authoritative inputs

- Published production PWA: merge `5351d6a6c1a4b817aefad62de01142198deccbc3`, service-worker cache `crewbiq-driver-v96`.
- Production navigation model: `navigation-model.js` plus DOM routing and render hooks retained in `index.html`.
- Navigation behavior contract: `docs/collaboration/NAVIGATION_CONTRACT.md`.
- Accepted visual baseline: `docs/collaboration/UI_SHELL_PROTOTYPE.md` and the isolated `prototype/crewbiq-next` shell.
- Production integration boundary: `docs/collaboration/PRODUCTION_UI_INTEGRATION_CONTRACT.md`.
- Scope boundary: `docs/collaboration/ANALYTICS_SCOPE_CONTRACT.md`.
- ADR-0007 role and delegated-scope decision in `crewbiq-docs`.

The prototype is visual evidence only. Its mock values, role switch, calculations, and embedded navigation snapshot are not production authority or production data sources.

## Current v96 production information architecture

### Shell and routing ownership

- `index.html::showPage()` remains the DOM router and render-hook dispatcher.
- `navigation-model.js` owns page metadata, `ROLE_CONFIG`, `FUNCTION_GROUPS`, role rank, bottom destinations, and pure navigation lookups.
- Bottom navigation exposes `home`, `work`, role-adaptive `truck` or `team`, and `money`; Quick Add is an action, not a destination.
- `work`, `truck`, `team`, and `money` are technical domain containers.
- `menu` is a reachable legacy Functions container and invalid-route fallback.
- `settings` is reached through account/header navigation and the Functions directory.
- `marketplace` remains orphaned. `community` remains the active Links container.
- Driver SELF is already composed as a read-only home-card refresh path. It must retain explicit unavailable/unauthorized states rather than becoming a shell authority source.

### Current visible surface map

| Domain | Current destinations | Current production presentation visibility |
| --- | --- | --- |
| Today | `home` | all local personas |
| Work | `load`, `disputes`, `scan` | all local personas |
| Truck operations | `pti`; plus `fuel`, `service` for elevated local personas | local `driver`, `owner_op`, `fleet` according to current model |
| Money | `expenses`, `report`, `stats`; plus `deductions` for elevated local personas | current model visibility only |
| Team | `fleet`, `drivers` | local `fleet` only |
| Resources/account | `community`, `settings` | all local personas |

This table describes reachability, not authorization. `showPage()` does not enforce roles, and ADR-0007 explicitly requires server-derived authorization below the UI.

## Required semantic separation

### Legacy presentation persona is not canonical authority

The v96 navigation model uses `driver`, `owner_op`, and `fleet`, with a client-side rank. ADR-0007 uses canonical authority roles `driver`, `fleet`, and `carrier` and has no `owner_op` role. The current local persona must therefore not be renamed, promoted, or interpreted as a canonical membership role.

Until a reviewed bridge exists:

- `owner_op` remains a legacy presentation persona only;
- local `fiqD_userRole` selection remains presentation state only;
- no local role or rank may grant a server capability;
- `carrier` must not be simulated as `fleet`;
- an ownership relationship must not be converted into an `owner` or implicit `fleet` role;
- missing, ambiguous, inactive, or unauthorized server context must fail closed for protected reads while preserving already accepted graceful-degradation behavior for legacy-capable workflows.

### Proposed presentation context boundary

The production shell should eventually consume one normalized, read-only presentation input:

```text
authenticated session
  -> server-active WorkspaceMembership
  -> server-derived role + capabilities
  -> active relationship scope (including CarrierAssignment where relevant)
  -> fail-closed PresentationContext
  -> navigation visibility and read-only view-model requests
```

The shell may use `PresentationContext` to decide what to display. Endpoints must still authorize every request independently.

A future contract may represent the value as:

```js
PresentationContext = {
  status: 'resolved' | 'unavailable' | 'unauthorized' | 'ambiguous',
  workspaceId: null | 'canonical-workspace-id',
  membershipRole: null | 'driver' | 'fleet' | 'carrier',
  capabilities: [],
  relationshipScope: {
    carrierAssignmentIds: []
  },
  legacyPersona: null | 'driver' | 'owner_op' | 'fleet'
}
```

This is a preparation shape, not an approved runtime schema. `legacyPersona` can preserve current presentation compatibility during migration but can never add authority.

## Target IA boundaries

The target keeps domain ownership stable while allowing the presentation shell to evolve.

| Layer | Owns | Must not own |
| --- | --- | --- |
| Session/authorization | actor, active membership, workspace, capabilities, relationship scope | visual labels, card layout, local persona selection |
| Presentation context | fail-closed normalization of authoritative read context plus explicit legacy compatibility state | endpoint authorization, inferred IDs, business calculations |
| Navigation model | page registry, domain grouping, visible destinations from resolved context | persistence, transport, mutation, permission grants |
| View-model adapters/selectors | authorized canonical snapshots and explicit unavailable states | DOM routing, local-storage identity guessing, duplicated finance math |
| Shell/presentation | layout, responsive navigation, state rendering, explicit user selection | authority, entity inference, direct business-data mutation |
| Domain modules | Loads, PTI, Links, analytics, assignments, settings behavior | shell-wide role derivation |

## Role-oriented IA preparation

### Driver

- Today: existing read-only SELF status/metrics where canonical evidence resolves; explicit unavailable state otherwise.
- Work: Loads, exceptions, documents.
- Truck: PTI and assigned-truck operational context; no first-truck fallback.
- Money: expenses, reports, performance.
- Account: session, active workspace, profile/settings, Links.

### Fleet

- Today: workspace-scoped operational summary from authorized view models.
- Work: workspace Loads, exceptions, documents.
- Team: Drivers and canonical effective-dated Driver/Truck assignments.
- Fleet assets: Trucks, PTI/compliance evidence, fuel, maintenance.
- Money: existing authoritative fleet finance outputs; no duplicated calculations in presentation.
- Account: membership/workspace context and settings.

### Carrier

- Carrier is a canonical ADR role but has no production navigation persona in v96.
- Its future shell may expose only assignment-scoped operational/compliance information authorized by active `CarrierAssignment` relationships.
- It must not expose a delegated fleet's complete workspace, private finance configuration, deductions, or unrelated assignments.
- Carrier IA must remain unavailable until its presentation scope, field-level view models, and cross-fleet authorization tests are independently accepted. It must not be approximated by the current `fleet` menu.

## Readiness and gaps

| Dependency | Classification | Evidence / consequence |
| --- | --- | --- |
| Published v96 shell and page registry | `READY` | Exact production publication verified at `5351d6a6`; current route ownership is contracted. |
| Accepted visual baseline | `READY_AS_VISUAL_REFERENCE` | Prototype is accepted but mock-only and must not replace `index.html` wholesale. |
| ADR-0007 role semantics | `READY / FROZEN` | Accepted at `d62cb517`; implementation validation remains mandatory. |
| Driver SELF read-only composition | `READY_WITH_UNAVAILABLE_STATE` | Existing home-card composition is present; authority failures must remain explicit. |
| Canonical-vs-legacy presentation role bridge | `MISSING` | Current `owner_op` and rank model cannot be treated as ADR authority. |
| Fleet production IA | `PARTIAL` | Existing pages and selectors exist, but shell visibility is local-persona based and not an authorization boundary. |
| Carrier production IA | `BLOCKED` | No v96 carrier persona; assignment-scoped field/view-model contract and authorization evidence are required. |
| Navigation model unification | `NOT_REQUIRED_FOR_FIRST_SLICE` | `ROLE_CONFIG` and `FUNCTION_GROUPS` intentionally remain independent; do not combine them during authority work. |
| Broad RBAC rewrite | `NOT_AUTHORIZED` | UI architecture must freeze before any broad rewrite. |

## Safe production integration sequence

1. **IA-1 - Presentation-context contract and pure resolver.** Define and contract-test a fail-closed mapping from existing authenticated membership/capability/relationship evidence to canonical `driver|fleet|carrier` presentation context. Do not change DOM, endpoint authorization, persisted roles, or navigation yet.
2. **IA-2 - Navigation projection adapter.** Project a resolved presentation context onto a copy-free navigation view while retaining existing page IDs, `showPage()` ownership, render hooks, legacy persona compatibility, and both current model inventories. No visual replacement.
3. **IA-3 - Driver shell integration.** Connect only the Driver Today/read-only context and current Driver destinations to the accepted shell tokens. Preserve PTI gate, startup, offline restore, Quick Add, and graceful degradation.
4. **IA-4 - Fleet shell integration.** Add authorized workspace summaries and explicit Driver/Truck selection using existing canonical IDs and assignments. Reuse authoritative finance outputs; do not add ranking.
5. **IA-5 - Carrier contract before carrier UI.** Define assignment-scoped fields, authorized view models, empty/revoked states, and cross-fleet isolation tests. Only then add a carrier presentation surface.
6. **IA-6 - Incremental visual-shell adoption.** Move one reviewed surface at a time; preserve page/domain ownership and require mobile/desktop/accessibility/offline regression evidence for each slice.

Every slice must retain independent server authorization. Navigation visibility tests cannot substitute for cross-tenant endpoint tests.

## Required validation gates for later implementation

- No local persona, role rank, URL, DOM value, or client-supplied ID grants authority.
- Invalid, ambiguous, inactive, or cross-workspace context fails closed.
- `owner_op` is never emitted as an authoritative membership role.
- `carrier` cannot see a fleet workspace merely by selecting its ID or by being inserted as a member there.
- Revoked/ended `CarrierAssignment` removes forward carrier visibility without rewriting historical evidence.
- Existing startup/session restore, mandatory PTI cadence, graceful degradation, offline behavior, Quick Add, route history, and service-worker cache behavior remain unchanged unless a separately approved slice explicitly changes them.
- Existing domain calculations and mutations remain in their current owners; presentation consumes view models.
- Mobile and desktop use the same authorization, scope, selector, and view-model contracts.
- All ADR-0007 Validation requirements pass before any governed implementation is declared production-ready.

## Explicit non-goals

- No broad RBAC rewrite.
- No direct replacement of production `index.html` with prototype markup or mock data.
- No role-name search/replace from `owner_op` to `fleet`.
- No carrier-as-fleet compatibility shortcut.
- No new mutation UI, ranking, legacy backfill, or historical reconstruction.
- No SIDR, Dispatch, Safety, Truckpedia, GitHub #206480, or unrelated workflow work.
- No merge, deployment, migration, or production/staging data mutation.

## Recommended next bounded slice

After independent review, the smallest safe continuation is **IA-1: Presentation-context contract and pure resolver**.

Before any runtime edit, IA-1 must pin the existing session/membership/capability input shapes, define fail-closed outcomes, and prove that legacy persona state cannot grant or widen authority. It should introduce no DOM or visual change, no persisted-role migration, no endpoint-policy rewrite, and no carrier UI.

