# CrewBIQ Architecture Snapshot for Pre-Base44 Audit

## Runtime decomposition status

Current runtime has a hybrid form:

- A module-extracted path via `core.js` for most major domains.
- A monolithic `index.html` that still orchestrates bootstrap, routing/rendering, startup guards, and several domain workflows.

## Current module map (high confidence)

- `core-runtime.js`: transport compatibility layer for auth/login/bootstrap/restore endpoints and fetch wrappers.
- `sync.js`: sync orchestration facade.
- `loads.js`: load operations and lifecycle helpers.
- `expenses.js`: expense-domain operations.
- `settings.js`: settings/configuration persistence and updates.
- `company.js`: company/account domain operations.
- `fleet-stats.js`, `deductions.js`, `pti.js`: specialty domain modules.
- `offline-sync-queue.js`: background mutation queue with persistence and online retry.
- `sw.js`: shell + cache strategy for PWA behavior.
- `index.html`: remaining orchestration and glue logic.

## App shell / boot flow

1. Parse startup token and route context.
2. Run `restoreSession()` (if token available) and/or default boot path.
3. Run bootstrap checks and UI boot sequence in `boot()`.
4. Evaluate PTI gating before app activation.
5. Render pages and role-based UI.
6. Register service worker and finalize startup.

## Current integration risks

- Shared mutable state and timing assumptions are concentrated in `index.html`.
- Several modules expect side effects in specific order rather than explicit dependency injection.
- Links/community and OCR UI logic should be extracted without introducing contract drift.

## Decomposition principle

Cut by contract stability and state ownership:

- First cut: startup/auth/session contract.
- Second cut: local link registry and OCR transport.
- Third cut: queue/retry and module lifecycle boundaries.

Any deeper cuts should occur only after each exported contract has tests or smoke assertions.

