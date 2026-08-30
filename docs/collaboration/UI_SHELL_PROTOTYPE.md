# CrewBIQ Next Read-Only Visual Shell Prototype

## Purpose and design goals

Slice 4A demonstrates that a substantially different premium shell can consume the accepted navigation model without replacing the production application or duplicating business logic. The direction is calm, mobile-first fleet SaaS: deep navy surfaces, electric-blue hierarchy, restrained glow, high legibility, generous spacing, and motion that communicates state rather than decorating every control.

## Prototype files

- `prototype/crewbiq-next/index.html`: isolated static shell and semantic UI structure.
- `prototype/crewbiq-next/styles.css`: reusable prototype tokens, components, responsive layout, focus treatment, and reduced-motion support.
- `prototype/crewbiq-next/app.js`: in-memory demo state, role adaptation, navigation rendering, mock screens, and prototype interactions.
- `tests/ui-shell-prototype.test.mjs`: parse, isolation, model-consumption, and production-hash safety contract.

Open `prototype/crewbiq-next/index.html` directly in a browser. It uses the repository's accepted `navigation-model.js` through `../../navigation-model.js`; no build or package install is required. Network access is used only for the Manrope/Sora web fonts, with local fallbacks.

## Visual system

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

