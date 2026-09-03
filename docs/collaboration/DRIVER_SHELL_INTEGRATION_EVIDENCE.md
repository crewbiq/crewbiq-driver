# IA-3 Driver shell integration evidence

Status: PUBLISHED / AWAITING CLAUDE REVIEW

Implementation: `c0ec7d884f59f4eca91fee311a8b11cbfa98f628`
Branch: `agent/pre-base44-audit`
Release readiness: NOT_READY_FOR_PRODUCTION

## Changes

- `driver-presentation.js`: one lazy in-memory coordinator reuses the existing
  Driver SELF reader and captures its adapter results for PresentationContext.
- `index.html`: loads the three modules, delegates the existing SELF refresh
  entry point, applies Driver-only presentation, and invalidates on disconnect.
- The render-time role helper checks session/account/workspace snapshot identity
  before using any previously resolved projection. The key remains in memory.
- `sw.js`: cache `crewbiq-driver-v98` and the three new shell assets.
- Package wiring, targeted coordinator tests, exact cache assertions, and the
  navigation-shell helper assertion were updated without weakening their checks.

No server role/capability, endpoint, domain-module, navigation-inventory,
migration, business-data, deployment, or merge change is included.

## Executed checks

`node --test tests/driver-presentation.test.mjs`: 10 passed, 0 failed.

`npm run test:e2e:tooling`: 366 passed, 0 failed.

The new tests execute the real coordinator, SELF reader, resolver and projection
against controlled adapter responses. They cover successful Driver composition,
no-account and network failure, assignment authorization denial, Fleet/Carrier
non-application, ambiguous membership, ordinary in-flight request reuse, stale
completion disposal, render-time session/account/workspace invalidation, and
script/cache wiring.

The existing tooling suite covers startup, inline-script parsing, PTI contracts,
navigation ownership, hotfix load order, and service-worker paths. This is
unit/static-contract evidence, not authenticated browser or live server evidence.

## Remaining dependency

`CANONICAL_DRIVER_ASSIGNMENT_READ_NOT_AUTHORIZED`

At accepted orchestrator commit
`4c85fd41d90ec542b7b1c0c15c9e1ca80ec1dda1`, the canonical `driver` capability
set contains AccountDriverLink read but not DriverTruckAssignment read. The
current assignment endpoint requires `canonical.driver_truck_assignment.read`.
Consequently, the successful Driver scenario in the new suite uses a controlled
adapter response and does not prove that a real canonical Driver can complete
the chain against that backend. Its authorization-denial scenario explicitly
proves that the client retains legacy presentation rather than inventing a
Truck or treating the denied read as successful integration.

No broader capability was granted as a workaround. Any future backend correction
must independently enforce the authenticated Driver's own scope; granting
workspace-wide assignment-read authority is not authorized by this slice.

Authenticated browser, mobile/desktop, and live offline smoke were not executed.
Claude must review both implementation correctness and these evidence limits
before a subsequent bounded action is selected. No deployment is authorized.
