/**
 * CrewBIQ Core loader v0.2.5
 *
 * Loads the stable authenticated Core runtime, full restore, Settings durability,
 * authenticated OCR transport, and safe multi-driver invoice review before the
 * inline application executes.
 */
(function () {
  'use strict';
  document.write('<script src="core-runtime.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="restore-hotfix.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="settings-hotfix.js?v=20260712-settings-reconcile-v2"><\/script>');
  document.write('<script src="ocr-hotfix.js?v=20260712-ocr-auth-v1"><\/script>');
  document.write('<script src="ocr-invoice-review.js?v=20260712-ocr-invoice-v2"><\/script>');
})();
