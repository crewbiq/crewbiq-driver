# CrewBIQ IA-3A Driver Shell Integration Contract

Status: `PROPOSED / AWAITING INDEPENDENT REVIEW`

## Purpose and boundary

This contract defines the smallest production-shell connection for the
accepted pure `PresentationContext` resolver and IA-2 navigation projection.
It is Driver-only and read-only. It does not implement the connection, alter
authorization, add a carrier surface, replace the visual shell, or change any
business-data mutation.

The shell remains a presentation consumer. Every protected endpoint continues
to authorize its request independently; visibility never grants authority.

## Existing owners that remain unchanged

- `startup-session.js` remains the sole boot, restore, PTI-gate, and `showApp`
  owner.
- `index.html::showPage()` remains the sole DOM router and render-hook
  dispatcher.
- `navigation-model.js` remains the sole owner of `ROLE_CONFIG`,
  `FUNCTION_GROUPS`, `PAGE_REGISTRY`, page IDs, and navigation lookup rules.
- `driver-self.js` plus the accepted AccountDriverLink and
  DriverTruckAssignment adapters remain the read-only Driver SELF evidence
  chain.
- Quick Add, route history, PTI cadence/blocker behavior, offline restore, and
  legacy local workflows retain their current owners and behavior.

## Exact integration shape

The implementation slice may add one in-memory Driver presentation coordinator
and load the already accepted `presentation-context.js` and
`navigation-projection.js` modules. Required script order is:

1. accepted identity/relationship read adapters;
2. `driver-self.js`;
3. `navigation-model.js`;
4. `presentation-context.js`;
5. `navigation-projection.js`;
6. the existing inline shell/composition code.

The coordinator derives one snapshot key from the authenticated session token,
canonical account ID, and server-active workspace ID. It reads only the
existing normalized adapters, passes their successful results plus `/v1/me`
memberships and an explicit evaluation timestamp to
`resolvePresentationContext()`, then passes the result and the existing
`CrewBIQNavigationModel` to `projectNavigation()`.

The coordinator is lazy and non-blocking. It may refresh when Home renders,
after a successful Orchestrator connection, or after an explicit active
workspace switch. It must not add a boot/restore/showApp call, delay PTI
routing, schedule sync, or issue a request merely because its script loaded.
Only the newest snapshot key may update presentation state; stale asynchronous
results are discarded. Disconnect and workspace change clear the in-memory
snapshot without changing local business records.

## Driver-only application rule

Only a projection with all of the following may influence shell visibility:

- `status === 'resolved'`;
- `membershipRole === 'driver'`;
- non-blank canonical `workspaceId`; and
- `presentationPersona === 'driver'`.

That result may only narrow visible menu/bottom destinations to the existing
Driver model. It must not create destinations, rename page IDs, invoke
`setUserRole()`, write `fiqD_userRole`, alter role rank, or suppress endpoint
authorization. Existing Driver SELF status rendering remains the Today
read-only canonical-state surface.

Fleet and carrier projections are not applied in IA-3. Fleet stays on its
current legacy shell pending IA-4. Carrier stays explicitly unavailable until
IA-5 and is never mapped to fleet.

## Graceful degradation and lockout prevention

`PresentationContext` and navigation projection correctly return empty
fail-closed payloads when canonical authority is absent or invalid. IA-3 must
not reinterpret that empty canonical payload as an instruction to hide or lock
the entire legacy-capable application.

For no connected Orchestrator account, network/server unavailable, missing
canonical relationship evidence, or `unavailable`/`unauthorized`/`ambiguous`
context:

- retain the current legacy presentation/navigation and offline-capable
  workflows;
- render Driver SELF through its existing explicit unavailable/unauthorized
  state;
- never infer Driver, Truck, workspace, role, capability, or relationship;
- never bypass PTI or create a full-app lockout; and
- never cache a failed canonical result as authority.

If canonical Driver authority later resolves, the coordinator may apply the
Driver-only narrowing. If it becomes unavailable or the session/workspace key
changes, the shell returns to the pre-existing legacy presentation rather than
retaining stale canonical visibility.

## Cache and publication discipline

Because the implementation will change `index.html` and add accepted modules
to the cache-first app shell, it must rotate `crewbiq-driver-v97` to `v98`, add
both module paths to the service-worker shell, and update every exact cache
assertion. No cache rotation occurs in this documentation slice.

## Required implementation tests

1. Script load order is exact and each accepted module loads once.
2. Module load performs no request, DOM mutation, storage write, boot, PTI, or
   sync action.
3. Resolved canonical Driver plus stale `owner_op`/`fleet` persona displays
   only existing Driver destinations without writing the persona.
4. No-account and network/server-unavailable states preserve legacy workflows
   and keep PTI submittable under the accepted graceful-degradation contract.
5. Unauthorized/ambiguous context never applies partial or stale projection.
6. Fleet context is not altered by IA-3; carrier is never mapped to fleet.
7. Workspace/session change invalidates the in-memory snapshot and stale
   promises cannot update the shell.
8. Home render, account connection, and workspace switch reuse one coordinator
   refresh path without duplicate evidence requests.
9. `showPage()` remains unique; render hooks, route history, Quick Add, and
   bottom destination page IDs remain unchanged.
10. Startup/session restore, PTI attribution/blocker, offline, Driver SELF,
    navigation, hotfix load order, index parse/composition, service-worker path,
    and full tooling regressions remain green.

## Implementation allowlist after independent acceptance

- one new in-memory Driver presentation coordinator module;
- `index.html` only for script load and narrow refresh/application wiring;
- `sw.js` for v98 cache rotation and new shell assets;
- targeted IA-3 tests and existing exact cache assertions;
- `package.json` only for test wiring;
- collaboration evidence/state.

No other product file, endpoint, role/capability, navigation inventory,
business logic, workflow, migration, data, deployment, or later IA slice is
included.
