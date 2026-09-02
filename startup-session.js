(function (global) {
  'use strict';

  function create(deps) {
    async function restoreSession(options = {}) {
      deps.setFleetRestoreSettled(false);
      const sessionToken = String(options.sessionToken || deps.getSavedSessionToken()).trim();
      const syncUrl = String(options.syncUrl || deps.defaultSyncUrl).trim();
      if (!sessionToken) throw deps.endpointError('auth_restore', 'sessionToken missing before restore');
      const data = await deps.authPost('auth_restore', { sessionToken }, syncUrl);
      deps.applyAuthRestoreData(data, syncUrl);
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
      if (driver && driver.syncUrl && typeof pullFromCloud === 'function') {
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

    function start(options = {}) {
      const savedSession = deps.getSavedSessionToken();
      const savedUrl = String(options.savedUrl || '').trim();
      const driver = deps.getDriver();
      if (savedSession && (savedUrl || (driver && driver.syncUrl))) {
        return restoreSession({
          sessionToken: savedSession,
          syncUrl: savedUrl || driver.syncUrl,
          silent: true,
        })
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
