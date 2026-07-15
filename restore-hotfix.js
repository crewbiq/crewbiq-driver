/**
 * CrewBIQ authenticated restore + expense durability adapter v0.2.0
 *
 * Loaded after core-runtime.js and before sync.js. It keeps the existing
 * authenticated transport, adds complete PostgreSQL restore, and bridges the
 * PWA's scoped Expenses storage into authenticated sync without a legacy fallback.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  const previousFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;
  let expenseSyncTimer = null;

  if (!previousFetch || !global.CrewBIQCore || !global.CrewBIQCore.orchestratorTransport) {
    console.error('[CrewBIQ Restore] Core transport is unavailable');
    return;
  }

  function requestMethod(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function parseBody(init) {
    const body = init && init.body;
    if (typeof body !== 'string') return null;
    try { return JSON.parse(body); } catch (e) { return null; }
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function responseData(response) {
    try {
      const data = await response.json();
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  function responseError(data, fallback) {
    const detail = data && data.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail.map(item => item && item.msg ? item.msg : String(item)).join('; ');
    }
    return (data && (data.error || data.reason || data.message)) || fallback || 'Restore failed';
  }

  function tokenFrom(payload) {
    try {
      return String((payload && payload.sessionToken) || localStorage.getItem(K + 'sessionToken') || '').trim();
    } catch (e) {
      return String((payload && payload.sessionToken) || '').trim();
    }
  }

  function identitySlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  function identityKey(identity) {
    const crew = identitySlug(identity && (identity.crewId || identity.crewbiq_id));
    const email = identitySlug(identity && identity.email);
    return crew ? 'crew_' + crew : (email ? 'email_' + email : '');
  }

  function scopedExpensesKey(identity) {
    const key = identityKey(identity);
    return key ? K + 'data_' + key + '_expenses' : K + 'expenses';
  }

  function storedDriver() {
    try {
      return JSON.parse(localStorage.getItem(K + 'driver') || 'null') || {};
    } catch (e) {
      return {};
    }
  }

  function loadScopedExpenses(identity) {
    try {
      const raw = localStorage.getItem(scopedExpensesKey(identity || storedDriver()));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function persistScopedExpenses(identity, expenses) {
    if (!Array.isArray(expenses)) return;
    try {
      localStorage.setItem(scopedExpensesKey(identity), JSON.stringify(expenses));
    } catch (e) {}
  }

  function authorizedUiRole(roles) {
    const list = Array.isArray(roles) ? roles.map(String) : [];
    if (list.includes('fleet')) return 'fleet';
    if (list.includes('owner_op') || list.includes('owner')) return 'owner_op';
    return 'driver';
  }

  function persistAuth(user, roles, payConfig) {
    try {
      localStorage.setItem(K + 'authUser', JSON.stringify(user || {}));
      localStorage.setItem(K + 'authRoles', JSON.stringify(Array.isArray(roles) ? roles : []));
      localStorage.setItem(K + 'userRole', authorizedUiRole(roles));
      if (payConfig && typeof payConfig === 'object' && payConfig.payType) {
        localStorage.setItem(K + 'paySettings', JSON.stringify(payConfig));
      }
    } catch (e) {}
  }

  function legacyProfile(user, roles) {
    const crewId = String(user.crewbiq_id || '');
    const email = String(user.email || '');
    const nickname = String(user.nickname || '');
    const effectiveOwner = String(user.effective_owner_crewbiq_id || crewId);
    return {
      email,
      nickname,
      crewId,
      driverId: crewId,
      effectiveOwnerCrewId: effectiveOwner,
      roles: Array.isArray(roles) ? roles : [],
      profile: {
        email,
        nickname,
        crewId,
        driverId: crewId,
        effectiveOwnerCrewId: effectiveOwner,
        driver: {
          email,
          nickname,
          crewId,
          driverId: crewId,
          name: nickname || (email ? email.split('@')[0] : 'Driver'),
        },
      },
    };
  }

  async function authenticatedGet(path, token) {
    const base = global.CrewBIQCore.orchestratorTransport.getOrchestratorBase();
    const response = await previousFetch(base + path, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      cache: 'no-store',
    });
    return { response, data: await responseData(response) };
  }

  function restoreReport(restore, ownerData) {
    const counts = restore.counts || {};
    const trucks = Array.isArray(ownerData.trucks) ? ownerData.trucks : [];
    const purchaseCosts = trucks.filter(item => Number(item && item.purchaseCost || 0) > 0).length;
    return {
      at: new Date().toISOString(),
      source: restore.source || '',
      counts,
      reconciliation: restore.reconciliation || {},
      roiInputs: {
        trucks: trucks.length,
        trucksWithPurchaseCost: purchaseCosts,
        ready: trucks.length > 0 && purchaseCosts === trucks.length,
      },
    };
  }

  function persistRestoreReport(report) {
    try { localStorage.setItem(K + 'lastRestoreReport', JSON.stringify(report)); } catch (e) {}
    global.lastCrewBIQRestoreReport = report;
  }

  function showRestoreReport(report) {
    if (!report || typeof setTimeout !== 'function') return;
    setTimeout(function () {
      if (typeof global.toast !== 'function') return;
      const counts = report.counts || {};
      const message = 'Restored: ' + Number(counts.loads || 0) + ' loads, ' +
        Number(counts.trucks || 0) + ' trucks, ' +
        Number(counts.driverProfiles || 0) + ' drivers, ' +
        Number(counts.expenses || 0) + ' expenses';
      global.toast(message, '');
    }, 700);
  }

  async function fullRestore(payload) {
    const token = tokenFrom(payload);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer session required' }, 401);

    const meResult = await authenticatedGet('/v1/me', token);
    if (!meResult.response.ok || meResult.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(meResult.data, 'Session restore failed'),
      }, meResult.response.status || 401);
    }

    const restoreResult = await authenticatedGet('/v1/restore/pwa', token);
    if (!restoreResult.response.ok || restoreResult.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(restoreResult.data, 'Full cloud restore failed'),
      }, restoreResult.response.status || 502);
    }

    const user = meResult.data.user || {};
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const restore = restoreResult.data || {};
    const ownerData = restore.ownerData && typeof restore.ownerData === 'object'
      ? restore.ownerData
      : {
          trucks: Array.isArray(restore.trucks) ? restore.trucks : [],
          driverProfiles: Array.isArray(restore.driver_profiles) ? restore.driver_profiles : [],
        };
    const payConfig = restore.pay_config || {};

    persistAuth(user, roles, payConfig);
    persistScopedExpenses(user, Array.isArray(ownerData.expenses) ? ownerData.expenses : []);
    const report = restoreReport(restore, ownerData);
    persistRestoreReport(report);
    showRestoreReport(report);

    return jsonResponse({
      ok: true,
      ...legacyProfile(user, roles),
      loads: Array.isArray(restore.loads) ? restore.loads : [],
      ptiLog: Array.isArray(restore.ptiLog) ? restore.ptiLog : [],
      disputes: Array.isArray(restore.disputes) ? restore.disputes : [],
      ownerData,
      pay_config: payConfig,
      restoreCounts: restore.counts || {},
      restoreReconciliation: restore.reconciliation || {},
      restoreSource: restore.source || '',
      roiInputs: report.roiInputs,
    });
  }

  function cloneBody(body) {
    try { return JSON.parse(JSON.stringify(body)); } catch (e) { return body; }
  }

  function attachExpensesToReport(body) {
    if (!body || typeof body !== 'object') return body;
    const cloned = cloneBody(body);
    let report = null;
    if (cloned.type === 'driver_report') report = cloned;
    else if (cloned.payload && cloned.payload.type === 'driver_report') report = cloned.payload;
    if (!report) return body;

    const identity = report.driver || storedDriver();
    const expenses = loadScopedExpenses(identity);
    const ownerData = report.ownerData && typeof report.ownerData === 'object'
      ? report.ownerData
      : {};
    report.ownerData = { ...ownerData, expenses };
    report.expenses = expenses;
    return cloned;
  }

  async function syncExpensesNow() {
    const token = tokenFrom({});
    const driver = storedDriver();
    if (!token || !identityKey(driver)) return { ok: false, reason: 'not_authenticated' };
    const expenses = loadScopedExpenses(driver);
    const recordId = 'expense_sync_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const response = await previousFetch(driver.syncUrl || 'https://script.google.com/macros/s/crewbiq-expenses/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'driver_report',
        record_id: recordId,
        sentAt: new Date().toISOString(),
        driver,
        loads: [],
        ptiLog: [],
        ownerData: { expenses },
        expenses,
      }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, count: expenses.length };
  }

  function scheduleExpenseSync() {
    clearTimeout(expenseSyncTimer);
    expenseSyncTimer = setTimeout(function () {
      syncExpensesNow().catch(function (error) {
        console.warn('[CrewBIQ Expenses] sync failed:', error && error.message ? error.message : error);
      });
    }, 900);
  }

  function installExpenseSaveHook() {
    const original = global.saveExpenses;
    if (typeof original !== 'function' || original.__crewbiqExpenseHook) return;
    const wrapped = function (value) {
      const result = original.apply(this, arguments);
      scheduleExpenseSync();
      return result;
    };
    wrapped.__crewbiqExpenseHook = true;
    global.saveExpenses = wrapped;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installExpenseSaveHook);
    } else {
      setTimeout(installExpenseSaveHook, 0);
    }
  }

  async function routedFetch(input, init = {}) {
    const body = parseBody(init);
    if (requestMethod(input, init) === 'POST' && body && body.type === 'auth_restore') {
      return fullRestore(body);
    }
    if (requestMethod(input, init) === 'POST' && body) {
      const enriched = attachExpensesToReport(body);
      if (enriched !== body) {
        return previousFetch(input, { ...init, body: JSON.stringify(enriched) });
      }
    }
    return previousFetch(input, init);
  }

  global.fetch = routedFetch;
  global.CrewBIQRestoreHotfix = {
    version: '0.2.0',
    fullRestore,
    syncExpensesNow,
    loadScopedExpenses,
    scopedExpensesKey,
  };

  console.info('[CrewBIQ Restore] authenticated restore + expenses v0.2.0 loaded');
})(window);
