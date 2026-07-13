/**
 * CrewBIQ owner snapshot durability adapter v0.1.0
 *
 * Adds explicit complete-snapshot semantics for Expenses, Deduction Templates,
 * and Weekly Deductions. Local edits remain authoritative until an authenticated
 * sync succeeds, preventing a cloud pull from resurrecting pending deletions.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  const ENTITIES = ['expenses', 'deductionTemplates', 'weeklyDeductions'];
  const previousFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;
  let applyingCloudRestore = false;
  let retryTimer = null;

  if (!previousFetch) {
    console.error('[CrewBIQ Owner Snapshot] fetch unavailable');
    return;
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function identitySlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  function storedDriver() {
    try { return JSON.parse(localStorage.getItem(K + 'driver') || 'null') || {}; }
    catch (e) { return {}; }
  }

  function identityKey(identity) {
    const source = identity || storedDriver();
    const crew = identitySlug(source.crewId || source.crewbiq_id);
    const email = identitySlug(source.email);
    return crew ? 'crew_' + crew : (email ? 'email_' + email : 'anonymous');
  }

  function pendingKey(identity) {
    return K + 'data_' + identityKey(identity) + '_ownerSnapshotPending';
  }

  function loadPending(identity) {
    try {
      const parsed = JSON.parse(localStorage.getItem(pendingKey(identity)) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function savePending(value, identity) {
    try {
      const key = pendingKey(identity);
      if (!value || !Object.keys(value).length) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function currentEntity(entity) {
    try {
      if (entity === 'expenses') {
        if (global.CrewBIQRestoreHotfix && typeof global.CrewBIQRestoreHotfix.loadScopedExpenses === 'function') {
          return { available: true, value: global.CrewBIQRestoreHotfix.loadScopedExpenses(storedDriver()) };
        }
        if (typeof global.loadExpenses === 'function') {
          return { available: true, value: global.loadExpenses() };
        }
      }
      if (entity === 'deductionTemplates' && typeof global.loadDedTemplates === 'function') {
        return { available: true, value: global.loadDedTemplates() };
      }
      if (entity === 'weeklyDeductions' && typeof global.loadWeeklyDeds === 'function') {
        return { available: true, value: global.loadWeeklyDeds() };
      }
    } catch (e) {
      console.warn('[CrewBIQ Owner Snapshot] could not read ' + entity, e);
    }
    return { available: false, value: [] };
  }

  function markPending(entity, value) {
    if (applyingCloudRestore || !ENTITIES.includes(entity) || !Array.isArray(value)) return;
    const pending = loadPending();
    pending[entity] = {
      value: clone(value),
      updatedAt: new Date().toISOString(),
    };
    savePending(pending);
    scheduleFullSync(250);
  }

  function pendingOverlay(ownerData) {
    const patched = ownerData && typeof ownerData === 'object' ? clone(ownerData) : {};
    const pending = loadPending();
    ENTITIES.forEach(function (entity) {
      const item = pending[entity];
      if (item && Array.isArray(item.value)) patched[entity] = clone(item.value);
    });
    return patched;
  }

  function reportFromBody(body) {
    if (!body || typeof body !== 'object') return null;
    if (body.type === 'driver_report') return body;
    if (body.payload && body.payload.type === 'driver_report') return body.payload;
    return null;
  }

  function parseBody(init) {
    const raw = init && init.body;
    if (typeof raw !== 'string') return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function attachSnapshots(body) {
    const cloned = clone(body);
    const report = reportFromBody(cloned);
    if (!report) return { body, versions: {} };

    const ownerData = report.ownerData && typeof report.ownerData === 'object'
      ? report.ownerData
      : {};
    const pending = loadPending(report.driver || storedDriver());
    const snapshotEntities = [];
    const versions = {};

    ENTITIES.forEach(function (entity) {
      const pendingItem = pending[entity];
      if (pendingItem && Array.isArray(pendingItem.value)) {
        ownerData[entity] = clone(pendingItem.value);
        snapshotEntities.push(entity);
        versions[entity] = String(pendingItem.updatedAt || '');
        return;
      }

      const current = currentEntity(entity);
      if (current.available && Array.isArray(current.value)) {
        ownerData[entity] = clone(current.value);
        snapshotEntities.push(entity);
      }
    });

    if (!snapshotEntities.length) return { body, versions: {} };
    ownerData.snapshotEntities = Array.from(new Set(
      (Array.isArray(ownerData.snapshotEntities) ? ownerData.snapshotEntities : [])
        .concat(snapshotEntities)
    ));
    report.ownerData = ownerData;
    if (Array.isArray(ownerData.expenses)) report.expenses = clone(ownerData.expenses);
    return { body: cloned, versions };
  }

  function clearAcknowledgedPending(versions) {
    if (!versions || !Object.keys(versions).length) return;
    const pending = loadPending();
    Object.keys(versions).forEach(function (entity) {
      if (pending[entity] && String(pending[entity].updatedAt || '') === String(versions[entity] || '')) {
        delete pending[entity];
      }
    });
    savePending(pending);
  }

  async function routedFetch(input, init = {}) {
    const parsed = parseBody(init);
    const attached = parsed ? attachSnapshots(parsed) : { body: parsed, versions: {} };
    const nextInit = attached.body && attached.body !== parsed
      ? { ...init, body: JSON.stringify(attached.body) }
      : init;
    const response = await previousFetch(input, nextInit);
    if (response && response.ok && Object.keys(attached.versions).length) {
      clearAcknowledgedPending(attached.versions);
    }
    return response;
  }

  function scheduleFullSync(delay) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      if (typeof global.forceFullSync !== 'function') return;
      Promise.resolve(global.forceFullSync()).catch(function (error) {
        console.warn('[CrewBIQ Owner Snapshot] sync retry failed:', error && error.message ? error.message : error);
      });
    }, Number(delay || 250));
  }

  function wrapSaver(functionName, entity) {
    const original = global[functionName];
    if (typeof original !== 'function' || original.__crewbiqOwnerSnapshot) return;
    const wrapped = function (value) {
      const result = original.apply(this, arguments);
      const current = Array.isArray(value) ? value : currentEntity(entity).value;
      markPending(entity, Array.isArray(current) ? current : []);
      return result;
    };
    wrapped.__crewbiqOwnerSnapshot = true;
    global[functionName] = wrapped;
  }

  function wrapCloudRestore() {
    const original = global.applyOwnerSyncData;
    if (typeof original !== 'function' || original.__crewbiqOwnerSnapshot) return;
    const wrapped = function (ownerData) {
      applyingCloudRestore = true;
      try {
        return original.call(this, pendingOverlay(ownerData));
      } finally {
        applyingCloudRestore = false;
      }
    };
    wrapped.__crewbiqOwnerSnapshot = true;
    global.applyOwnerSyncData = wrapped;
  }

  function installHooks() {
    wrapSaver('saveExpenses', 'expenses');
    wrapSaver('saveDedTemplates', 'deductionTemplates');
    wrapSaver('saveWeeklyDeds', 'weeklyDeductions');
    wrapCloudRestore();

    if (Object.keys(loadPending()).length) scheduleFullSync(1800);
  }

  global.fetch = routedFetch;
  global.CrewBIQOwnerSnapshots = {
    version: '0.1.0',
    loadPending,
    markPending,
    pendingOverlay,
    attachSnapshots,
    scheduleFullSync,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHooks);
    else setTimeout(installHooks, 0);
  }

  console.info('[CrewBIQ Owner Snapshot] deletion durability v0.1.0 loaded');
})(window);
