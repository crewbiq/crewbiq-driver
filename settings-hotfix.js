/**
 * CrewBIQ authenticated Settings durability adapter v0.1.0
 *
 * Loaded after restore-hotfix.js. Adds a bounded Settings snapshot to every
 * authenticated driver report and hydrates it during auth_restore. Identity,
 * roles, credentials, sync URLs and orchestrator secrets are never copied from
 * the client snapshot.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  const previousFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;
  const PROFILE_FIELDS = [
    'name', 'company', 'truckName', 'unitNumber', 'plate',
    'teamDriver', 'teamRate', 'payType', 'cpmRate', 'grossPercent',
    'cpmBase', 'ptiSchedule', 'ptiEnabled',
  ];
  const PREFERENCE_FIELDS = ['theme', 'accent', 'weekStart', 'rateEffectiveDate'];

  if (!previousFetch || !global.CrewBIQCore || !global.CrewBIQCore.orchestratorTransport) {
    console.error('[CrewBIQ Settings] authenticated transport is unavailable');
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

  function cloneJson(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function storedJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function storedDriver() {
    const value = storedJson(K + 'driver', {});
    return value && typeof value === 'object' ? value : {};
  }

  function safeScalar(value) {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && value.length <= 500;
  }

  function boundedText(value, limit) {
    return String(value || '').trim().slice(0, limit);
  }

  function sanitizeCustomPti(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 50).map(function (item) {
      if (!item || typeof item !== 'object') return null;
      const clean = {
        id: boundedText(item.id, 80),
        name: boundedText(item.name, 120),
        desc: boundedText(item.desc, 240),
      };
      return clean.name ? clean : null;
    }).filter(Boolean);
  }

  function sanitizeSettings(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const rawProfile = raw.profile && typeof raw.profile === 'object' ? raw.profile : raw;
    const rawPreferences = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : raw;
    const profile = {};
    const preferences = {};

    PROFILE_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(rawProfile, key) && safeScalar(rawProfile[key])) {
        profile[key] = rawProfile[key];
      }
    });
    PREFERENCE_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(rawPreferences, key) && safeScalar(rawPreferences[key])) {
        preferences[key] = rawPreferences[key];
      }
    });

    const customPti = sanitizeCustomPti(raw.customPti);
    if (!Object.keys(profile).length && !Object.keys(preferences).length && !customPti.length) return null;

    const result = { version: 1, profile, preferences };
    if (customPti.length) result.customPti = customPti;
    const updatedAt = boundedText(raw.updatedAt, 64);
    if (updatedAt) result.updatedAt = updatedAt;
    return result;
  }

  function settingsSnapshot() {
    const driver = storedDriver();
    const profile = {};
    PROFILE_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(driver, key) && safeScalar(driver[key])) {
        profile[key] = driver[key];
      }
    });

    const preferences = {
      theme: localStorage.getItem(K + 'theme') || 'dark',
      accent: localStorage.getItem(K + 'accent') || 'blue',
      weekStart: localStorage.getItem(K + 'weekStart') || '1',
      rateEffectiveDate: localStorage.getItem(K + 'rateEffectiveDate') || '',
    };

    return sanitizeSettings({
      version: 1,
      updatedAt: localStorage.getItem(K + 'settingsUpdatedAt') || new Date().toISOString(),
      profile,
      preferences,
      customPti: storedJson(K + 'ptiCustom', []),
    });
  }

  function findDriverReport(body) {
    if (!body || typeof body !== 'object') return null;
    if (body.type === 'driver_report') return body;
    if (body.payload && body.payload.type === 'driver_report') return body.payload;
    return null;
  }

  function attachSettingsToReport(body) {
    const cloned = cloneJson(body);
    const report = findDriverReport(cloned);
    if (!report) return body;
    const settings = settingsSnapshot();
    if (!settings) return body;
    const ownerData = report.ownerData && typeof report.ownerData === 'object'
      ? report.ownerData
      : {};
    report.ownerData = { ...ownerData, settings };
    report.settings = settings;
    return cloned;
  }

  function tokenFrom(body) {
    try {
      return String((body && body.sessionToken) || localStorage.getItem(K + 'sessionToken') || '').trim();
    } catch (e) {
      return String((body && body.sessionToken) || '').trim();
    }
  }

  async function responseJson(response) {
    try {
      const data = await response.clone().json();
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  function jsonResponseLike(response, data) {
    const headers = new Headers(response.headers || {});
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  async function fetchCloudSettings(token) {
    if (!token) return null;
    try {
      const base = global.CrewBIQCore.orchestratorTransport.getOrchestratorBase();
      const response = await previousFetch(base + '/v1/settings/pwa', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const data = await responseJson(response);
      return sanitizeSettings(data.settings);
    } catch (e) {
      console.warn('[CrewBIQ Settings] cloud restore unavailable:', e && e.message ? e.message : e);
      return null;
    }
  }

  function applyLocalSettings(raw) {
    const settings = sanitizeSettings(raw);
    if (!settings) return null;
    const profile = settings.profile || {};
    const preferences = settings.preferences || {};

    try {
      if (profile.payType) {
        localStorage.setItem(K + 'paySettings', JSON.stringify({
          payType: profile.payType,
          cpmRate: Number(profile.cpmRate || 0),
          grossPercent: Number(profile.grossPercent || 0),
          cpmBase: profile.cpmBase || 'loaded',
          savedAt: settings.updatedAt || new Date().toISOString(),
        }));
      }
      if (profile.ptiSchedule) {
        localStorage.setItem(K + '_savedPtiSched', String(profile.ptiSchedule));
      }
      if (Object.prototype.hasOwnProperty.call(preferences, 'theme')) {
        localStorage.setItem(K + 'theme', String(preferences.theme || 'dark'));
      }
      if (Object.prototype.hasOwnProperty.call(preferences, 'accent')) {
        localStorage.setItem(K + 'accent', String(preferences.accent || 'blue'));
      }
      if (Object.prototype.hasOwnProperty.call(preferences, 'weekStart')) {
        localStorage.setItem(K + 'weekStart', String(preferences.weekStart));
      }
      if (Object.prototype.hasOwnProperty.call(preferences, 'rateEffectiveDate')) {
        localStorage.setItem(K + 'rateEffectiveDate', String(preferences.rateEffectiveDate || ''));
      }
      if (Array.isArray(settings.customPti)) {
        localStorage.setItem(K + 'ptiCustom', JSON.stringify(settings.customPti));
      }
      localStorage.setItem(K + 'settingsUpdatedAt', settings.updatedAt || new Date().toISOString());
    } catch (e) {}

    try {
      if (typeof global.applyTheme === 'function' && preferences.theme) global.applyTheme(preferences.theme);
      if (typeof global.setAccent === 'function' && preferences.accent) global.setAccent(preferences.accent);
    } catch (e) {}
    return settings;
  }

  function mergeSettingsIntoAuthPayload(data, raw) {
    const settings = sanitizeSettings(raw);
    if (!settings || !data || typeof data !== 'object') return data;
    const profile = settings.profile || {};
    const currentProfile = data.profile && typeof data.profile === 'object' ? data.profile : {};
    const currentDriver = currentProfile.driver && typeof currentProfile.driver === 'object'
      ? currentProfile.driver
      : {};

    data.profile = {
      ...currentProfile,
      driver: { ...currentDriver, ...profile },
    };
    const ownerData = data.ownerData && typeof data.ownerData === 'object' ? data.ownerData : {};
    data.ownerData = { ...ownerData, settings };
    data.settings = settings;
    return data;
  }

  async function restoreSettingsIntoResponse(response, body) {
    if (!response.ok) return response;
    const data = await responseJson(response);
    const embedded = sanitizeSettings(
      (data.ownerData && data.ownerData.settings) || data.settings
    );
    const cloud = await fetchCloudSettings(tokenFrom(body));
    const settings = cloud || embedded;
    if (!settings) return response;
    applyLocalSettings(settings);
    mergeSettingsIntoAuthPayload(data, settings);
    return jsonResponseLike(response, data);
  }

  function persistSettingsFormState() {
    try {
      const effective = document.getElementById('setRateEffectiveDate');
      if (effective) localStorage.setItem(K + 'rateEffectiveDate', String(effective.value || ''));
      localStorage.setItem(K + 'settingsUpdatedAt', new Date().toISOString());
    } catch (e) {}
  }

  function installSettingsHooks() {
    const originalSave = global.saveSettings;
    if (typeof originalSave === 'function' && !originalSave.__crewbiqSettingsHook) {
      const wrappedSave = function () {
        persistSettingsFormState();
        const result = originalSave.apply(this, arguments);
        persistSettingsFormState();
        return result;
      };
      wrappedSave.__crewbiqSettingsHook = true;
      global.saveSettings = wrappedSave;
    }

    const originalRender = global.renderSettingsPage;
    if (typeof originalRender === 'function' && !originalRender.__crewbiqSettingsHook) {
      const wrappedRender = function () {
        const result = originalRender.apply(this, arguments);
        try {
          const effective = document.getElementById('setRateEffectiveDate');
          const saved = localStorage.getItem(K + 'rateEffectiveDate') || '';
          if (effective && saved) effective.value = saved;
        } catch (e) {}
        return result;
      };
      wrappedRender.__crewbiqSettingsHook = true;
      global.renderSettingsPage = wrappedRender;
    }
  }

  async function routedFetch(input, init = {}) {
    const body = parseBody(init);
    if (requestMethod(input, init) === 'POST' && body && body.type === 'auth_restore') {
      const response = await previousFetch(input, init);
      return restoreSettingsIntoResponse(response, body);
    }
    if (requestMethod(input, init) === 'POST' && body) {
      const enriched = attachSettingsToReport(body);
      if (enriched !== body) {
        return previousFetch(input, { ...init, body: JSON.stringify(enriched) });
      }
    }
    return previousFetch(input, init);
  }

  global.fetch = routedFetch;
  global.CrewBIQSettingsHotfix = {
    version: '0.1.0',
    settingsSnapshot,
    sanitizeSettings,
    applyLocalSettings,
    attachSettingsToReport,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installSettingsHooks);
    } else {
      setTimeout(installSettingsHooks, 0);
    }
  }

  console.info('[CrewBIQ Settings] cloud Settings durability v0.1.0 loaded');
})(window);
