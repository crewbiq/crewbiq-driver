/**
 * CrewBIQ authenticated full-restore hotfix v0.1.0
 *
 * Loaded after core-runtime.js and before sync.js. It replaces only the legacy
 * auth_restore envelope with the complete Bearer-authenticated PostgreSQL restore
 * contract. All login, logout, sync, role-guard, and fleet-only behavior remains
 * owned by CrewBIQ Core v0.2.0.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  const previousFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;

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

    return jsonResponse({
      ok: true,
      ...legacyProfile(user, roles),
      loads: Array.isArray(restore.loads) ? restore.loads : [],
      ptiLog: Array.isArray(restore.ptiLog) ? restore.ptiLog : [],
      ownerData,
      pay_config: payConfig,
      restoreCounts: restore.counts || {},
      restoreSource: restore.source || '',
    });
  }

  async function routedFetch(input, init = {}) {
    const body = parseBody(init);
    if (requestMethod(input, init) === 'POST' && body && body.type === 'auth_restore') {
      return fullRestore(body);
    }
    return previousFetch(input, init);
  }

  global.fetch = routedFetch;
  global.CrewBIQRestoreHotfix = {
    version: '0.1.0',
    fullRestore,
  };

  console.info('[CrewBIQ Restore] authenticated full restore v0.1.0 loaded');
})(window);
