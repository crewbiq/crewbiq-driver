# CrewBIQ Navigation / Role Menu / FUNCTION_GROUPS Behavior Contract

## Scope and evidence

## Slice 3B runtime ownership

`navigation-model.js` owns the independent `ROLE_CONFIG` and `FUNCTION_GROUPS` models, `ROLE_RANK`, page/primary metadata, and pure lookup helpers. It loads immediately after `links.js`, before its inline consumers, and outside the 18-script hotfix chain. Compatibility globals preserve existing callers; the effective Scan insertion order is represented directly in the extracted model.

`index.html` retains page markup, `getUserRole`, the single effective `setUserRole`, menu DOM glue, `showPage`, render dispatch, primary-nav DOM updates, history/back, visual shell, and event wiring. `core-runtime.js` retains `installRoleGuard()` unchanged: its `DOMContentLoaded` callback wraps that same setter using `fiqD_authRoles`. The model exports no setter or router.

Slice 3A contract-pins the navigation behavior implemented in `index.html` at accepted Slice 2B state. It does not redesign or extract navigation. Static observations are marked `STATIC_CONTRACT`; executable model/routing checks are marked `UNIT_CONTRACT`; browser layout, focus, animation, and actual back interaction remain `E2E_REQUIRED`.

## Current navigation architecture

- Bottom navigation owns the primary shell destinations: `home`, `work`, role-adaptive `truck`/`team`, and `money`. The center Add control opens quick add and is not a page or function group.
- Domain pages `work`, `truck`, `money`, and `team` are active technical containers that route to feature pages without owning their business logic.
- `menuGrid` is rendered by `applyRoleUI()` from `FUNCTION_GROUPS`; it is the grouped Functions directory.
- `ROLE_CONFIG` separately holds role metadata and a flat ordered menu inventory. Its `menu` array is not used to render `menuGrid`.
- Header/account navigation opens `settings`. The single back control uses in-memory `pageNavigationHistory` and domain fallback mapping.
- `showPage()` owns DOM page activation, primary-nav highlighting, render-hook dispatch, and back-control updates.
- Marketplace uses `moduleTarget()` shortcuts. Its `links` shortcut resolves to `community`; Marketplace does not own Links storage, rendering, or primary reachability.

## Page registry

`Allowed roles` describes current visible navigation surfaces, not an authorization boundary. Direct `showPage()` calls do not enforce roles.

