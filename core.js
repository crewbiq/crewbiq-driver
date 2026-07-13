/**
 * CrewBIQ Core loader v0.2.8
 *
 * Loads the stable authenticated Core runtime, full restore, Settings durability,
 * durable owner snapshots, effective-dated truck deductions, authenticated OCR
 * transport, safe multi-driver invoice review, and vendor alias normalization.
 */
(function () {
  'use strict';
  document.write('<script src="core-runtime.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="restore-hotfix.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="settings-hotfix.js?v=20260712-settings-reconcile-v2"><\/script>');
  document.write('<script src="owner-snapshot-hotfix.js?v=20260713-owner-snapshot-v1"><\/script>');
  document.write('<script src="deduction-policy-hotfix.js?v=20260713-deduction-policy-v1"><\/script>');
  document.write('<script src="ocr-hotfix.js?v=20260712-ocr-auth-v1"><\/script>');
  document.write('<script src="ocr-invoice-review.js?v=20260712-ocr-invoice-v2"><\/script>');
  document.write('<script src="ocr-item-alias-hotfix.js?v=20260712-defd-alias-v1"><\/script>');
})();
