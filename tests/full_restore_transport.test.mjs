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
  addEventListener(name, handler) { documentListeners.set(name, handler); },
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
      loads: [{ id: 'load_1', loadId: 'AMZ-1', gross: 3000, synced: true }],
      ptiLog: [{ id: 'pti_1', date: '2026-07-01', odometer: 500000, synced: true }],
      ownerData: {
        trucks: [{ id: 'truck_10', unitNumber: '10', active: true }],
        driverProfiles: [{ id: 'driver_a', name: 'Driver A', active: true }],
        fuelLogs: [{ id: 'fuel_1', truckId: 'truck_10', fuelCost: 350 }],
        serviceLogs: [{ id: 'svc_1', truckId: 'truck_10', amount: 200 }],
        deductionTemplates: [{ id: 'ded_1', name: 'Insurance', amount: 450 }],
        weeklyDeductions: [{ id: 'week_1', truckId: 'truck_10', total: 450 }],
      },
      pay_config: { payType: 'gross_percent', grossPercent: 20 },
      counts: {
        loads: 1,
        ptiLog: 1,
        trucks: 1,
        driverProfiles: 1,
        fuelLogs: 1,
        serviceLogs: 1,
        deductionTemplates: 1,
        weeklyDeductions: 1,
      },
      source: 'postgres',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
};
context.window = context;
context.globalThis = context;

const runtime = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(runtime, context, { filename: 'core-runtime.js' });
const hotfix = fs.readFileSync(new URL('../restore-hotfix.js', import.meta.url), 'utf8');
vm.runInNewContext(hotfix, context, { filename: 'restore-hotfix.js' });

assert.equal(context.CrewBIQCore.version, '0.2.0');
assert.equal(context.CrewBIQRestoreHotfix.version, '0.1.0');

localStorage.setItem('fiqD_sessionToken', 'token-owner-1');
const response = await context.fetch('https://script.google.com/macros/s/example/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({ type: 'auth_restore', sessionToken: 'token-owner-1' }),
});
const restored = await response.json();

assert.equal(restored.ok, true);
assert.deepEqual(restored.loads.map(item => item.id), ['load_1']);
assert.deepEqual(restored.ptiLog.map(item => item.id), ['pti_1']);
assert.deepEqual(restored.ownerData.trucks.map(item => item.id), ['truck_10']);
assert.deepEqual(restored.ownerData.driverProfiles.map(item => item.id), ['driver_a']);
assert.deepEqual(restored.ownerData.fuelLogs.map(item => item.id), ['fuel_1']);
assert.deepEqual(restored.ownerData.serviceLogs.map(item => item.id), ['svc_1']);
assert.deepEqual(restored.ownerData.deductionTemplates.map(item => item.id), ['ded_1']);
assert.deepEqual(restored.ownerData.weeklyDeductions.map(item => item.id), ['week_1']);
assert.equal(restored.restoreCounts.loads, 1);
assert.equal(restored.restoreSource, 'postgres');
assert.equal(restored.effectiveOwnerCrewId, 'CBQ-OWNER');
assert.deepEqual(JSON.parse(localStorage.getItem('fiqD_paySettings')), {
  payType: 'gross_percent',
  grossPercent: 20,
});
assert.equal(localStorage.getItem('fiqD_userRole'), 'fleet');

assert.equal(calls.length, 2);
assert.equal(calls[0].url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/me');
assert.equal(calls[1].url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/restore/pwa');
assert.equal(calls[0].headers.get('authorization'), 'Bearer token-owner-1');
assert.equal(calls[1].headers.get('authorization'), 'Bearer token-owner-1');
assert.equal(calls.some(call => call.url.includes('script.google.com')), false);
assert.equal(calls.some(call => call.url.includes('/v1/fleet/config')), false);

console.log('authenticated full restore transport: ok');