| Page id | Visible label / icon | Allowed roles on visible surfaces | Navigation source | Render hook | Domain owner | Classification | Dependencies / reachability |
|---|---|---|---|---|---|---|---|
| `home` | Today / 🏠 | all | bottom nav | `renderHome` | dashboard | ACTIVE | initial active page; directly reachable |
| `work` | Work / 🛣️ | all | bottom nav | static container | work shell | ACTIVE (technical container) | routes to load, disputes, scan |
| `truck` | Truck / 🚛 | driver, owner_op | bottom nav | static container | truck shell | ACTIVE (technical container) | hidden for fleet; routes to PTI and owner features |
| `team` | Team / 👥 | fleet | bottom nav | static container | fleet shell | ACTIVE (technical container) | shown only for fleet; routes to fleet and drivers |
| `money` | Money / 💳 | all | bottom nav | static container | finance shell | ACTIVE (technical container) | routes to expenses/report/stats and role-gated deductions |
| `load` | Loads / 📦 | all | ROLE_CONFIG, FUNCTION_GROUPS, Work, quick add | `renderLoadPage` | loads | ACTIVE | directly reachable |
| `disputes` | Disputes or Exceptions / ⚖️ | all | ROLE_CONFIG, FUNCTION_GROUPS, Work, quick add | `renderDriverDisputedPage` | disputes | ACTIVE | label differs between models |
| `scan` | Scan, Documents / 📷 or 📄 | all | injected ROLE_CONFIG item, FUNCTION_GROUPS, Work, quick add | `renderScanReview` | document intake | ACTIVE | icon and label differ between models |
| `pti` | PTI or Inspections / 🔍 | all | ROLE_CONFIG, FUNCTION_GROUPS, Truck, quick add | `renderPTIPage` | inspections | ACTIVE | startup PTI gate is separate from page navigation |
| `fuel` | Fuel / ⛽ | owner_op, fleet | ROLE_CONFIG, FUNCTION_GROUPS, Truck, quick add | `renderFuelPage` | truck costs | ACTIVE | UI role visibility only |
| `service` | Service or Maintenance / 🔧 | owner_op, fleet | ROLE_CONFIG, FUNCTION_GROUPS, Truck, quick add | `renderServicePage` | maintenance | ACTIVE | label differs between models |
| `expenses` | Expenses / 💳 | all | ROLE_CONFIG, FUNCTION_GROUPS, Money, quick add | `renderExpenses` | expenses | ACTIVE | directly reachable |
| `report` | Reports / 📄 | all | ROLE_CONFIG, FUNCTION_GROUPS, Money | no-op branch | reporting | ACTIVE | page DOM performs user-driven report actions |
| `stats` | Stats or Performance / 📈 | all | ROLE_CONFIG, FUNCTION_GROUPS, Money | `renderStats`, `renderFleetStats` | analytics | ACTIVE | two hooks execute on entry |
| `deductions` | Deductions / 💰 | owner_op, fleet | ROLE_CONFIG, FUNCTION_GROUPS, Money | `renderDeductionsPage` | deductions | ACTIVE | UI role visibility only |
| `fleet` | Fleet or Fleet overview / 🚚 | fleet | ROLE_CONFIG, FUNCTION_GROUPS, Team | `renderFleetPage` | fleet | ACTIVE | fleet-visible surface |
| `drivers` | Drivers / 👥 | fleet | ROLE_CONFIG, FUNCTION_GROUPS, Team | `renderDriversPage` | drivers | ACTIVE | fleet-visible surface |
| `community` | Links / 🔗 | all | ROLE_CONFIG, FUNCTION_GROUPS, Marketplace shortcut | `renderCommunity` | Links (`links.js`) | ACTIVE | active technical DOM container for extracted Links runtime |
| `settings` | Settings or Account / ⚙️ | all | ROLE_CONFIG, FUNCTION_GROUPS, header | `renderSettingsPage(true)` | settings | ACTIVE | role-aware settings catalog remains separate |
| `menu` | Functions / ☰ | all | menu control and invalid-page fallback | `applyRoleUI` | navigation shell | LEGACY_CONTAINER | reachable grouped directory; must not be removed while active |
| `marketplace` | CrewBIQ Place / 🧩 | none in current navigation | no live navigation surface | `renderMarketplace` | module catalog | ORPHANED | DOM and runtime remain, but no current route reaches the page |

## Role matrix

### Bottom navigation

| Role | Ordered visible destinations |
|---|---|
| driver | home, work, truck, money |
| owner_op | home, work, truck, money |
| fleet | home, work, team, money |

### ROLE_CONFIG flat menu order

- driver: load, report, expenses, scan, disputes, pti, stats, community, settings
- owner_op: load, report, expenses, scan, fuel, deductions, service, disputes, pti, stats, community, settings
- fleet: load, fleet, drivers, report, expenses, scan, fuel, deductions, service, disputes, pti, stats, community, settings

`scan` is inserted after `expenses` at script evaluation time for all three roles.

### FUNCTION_GROUPS visible order

- driver: Work(load, disputes, scan); Truck(pti); Money(expenses, report, stats); Resources & account(community, settings)
- owner_op: Work(load, disputes, scan); Truck(pti, fuel, service); Money(expenses, report, stats, deductions); Resources & account(community, settings)
- fleet: Work(load, disputes, scan); Truck(pti, fuel, service); Money(expenses, report, stats, deductions); Team(fleet, drivers); Resources & account(community, settings)

`roles:['fleet']` gates the Team group. `minRole:'owner_op'` uses rank `driver:0`, `owner_op:1`, `fleet:2` for fuel, service, and deductions.

## Role restore and invalid roles

- `getUserRole()` returns persisted `fiqD_userRole`, defaulting only when the key is absent/falsy.
- `setUserRole()` rejects values absent from `ROLE_CONFIG`.
- Restore from owner data upgrades only a current `driver` to `owner_op` or `fleet`; it does not downgrade or replace another persisted value.
- A stale non-empty invalid persisted role is not normalized. `applyRoleUI()` uses driver metadata as its badge fallback, but rank comparisons receive `undefined`, producing a conservative yet internally inconsistent menu. This is a non-blocking extraction risk.
- Role checks are navigation visibility rules only. `showPage()` has no role enforcement, so direct calls can open pages hidden from menus. Because roles are locally user-selectable and are not an authorization boundary, this is current behavior to preserve during extraction, not evidence of a security permission boundary.

