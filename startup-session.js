(function (global) {
  'use strict';

  function create(deps) {
    async function restoreSession(options = {}) {
      deps.setFleetRestoreSettled(false);
      const sessionToken = String(options.sessionToken || deps.getSavedSessionToken()).trim();
      if (!sessionToken) throw deps.endpointError('auth_restore', 'sessionToken missing before restore');
      const data = await deps.authPost('auth_restore', { sessionToken });
      // defaultSyncUrl only populates driver.syncUrl (a device/environment
      // display field) - it no longer affects where authPost() actually
      // sends anything, since authPost() resolves its own destination.
      deps.applyAuthRestoreData(data, deps.defaultSyncUrl);
      let fleetRestore = null;
      const driver = deps.getDriver();
      if (driver && driver.crewId && (!deps.loadTrucks().length || !deps.loadDriverProfiles().length)) {
        fleetRestore = await deps.restoreFleetConfigFromOrchestrator(driver.crewId);
      }
      deps.saveAll();
      deps.saveDriverProfile();
      deps.renderAll();
      deps.setFleetRestoreSettled(true);
      if (!options.silent) {
        deps.setLoginStatus('Restored cloud data: ' + deps.formatRestoreSummary(data, fleetRestore), 'ok');
      }
      return { ...deps.unwrapAuthResponse(data), fleetRestore };
    }

    function showApp() {
      deps.document.getElementById('app').classList.add('show');
      deps.ensureDefaultTruckFromDriver();
      deps.renderAll();
      deps.scheduleAutoSync();
      const driver = deps.getDriver();
      const pullFromCloud = deps.getPullFromCloud();
      if (driver && typeof pullFromCloud === 'function') {
        deps.setTimeout(() => pullFromCloud({ silent: true }), 1000);
      }
    }

    function boot() {
      const driver = deps.getDriver();
      if (!driver) {
        deps.document.getElementById('setupScreen').style.display = 'flex';
        return;
      }
      deps.renderStartupShell();
      if (deps.needsPTI()) deps.showPTIBlocker();
      else showApp();
    }

    function start() {
      const savedSession = deps.getSavedSessionToken();
      if (savedSession) {
        return restoreSession({ sessionToken: savedSession, silent: true })
          .catch(error => deps.warn('[CrewBIQ Auth] session restore failed:', error.message))
          .finally(() => boot());
      }
      deps.setFleetRestoreSettled(true);
      boot();
      return Promise.resolve();
    }

    return { boot, restoreSession, showApp, start };
  }

  global.CrewBIQStartupSession = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
