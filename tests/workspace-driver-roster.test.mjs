import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../workspace-driver-roster.js', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadApi(overrides = {}) {
  const context = vm.createContext({ window: {}, globalThis: {}, Date, Object, Array, Set, Number, String, ...overrides });
  vm.runInContext(source, context, { filename: 'workspace-driver-roster.js' });
  return context.window.CrewBIQWorkspaceDriverRoster;
}

const api = loadApi();
const requestContext = { sessionToken: 'token-1', workspaceId: 'workspace-1' };
const driver = {
  driver_id: 'driver-1', workspace_id: 'workspace-1', name: 'Driver One', status: 'active',
  effective_from: '2026-01-01T00:00:00Z', effective_to: null,
};

function wire(drivers = [driver], overrides = {}) {
  return { ok: true, workspace_id: 'workspace-1', drivers, ...overrides };
}

function adapter(result, calls = []) {
  return api.create({
    request: async (action, payload) => {
      calls.push({ action, payload });
      return typeof result === 'function' ? result() : result;
    },
  });
}

test('module exports a bounded namespace and performs no request on load', () => {
  let requests = 0;
  loadApi({ request: () => { requests += 1; } });
  assert.equal(requests, 0);
  assert.deepEqual(Object.keys(api), ['ACTION', 'ERROR_CODES', 'validateResponse', 'create']);
});

test('authorized roster normalizes stable server IDs without mutation', async () => {
  const calls = [];
  const response = wire();
  const before = JSON.stringify(response);
  const result = await adapter(response, calls).read(requestContext);
  assert.deepEqual(plain(result), {
    ok: true,
    workspaceId: 'workspace-1',
    drivers: [{
      driverId: 'driver-1', workspaceId: 'workspace-1', name: 'Driver One', status: 'active',
      effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null,
    }],
  });
  assert.deepEqual(plain(calls), [{ action: 'workspace_driver_roster_read', payload: requestContext }]);
  assert.equal(JSON.stringify(response), before);
  assert.notEqual(result.drivers[0], response.drivers[0]);
});

test('empty and multiple Driver rosters are accepted deterministically', async () => {
  assert.deepEqual(plain(await adapter(wire([])).read(requestContext)), { ok: true, workspaceId: 'workspace-1', drivers: [] });
  const second = { ...driver, driver_id: 'driver-2', name: 'Driver Two', status: 'inactive', effective_to: '2026-08-01T00:00:00Z' };
  const result = await adapter(wire([driver, second])).read(requestContext);
  assert.deepEqual(plain(result.drivers.map(item => item.driverId)), ['driver-1', 'driver-2']);
});

test('response-level and record-level workspace mismatches fail closed', async () => {
  assert.equal((await adapter(wire([], { workspace_id: 'other' })).read(requestContext)).code, 'workspace_driver_roster_workspace_mismatch');
  assert.equal((await adapter(wire([{ ...driver, workspace_id: 'other' }])).read(requestContext)).code, 'workspace_driver_roster_workspace_mismatch');
});

test('malformed and duplicate Driver records reject the entire roster', async () => {
  for (const malformed of [
    { ...driver, driver_id: '' },
    { ...driver, workspace_id: '' },
    { ...driver, name: '' },
    { ...driver, status: 'unknown' },
    { ...driver, effective_from: 'not-a-date' },
    { ...driver, effective_to: '2025-01-01T00:00:00Z' },
  ]) {
    assert.equal((await adapter(wire([driver, malformed])).read(requestContext)).code, 'workspace_driver_roster_invalid_response');
  }
  assert.equal((await adapter(wire([driver, { ...driver }])).read(requestContext)).code, 'workspace_driver_roster_invalid_response');
});

test('camelCase or structurally malformed wire responses are not guessed', async () => {
  assert.equal((await adapter({ ok: true, workspaceId: 'workspace-1', drivers: [] }).read(requestContext)).code, 'workspace_driver_roster_workspace_mismatch');
  assert.equal((await adapter({ ok: true, workspace_id: 'workspace-1', drivers: 'invalid' }).read(requestContext)).code, 'workspace_driver_roster_invalid_response');
  assert.equal((await adapter(wire([{ driverId: 'driver-1', workspaceId: 'workspace-1', name: 'Guessed' }])).read(requestContext)).code, 'workspace_driver_roster_invalid_response');
});

test('missing session or workspace fails before transport', async () => {
  let requests = 0;
  const runtime = api.create({ request: async () => { requests += 1; return wire(); } });
  assert.equal((await runtime.read({ ...requestContext, sessionToken: '' })).code, 'workspace_driver_roster_unauthorized');
  assert.equal((await runtime.read({ ...requestContext, workspaceId: '' })).code, 'workspace_driver_roster_unauthorized');
  assert.equal(requests, 0);
});

test('authorization, network, and server failures remain structured', async () => {
  assert.equal((await adapter({ status: 403, data: { ok: false } }).read(requestContext)).code, 'workspace_driver_roster_unauthorized');
  assert.equal((await adapter({ status: 503, data: { ok: false } }).read(requestContext)).code, 'server_error');
  const runtime = api.create({ request: async () => { const error = new Error('offline'); error.code = 'offline'; throw error; } });
  assert.equal((await runtime.read(requestContext)).code, 'network_unavailable');
});

test('transport maps only the semantic action to authenticated read-only GET', () => {
  const body = coreSource.match(/async function adaptWorkspaceDriverRoster\(payload\) \{[\s\S]*?\n  \}/);
  assert.ok(body, 'workspace Driver roster transport adapter must exist');
  assert.match(body[0], /getSessionToken\(payload\.sessionToken\)/);
  assert.match(body[0], /encodeURIComponent\(workspaceId\)/);
  assert.match(body[0], /method: 'GET'/);
  assert.match(body[0], /headers: authHeaders\(token\)/);
  assert.doesNotMatch(body[0], /method: '(POST|PUT|PATCH|DELETE)'|body:|localStorage|scopedSave|save[A-Z]/);
  assert.match(coreSource, /body\.type === 'workspace_driver_roster_read'\) return adaptWorkspaceDriverRoster\(body\)/);
});

test('adapter is loaded, lazily composed, and cache shell is rotated', () => {
  assert.match(html, /<script src="workspace-driver-roster\.js\?v=20260831-slice4b1b2c-s2-v1"><\/script>/);
  assert.match(html, /function getWorkspaceDriverRosterAdapter\(\)/);
  assert.doesNotMatch(html, /CrewBIQWorkspaceDriverRoster\.read\(/);
  assert.match(swSource, /crewbiq-driver-v96/);
  assert.match(swSource, /workspace-driver-roster\.js/);
});

test('adapter contains no persistence, fallback selection, direct network, or mutation path', () => {
  for (const pattern of [/localStorage|indexedDB|sessionStorage/, /\bfetch\s*\(/, /XMLHttpRequest/, /firstDriver|driverProfiles|AccountDriverLink/, /setItem\s*\(/, /\b(save|write|create|update|delete)Driver/i]) {
    assert.doesNotMatch(source, pattern);
  }
});
