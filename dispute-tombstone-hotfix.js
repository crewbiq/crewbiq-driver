(function (global) {
  'use strict';

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function install() {
    var api = global.CrewBIQLoads;
    if (!api || typeof api.getDriverDisputed !== 'function') {
      setTimeout(install, 0);
      return;
    }
    if (api.__durableDisputeDeleteInstalled) return;

    var rawGet = api.getDriverDisputed.bind(api);
    var rawSet = api.setDriverDisputed.bind(api);
    var rawRender = api.renderDriverDisputedPage.bind(api);

    function visibleDisputes() {
      return (rawGet() || []).filter(function (item) {
        return item && item.status !== 'deleted';
      });
    }

    function renderVisibleDisputes() {
      var all = rawGet() || [];
      if (!all.some(function (item) { return item && item.status === 'deleted'; })) {
        return rawRender();
      }

      // The original renderer closes over its private getter. Temporarily expose
      // only visible records while it renders, then restore the tombstones so
      // authenticated sync can continue carrying them until acknowledged.
      rawSet(visibleDisputes());
      try {
        return rawRender();
      } finally {
        rawSet(all);
      }
    }

    async function syncWithBusyRetry() {
      if (typeof global.doSync !== 'function') {
        return { ok: false, reason: 'sync_unavailable' };
      }
      var result = null;
      for (var attempt = 0; attempt < 5; attempt++) {
        result = await global.doSync({ forceAll: true });
        if (!(result && result.skipped && result.reason === 'sync_in_progress')) {
          return result;
        }
        await delay(600);
      }
      return result || { ok: false, reason: 'sync_in_progress' };
    }

    function postgresAcknowledged(result) {
      var copy = result && result.orchestratorCopy;
      return !!(result && result.ok && copy && copy.ok && !copy.skipped);
    }

    function keepPendingTombstone(id) {
      var current = rawGet() || [];
      var index = current.findIndex(function (item) { return item && item.id === id; });
      if (index < 0) return;
      current[index] = Object.assign({}, current[index], {
        status: 'deleted',
        deletedAt: current[index].deletedAt || new Date().toISOString(),
        synced: false,
      });
      rawSet(current);
      renderVisibleDisputes();
    }

    async function durableDeleteDispute(id) {
      if (!global.confirm('Delete this dispute?')) return false;

      var all = rawGet() || [];
      var index = all.findIndex(function (item) { return item && item.id === id; });
      if (index < 0) {
        if (global.CrewBIQCore) global.CrewBIQCore.toast('Dispute changed or disappeared. Refresh and try again.', 'err');
        return false;
      }

      all[index] = Object.assign({}, all[index], {
        status: 'deleted',
        deletedAt: new Date().toISOString(),
        synced: false,
      });
      rawSet(all);
      renderVisibleDisputes();

      if (global.CrewBIQCore) global.CrewBIQCore.toast('Deleting dispute...');
      var result = await syncWithBusyRetry();
      if (postgresAcknowledged(result)) {
        // PostgreSQL and the event log now retain the monotonic tombstone. The
        // local copy can be pruned so it does not grow forever.
        rawSet((rawGet() || []).filter(function (item) { return !item || item.id !== id; }));
        renderVisibleDisputes();
        if (global.CrewBIQCore) global.CrewBIQCore.toast('Dispute deleted and synced');
        if (global.CrewBIQCore && global.CrewBIQCore.events) {
          global.CrewBIQCore.events.emit('dispute:deleted', { id: id, durable: true });
        }
        return true;
      }

      // The legacy/cloud leg may already have marked the record synced even when
      // the PostgreSQL copy failed or was skipped. Restore synced:false so a later
      // normal sync still carries the tombstone.
      keepPendingTombstone(id);
      if (global.CrewBIQCore) {
        global.CrewBIQCore.toast('Deletion is pending sync. It will retry when connection returns.', 'warn');
      }
      return false;
    }

    api.getDriverDisputedForSync = rawGet;
    api.driverDeleteDispute = durableDeleteDispute;
    api.renderDriverDisputedPage = renderVisibleDisputes;
    api.__durableDisputeDeleteInstalled = true;

    global.driverDeleteDispute = durableDeleteDispute;
    global.renderDriverDisputedPage = renderVisibleDisputes;
  }

  install();
})(window);
