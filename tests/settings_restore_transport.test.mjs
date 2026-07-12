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
      source: 'sync_event_settings',
      settings: {
        version: 1,
        updatedAt: '2026-07-12T17:30:00Z',
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
          rateEffectiveDate: '2026-07-09',
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

assert.equal(context.CrewBIQSettingsHotfix.version, '0.1.0');
localStorage.setItem('fiqD_sessionToken', 'token-owner-1');

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
assert.equal(localStorage.getItem('fiqD_theme'), 'dark');
assert.equal(localStorage.getItem('fiqD_accent'), 'cyan');
assert.equal(localStorage.getItem('fiqD_weekStart'), '5');
assert.equal(localStorage.getItem('fiqD_rateEffectiveDate'), '2026-07-09');
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
assert.equal(calls.some(call => call.url.includes('script.google.com')), false);
assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/settings/pwa');
assert.equal(calls.at(-1).headers.get('authorization'), 'Bearer token-owner-1');

localStorage.setItem('fiqD_driver', JSON.stringify({
  crewId: 'CBQ-AUTH',
  email: 'owner@example.com',
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
  syncUrl: 'https://must-not-sync.invalid',
  sessionToken: 'must-not-sync',
}));
localStorage.setItem('fiqD_settingsUpdatedAt', '2026-07-12T17:31:00Z');

const syncResponse = await context.fetch('https://script.google.com/macros/s/example/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({
    type: 'driver_report',
    sessionToken: 'token-owner-1',
    record_id: 'sync-settings-1',
    driver: { crewId: 'CBQ-AUTH', email: 'owner@example.com' },
    loads: [],
    ptiLog: [],
    ownerData: {},
  }),
});
assert.equal((await syncResponse.json()).ok, true);
const syncCall = calls.at(-1);
assert.equal(syncCall.url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync/pwa');
const syncBody = JSON.parse(syncCall.body);
assert.equal(syncBody.settings.profile.company, 'Kaunas Express');
assert.equal(syncBody.settings.profile.grossPercent, 42);
assert.equal(syncBody.settings.preferences.accent, 'cyan');
assert.equal(syncBody.ownerData.settings.preferences.rateEffectiveDate, '2026-07-09');
assert.equal('email' in syncBody.settings.profile, false);
assert.equal('crewId' in syncBody.settings.profile, false);
assert.equal('syncUrl' in syncBody.settings.profile, false);
assert.equal('sessionToken' in syncBody.settings.profile, false);
assert.equal('orchestratorSecret' in syncBody.settings.preferences, false);

console.log('authenticated Settings snapshot sync and restore contract: ok');
