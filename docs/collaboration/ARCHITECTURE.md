# CrewBIQ Architecture Snapshot for Pre-Base44 Audit

## Runtime decomposition status

`core.js` defines the bootstrap module order for the post-`core-runtime` stack.  
`index.html` remains the orchestration shell and still contains significant startup and page-render coupling.

## Current module map (high confidence)

- `core-runtime.js`: transport foundation for orchestrated auth/sync/restore and local storage utilities.
- `offline-sync-queue.js`: background mutation queue with persistence, replay, and online retry hooks.
- `restore-hotfix.js`: authenticated restore transport adapter for cloud restore and driver/owner data hydration.
- `settings-hotfix.js`: authenticated settings transport adapter and cloud settings snapshot ingestion.
- `owner-snapshot-hotfix.js`: owner-scoped deletion durability for expenses, service logs, deduction templates, and weekly deductions.
- `load-order-hotfix.js`: load normalization + restore-edit compatibility layer wrapping `CrewBIQLoads` lifecycle.
- `deduction-policy-hotfix.js`: deduction policy CRUD and application helpers.
- `deduction-period-hotfix.js`: policy period lifecycle extension (start/end boundaries).
- `settlement-week-hotfix.js`: settlement calendar and truck-level week boundary utilities.
- `deduction-trip-resolution.js`: settlement lookup path for trips using settlement-week + active policy versioning.
- `accounting-action-guard.js`: guarded accounting action controls and skip/restore workflows.
- `deduction-policy-ui-fix.js`: UI placement compatibility for deduction policy modal.
- `ocr-hotfix.js`: authenticated OCR extract transport.
- `ocr-invoice-review.js`: invoice grouping and manual review state machine for OCR fuel invoices.
- `ocr-item-alias-hotfix.js`: legacy alias normalization for OCR item labels.
- `ocr-service-invoice-review.js`: segmented service invoice review flow (parent + grouped child allocations).
- `service-invoice-legacy-upgrade.js`: upgrade wrapper to avoid duplicate legacy service log entries.
- `dispute-tombstone-hotfix.js`: durable dispute delete tombstoning and sync-retry contract.
- `loads.js`: core load/changelog lifecycle module.
- `sync.js`: sync orchestration and driver/event forwarding.
- `pti.js`: PTI readiness and lifecycle helper.
- `fleet-load-resolution.js`: truck/load matching for dispute settlement behavior.
- `sw.js`: service worker app-shell cache and network policy.
- `index.html`: startup flow, page routing, modal/render glue, and many inline handlers not yet fully extracted.

## Verified hotfix loader chain

The 18-script ordered chain loaded from `core.js` is:

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

## Decomposition principle

- First cut: harden loader-contract + hotfix dependencies before moving behavior in `index.html`.
- Second cut: extract dedicated module boundaries only where runtime guards are already explicit and contract-safe.
- Tests and assertions should gate any reorder or removal of the chain.

