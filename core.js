/** CrewBIQ Core loader v0.3.13 */
(function () {
  'use strict';
  function load(src) {
    document.write('<scr' + 'ipt src="' + src + '"><\/scr' + 'ipt>');
  }
  load('core-runtime.js?v=20260712-full-restore');
  load('offline-sync-queue.js?v=20260716-offline-sync-v2');
  load('restore-hotfix.js?v=20260715-disputes-sync-v1');
  load('settings-hotfix.js?v=20260712-settings-reconcile-v2');
  load('owner-snapshot-hotfix.js?v=20260713-owner-snapshot-v2');
  load('load-order-hotfix.js?v=20260718-load-pencil-v4');
  load('deduction-policy-hotfix.js?v=20260713-deduction-policy-v1');
  load('deduction-period-hotfix.js?v=20260717-deduction-period-v1');
  load('settlement-week-hotfix.js?v=20260717-settlement-week-v1');
  load('deduction-trip-resolution.js?v=20260717-deduction-trip-v2');
  load('accounting-action-guard.js?v=20260717-accounting-guard-v1');
  load('deduction-policy-ui-fix.js?v=20260713-deduction-policy-ui-v1');
  load('ocr-hotfix.js?v=20260712-ocr-auth-v1');
  load('ocr-invoice-review.js?v=20260712-ocr-invoice-v2');
  load('ocr-item-alias-hotfix.js?v=20260712-defd-alias-v1');
  load('ocr-service-invoice-review.js?v=20260713-service-invoice-v1');
  load('service-invoice-legacy-upgrade.js?v=20260713-service-legacy-v1');
  load('dispute-tombstone-hotfix.js?v=20260716-dispute-delete-v1');
})();
