/**
 * CrewBIQ Core loader v0.3.2
 *
 * Loads authenticated sync/restore, durable offline retry, effective truck
 * deductions, protected OCR, segmented invoice review, and snapshot fixes.
 */
(function () {
  'use strict';
  document.write('<script src="core-runtime.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="offline-sync-queue.js?v=20260713-offline-sync-v1"><\/script>');
  document.write('<script src="restore-hotfix.js?v=20260715-disputes-sync-v1"><\/script>');
  document.write('<script src="settings-hotfix.js?v=20260712-settings-reconcile-v2"><\/script>');
  document.write('<script src="owner-snapshot-hotfix.js?v=20260713-owner-snapshot-v2"><\/script>');
  document.write('<script src="deduction-policy-hotfix.js?v=20260713-deduction-policy-v1"><\/script>');
  document.write('<script src="deduction-policy-ui-fix.js?v=20260713-deduction-policy-ui-v1"><\/script>');
  document.write('<script src="ocr-hotfix.js?v=20260712-ocr-auth-v1"><\/script>');
  document.write('<script src="ocr-invoice-review.js?v=20260712-ocr-invoice-v2"><\/script>');
  document.write('<script src="ocr-item-alias-hotfix.js?v=20260712-defd-alias-v1"><\/script>');
  document.write('<script src="ocr-service-invoice-review.js?v=20260713-service-invoice-v1"><\/script>');
  document.write('<script src="service-invoice-legacy-upgrade.js?v=20260713-service-legacy-v1"><\/script>');
})();
