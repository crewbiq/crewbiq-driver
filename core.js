/**
 * CrewBIQ Core loader v0.2.2
 *
 * Loads the stable authenticated Core runtime, the bounded full-restore adapter,
 * and the safe Settings durability adapter synchronously before sync.js and the
 * inline application execute.
 */
(function () {
  'use strict';
  document.write('<script src="core-runtime.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="restore-hotfix.js?v=20260712-full-restore"><\/script>');
  document.write('<script src="settings-hotfix.js?v=20260712-settings-restore"><\/script>');
})();
