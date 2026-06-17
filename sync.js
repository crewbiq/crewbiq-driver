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
  const DEFAULT_ORCHESTRATOR_SYNC_URL = 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync';

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
  let _eventForwardersRegistered = false;
  let _syncInProgress = false;

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
    registerEventForwarders();
    console.info('[CrewBIQ Sync] init() complete');
  }

  function registerEventForwarders() {
    if (_eventForwardersRegistered) return;
    ['load:created', 'load:updated', 'load:deleted', 'pti:submitted'].forEach(eventName => {
      Core.events.on(eventName, payload => {
        forwardEventToOrchestrator(eventName, payload).catch(e => {
          console.warn('[CrewBIQ Orchestrator] event forward failed', e);
        });
      });
    });
    _eventForwardersRegistered = true;
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

  function getOrchestratorSecret() {
    try {
      const secret = localStorage.getItem(K + 'orchestratorSecret') || localStorage.getItem(K + 'orchestratorSecretBackup') || '';
      if (secret) localStorage.setItem(K + 'orchestratorSecret', secret);
      return secret;
    } catch (e) {
      return '';
    }
  }

  function getSessionToken(options = {}) {
    try {
      return String(options.sessionToken || localStorage.getItem(K + 'sessionToken') || '').trim();
    } catch (e) {
      return String(options.sessionToken || '').trim();
    }
  }

  function normalizeOrchestratorSyncUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    const trimmed = url.replace(/\/+$/, '');
    if (/\/v1\/sync$/i.test(trimmed)) return trimmed;
    if (/\/v1\/events$/i.test(trimmed)) return trimmed.replace(/\/v1\/events$/i, '/v1/sync');
    return trimmed + '/v1/sync';
  }

  function getOrchestratorSyncUrl() {
    try {
      const raw = localStorage.getItem(K + 'orchestratorUrl') || localStorage.getItem(K + 'orchestratorUrlBackup') || DEFAULT_ORCHESTRATOR_SYNC_URL;
      const normalized = normalizeOrchestratorSyncUrl(raw);
      if (normalized && raw !== normalized) {
        localStorage.setItem(K + 'orchestratorUrl', normalized);
      }
      if (normalized) {
        localStorage.setItem(K + 'orchestratorUrl', normalized);
        localStorage.setItem(K + 'orchestratorUrlBackup', normalized);
      }
      return normalized;
    } catch (e) {
      return DEFAULT_ORCHESTRATOR_SYNC_URL;
    }
  }

  function setLastOrchestratorCopyStatus(status) {
    try {
      const allowedReasons = ['ok', 'no_orchestrator_url', 'unauthorized', 'not_found', 'http_error', 'network_error'];
      const safeStatus = {
        ok: !!(status && status.ok),
        skipped: !!(status && status.skipped),
        status: status && typeof status.status === 'number' ? status.status : null,
        reason: status && allowedReasons.includes(status.reason) ? status.reason : 'network_error',
        at: status && status.at ? status.at : new Date().toISOString(),
      };
      localStorage.setItem('fiqD_lastOrchestratorCopyStatus', JSON.stringify(safeStatus));
      if (typeof window !== 'undefined') window.lastOrchestratorSyncStatus = safeStatus;
      global.lastOrchestratorSyncStatus = safeStatus;
      return safeStatus;
    } catch (e) {}
  }

  function orchestratorHttpFailureReason(statusCode) {
    if (statusCode === 401) return 'unauthorized';
    if (statusCode === 404) return 'not_found';
    return 'http_error';
  }

  function buildOrchestratorHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const secret = getOrchestratorSecret();
    if (secret) headers['X-CrewBIQ-Secret'] = secret;
    return headers;
  }

  function _secureId() {
    // Use crypto.randomUUID() when available (all modern browsers).
    // Fallback combines timestamp + Math.random() for older environments.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  }

  function makeSyncRecordId(forceAll = false) {
    return 'sync_' + getDeviceId() + '_' + _secureId() + (forceAll ? '_full' : '');
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
    const ownerData = typeof global.getOwnerSyncData === 'function'
      ? (global.getOwnerSyncData() || {})
      : {};
    const normalizedOwnerData = {
      trucks: ownerData.trucks || [],
      driverProfiles: ownerData.driverProfiles || [],
      fuelLogs: ownerData.fuelLogs || [],
      serviceLogs: ownerData.serviceLogs || [],
      weeklyDeductions: ownerData.weeklyDeductions || [],
      deductionTemplates: ownerData.deductionTemplates || [],
    };
    return {
      type: 'driver_report',
      sessionToken: getSessionToken(),
      record_id: makeSyncRecordId(forceAll),
      sentAt: new Date().toISOString(),
      deviceId: getDeviceId(),
      driver: cloneDriver(driver),
      profile: { driver: cloneDriver(driver), ownerKey: ownerKey(driver), updatedAt: new Date().toISOString() },
      loads:  (forceAll ? loads : loads.filter(x => !x.synced)).map(stampRecord),
      ptiLog: (forceAll ? ptiLog : ptiLog.filter(p => !p.synced).slice(0, 10)).map(stampRecord),
      ownerData: shouldSendOwnerData(normalizedOwnerData) ? normalizedOwnerData : null,
      // Pay settings sent separately so Orchestrator can persist them
      // independently of the Apps Script profile.
      paySettings: (function() {
        try {
          var raw = (typeof localStorage !== 'undefined')
            ? localStorage.getItem('fiqD_paySettings')
            : null;
          return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
      })(),
    };
  }

  function payloadHasOwnerData(ownerData) {
    if (!ownerData || typeof ownerData !== 'object') return false;
    return ['trucks', 'driverProfiles', 'fuelLogs', 'serviceLogs', 'weeklyDeductions', 'deductionTemplates']
      .some(key => Array.isArray(ownerData[key]) && ownerData[key].length > 0);
  }

  function shouldSendOwnerData(ownerData) {
    if (payloadHasOwnerData(ownerData)) return true;
    try {
      const role = typeof global.getUserRole === 'function' ? global.getUserRole() : '';
      return role === 'owner' || role === 'owner_op' || role === 'fleet';
    } catch (e) {
      return false;
    }
  }

  function describeOrchestratorCopy(result) {
    if (!result) return '';
    if (result.ok && !result.skipped) return 'DB ok';
    if (result.skipped) return 'DB skipped';
    if (result.status) return 'DB ' + result.status;
    return 'DB error';
  }

  async function pushToOrchestrator(payload) {
    const orchestratorUrl = getOrchestratorSyncUrl();

    if (!orchestratorUrl) {
      setLastOrchestratorCopyStatus({
        ok: false,
        skipped: true,
        status: null,
        reason: 'no_orchestrator_url',
      });
      return { ok: false, skipped: true, reason: 'no_orchestrator_url' };
    }

    const body = {
      source: 'crewbiq_driver',
      deviceId: payload && payload.deviceId ? payload.deviceId : getDeviceId(),
      sentAt: payload && payload.sentAt ? payload.sentAt : new Date().toISOString(),
      payload,
    };

    try {
      const resp = await fetch(orchestratorUrl, {
        method: 'POST',
        headers: buildOrchestratorHeaders(),
        body: JSON.stringify(body),
      });

      let result = {};
      try { result = await resp.json(); } catch (e) {}

      if (!resp.ok) {
        setLastOrchestratorCopyStatus({
          ok: false,
          skipped: false,
          status: resp.status,
          reason: orchestratorHttpFailureReason(resp.status),
        });
        console.warn('[CrewBIQ Orchestrator] sync failed', {
          ok: false,
          status: resp.status,
          result,
        });
        return { ok: false, status: resp.status, result };
      }

      setLastOrchestratorCopyStatus({
        ok: true,
        skipped: false,
        status: resp.status,
        reason: 'ok',
      });
      console.info('[CrewBIQ Orchestrator] sync ok', {
        ok: true,
        status: resp.status,
        result,
      });
      return { ok: true, status: resp.status, result };
    } catch (e) {
      setLastOrchestratorCopyStatus({
        ok: false,
        skipped: false,
        status: null,
        reason: 'network_error',
      });
      console.warn('[CrewBIQ Orchestrator] sync failed', {
        ok: false,
        error: e.message,
      });
      return { ok: false, error: e.message };
    }
  }

  async function forwardEventToOrchestrator(eventName, payload = {}) {
    const orchestratorUrl = getOrchestratorSyncUrl();

    if (!orchestratorUrl) {
      setLastOrchestratorCopyStatus({
        ok: false,
        skipped: true,
        status: null,
        reason: 'no_orchestrator_url',
      });
      return { ok: false, skipped: true, reason: 'no_orchestrator_url' };
    }

    const eventsUrl = orchestratorUrl.replace(/\/v1\/sync\/?$/, '/v1/events');

    const body = {
      record_id: 'evt_' + getDeviceId() + '_' + _secureId(),
      event: eventName,
      source: 'pwa',
      timestamp: new Date().toISOString(),
      module: String(eventName).split(':')[0] || 'unknown',
      priority_hint: 'low',
      payload,
    };

    try {
      const resp = await fetch(eventsUrl, {
        method: 'POST',
        headers: buildOrchestratorHeaders(),
        body: JSON.stringify(body),
      });

      let result = {};
      try { result = await resp.json(); } catch (e) {}

      if (!resp.ok) {
        setLastOrchestratorCopyStatus({
          ok: false,
          skipped: false,
          status: resp.status,
          reason: orchestratorHttpFailureReason(resp.status),
        });
        console.warn('[CrewBIQ Orchestrator] event forward failed', {
          ok: false,
          event: eventName,
          status: resp.status,
          result,
        });
        return { ok: false, status: resp.status, result };
      }

      setLastOrchestratorCopyStatus({
        ok: true,
        skipped: false,
        status: resp.status,
        reason: 'ok',
      });
      console.info('[CrewBIQ Orchestrator] event forwarded', {
        ok: true,
        event: eventName,
        status: resp.status,
        result,
      });
      return { ok: true, status: resp.status, result };
    } catch (e) {
      setLastOrchestratorCopyStatus({
        ok: false,
        skipped: false,
        status: null,
        reason: 'network_error',
      });
      console.warn('[CrewBIQ Orchestrator] event forward failed', {
        ok: false,
        event: eventName,
        error: e.message,
      });
      return { ok: false, error: e.message };
    }
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

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      setSyncUI('err', 'Login required');
      return { ok: false, skipped: true, reason: 'missing_session_token' };
    }

    const payload = buildSyncPayload(forceAll);

    if ((payload.loads.length + payload.ptiLog.length) === 0 && !payload.ownerData && !forceAll) {
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
    if (result.error || result.ok === false) throw new Error(result.error || result.reason || 'Cloud returned error');

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
      payload,
      result,
    };
  }

  async function pullFromCloud(options = {}) {
    if (!assertReady()) return { ok: false, reason: 'not_ready' };
    const driver = _get.driver();
    const silent = !!options.silent;
    const sessionToken = getSessionToken(options);

    if (!(driver && driver.syncUrl)) {
      if (!silent) setSyncUI('idle', 'No sync URL');
      return { ok: false, reason: 'no_sync_url' };
    }

    if (!sessionToken) {
      if (!silent) {
        setSyncUI('err', 'Login required');
        Core.toast('Login required to restore cloud data.', 'err');
      }
      return { ok: false, reason: 'missing_session_token', error: 'Login required to restore cloud data.' };
    }

    try {
      if (!silent) setSyncUI('busy', 'Pulling cloud...');
      const resp = await fetch(driver.syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          type: 'auth_restore',
          sessionToken,
          client: 'crewbiq-driver-pwa',
          deviceId: getDeviceId(),
        }),
        cache: 'no-store',
        redirect: 'follow',
      });

      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (data.error || data.ok === false) throw new Error(data.error || data.reason || 'Cloud returned error');

      const profile = data.profile || null;
      const remoteLoads = data.loads || [];
      const remotePti   = data.ptiLog || [];
      const ownerRestore = (data.ownerData && typeof global.applyOwnerSyncData === 'function')
        ? global.applyOwnerSyncData(data.ownerData)
        : { changed: false };
      const loadMerge = mergeById(_get.loads(), remoteLoads);
      const ptiMerge  = mergeById(_get.ptiLog(), remotePti);

      if (loadMerge.imported || loadMerge.updated) {
        _set.loads(sortLoads(loadMerge.list));
      }
      if (ptiMerge.imported || ptiMerge.updated) {
        _set.ptiLog(ptiMerge.list);
      }

      if (loadMerge.imported || loadMerge.updated || ptiMerge.imported || ptiMerge.updated || ownerRestore.changed) {
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
        ownerData:      ownerRestore,
        profile
      });

      return {
        ok: true,
        loadsImported: loadMerge.imported,
        loadsUpdated:  loadMerge.updated,
        ptiImported:   ptiMerge.imported,
        ptiUpdated:    ptiMerge.updated,
        ownerData: ownerRestore,
        profile,
        driverId: data.driverId || '',
        crewId: data.crewId || '',
        email: data.email || '',
        ownerKey: data.ownerKey || '',
        pointsBalance: data.pointsBalance,
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
    if (_syncInProgress) {
      console.info('[CrewBIQ Sync] Sync already in progress, skipping');
      return { ok: false, skipped: true, reason: 'sync_in_progress' };
    }
    _syncInProgress = true;

    try {
    const driver = _get.driver();

    if (!(driver && driver.syncUrl)) {
      setSyncUI('idle', 'No sync URL');
      return;
    }

    setSyncUI('busy', 'Syncing...');
    Core.events.emit('sync:start', null);

    try {
      if (typeof global.saveAdvancedSyncSettings === 'function') {
        global.saveAdvancedSyncSettings(false);
      }

      const push = await pushToCloud(!!options.forceAll);
      if (push && push.reason === 'missing_session_token') {
        throw new Error('Login required to restore cloud data.');
      }
      let orchestratorCopy = null;
      if (push && push.ok && !push.skipped && push.payload) {
        orchestratorCopy = await pushToOrchestrator(push.payload);
        if (options.forceAll && orchestratorCopy && !orchestratorCopy.ok && !orchestratorCopy.skipped) {
          throw new Error('PostgreSQL copy failed: ' + describeOrchestratorCopy(orchestratorCopy));
        }
      }
      const pull = await pullFromCloud({ silent: true });

      const timeStr = new Date().toLocaleTimeString();
      const pushedLoads = push && push.pushedLoads ? push.pushedLoads : 0;
      const importedLoads = pull && pull.loadsImported ? pull.loadsImported : 0;
      const importedPti = pull && pull.ptiImported ? pull.ptiImported : 0;

      const dbLabel = describeOrchestratorCopy(orchestratorCopy);
      const dbFailed = orchestratorCopy && !orchestratorCopy.ok && !orchestratorCopy.skipped;
      const statusText = `Synced ${timeStr} · ↑${pushedLoads} ↓${importedLoads}` + (dbLabel ? ` · ${dbLabel}` : '');
      setSyncUI(dbFailed ? 'err' : 'ok', statusText);
      Core.toast(dbFailed ? `Cloud synced, ${dbLabel}` : `Synced ✅ ↑${pushedLoads} ↓${importedLoads}`);
      Core.events.emit('sync:success', {
        loadsCount: pushedLoads,
        ptiCount:   push && push.pushedPti ? push.pushedPti : 0,
        pulledLoads: importedLoads,
        pulledPti: importedPti,
        orchestratorCopy,
        time: timeStr,
      });

    } catch (e) {
      setSyncUI('err', 'Failed: ' + e.message);
      Core.toast('Sync failed: ' + e.message, 'err');
      Core.events.emit('sync:error', { message: e.message });
    }
    } finally {
      _syncInProgress = false;
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
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      console.warn('[CrewBIQ Sync] syncPTIEntry skipped: missing session token');
      return;
    }

    try {
      const resp = await fetch(driver.syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          type: 'pti_report',
          sessionToken,
          sentAt: new Date().toISOString(),
          driver: cloneDriver(driver),
          pti: stampRecord(entry),
        }),
        redirect: 'follow',
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      let result = {};
      try { result = await resp.json(); } catch (e) {}
      if (result.error || result.ok === false) throw new Error(result.error || result.reason || 'Cloud returned error');
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
    forwardEventToOrchestrator,
    normalizeOrchestratorSyncUrl,
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
  global.forwardEventToOrchestrator = forwardEventToOrchestrator;
  global.normalizeOrchestratorSyncUrl = normalizeOrchestratorSyncUrl;

  console.info('[CrewBIQ Sync] v0.3.0 loaded');

})(window);
