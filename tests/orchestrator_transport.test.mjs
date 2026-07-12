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

  if (call.url.endsWith('/v1/auth/login')) {
    return new Response(JSON.stringify({
      ok: true,
      session_token: 'token-owner-1',
      user: {
        crewbiq_id: 'CBQ-AUTH',
        email: 'owner@example.com',
        nickname: 'Owner',
      },
      effective_owner_crewbiq_id: 'CBQ-HISTORICAL',
      roles: ['fleet'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/me')) {
    return new Response(JSON.stringify({
      ok: true,
      user: {
        crewbiq_id: 'CBQ-AUTH',
        effective_owner_crewbiq_id: 'CBQ-HISTORICAL',
        email: 'owner@example.com',
        nickname: 'Owner',
        roles: ['fleet'],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/fleet/config')) {
    return new Response(JSON.stringify({
      ok: true,
      crewbiq_id: 'CBQ-HISTORICAL',
      trucks: [{ id: 'truck_active', unitNumber: '10', active: true }],
      driver_profiles: [{ id: 'driver_active', name: 'Active Driver', active: true }],
      pay_config: { payType: 'cpm', cpmRate: 0.7 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/sync/pwa')) {
    const body = JSON.parse(call.body || '{}');
    return new Response(JSON.stringify({
      ok: true,
      received: true,
      record_id: body.record_id || (body.payload && body.payload.record_id) || 'unknown',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (call.url.endsWith('/v1/auth/logout')) {
    return new Response(JSON.stringify({ ok: true }), {
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
};
context.window = context;
context.globalThis = context;

const source = fs.readFileSync(new URL('../core.js', import.meta.url), 'utf8');
vm.runInNewContext(source, context, { filename: 'core.js' });

assert.equal(context.CrewBIQCore.version, '0.2.0');

const legacySyncUrl = 'https://script.google.com/macros/s/example/exec';
const loginResponse = await context.fetch(legacySyncUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({
    type: 'auth_login',
    emailOrNickname: 'owner@example.com',
    password: 'secret-password',
  }),
});
const login = await loginResponse.json();
assert.equal(login.ok, true);
assert.equal(login.sessionToken, 'token-owner-1');
assert.equal(login.crewId, 'CBQ-AUTH');
assert.equal(login.effectiveOwnerCrewId, 'CBQ-HISTORICAL');
assert.equal(localStorage.getItem('fiqD_sessionToken'), 'token-owner-1');
assert.equal(localStorage.getItem('fiqD_userRole'), 'fleet');
assert.equal(calls[0].url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/auth/login');
assert.deepEqual(JSON.parse(calls[0].body), {
  email: 'owner@example.com',
  password: 'secret-password',
});

const restoreResponse = await context.fetch(legacySyncUrl, {
  method: 'POST',
  body: JSON.stringify({ type: 'auth_restore', sessionToken: 'token-owner-1' }),
});
const restored = await restoreResponse.json();
assert.equal(restored.ok, true);
assert.deepEqual(restored.ownerData.trucks.map(item => item.id), ['truck_active']);
assert.deepEqual(restored.ownerData.driverProfiles.map(item => item.id), ['driver_active']);
assert.equal(restored.pay_config.payType, 'cpm');
assert.deepEqual(JSON.parse(localStorage.getItem('fiqD_paySettings')), {
  payType: 'cpm',
  cpmRate: 0.7,
});
assert.equal(calls.at(-2).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/me');
assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/fleet/config');
assert.equal(calls.at(-2).headers.get('authorization'), 'Bearer token-owner-1');
assert.equal(calls.at(-1).headers.get('authorization'), 'Bearer token-owner-1');

const beforeFleetCall = calls.length;
await context.fetch('https://crewbiq-orchestrator-production.up.railway.app/v1/fleet/config/pwa?crewbiq_id=CBQ-ATTACKER', {
  method: 'GET',
});
assert.equal(calls.length, beforeFleetCall + 1);
assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/fleet/config');
assert.equal(calls.at(-1).headers.get('authorization'), 'Bearer token-owner-1');

const syncPayload = {
  type: 'driver_report',
  sessionToken: 'token-owner-1',
  record_id: 'sync_device_a_1',
  sentAt: '2026-07-12T15:00:00Z',
  deviceId: 'device-a',
  driver: {
    crewId: 'CBQ-ATTACKER',
    ownerKey: 'crew_attacker',
    email: 'attacker@example.com',
  },
  loads: [],
  ptiLog: [],
  ownerData: {
    trucks: [{ id: 'truck_active', active: true }],
    driverProfiles: [{ id: 'driver_active', active: true }],
  },
};

const syncResponse = await context.fetch(legacySyncUrl, {
  method: 'POST',
  body: JSON.stringify(syncPayload),
});
assert.equal((await syncResponse.json()).ok, true);
assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync/pwa');
assert.equal(calls.at(-1).headers.get('authorization'), 'Bearer token-owner-1');
const sentSyncPayload = JSON.parse(calls.at(-1).body);
assert.equal(Object.hasOwn(sentSyncPayload, 'sessionToken'), false);
assert.equal(sentSyncPayload.driver.crewId, 'CBQ-ATTACKER');

const beforeDuplicate = calls.length;
const duplicateResponse = await context.fetch('https://crewbiq-orchestrator-production.up.railway.app/v1/sync', {
  method: 'POST',
  body: JSON.stringify({
    source: 'crewbiq_driver',
    deviceId: 'device-a',
    payload: syncPayload,
  }),
});
const duplicate = await duplicateResponse.json();
assert.equal(duplicate.ok, true);
assert.equal(duplicate.client_deduplicated, true);
assert.equal(calls.length, beforeDuplicate);

context.setUserRole = function (role) {
  localStorage.setItem('fiqD_userRole', role);
};
documentListeners.get('DOMContentLoaded')();
localStorage.setItem('fiqD_authRoles', JSON.stringify(['driver']));
localStorage.setItem('fiqD_userRole', 'driver');
context.setUserRole('fleet');
assert.equal(localStorage.getItem('fiqD_userRole'), 'driver');

const logoutResponse = await context.fetch(legacySyncUrl, {
  method: 'POST',
  body: JSON.stringify({ type: 'auth_logout', sessionToken: 'token-owner-1' }),
});
assert.equal((await logoutResponse.json()).ok, true);
assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/auth/logout');
assert.equal(calls.at(-1).headers.get('authorization'), 'Bearer token-owner-1');

console.log('orchestrator transport contract: ok');
