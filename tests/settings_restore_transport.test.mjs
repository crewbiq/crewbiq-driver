import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

const documentListeners = new Map();
const document = {
  readyState: 'loading',
  addEventListener(name, handler) {
    const list = documentListeners.get(name) || [];
    list.push(handler);
    documentListeners.set(name, list);
  },
  getElementById() { return null; },
};

const calls = [];
async function mockFetch(url, init = {}) {
  const call = {
    url: String(url),
    method: String(init.method || 'GET').toUpperCase(),
    headers: new Headers(init.headers || {}),
    body: typeof init.body === 'string' ? init.body : '',
  };
  calls.push(call);

  if (call.url.endsWith('/v1/me')) {
    return new Response(JSON.stringify({
      ok: true,
      user: {
        crewbiq_id: 'CBQ-AUTH',
        effective_owner_crewbiq_id: 'CBQ-OWNER',
        email: 'owner@example.com',
        nickname: 'Owner',
        roles: ['fleet'],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/restore/pwa')) {
    return new Response(JSON.stringify({
      ok: true,
      crewbiq_id: 'CBQ-OWNER',
      loads: [],
      ptiLog: [],
      ownerData: { trucks: [], driverProfiles: [], expenses: [] },
      pay_config: {},
      counts: { loads: 0, trucks: 0, driverProfiles: 0, expenses: 0 },
      reconciliation: {},
      source: 'postgres',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/settings/pwa')) {
    return new Response(JSON.stringify({
      ok: true,
      crewbiq_id: 'CBQ-OWNER',
      source: 'sync_event_settings_reconciled',
      diagnostics: {
        eventsScanned: 8,
        explicitSnapshots: 3,
        profileCandidates: 6,
        profileQuality: 17,
        profileFields: 10,
        preferenceFields: 4,
        selectedProfileSource: 'legacy_driver',
        validPayConfig: true,
      },
      settings: {
        version: 2,
        updatedAt: '2026-07-12T17:30:00Z',
        profileSource: 'legacy_driver',
        profile: {
          name: 'Izzet',
          company: 'Kaunas Express',
          truckName: 'Mack Anthem',
          unitNumber: '1919',
          plate: 'P1340909',
          payType: 'gross_percent',
          grossPercent: 42,
          cpmBase: 'total',
          ptiEnabled: false,
          ptiSchedule: 'weekly',
          email: 'attacker@example.com',
          crewId: 'CBQ-ATTACKER',
        },
        preferences: {
          theme: 'dark',
          accent: 'cyan',
          weekStart: 5,
          rateEffectiveDate: '2026-07-08',
          syncUrl: 'https://attacker.invalid',
          orchestratorSecret: 'secret',
        },
        customPti: [{ id: 'custom-1', name: 'Air lines', desc: 'Check leaks' }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/sync/pwa')) {
    return new Response(JSON.stringify({ ok: true, record_id: 'sync-settings-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  throw new Error('Unexpected native fetch: ' + call.method + ' ' + call.url);
}

const context = {
  console,
  localStorage,
  document,
  fetch: mockFetch,
  Response,
  Headers,
  Request,
  setTimeout,
  clearTimeout,
  Math,
  Date,
};
context.window = context;
context.globalThis = context;

for (const filename of ['core-runtime.js', 'restore-hotfix.js', 'settings-hotfix.js']) {
  const source = fs.readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
  vm.runInNewContext(source, context, { filename });
}

assert.equal(context.CrewBIQSettingsHotfix.version, '0.2.1');
localStorage.setItem('fiqD_sessionToken', 'token-owner-1');

// A brand-new device has no manual profile marker and must not publish defaults.
assert.equal(context.CrewBIQSettingsHotfix.settingsSnapshot(), null);

const restoreResponse = await context.fetch('https://script.google.com/macros/s/example/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({ type: 'auth_restore', sessionToken: 'token-owner-1' }),
});
const restored = await restoreResponse.json();

assert.equal(restored.profile.driver.company, 'Kaunas Express');
assert.equal(restored.profile.driver.truckName, 'Mack Anthem');
assert.equal(restored.profile.driver.unitNumber, '1919');
assert.equal(restored.profile.driver.plate, 'P1340909');
assert.equal(restored.profile.driver.payType, 'gross_percent');
assert.equal(restored.profile.driver.grossPercent, 42);
assert.equal(restored.profile.driver.cpmBase, 'total');
assert.equal(restored.profile.driver.ptiEnabled, false);
assert.equal(restored.profile.driver.ptiSchedule, 'weekly');
assert.equal(restored.profile.driver.email, 'owner@example.com');
assert.equal(restored.profile.driver.crewId, 'CBQ-AUTH');
assert.equal(restored.settingsRestoreDiagnostics.profileFields, 10);
assert.equal(restored.settingsRestoreDiagnostics.validPayConfig, true);
assert.equal(restored.settingsRestoreDiagnostics.eventsScanned, 8);
assert.equal(localStorage.getItem('fiqD_theme'), 'dark');
assert.equal(localStorage.getItem('fiqD_accent'), 'cyan');
assert.equal(localStorage.getItem('fiqD_weekStart'), '5');
assert.equal(localStorage.getItem('fiqD_rateEffectiveDate'), '2026-07-08');
assert.equal(localStorage.getItem('fiqD_settingsProfileSavedAt'), null);
assert.equal(localStorage.getItem('fiqD_settingsProfileSnapshot'), null);
assert.deepEqual(JSON.parse(localStorage.getItem('fiqD_paySettings')), {
  payType: 'gross_percent',
  cpmRate: 0,
  grossPercent: 42,
  cpmBase: 'total',
  savedAt: '2026-07-12T17:30:00Z',
});
assert.deepEqual(JSON.parse(localStorage.getItem('fiqD_ptiCustom')), [
  { id: 'custom-1', name: 'Air lines', desc: 'Check leaks' },
]);
const restoreReport = JSON.parse(localStorage.getItem('fiqD_lastSettingsRestoreReport'));
assert.equal(restoreReport.profileFields, 10);
assert.equal(restoreReport.validPayConfig, true);
assert.equal(restoreReport.diagnostics.profileQuality, 17);
assert.equal(calls.some(call => call.url.includes('script.google.com')), false);
assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/settings/pwa');
assert.equal(calls.at(-1).headers.get('authorization'), 'Bearer token-owner-1');

// Cloud-restored preferences may sync, but profile fields remain withheld until
// the user explicitly taps Save Settings on this device.
localStorage.setItem('fiqD_driver', JSON.stringify({
  crewId: 'CBQ-AUTH',
  email: 'owner@example.com',
  name: 'Izzet',
  company: '',
  truckName: '',
  unitNumber: '',
  plate: '',
  payType: 'cpm',
  cpmRate: 0,
  cpmBase: 'loaded',
  ptiEnabled: false,
  ptiSchedule: 'weekly',
}));

await context.fetch('https://script.google.com/macros/s/example/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({
    type: 'driver_report',
    sessionToken: 'token-owner-1',
    record_id: 'sync-clean-device-1',
    driver: { crewId: 'CBQ-AUTH', email: 'owner@example.com' },
    loads: [],
    ptiLog: [],
    ownerData: {},
  }),
});
let syncBody = JSON.parse(calls.at(-1).body);
assert.deepEqual(syncBody.settings.profile, {});
assert.equal(syncBody.settings.preferences.accent, 'cyan');
assert.equal(syncBody.settings.profileSource, undefined);

// A manual Save stores a separate safe profile snapshot. Even if the driver
// object is later cleared, the final sync still publishes the saved profile.
const savedProfile = {
  name: 'Izzet',
  company: 'Kaunas Express',
  truckName: 'Mack Anthem',
  unitNumber: '1919',
  plate: 'P1340909',
  payType: 'gross_percent',
  grossPercent: 42,
  cpmBase: 'total',
  ptiEnabled: false,
  ptiSchedule: 'weekly',
};
localStorage.setItem('fiqD_settingsProfileSnapshot', JSON.stringify(savedProfile));
localStorage.setItem('fiqD_settingsProfileSavedAt', '2026-07-12T17:31:00Z');
localStorage.setItem('fiqD_settingsUpdatedAt', '2026-07-12T17:31:00Z');
localStorage.setItem('fiqD_driver', JSON.stringify({
  crewId: 'CBQ-AUTH',
  email: 'owner@example.com',
  name: 'Izzet',
  company: '',
  truckName: '',
  unitNumber: '',
  plate: '',
  payType: 'cpm',
  cpmRate: 0,
  cpmBase: 'loaded',
  syncUrl: 'https://must-not-sync.invalid',
  sessionToken: 'must-not-sync',
}));

const syncResponse = await context.fetch('https://script.google.com/macros/s/example/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({
    type: 'driver_report',
    sessionToken: 'token-owner-1',
    record_id: 'sync-settings-manual-1',
    driver: { crewId: 'CBQ-AUTH', email: 'owner@example.com' },
    loads: [],
    ptiLog: [],
    ownerData: {},
  }),
});
assert.equal((await syncResponse.json()).ok, true);
const syncCall = calls.at(-1);
assert.equal(syncCall.url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync/pwa');
syncBody = JSON.parse(syncCall.body);
assert.equal(syncBody.settings.profileSource, 'manual');
assert.equal(syncBody.settings.profile.company, 'Kaunas Express');
assert.equal(syncBody.settings.profile.truckName, 'Mack Anthem');
assert.equal(syncBody.settings.profile.unitNumber, '1919');
assert.equal(syncBody.settings.profile.grossPercent, 42);
assert.equal(syncBody.settings.preferences.accent, 'cyan');
assert.equal(syncBody.ownerData.settings.preferences.rateEffectiveDate, '2026-07-08');
assert.equal('email' in syncBody.settings.profile, false);
assert.equal('crewId' in syncBody.settings.profile, false);
assert.equal('syncUrl' in syncBody.settings.profile, false);
assert.equal('sessionToken' in syncBody.settings.profile, false);
assert.equal('orchestratorSecret' in syncBody.settings.preferences, false);

console.log('authenticated Settings reconciliation and empty-snapshot guard: ok');