## FUNCTION_GROUPS and ROLE_CONFIG ownership

The models are independently maintained views that currently contain equal role-specific target sets but different ordering, labels, and some icons. `FUNCTION_GROUPS` owns grouped Functions rendering and `minRole`/group visibility. `ROLE_CONFIG` owns role metadata and a flat legacy inventory; only its label/icon metadata is consumed by current `applyRoleUI()`. They can drift and must not be merged during behavior-preserving extraction.

Known differences include Disputes/Exceptions, Scan/Documents with 📷/📄, PTI/Inspections, Service/Maintenance, Stats/Performance, and Fleet/Fleet overview. Contract tests pin both independent orders and verify target-set parity per role.

## showPage routing contract

- Removes `active` from every `.page`, then resolves `page-{name}`.
- An invalid page falls back to `menu`, sets `currentPageName` to `menu`, invokes `applyRoleUI()`, and updates back navigation.
- Pushes the prior page for secondary forward navigation; entering a primary page clears history. Back-mode navigation does not push history.
- Activates the destination and clears all `.navbtn` active state.
- Highlights an explicit clicked primary button or the visible primary destination derived by `primaryDestinationForPage()`.
- Dispatches the exact render hooks listed in the registry. Domain containers use existing static markup. `report` has an explicit no-op branch.
- Calls `updatePageBackNavigation(name)` after rendering.
- Does not call `scrollTo`, browser History APIs, or role enforcement. History is in-memory only.
- Modal overlays are outside `showPage`; quick add closes itself before routing.
- Browser-level visual state, focus, physical scrolling, and back interaction are `E2E_REQUIRED`.

## Marketplace shortcuts and Links ownership

`moduleTarget()` maps `expenses→expenses`, `links→community`, `reports→report`, `pti→pti`, and `fuel→expenses`. `openModule()` routes immediately; `installModule()` persists installation, rerenders Marketplace, then routes after 250 ms. Links remains independently reachable through every role's ROLE_CONFIG and FUNCTION_GROUPS entries. Marketplace neither owns nor is required for Links.

## Legacy, orphaned, and technical-container caveats

- `menu` is a reachable legacy container and invalid-route fallback; removing it would break routing behavior.
- `work`, `truck`, `money`, and `team` are active technical containers. Their lack of render hooks does not make them dead pages.
- `community` is an active technical container whose runtime owner is extracted `links.js`.
- `marketplace` is currently orphaned: its page and renderer exist, but no live navigation surface targets it. Preserve it during a behavior-only extraction; removal requires a separate product decision.

## Existing test inventory

- `navigation_shell.test.mjs`: static primary nav, domain containers, group names, role adaptation, keyboard-related markup, and back-control structure.
- `settings_information_architecture.test.mjs`: settings catalog, role-specific placement, unique IDs, and settings render reset behavior.
- `index-startup-composition.test.mjs`: inline script parsing and startup ownership; it does not contract-pin navigation semantics.
- `tests/e2e/navigation-shell.spec.mjs`: browser navigation-shell behavior; environment-sensitive and therefore `E2E_REQUIRED` for this slice.
- Links contracts protect `community` module behavior but not its complete navigation reachability.
- Existing role mission tests describe staging journeys, not ROLE_CONFIG/FUNCTION_GROUPS parity.

## Extraction invariants and readiness

`READY_FOR_NAVIGATION_EXTRACTION`.

Recommended Slice 3B boundary: add `navigation-model.js` owning data/model only: page registry metadata, role navigation definitions, grouping definitions, role-rank and lookup helpers. Keep DOM page markup, `showPage()` DOM mutation, visual shell, render-hook dispatch, history/back behavior, and existing event wiring in `index.html`. Preserve both models before any reviewed unification.

Future Base44-inspired visual/navigation redesign may change the visual shell, cards, bottom navigation, sidebar, icons, grouping, transitions, and dashboard presentation. It must not silently change product feature availability, role permissions, page/domain ownership, persistence, business logic, or audit/compliance behavior. Visual navigation and business-domain ownership must become separate layers.
