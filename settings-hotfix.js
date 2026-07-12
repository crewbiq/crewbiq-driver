/**
 * CrewBIQ authenticated Settings durability adapter v0.2.1
 *
 * Adds a bounded Settings snapshot to authenticated driver reports and hydrates
 * it during auth_restore. A clean device cannot publish profile settings until
 * the user explicitly taps Save Settings. The manual profile is stored separately
 * so a local driver reset cannot replace it with blank defaults. Identity, roles,
 * credentials, URLs, tokens and orchestrator secrets are never copied.
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

  function meaningfulScalar(value) {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
  }

  function normalizedScalar(value) {
    return typeof value === 'string' ? value.trim() : value;
  }

  function boundedText(value, limit) {
    return String(value || '').trim().slice(0, limit);
  }

  function collectProfile(source) {
    const profile = {};
    if (!source || typeof source !== 'object') return profile;
    PROFILE_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(source, key) && meaningfulScalar(source[key])) {
        profile[key] = normalizedScalar(source[key]);
      }
    });
    return profile;
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
    const profile = collectProfile(rawProfile);
    const preferences = {};

    PREFERENCE_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(rawPreferences, key) && meaningfulScalar(rawPreferences[key])) {
        preferences[key] = normalizedScalar(rawPreferences[key]);
      }
    });

    const customPresent = Array.isArray(raw.customPti);
    const customPti = sanitizeCustomPti(raw.customPti);
    if (!Object.keys(profile).length && !Object.keys(preferences).length && !customPresent) return null;

    const result = { version: 2, profile, preferences };
    if (customPresent) result.customPti = customPti;
    const updatedAt = boundedText(raw.updatedAt, 64);
    if (updatedAt) result.updatedAt = updatedAt;
    if (raw.profileSource === 'manual') result.profileSource = 'manual';
    return result;
  }

  function manualProfileSnapshot() {
    const saved = storedJson(K + 'settingsProfileSnapshot', null);
    if (saved && typeof saved === 'object') {
      const clean = collectProfile(saved);
      if (Object.keys(clean).length) return clean;
    }
    return collectProfile(storedDriver());
  }

  function settingsSnapshot() {
    const manualSavedAt = String(localStorage.getItem(K + 'settingsProfileSavedAt') || '').trim();
    const settingsUpdatedAt = String(localStorage.getItem(K + 'settingsUpdatedAt') || '').trim();

    // A brand-new or freshly-cleared device must not publish defaults as if they
    // were user settings. Cloud restore or manual Save creates the readiness marker.
    if (!manualSavedAt && !settingsUpdatedAt) return null;

    const profile = manualSavedAt ? manualProfileSnapshot() : {};
    const preferences = {};
    const storedPreferences = {
      theme: localStorage.getItem(K + 'theme'),
      accent: localStorage.getItem(K + 'accent'),
      weekStart: localStorage.getItem(K + 'weekStart'),
      rateEffectiveDate: localStorage.getItem(K + 'rateEffectiveDate'),
    };
    PREFERENCE_FIELDS.forEach(function (key) {
      if (meaningfulScalar(storedPreferences[key])) {
        preferences[key] = normalizedScalar(storedPreferences[key]);
      }
    });

    return sanitizeSettings({
      version: 2,
      updatedAt: manualSavedAt || settingsUpdatedAt,
      profileSource: manualSavedAt ? 'manual' : 'none',
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
      const settings = sanitizeSettings(data.settings);
      return settings ? {
        settings,
        diagnostics: data.diagnostics && typeof data.diagnostics === 'object' ? data.diagnostics : {},
        source: String(data.source || ''),
      } : null;
    } catch (e) {
      console.warn('[CrewBIQ Settings] cloud restore unavailable:', e && e.message ? e.message : e);
      return null;
    }
  }

  function validPayConfig(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (profile.payType === 'cpm') return Number(profile.cpmRate || 0) > 0;
    if (profile.payType === 'gross_percent') return Number(profile.grossPercent || 0) > 0;
    return false;
  }

  function persistSettingsRestoreReport(settings, diagnostics, source) {
    const report = {
      at: new Date().toISOString(),
      source: source || '',
      profileFields: Object.keys((settings && settings.profile) || {}).length,
      preferenceFields: Object.keys((settings && settings.preferences) || {}).length,
      validPayConfig: validPayConfig((settings && settings.profile) || {}),
      diagnostics: diagnostics || {},
    };
    try { localStorage.setItem(K + 'lastSettingsRestoreReport', JSON.stringify(report)); } catch (e) {}
    global.lastCrewBIQSettingsRestoreReport = report;
    return report;
  }

  function showSettingsRestoreReport(report) {
    if (!report || typeof setTimeout !== 'function') return;
    setTimeout(function () {
      if (typeof global.toast !== 'function') return;
      global.toast(
        'Settings restored: ' + report.profileFields + ' profile fields, ' +
          report.preferenceFields + ' preferences',
        report.profileFields > 0 ? '' : 'warn'
      );
    }, 1500);
  }

  function applyLocalSettings(raw, diagnostics, source) {
    const settings = sanitizeSettings(raw);
    if (!settings) return null;
    const profile = settings.profile || {};
    const preferences = settings.preferences || {};

    try {
      if (validPayConfig(profile)) {
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
      localStorage.setItem(K + 'settingsCloudRestoredAt', new Date().toISOString());
      // Deliberately do not set settingsProfileSavedAt or settingsProfileSnapshot.
      // Only a manual Save authorizes this device to publish profile fields.
    } catch (e) {}

    try {
      if (typeof global.applyTheme === 'function' && preferences.theme) global.applyTheme(preferences.theme);
      if (typeof global.setAccent === 'function' && preferences.accent) global.setAccent(preferences.accent);
    } catch (e) {}

    const report = persistSettingsRestoreReport(settings, diagnostics, source);
    showSettingsRestoreReport(report);
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
    const cloudResult = await fetchCloudSettings(tokenFrom(body));
    const settings = (cloudResult && cloudResult.settings) || embedded;
    if (!settings) return response;
    const diagnostics = (cloudResult && cloudResult.diagnostics) || {};
    const source = (cloudResult && cloudResult.source) || 'embedded';
    applyLocalSettings(settings, diagnostics, source);
    mergeSettingsIntoAuthPayload(data, settings);
    data.settingsRestoreDiagnostics = {
      source,
      profileFields: Object.keys(settings.profile || {}).length,
      preferenceFields: Object.keys(settings.preferences || {}).length,
      validPayConfig: validPayConfig(settings.profile || {}),
      ...diagnostics,
    };
    return jsonResponseLike(response, data);
  }

  function persistSettingsFormState() {
    try {
      const now = new Date().toISOString();
      const effective = document.getElementById('setRateEffectiveDate');
      if (effective) localStorage.setItem(K + 'rateEffectiveDate', String(effective.value || ''));
      const profile = collectProfile(storedDriver());
      localStorage.setItem(K + 'settingsProfileSnapshot', JSON.stringify(profile));
      localStorage.setItem(K + 'settingsProfileSavedAt', now);
      localStorage.setItem(K + 'settingsUpdatedAt', now);
    } catch (e) {}
  }

  function installSettingsHooks() {
    const originalSave = global.saveSettings;
    if (typeof originalSave === 'function' && !originalSave.__crewbiqSettingsHook) {
      const wrappedSave = function () {
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
    version: '0.2.1',
    settingsSnapshot,
    sanitizeSettings,
    applyLocalSettings,
    attachSettingsToReport,
    validPayConfig,
    manualProfileSnapshot,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installSettingsHooks);
    } else {
      setTimeout(installSettingsHooks, 0);
    }
  }

  console.info('[CrewBIQ Settings] cloud Settings durability v0.2.1 loaded');
})(window);
