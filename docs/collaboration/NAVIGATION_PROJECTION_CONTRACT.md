# CrewBIQ IA-2 Navigation Projection Contract

Status: `IMPLEMENTED / AWAITING INDEPENDENT REVIEW`

## Boundary

`navigation-projection.js::projectNavigation(presentationContext,
navigationModel)` is a pure, disconnected presentation adapter. It consumes an
already-resolved `PresentationContext` and the existing
`CrewBIQNavigationModel`; it grants no authority and performs no DOM, routing,
rendering, persistence, transport, or mutation work.

`ROLE_CONFIG`, `FUNCTION_GROUPS`, `PAGE_REGISTRY`, page IDs, `showPage()`, and
all render hooks remain owned by their existing files. The projection references
the canonical role-config/page-registry objects and calls existing model
lookups; it defines no replacement navigation inventory.

## Projection rules

1. `unavailable`, `unauthorized`, and `ambiguous` PresentationContext inputs
   retain that status and return an empty navigation payload.
2. A resolved canonical `driver` always projects the current `driver` model.
   `legacyPersona` can never elevate it to `owner_op` or `fleet`.
3. A resolved canonical `fleet` projects `fleet` by default. Existing
   `driver` or `owner_op` legacy presentation state may only narrow that view;
   it does not change `membershipRole` or server authority.
4. A resolved canonical `carrier` returns explicit
   `carrier_navigation_not_available`. It is never approximated as `fleet`;
   carrier presentation remains gated by IA-5.
5. Invalid role, workspace, persona, or navigation-model input fails closed
   without the current model's legacy invalid-role-to-driver fallback.
6. Every returned destination and group comes from the existing navigation
   model in its existing order. Endpoint authorization remains independent.

## Evidence

`tests/navigation-projection.test.mjs` proves non-resolved zeroing, no persona
promotion, fleet-only narrowing, carrier unavailability, inventory identity,
page-ID/order preservation, invalid-input failure, purity, input immutability,
and absence of DOM/router/network/storage effects. It is wired into
`npm run test:e2e:tooling`.

## Non-goals

- no `index.html`, `navigation-model.js`, `showPage()`, render-hook, or shell
  composition change;
- no canonical role/capability persistence or endpoint-policy change;
- no carrier UI, visual replacement, migration, data population, deployment,
  or IA-3 implementation.
