# CrewBIQ UI Refresh

## Goal
Apply the approved Base44-inspired visual direction to CrewBIQ Driver without replacing existing data models, calculations, offline behavior, sync, identity, or fleet logic.

## Design direction
- Deep navy background with electric-blue accent
- Branded launch/splash experience
- Cleaner app shell and visual hierarchy
- Driver-first mobile navigation
- Bottom navigation: Home, Links, + Load, Expenses, Menu
- Larger KPI cards and faster quick actions
- Consistent spacing, typography, borders, and motion
- Preserve accessibility and offline-first behavior

## Guardrails
- Do not replace current entities or storage keys
- Do not alter payroll, deductions, disputes, or settlement formulas
- Do not break CrewBIQ ID, orchestrator sync, service worker, or migrations
- Introduce changes incrementally behind a dedicated branch
- Validate existing flows after each visual change

## Initial implementation scope
1. Design tokens and shared visual primitives
2. Launch/splash overlay
3. App shell and bottom navigation
4. Home dashboard visual refresh
5. Load and expense form styling
6. Menu and settings visual refresh

## Validation
- Existing unit and E2E tests remain green
- Offline startup and cached shell still work
- Existing account data remains visible
- No new storage schema is introduced
