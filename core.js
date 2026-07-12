/**
 * CrewBIQ Core v0.2.0
 * CrewBIQ Technologies — Foundation layer for modular architecture
 *
 * Provides:
 *   Core.storage                — localStorage wrapper
 *   Core.events                 — lightweight event bus
 *   Core.toast                  — notification utility
 *   Core.utils                  — shared helpers
 *   Core.orchestratorTransport  — authenticated Orchestrator compatibility layer
 *
 * The transport layer is intentionally bounded. It translates the PWA's current
 * action-envelope calls into the real Orchestrator REST contract so the UI can be
 * cut over without a silent legacy fallback:
 *
 *   auth_login   -> POST /v1/auth/login
 *   auth_restore -> GET  /v1/me + GET /v1/fleet/config
 *   auth_logout  -> POST /v1/auth/logout
 *   driver_report / pti_report -> POST /v1/sync/pwa
 *
 * Owner scope is never selected by client fields. The Bearer session is the only
 * authority used by the Orchestrator.
 */

(function (global) {
  'use strict';

  const K = 'fiqD_';
  const DEFAULT_ORCHESTRATOR_BASE = 'https://crewbiq-orchestrator-production.up.railway.app';
  const nativeFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;
  const recentSyncRecordIds = new Map();

  // ── STORAGE ──────────────────────────────────────────────────────────────

  const storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn('[CrewBIQ Core] storage.get error:', key, e);
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[CrewBIQ Core] storage.set error:', key, e);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn('[CrewBIQ Core] storage.remove error:', key, e);
      }
    },
  };

  // ── EVENTS ───────────────────────────────────────────────────────────────

  const _listeners = {};

  const events = {
    on(event, handler) {
      if (typeof handler !== 'function') {
        console.warn('[CrewBIQ Core] events.on: handler must be a function');
        return;
      }
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(handler);
    },

    off(event, handler) {
      if (!_listeners[event]) return;
      _listeners[event] = _listeners[event].filter(h => h !== handler);
    },

    emit(event, payload) {
      if (!_listeners[event]) return;
      _listeners[event].forEach(handler => {
        try {
          handler(payload);
        } catch (e) {
          console.error('[CrewBIQ Core] events.emit handler error:', event, e);
        }
      });
    },

    once(event, handler) {
      const wrapper = (payload) => {
        handler(payload);
        this.off(event, wrapper);
      };
      this.on(event, wrapper);
    },
  };

  // ── TOAST ────────────────────────────────────────────────────────────────

  const toast = function (message, type = '') {
    if (typeof global.toast === 'function') {
      global.toast(message, type);
    } else {
      console.info('[CrewBIQ Toast]', type ? `[${type}]` : '', message);
    }
  };

  // ── UTILS ────────────────────────────────────────────────────────────────

  const utils = {
    fmt(n) {
      return '$' + (Number(n) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },

    today() {
      return new Date().toISOString().slice(0, 10);
    },

    todayDisplay() {
      return new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    },

    escHtml(s) {
      return String(s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;',
      }[m]));
    },

    uid(prefix = 'id') {
      return `${prefix}_${Date.now()}`;
    },
  };

  // ── AUTHENTICATED ORCHESTRATOR TRANSPORT ────────────────────────────────

  function normalizeOrchestratorBase(value) {
    let url = String(value || '').trim().replace(/\/+$/, '');
    if (!url) return DEFAULT_ORCHESTRATOR_BASE;
    url = url
      .replace(/\/v1\/sync\/pwa$/i, '')
      .replace(/\/v1\/sync$/i, '')
      .replace(/\/v1\/events$/i, '')
      .replace(/\/v1\/fleet\/config\/pwa$/i, '')
      .replace(/\/v1\/fleet\/config$/i, '')
      .replace(/\/v1\/me$/i, '')
      .replace(/\/v1\/auth\/(login|logout|bootstrap)$/i, '');
    return url.replace(/\/+$/, '') || DEFAULT_ORCHESTRATOR_BASE;
  }

  function getOrchestratorBase() {
    try {
      const stored = localStorage.getItem(K + 'orchestratorUrl') ||
        localStorage.getItem(K + 'orchestratorUrlBackup') ||
        DEFAULT_ORCHESTRATOR_BASE;
      return normalizeOrchestratorBase(stored);
    } catch (e) {
      return DEFAULT_ORCHESTRATOR_BASE;
    }
  }

  function getSessionToken(explicitToken) {
    try {
      return String(explicitToken || localStorage.getItem(K + 'sessionToken') || '').trim();
    } catch (e) {
      return String(explicitToken || '').trim();
    }
  }

  function cloneJson(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (e) {
      return {};
    }
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function responseData(resp) {
    let data = {};
    try { data = await resp.json(); } catch (e) {}
    return data && typeof data === 'object' ? data : {};
  }

  function responseError(data, fallback) {
    const detail = data && data.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail.map(item => item && item.msg ? item.msg : String(item)).join('; ');
    }
    return (data && (data.error || data.reason || data.message)) || fallback || 'Request failed';
  }

  function authHeaders(token, headers) {
    const result = new Headers(headers || {});
    result.set('Content-Type', 'application/json');
    if (token) result.set('Authorization', 'Bearer ' + token);
    result.delete('X-CrewBIQ-Secret');
    return result;
  }

  function roleLevel(role) {
    return role === 'fleet' ? 2 : role === 'owner_op' || role === 'owner' ? 1 : 0;
  }

  function authorizedUiRole(roles) {
    const list = Array.isArray(roles) ? roles.map(String) : [];
    if (list.includes('fleet')) return 'fleet';
    if (list.includes('owner_op') || list.includes('owner')) return 'owner_op';
    return 'driver';
  }

  function persistAuthenticatedUser(user, roles) {
    const safeUser = user && typeof user === 'object' ? user : {};
    const safeRoles = Array.isArray(roles) ? roles.map(String) : [];
    try {
      localStorage.setItem(K + 'authUser', JSON.stringify(safeUser));
      localStorage.setItem(K + 'authRoles', JSON.stringify(safeRoles));
      localStorage.setItem(K + 'userRole', authorizedUiRole(safeRoles));
    } catch (e) {}
  }

  function persistPayConfig(payConfig) {
    if (!payConfig || typeof payConfig !== 'object' || !payConfig.payType) return;
    try {
      localStorage.setItem(K + 'paySettings', JSON.stringify(payConfig));
    } catch (e) {}
  }

  function legacyProfile(user, roles, effectiveOwnerId) {
    const crewId = String(user.crewbiq_id || '');
    const email = String(user.email || '');
    const nickname = String(user.nickname || '');
    return {
      email,
      nickname,
      crewId,
      driverId: crewId,
      effectiveOwnerCrewId: String(effectiveOwnerId || user.effective_owner_crewbiq_id || crewId),
      roles: Array.isArray(roles) ? roles : [],
      profile: {
        email,
        nickname,
        crewId,
        driverId: crewId,
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

  async function orchestratorJson(path, options) {
    const resp = await nativeFetch(getOrchestratorBase() + path, options);
    const data = await responseData(resp);
    return { resp, data };
  }

  async function adaptLogin(payload) {
    const email = String(payload.email || payload.emailOrNickname || '').trim();
    const password = String(payload.password || '');
    const upstream = await orchestratorJson('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    if (!upstream.resp.ok || upstream.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(upstream.data, 'Orchestrator login failed'),
      }, upstream.resp.status || 401);
    }

    const token = String(upstream.data.session_token || upstream.data.sessionToken || '').trim();
    const user = upstream.data.user || {};
    const roles = upstream.data.roles || user.roles || [];
    if (!token) return jsonResponse({ ok: false, error: 'Orchestrator login returned no session token' }, 502);

    try { localStorage.setItem(K + 'sessionToken', token); } catch (e) {}
    persistAuthenticatedUser(user, roles);

    return jsonResponse({
      ok: true,
      sessionToken: token,
      ...legacyProfile(user, roles, upstream.data.effective_owner_crewbiq_id),
    });
  }

  async function adaptBootstrap(payload) {
    const upstream = await orchestratorJson('/v1/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(payload.email || '').trim(),
        password: String(payload.password || ''),
        nickname: String(payload.nickname || '').trim(),
      }),
      cache: 'no-store',
    });

    if (!upstream.resp.ok || upstream.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(upstream.data, 'Account bootstrap failed'),
      }, upstream.resp.status || 400);
    }

    const token = String(upstream.data.session_token || upstream.data.sessionToken || '').trim();
    const user = upstream.data.user || {};
    const roles = upstream.data.roles || user.roles || [];
    if (!token) return jsonResponse({ ok: false, error: 'Account created without a session token' }, 502);

    try { localStorage.setItem(K + 'sessionToken', token); } catch (e) {}
    persistAuthenticatedUser(user, roles);

    return jsonResponse({
      ok: true,
      sessionToken: token,
      ...legacyProfile(user, roles, upstream.data.effective_owner_crewbiq_id),
    }, upstream.resp.status || 201);
  }

  async function adaptRestore(payload) {
    const token = getSessionToken(payload.sessionToken);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer session required' }, 401);

    const headers = authHeaders(token);
    const meResult = await orchestratorJson('/v1/me', {
      method: 'GET', headers, cache: 'no-store',
    });
    if (!meResult.resp.ok || meResult.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(meResult.data, 'Session restore failed'),
      }, meResult.resp.status || 401);
    }

    const fleetResult = await orchestratorJson('/v1/fleet/config', {
      method: 'GET', headers, cache: 'no-store',
    });
    if (!fleetResult.resp.ok || fleetResult.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(fleetResult.data, 'Fleet restore failed'),
      }, fleetResult.resp.status || 502);
    }

    const user = meResult.data.user || {};
    const roles = user.roles || [];
    const payConfig = fleetResult.data.pay_config || {};
    persistAuthenticatedUser(user, roles);
    persistPayConfig(payConfig);

    return jsonResponse({
      ok: true,
      ...legacyProfile(user, roles, user.effective_owner_crewbiq_id),
      loads: [],
      ptiLog: [],
      ownerData: {
        trucks: Array.isArray(fleetResult.data.trucks) ? fleetResult.data.trucks : [],
        driverProfiles: Array.isArray(fleetResult.data.driver_profiles)
          ? fleetResult.data.driver_profiles
          : (Array.isArray(fleetResult.data.driverProfiles) ? fleetResult.data.driverProfiles : []),
      },
      pay_config: payConfig,
    });
  }

  async function adaptLogout(payload) {
    const token = getSessionToken(payload.sessionToken);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer session required' }, 401);
    const upstream = await orchestratorJson('/v1/auth/logout', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    if (!upstream.resp.ok || upstream.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(upstream.data, 'Logout failed'),
      }, upstream.resp.status || 400);
    }
    return jsonResponse({ ok: true });
  }

  function sanitizeSyncPayload(value) {
    const clean = cloneJson(value);
    delete clean.sessionToken;
    if (clean.payload && typeof clean.payload === 'object') delete clean.payload.sessionToken;
    return clean;
  }

  function ptiAsDriverReport(payload) {
    return {
      type: 'driver_report',
      record_id: payload.record_id || ('sync_' + String(payload.deviceId || 'device') + '_' + Date.now()),
      sentAt: payload.sentAt || new Date().toISOString(),
      deviceId: payload.deviceId || '',
      driver: payload.driver || {},
      profile: { driver: payload.driver || {} },
      loads: [],
      ptiLog: payload.pti ? [payload.pti] : [],
      ownerData: null,
    };
  }

  function syncRecordId(payload) {
    const inner = payload && payload.payload && typeof payload.payload === 'object' ? payload.payload : payload;
    return String((inner && inner.record_id) || (payload && payload.record_id) || '').trim();
  }

  function pruneRecentSyncIds() {
    const cutoff = Date.now() - (2 * 60 * 1000);
    recentSyncRecordIds.forEach((at, id) => {
      if (at < cutoff) recentSyncRecordIds.delete(id);
    });
  }

  async function adaptSync(payload) {
    const token = getSessionToken(payload && payload.sessionToken);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer session required' }, 401);

    let clean = sanitizeSyncPayload(payload);
    if (clean.type === 'pti_report') clean = ptiAsDriverReport(clean);
    const recordId = syncRecordId(clean);

    pruneRecentSyncIds();
    if (recordId && recentSyncRecordIds.has(recordId)) {
      return jsonResponse({ ok: true, received: true, record_id: recordId, client_deduplicated: true });
    }

    const upstream = await orchestratorJson('/v1/sync/pwa', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(clean),
      cache: 'no-store',
    });

    if (upstream.resp.ok && recordId) recentSyncRecordIds.set(recordId, Date.now());
    if (!upstream.resp.ok || upstream.data.ok === false) {
      return jsonResponse({
        ok: false,
        error: responseError(upstream.data, 'Authenticated sync failed'),
      }, upstream.resp.status || 502);
    }
    return jsonResponse(upstream.data, upstream.resp.status || 200);
  }

  async function adaptFleetRestore() {
    const token = getSessionToken();
    if (!token) return jsonResponse({ ok: false, error: 'Bearer session required' }, 401);
    const upstream = await orchestratorJson('/v1/fleet/config', {
      method: 'GET',
      headers: authHeaders(token),
      cache: 'no-store',
    });
    if (upstream.resp.ok) persistPayConfig(upstream.data.pay_config || {});
    return jsonResponse(upstream.data, upstream.resp.status || 200);
  }

  function parseBody(init) {
    const body = init && init.body;
    if (typeof body !== 'string') return null;
    try { return JSON.parse(body); } catch (e) { return null; }
  }

  function requestUrl(input) {
    return typeof input === 'string' ? input : String((input && input.url) || '');
  }

  function requestMethod(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function isFleetRestoreUrl(url) {
    return /\/v1\/fleet\/config(?:\/pwa)?(?:\?|$)/i.test(String(url || ''));
  }

  function isOrchestratorSyncUrl(url) {
    return /\/v1\/sync(?:\/pwa)?(?:\?|$)/i.test(String(url || ''));
  }

  async function routedFetch(input, init = {}) {
    if (!nativeFetch) throw new Error('fetch is not available');
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const body = parseBody(init);

    if (method === 'POST' && body && body.type === 'auth_login') return adaptLogin(body);
    if (method === 'POST' && body && body.type === 'auth_signup') return adaptBootstrap(body);
    if (method === 'POST' && body && body.type === 'auth_restore') return adaptRestore(body);
    if (method === 'POST' && body && body.type === 'auth_logout') return adaptLogout(body);

    if (method === 'POST' && body && (
      body.type === 'driver_report' ||
      body.type === 'pti_report' ||
      (body.payload && typeof body.payload === 'object' && body.payload.type === 'driver_report') ||
      isOrchestratorSyncUrl(url)
    )) {
      return adaptSync(body);
    }

    if (method === 'GET' && isFleetRestoreUrl(url)) return adaptFleetRestore();

    return nativeFetch(input, init);
  }

  function installRoleGuard() {
    if (typeof global.setUserRole !== 'function' || global.setUserRole.__crewbiqGuarded) return;
    const original = global.setUserRole;
    const guarded = function (requestedRole) {
      let roles = [];
      try { roles = JSON.parse(localStorage.getItem(K + 'authRoles') || '[]'); } catch (e) {}
      if (Array.isArray(roles) && roles.length) {
        const maxRole = authorizedUiRole(roles);
        if (roleLevel(requestedRole) > roleLevel(maxRole)) {
          toast('This role is not authorized for the signed-in account.', 'err');
          return;
        }
      }
      return original(requestedRole);
    };
    guarded.__crewbiqGuarded = true;
    global.setUserRole = guarded;
  }

  const orchestratorTransport = {
    version: '0.1.0',
    normalizeOrchestratorBase,
    getOrchestratorBase,
    getSessionToken,
    authorizedUiRole,
    routedFetch,
  };

  if (nativeFetch) global.fetch = routedFetch;

  // ── CORE OBJECT ──────────────────────────────────────────────────────────

  const Core = {
    version: '0.2.0',
    storage,
    events,
    toast,
    utils,
    orchestratorTransport,
  };

  global.CrewBIQCore = Core;
  global.Core = Core;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installRoleGuard();
      Core.events.emit('core:ready', { version: Core.version });
    });
  } else {
    setTimeout(() => {
      installRoleGuard();
      Core.events.emit('core:ready', { version: Core.version });
    }, 0);
  }

  console.info(`[CrewBIQ Core] v${Core.version} loaded`);

})(window);
