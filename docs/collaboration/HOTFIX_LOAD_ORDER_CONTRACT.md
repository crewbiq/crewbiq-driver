# Hotfix Load Order Contract — Pre-Base44 Audit

## Scope

Date: 2026-08-30  
Branch: `agent/pre-base44-audit`  
Source: `core.js` loader chain

## Verified chain in `core.js`

The `load()` chain in `core.js` is required to remain stable for current deployment behavior:

1. `core-runtime.js?v=20260712-full-restore`
2. `offline-sync-queue.js?v=20260716-offline-sync-v2`
3. `restore-hotfix.js?v=20260715-disputes-sync-v1`
4. `settings-hotfix.js?v=20260712-settings-reconcile-v2`
5. `owner-snapshot-hotfix.js?v=20260713-owner-snapshot-v2`
6. `load-order-hotfix.js?v=20260717-load-order-v1`
7. `deduction-policy-hotfix.js?v=20260713-deduction-policy-v1`
8. `deduction-period-hotfix.js?v=20260717-deduction-period-v1`
9. `settlement-week-hotfix.js?v=20260717-settlement-week-v1`
10. `deduction-trip-resolution.js?v=20260717-deduction-trip-v2`
11. `accounting-action-guard.js?v=20260717-accounting-guard-v1`
12. `deduction-policy-ui-fix.js?v=20260713-deduction-policy-ui-v1`
13. `ocr-hotfix.js?v=20260712-ocr-auth-v1`
14. `ocr-invoice-review.js?v=20260712-ocr-invoice-v2`
15. `ocr-item-alias-hotfix.js?v=20260712-defd-alias-v1`
16. `ocr-service-invoice-review.js?v=20260713-service-invoice-v1`
17. `service-invoice-legacy-upgrade.js?v=20260713-service-legacy-v1`
18. `dispute-tombstone-hotfix.js?v=20260716-dispute-delete-v1`

## Contract requirements

1. Each of the 18 entries must exist in `core.js`.
2. Each entry must appear exactly once.
3. The sequence above must be exact and contiguous.
4. Every entry must reference an existing file on disk (query string ignored for file lookup).
5. Any mismatch in length, order, duplicate, or missing script should fail audit.

## 18-script dependency map

### 1) `core-runtime.js`

- Provides `window.CrewBIQCore` transport and orchestrator helpers.
- Must be first; all later hotfix adapters require Core APIs.

### 2) `offline-sync-queue.js`

- Reads/writes queue and replay utilities that feed orchestrated sync callers.
- Supports later hotfix flows via persistence and retry behavior but does not own ordering.

### 3) `restore-hotfix.js`

- Wraps `fetch` and handles `/v1/restore/pwa` path.
- Exposes `CrewBIQRestoreHotfix` helpers used by owner snapshot adapter.

### 4) `settings-hotfix.js`

- Wraps settings restore/sync payload behavior; depends on `CrewBIQCore`.
- No hard dependency on subsequent deduction/OCR scripts.

### 5) `owner-snapshot-hotfix.js`

- Wraps driver/dispute/expense/save flows and attaches restore snapshot overlays.
- Reads `CrewBIQRestoreHotfix.loadScopedExpenses` when available.
- Depends on storage loaders/savers (`loadExpenses`, `loadServiceLogs`, `loadDedTemplates`, `loadWeeklyDeds`) that are defined in `index.html` modules later in runtime.

### 6) `load-order-hotfix.js`

- Loads before `loads.js` and installs `CrewBIQLoads` interceptors.
- Defines stable load ordering and restored-edit compatibility for load IDs and dates.

### 7) `deduction-policy-hotfix.js`

- Adds active-policy engine helpers (`effectivePolicies`, `buildWeeklySnapshot`) and modal overrides used by settlement/calculation scripts.
- Expects truck/company load/save primitives in app globals.

### 8) `deduction-period-hotfix.js`

- Reuses policy modal behavior and monkey-patches `openAddDedTemplate` and `saveDedModal`.
- Exports policy extension APIs via `CrewBIQDeductionPeriods`.

### 9) `settlement-week-hotfix.js`

- Adds week calculation contract used by settlement resolution and guards.
- Writes back UI date fields and settlement operations through existing render helpers.
- Exposes `CrewBIQSettlementWeek` consumed by later accounting scripts.

### 10) `deduction-trip-resolution.js`

- Resolves trips to settlement periods and weekly snapshots.
- Depends on `CrewBIQSettlementWeek` and `CrewBIQDeductionPolicies` for policy period calculation.

### 11) `accounting-action-guard.js`

- Injects confirmation and exception UI around settlement mutations.
- Consumes `CrewBIQSettlementWeek`, `CrewBIQDeductionPolicies`, `loadWeeklyDeds`, and `renderDeductionsPage`.

### 12) `deduction-policy-ui-fix.js`

- Pure UI placement shim for existing deduction modal context.
- Must run before deduction modal render interactions in `index.html`.

### 13) `ocr-hotfix.js`

- Replaces OCR extraction fetch target and injects auth/session semantics.
- Depends on `CrewBIQCore.orchestratorTransport` and existing scan UI hooks.

### 14) `ocr-invoice-review.js`

- Implements OCR fuel review state machine and stop-level assignment.
- Depends on truck and load helpers (`loadTrucks`, etc.).

### 15) `ocr-item-alias-hotfix.js`

- Normalizes item aliases before review build.
- Requires `CrewBIQInvoiceReview` object and `renderScanReview` wrapper point from step 14.

### 16) `ocr-service-invoice-review.js`

- Implements segmented service invoice review and persistence into service logs.
- Depends on `loadTrucks`, `saveServiceLogs`, render helpers.

### 17) `service-invoice-legacy-upgrade.js`

- Installed after service invoice review to prevent duplicate service-log lineage.
- Depends on `CrewBIQServiceInvoice` and wraps `saveServiceLogs`.

### 18) `dispute-tombstone-hotfix.js`

- Adds durable delete and retry contract for disputes.
- Depends on `CrewBIQLoads.getDriverDisputed` and global sync controls (`doSync`).

## Hidden non-chain dependencies

- `index.html` loads additional modules by static tags: `sync.js`, `pti.js`, `loads.js`, and `fleet-load-resolution.js` before inline startup code.
- `loads.js` and `fleet-load-resolution.js` provide foundational APIs used by many chain scripts (disputes, OCR/truck matching, settlement calculations, UI actions).
- `sw.js` currently pre-caches a wider app shell: `core.js`, `core-runtime.js`, `offline-sync-queue.js`, and all 18 hotfix files plus core domains, with an implicit contract between cache and offline startup.

## Contract maintenance notes

- Any changes to the chain require synchronized updates to:
  1) `core.js` string list,
  2) this contract doc,
  3) `tests/hotfix-load-order-contract.test.mjs`, and
  4) any dependent versioned cache key in `sw.js` if offline shell behavior must be changed.
