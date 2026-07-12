/**
 * CrewBIQ Core loader v0.2.4
 *
 * Loads the stable authenticated Core runtime, full restore, Settings durability,
 * and authenticated OCR transport before sync.js and the inline application.
 */
(function () {
  'use strict';
  document.write('<script src="core-runtime.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="restore-hotfix.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="settings-hotfix.js?v=20260712-settings-reconcile-v2"><\/script>');
  document.write('<script src="ocr-hotfix.js?v=20260712-ocr-auth-v1"><\/script>');
})();
