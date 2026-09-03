import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Repaired 2026-09-01: the previous version of this test loaded the tiny
// core.js document.write() loader directly via vm, which throws immediately
// ("document.write is not a function") because vm's mock document has no
// write() implementation, and was never wired into any npm/CI script as a
// result. It predates the core.js/core-runtime.js split.
//
// This version loads core-runtime.js directly (the file core.js actually
// document.write()s into the page) and dynamically proves, for every legacy
// action-envelope type mapped in docs/collaboration/LEGACY_SYNC_CALL_PATH_MAP.md,
// that CrewBIQCore's routedFetch ignores whatever URL is supplied and routes
// to the configured Orchestrator by inspecting the JSON body's `type` field.
// It also proves the reverse: a request core-runtime does not recognize
// falls through untouched to the native fetch (so the transport layer is not
// silently swallowing everything).

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

const calls = [];
async function nativeFetchMock(url, init = {}) {
  const call = {
    url: String(typeof url === 'string' ? url : (url && url.url) || ''),
    method: String((init && init.method) || 'GET').toUpperCase(),
    headers: new Headers((init && init.headers) || {}),
    body: typeof (init && init.body) === 'string' ? init.body : '',
  };
  calls.push(call);

  if (call.url.endsWith('/v1/auth/login')) {
    return new Response(JSON.stringify({
      ok: true,
      session_token: 'token-1',
      user: { crewbiq_id: 'CBQ-A', email: 'a@example.com', nickname: 'A' },
      roles: ['fleet'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (call.url.endsWith('/v1/auth/bootstrap')) {
    return new Response(JSON.stringify({
      ok: true,
      session_token: 'token-2',
      user: { crewbiq_id: 'CBQ-B', email: 'b@example.com', nickname: 'B' },
      roles: ['driver'],
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  if (call.url.endsWith('/v1/me')) {
    return new Response(JSON.stringify({
      ok: true,
      user: { crewbiq_id: 'CBQ-A', email: 'a@example.com', nickname: 'A', roles: ['fleet'] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (call.url.endsWith('/v1/fleet/config')) {
    return new Response(JSON.stringify({
      ok: true,
      trucks: [{ id: 'truck_1' }],
      driver_profiles: [{ id: 'driver_1' }],
      pay_config: { payType: 'cpm', cpmRate: 0.6 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (call.url.endsWith('/v1/auth/logout')) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (call.url.includes('/v1/sync')) {
    const body = JSON.parse(call.body || '{}');
    const recordId = (body.payload && body.payload.record_id) || body.record_id || 'unknown';
    return new Response(JSON.stringify({ ok: true, received: true, record_id: recordId }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/v1\/workspaces\/[^/]+\/drivers$/.test(call.url)) {
    return new Response(JSON.stringify({ ok: true, drivers: [{ id: 'driver_1' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/v1\/workspaces\/[^/]+\/account-driver-link/.test(call.url)) {
    return new Response(JSON.stringify({ ok: true, link: { account_id: 'acct_1' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/v1\/workspaces\/[^/]+\/driver-truck-assignments\/(current|history|as-of)/.test(call.url)) {
    return new Response(JSON.stringify({ ok: true, assignments: [{ truck_id: 'truck_1' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (call.url === 'https://example.com/unrelated-native-endpoint') {
    return new Response(JSON.stringify({ ok: true, native: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  throw new Error('Unexpected native fetch call: ' + call.method + ' ' + call.url);
}

const document = {
  readyState: 'complete',
  addEventListener() {},
};

const context = {
  console,
  localStorage,
  document,
  fetch: nativeFetchMock,
  Response,
  Headers,
  Request,
  URLSearchParams,
  setTimeout,
  clearTimeout,
};
context.window = context;
context.globalThis = context;

const runtime = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(runtime, context, { filename: 'core-runtime.js' });

assert.equal(context.CrewBIQCore.version, '0.2.0');
assert.notEqual(context.fetch, nativeFetchMock, 'core-runtime must have replaced global.fetch with its own dispatcher');

const legacyUrl = 'https://script.google.com/macros/s/example/exec';

// auth_login: supplied legacy URL is discarded; routes to /v1/auth/login.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'auth_login', emailOrNickname: 'a@example.com', password: 'secret' }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(data.sessionToken, 'token-1');
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/auth/login');
  assert.equal(calls.at(-1).url.includes('script.google.com'), false);
}

// auth_signup: routes to /v1/auth/bootstrap.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'auth_signup', email: 'b@example.com', nickname: 'B', password: 'secret' }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/auth/bootstrap');
}

// auth_restore: fans out to /v1/me then /v1/fleet/config, never Google.
{
  localStorage.setItem('fiqD_sessionToken', 'token-1');
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'auth_restore', sessionToken: 'token-1' }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 2);
  assert.equal(calls[before].url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/me');
  assert.equal(calls[before + 1].url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/fleet/config');
  assert.equal(calls.slice(before).some(c => c.url.includes('script.google.com')), false);
}

// auth_logout: routes to /v1/auth/logout.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'auth_logout', sessionToken: 'token-1' }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/auth/logout');
}

// driver_report (pushToCloud's shape): routes to /v1/sync, not Google.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({
      type: 'driver_report', sessionToken: 'token-1', record_id: 'sync_matrix_1',
      driver: { crewId: 'CBQ-A' }, loads: [], ptiLog: [],
    }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url.includes('/v1/sync'), true);
  assert.equal(calls.at(-1).url.includes('script.google.com'), false);
}

// pti_report: also routes through adaptSync to /v1/sync.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({
      type: 'pti_report', sessionToken: 'token-1', record_id: 'sync_matrix_2',
      driver: { crewId: 'CBQ-A' }, pti: { date: '2026-09-01' },
    }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url.includes('/v1/sync'), true);
}

// workspace_driver_roster_read: routes to /v1/workspaces/:id/drivers.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'workspace_driver_roster_read', sessionToken: 'token-1', workspaceId: 'ws_1' }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/workspaces/ws_1/drivers');
}

// account_driver_link_read: routes to /v1/workspaces/:id/account-driver-link.
{
  const before = calls.length;
  const resp = await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'account_driver_link_read', sessionToken: 'token-1', workspaceId: 'ws_1' }),
  });
  const data = await resp.json();
  assert.equal(data.ok, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://crewbiq-orchestrator-production.up.railway.app/v1/workspaces/ws_1/account-driver-link');
}

// driver_truck_assignment_{current,history,as_of}_read: all three views.
{
  const before = calls.length;
  await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'driver_truck_assignment_current_read', sessionToken: 'token-1', workspaceId: 'ws_1', driverId: 'driver_1' }),
  });
  assert.equal(calls.at(-1).url.includes('/driver-truck-assignments/current'), true);

  await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'driver_truck_assignment_history_read', sessionToken: 'token-1', workspaceId: 'ws_1', driverId: 'driver_1' }),
  });
  assert.equal(calls.at(-1).url.includes('/driver-truck-assignments/history'), true);

  await context.fetch(legacyUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'driver_truck_assignment_as_of_read', sessionToken: 'token-1', workspaceId: 'ws_1', driverId: 'driver_1', effectiveAt: '2026-09-01T00:00:00Z' }),
  });
  assert.equal(calls.at(-1).url.includes('/driver-truck-assignments/as-of'), true);
  assert.equal(calls.length, before + 3);
  assert.equal(calls.slice(before).some(c => c.url.includes('script.google.com')), false);
}

// Unmatched request: an unrecognized shape must fall through to native fetch
// untouched (proves the transport layer is a bounded dispatcher, not a
// blanket interceptor that would silently swallow genuinely new call shapes).
{
  const before = calls.length;
  const resp = await context.fetch('https://example.com/unrelated-native-endpoint', { method: 'GET' });
  const data = await resp.json();
  assert.equal(data.native, true);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://example.com/unrelated-native-endpoint');
}

console.log('orchestrator transport action-matrix contract: ok');
