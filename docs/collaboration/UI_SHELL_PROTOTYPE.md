# CrewBIQ Next Read-Only Visual Shell Prototype

## Purpose and design goals

Slice 4A demonstrates that a substantially different premium shell can consume the accepted navigation model without replacing the production application or duplicating business logic. The direction is calm, mobile-first fleet SaaS: deep navy surfaces, electric-blue hierarchy, restrained glow, high legibility, generous spacing, and motion that communicates state rather than decorating every control.

## Prototype files

## Mobile visual review

### Slice 4A.2 mobile polish

The accepted visual direction and bottom navigation remain unchanged. Phone typography now uses a 16px body floor with larger secondary, metric, card, navigation, and sheet text. The mobile hero is approximately one quarter more compact. Work, Truck, Money, and Team open with role-aware operational summary signals before their capability cards. Role testing remains available through a compact prototype workspace control, while the normal header presents only subtle role metadata.

Use `prototype/crewbiq-next/crewbiq-next-standalone.html` for Android and other file/content-provider review. This file is intentionally self-contained: CSS, prototype JavaScript, SVG generation, and a read-only embedded navigation-model snapshot are inline. It requires no neighboring files, local server, npm, production runtime, or network access. The canonical model remains `navigation-model.js`; the embedded snapshot is review packaging only.

The standalone retains the same desktop design and phone breakpoints. At phone widths the rail is hidden, bottom navigation is shown, content grids collapse, role controls remain touchable, and bottom navigation/Quick Add account for safe-area insets.

- `prototype/crewbiq-next/index.html`: isolated static shell and semantic UI structure.
- `prototype/crewbiq-next/crewbiq-next-standalone.html`: portable single-file offline visual-review build.
- `prototype/crewbiq-next/styles.css`: reusable prototype tokens, components, responsive layout, focus treatment, and reduced-motion support.
- `prototype/crewbiq-next/app.js`: in-memory demo state, role adaptation, navigation rendering, mock screens, and prototype interactions.
- `tests/ui-shell-prototype.test.mjs`: parse, isolation, model-consumption, and production-hash safety contract.

Open `prototype/crewbiq-next/index.html` directly in a browser. It uses the repository's accepted `navigation-model.js` through `../../navigation-model.js`; no build or package install is required. Network access is used only for the Manrope/Sora web fonts, with local fallbacks.

## Visual system

## Data Visualization Layer

`prototype/crewbiq-next/charts.js` provides a dependency-free `CrewBIQCharts` namespace with reusable single/multi-series line charts, bars, progress signals, shared tooltips, selection guides, zero-state markup, and role-aware dashboard composition. SVG charts are generated from isolated mock datasets and are inlined into the standalone build.

Driver Today shows daily earnings and Loaded vs Deadhead miles. Owner-Op adapts to Revenue vs Net, Loaded vs Deadhead miles, and Fuel cost per mile. Fleet shows Fleet Gross, utilization bars, and a non-line Compliance & Evidence progress view. KPI sparklines remain unchanged as fast indicators; full charts answer weekly operational questions below the snapshot.

Mouse hover and forgiving pointer/touch selection choose the nearest day, reveal a bounded tooltip, emphasize marks, and show a vertical guide for Cartesian charts. Initial render and role changes replay restrained line/bar/progress animation. CSS reduced-motion handling collapses those animations when requested. Mobile uses one full-width card per row, readable 12–14px chart text, no horizontal chart scrolling, and the accepted bottom navigation remains untouched.

Empty analytics do not draw a fabricated trend. `zeroStateMarkup()` displays a dedicated message such as “No earnings recorded this week”; the System States screen includes this visual treatment.

Every selection emits `crewbiq:chart-select` with `{ chartId, role, metric, period, selectedDate, selectedSeries, selectedValue, relatedEntityIds }`. This is a prototype event contract for a future chart → drill-down → SIDR explanation path. SIDR, related-entity lookup, persistence, transport, production analytics, and all displayed values remain unimplemented/mock-only.

The design system uses named color tokens, a four-to-48-pixel spacing scale, three surface levels, consistent 12/18/26/34-pixel radii, restrained shadows, semantic positive/warning/danger colors, and reusable card/button/status/icon patterns. Desktop uses a compact navigation rail and fluid dashboard grid. Phone layouts use a five-position floating bottom bar, stacked content, touch-sized controls, and a native-feeling Quick Add sheet.

## Navigation and role adaptation

The prototype consumes `CrewBIQNavigationModel.visibleFunctionGroups()` and `bottomDestinationsForRole()` rather than maintaining disconnected role menus. Driver and Owner-Op show Home, Work, Truck, Money; Fleet shows Home, Work, Team, Money. Functions, domain hubs, owner-only tools, Links reachability, and Fleet Team visibility follow the extracted model. A prototype-only role switch changes dashboard mock metrics and every model-driven surface.

## Implemented visual screens

- Animated CREWBIQ launch treatment and automatic transition.
- Driver, Owner-Op, and Fleet home dashboards with representative metrics and operational status.
- Work, Truck, Money, and Team domain hubs.
- Model-driven Functions directory.
- Links search, category filters, favorites presentation, and add-link affordance using mock data.
- Secondary capability preview with page header/back behavior.
- Role-aware Quick Add sheet.
- Loading, empty, and recoverable error-state gallery.
- PTI, OCR/document, sync, evidence, and audit-readiness visual status without implementing their logic.

## Mock-only and intentionally absent

All dashboard values, loads, links, truck state, compliance percentages, sync messages, and role selection are in-memory demo data. No `fiqD_*` storage is read or written. Buttons that imply mutations only show a prototype toast. The prototype does not implement authentication, startup/session behavior, PTI policy, OCR transport, Document Vault, IFTA calculations, audit logic, backend authorization, persistence, deployment, or production routing.

## Possible production integration path

After visual acceptance, a separate bounded plan can map reusable shell components onto the existing `showPage()` and domain render hooks. Integration must retain `navigation-model.js` as the capability source, keep business-domain ownership separate from visual presentation, and migrate one reviewed surface at a time behind existing contracts. This prototype must not be copied over production `index.html` wholesale.

## Manual visual review checklist

- Let the splash transition complete and confirm motion feels restrained.
- Switch among Driver, Owner-Op, and Fleet; confirm dashboard, Truck/Team, Functions, and Quick Add adapt.
- Review Home at phone width, tablet width, and desktop width.
- Open each bottom destination and the Functions directory.
- Open Links, search, filter by category/favorites, and trigger mock actions.
- Open a capability card and verify header/back behavior.
- Open Quick Add and dismiss it by close button, scrim, and Escape.
- Open Synced/System states and review loading, empty, and error feedback.
- Check keyboard focus visibility and reduced-motion preference.
