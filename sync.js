/**
 * CrewBIQ Sync Module v0.3.0 — Two-Way Sync
 * CrewBIQ Technologies — Extracted from index.html
 *
 * FIX v0.1.1: index.html declares driver/loads/ptiLog with `let`,
 * so they are NOT on window.*. Worse — loads and ptiLog are frequently
 * reassigned (loads = loads.map(...)), so a one-time window reference
 * would go stale immediately.
 *
 * Solution: accessor functions passed in via CrewBIQSync.init().
 * index.html calls init() once after boot, providing getters/setters
 * and saveAll. sync.js never touches window.* for state.
 *
 * index.html must call once after loadAll():
 *   CrewBIQSync.init({
 *     getDriver: () => driver,
 *     getLoads:  () => loads,
 *     setLoads:  (v) => { loads = v; },
 *     getPtiLog: () => ptiLog,
 *     setPtiLog: (v) => { ptiLog = v; },
 *     saveAll:   saveAll,
 *     getTimer:  () => autoSyncTimer,
 *     setTimer:  (v) => { autoSyncTimer = v; },
 *   });
 */

(function (global) {
  'use strict';

  const Core = global.CrewBIQCore;

  const K = 'fiqD_';

  if (!Core) {
    console.error('[CrewBIQ Sync] CrewBIQCore not found. Load core.js first.');
    return;
  }

  // ── ACCESSORS ──────────────────────────────────────────────────────────────
  // Filled by init(). All sync functions go through these — never direct refs.

  let _get = {
    driver: null,
    loads:  null,
    ptiLog: null,
    timer:  null,
  };
  let _renderAll = null;
  let _set = {
    loads:  null,
    ptiLog: null,
    timer:  null,
  };
  let _saveAll = null;
  let _ready = false;

  function init(opts) {
    _get.driver = opts.getDriver;
    _get.loads  = opts.getLoads;
    _set.loads  = opts.setLoads;
    _get.ptiLog = opts.getPtiLog;
    _set.ptiLog = opts.setPtiLog;
    _saveAll    = opts.saveAll;
    _get.timer  = opts.getTimer;
    _set.timer  = opts.setTimer;
    _renderAll  = opts.renderAll || (() => {
      if (typeof global.renderAll === 'function') global.renderAll();
    });
    _ready = true;
    console.info('[CrewBIQ Sync] init() complete');
  }

  function assertReady() {
    if (!_ready) {
      console.error('[CrewBIQ Sync] Not initialized. Call CrewBIQSync.init() first.');
      return false;
    }
    return true;
  }

  // ── PAYLOAD BUILDER ────────────────────────────────────────────────────────

  function getDeviceId() {
    try {
      let id = localStorage.getItem(K + 'deviceId');
      if (!id) {
        id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(K + 'deviceId', id);
      }
      return id;
    } catch (e) {
      return 'dev_unknown';
    }
  }

  function identitySlug(value){ return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60); }
  function ownerKey(driver){
    if(!driver) return '';
    const crew=identitySlug(driver.crewId||'');
    const email=identitySlug(driver.email||'');
    return crew ? 'crew_'+crew : (email ? 'email_'+email : '');
  }

  function cloneDriver(driver) {
    return {
      name: driver.name || '',
      email: driver.email || '',
      crewId: driver.crewId || '',
      ownerKey: ownerKey(driver),
      unitNumber: driver.unitNumber || '',
      company: driver.company || '',
      truckName: driver.truckName || '',
      plate: driver.plate || '',
      teamDriver: driver.teamDriver || '',
      teamRate: driver.teamRate || 0,
      payType: driver.payType || '',
      cpmRate: driver.cpmRate || 0,
      grossPercent: driver.grossPercent || 0,
      cpmBase: driver.cpmBase || '',
      ptiSchedule: driver.ptiSchedule || '',
      deviceId: getDeviceId(),
    };
  }

  function stampRecord(record) {
    if (!record) return record;
    const driver = _get.driver ? _get.driver() : null;
    return {
      ...record,
      ownerKey: record.ownerKey || ownerKey(driver),
      crewId: record.crewId || (driver && driver.crewId) || '',
      driverEmail: record.driverEmail || (driver && driver.email) || '',
      updatedAt: record.updatedAt || new Date().toISOString(),
      deviceId: record.deviceId || getDeviceId(),
    };
  }

  function sortLoads(arr) {
    return (arr || []).slice().sort((a, b) => {
      const da = a.pickup || a.date || '0000';
      const db = b.pickup || b.date || '0000';
      return db > da ? 1 : db < da ? -1 : 0;
    });
  }

  function mergeById(localList, remoteList) {
    const byId = new Map();
    (localList || []).forEach(item => {
      if (item && item.id) byId.set(String(item.id), item);
    });

    let imported = 0;
    let updated = 0;

    (remoteList || []).forEach(remote => {
      if (!remote || !remote.id) return;
      const id = String(remote.id);
      const local = byId.get(id);

      if (!local) {
        byId.set(id, { ...remote, synced: true });
        imported++;
        return;
      }

      // MVP conflict rule:
      // - Do not overwrite local unsynced edits.
      // - If local is already synced, cloud can refresh it.
      if (local.synced !== false) {
        const merged = { ...local, ...remote, synced: true };
        // Protect status from old backend/default values. If cloud returns "active"
        // without a newer status timestamp, do not downgrade local success/cancel/disputed.
        if (local.status && local.status !== 'active' && remote.status === 'active' && !remote.statusUpdatedAt) {
          merged.status = local.status;
          merged.statusUpdatedAt = local.statusUpdatedAt || merged.statusUpdatedAt;
        }
        byId.set(id, merged);
        updated++;
      }
    });

    return { list: Array.from(byId.values()), imported, updated };
  }

  function buildSyncPayload(forceAll = false) {
    if (!assertReady()) return null;
    const driver = _get.driver();
    const loads  = _get.loads();
    const ptiLog = _get.ptiLog();
    return {
      type: 'driver_report',
      sentAt: new Date().toISOString(),
      deviceId: getDeviceId(),
      driver: cloneDriver(driver),
      profile: { driver: cloneDriver(driver), ownerKey: ownerKey(driver), updatedAt: new Date().toISOString() },
      loads:  (forceAll ? loads : loads.filter(x => !x.synced)).map(stampRecord),
      ptiLog: (forceAll ? ptiLog : ptiLog.filter(p => !p.synced).slice(0, 10)).map(stampRecord),
    };
  }

  // ── SYNC UI ────────────────────────────────────────────────────────────────

  function setSyncUI(state, msg) {
    const dot = document.getElementById('syncDot');
    const txt = document.getElementById('syncStatus');
    if (!dot || !txt) return;
    dot.className = 'sync-dot' +
      (state === 'ok'   ? ' ok'   :
       state === 'err'  ? ' err'  :
       state === 'busy' ? ' busy' : '');
    txt.textContent = msg;
  }

  // ── MAIN SYNC ──────────────────────────────────────────────────────────────

  async function pushToCloud(forceAll = false) {
    const driver = _get.driver();

    if (!(driver && driver.syncUrl)) {
      setSyncUI('idle', 'No sync URL');
      return { ok: false, skipped: true, reason: 'no_sync_url' };
    }

    const payload = buildSyncPayload(forceAll);

    if ((payload.loads.length + payload.ptiLog.length) === 0 && !forceAll) {
      Core.events.emit('sync:skip', { reason: 'nothing_to_push' });
      return { ok: true, skipped: true, reason: 'nothing_to_push' };
    }

    const syncedLoadIds = new Set(payload.loads.map(x => x.id));
    const syncedPtiIds  = new Set(payload.ptiLog.map(x => x.id));

    const resp = await fetch(driver.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const text = await resp.text();
    let result = {};
    try { result = JSON.parse(text); } catch (e) {}
    if (result.error) throw new Error(result.error);

    _set.loads(_get.loads().map(x =>
      syncedLoadIds.has(x.id) ? { ...x, synced: true } : x
    ));
    _set.ptiLog(_get.ptiLog().map(p =>
      syncedPtiIds.has(p.id) ? { ...p, synced: true } : p
    ));

    _saveAll();

    return {
      ok: true,
      pushedLoads: syncedLoadIds.size,
      pushedPti: syncedPtiIds.size,
      result,
    };
  }

  async function pullFromCloud(options = {}) {
    if (!assertReady()) return { ok: false, reason: 'not_ready' };
    const driver = _get.driver();
    const silent = !!options.silent;

    if (!(driver && driver.syncUrl)) {
      if (!silent) setSyncUI('idle', 'No sync URL');
      return { ok: false, reason: 'no_sync_url' };
    }

    const unit = driver.unitNumber || '';
    const oKey = ownerKey(driver);
    if (!unit && !oKey) {
      if (!silent) setSyncUI('err', 'No driver ID or unit number');
      return { ok: false, reason: 'no_identity' };
    }

    try {
      if (!silent) setSyncUI('busy', 'Pulling cloud...');
      const sep = driver.syncUrl.includes('?') ? '&' : '?';
      const url = driver.syncUrl + sep + 'type=driver&unit=' + encodeURIComponent(unit) + '&crewId=' + encodeURIComponent(driver.crewId || '') + '&email=' + encodeURIComponent(driver.email || '') + '&ownerKey=' + encodeURIComponent(oKey) + '&ts=' + Date.now();
      const resp = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
      });

      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (data.error || data.ok === false) throw new Error(data.error || 'Cloud returned error');

      const profile = data.profile || null;
      const remoteLoads = (data.loads || []).filter(x => !oKey || x.ownerKey === oKey || x.crewId === driver.crewId || x.driverEmail === driver.email);
      const remotePti   = (data.ptiLog || []).filter(x => !oKey || x.ownerKey === oKey || x.crewId === driver.crewId || x.driverEmail === driver.email);
      const loadMerge = mergeById(_get.loads(), remoteLoads);
      const ptiMerge  = mergeById(_get.ptiLog(), remotePti);

      if (loadMerge.imported || loadMerge.updated) {
        _set.loads(sortLoads(loadMerge.list));
      }
      if (ptiMerge.imported || ptiMerge.updated) {
        _set.ptiLog(ptiMerge.list);
      }

      if (loadMerge.imported || loadMerge.updated || ptiMerge.imported || ptiMerge.updated) {
        _saveAll();
        if (_renderAll) _renderAll();
      }

      const msg = `Cloud: +${loadMerge.imported} load(s), +${ptiMerge.imported} PTI`;
      if (!silent) {
        setSyncUI('ok', msg);
        Core.toast(msg + ' ✅');
      }
      Core.events.emit('sync:pull_success', {
        loadsImported: loadMerge.imported,
        loadsUpdated:  loadMerge.updated,
        ptiImported:   ptiMerge.imported,
        ptiUpdated:    ptiMerge.updated,
        profile
      });

      return {
        ok: true,
        loadsImported: loadMerge.imported,
        loadsUpdated:  loadMerge.updated,
        ptiImported:   ptiMerge.imported,
        ptiUpdated:    ptiMerge.updated,
        profile
      };
    } catch (e) {
      if (!silent) {
        setSyncUI('err', 'Pull failed: ' + e.message);
        Core.toast('Cloud pull failed: ' + e.message, 'err');
      }
      Core.events.emit('sync:pull_error', { message: e.message });
      return { ok: false, error: e.message };
    }
  }

  async function doSync(options = {}) {
    if (!assertReady()) return;
    const driver = _get.driver();

    if (!(driver && driver.syncUrl)) {
      setSyncUI('idle', 'No sync URL');
      return;
    }

    setSyncUI('busy', 'Syncing...');
    Core.events.emit('sync:start', null);

    try {
      const push = await pushToCloud(!!options.forceAll);
      const pull = await pullFromCloud({ silent: true });

      const timeStr = new Date().toLocaleTimeString();
      const pushedLoads = push && push.pushedLoads ? push.pushedLoads : 0;
      const importedLoads = pull && pull.loadsImported ? pull.loadsImported : 0;
      const importedPti = pull && pull.ptiImported ? pull.ptiImported : 0;

      setSyncUI('ok', `Synced ${timeStr} · ↑${pushedLoads} ↓${importedLoads}`);
      Core.toast(`Synced ✅ ↑${pushedLoads} ↓${importedLoads}`);
      Core.events.emit('sync:success', {
        loadsCount: pushedLoads,
        ptiCount:   push && push.pushedPti ? push.pushedPti : 0,
        pulledLoads: importedLoads,
        pulledPti: importedPti,
        time: timeStr,
      });

    } catch (e) {
      setSyncUI('err', 'Failed: ' + e.message);
      Core.toast('Sync failed: ' + e.message, 'err');
      Core.events.emit('sync:error', { message: e.message });
    }
  }

  async function forceFullSync() {
    return doSync({ forceAll: true });
  }

  // ── PTI SINGLE ENTRY SYNC ─────────────────────────────────────────────────

  async function syncPTIEntry(entry) {
    if (!assertReady()) return;
    const driver = _get.driver();
    if (!(driver && driver.syncUrl)) return;

    try {
      await fetch(driver.syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          type: 'pti_report',
          sentAt: new Date().toISOString(),
          driver: cloneDriver(driver),
          pti: stampRecord(entry),
        }),
        redirect: 'follow',
      });
      entry.synced = true;
      _saveAll();
      Core.events.emit('sync:pti_sent', { entryId: entry.id });
    } catch (e) {
      console.warn('[CrewBIQ Sync] syncPTIEntry silent fail:', e.message);
    }
  }

  // ── AUTO SYNC SCHEDULER ────────────────────────────────────────────────────

  function scheduleAutoSync() {
    if (!assertReady()) return;
    clearInterval(_get.timer());
    _set.timer(setInterval(() => doSync(), 60 * 60 * 1000)); // hourly push+pull

    const now = new Date();
    const msToMidnight = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + 1
    ) - now;

    setTimeout(() => {
      doSync();
      scheduleAutoSync();
    }, msToMidnight);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  const CrewBIQSync = {
    version: '0.3.0',
    init,
    buildSyncPayload,
    doSync,
    pushToCloud,
    pullFromCloud,
    forceFullSync,
    syncPTIEntry,
    setSyncUI,
    scheduleAutoSync,
  };

  global.CrewBIQSync = CrewBIQSync;

  // Backward compat — index.html calls these by name directly
  global.doSync           = doSync;
  global.pushToCloud      = pushToCloud;
  global.pullFromCloud    = pullFromCloud;
  global.forceFullSync    = forceFullSync;
  global.syncPTIEntry     = syncPTIEntry;
  global.setSyncUI        = setSyncUI;
  global.scheduleAutoSync = scheduleAutoSync;
  global.buildSyncPayload = buildSyncPayload;

  console.info('[CrewBIQ Sync] v0.3.0 loaded');

})(window);
