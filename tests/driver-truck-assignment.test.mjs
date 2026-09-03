import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../driver-truck-assignment.js', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadApi(overrides = {}) {
  const context = vm.createContext({ window: {}, globalThis: {}, Date, Object, Array, Set, Number, String, ...overrides });
  vm.runInContext(source, context, { filename: 'driver-truck-assignment.js' });
  return context.window.CrewBIQDriverTruckAssignment;
}

const api = loadApi();
const baseContext = { sessionToken: 'token-1', workspaceId: 'workspace-1', driverId: 'driver-1' };
const assignment = {
  id: 'assignment-1',
  workspace_id: 'workspace-1',
  driver_id: 'driver-1',
  truck_id: 'truck-1',
  effective_from: '2026-08-31T08:00:00+00:00',
  effective_to: null,
  assignment_type: 'solo',
  status: 'active',
  version: 1,
  created_at: '2026-08-31T07:00:00+00:00',
  updated_at: '2026-08-31T07:00:00+00:00',
  provenance: { evidence_type: 'dispatch' },
};

function wire(view, assignments = [assignment], overrides = {}) {
  const response = { ok: true, workspace_id: 'workspace-1', view, assignments, ...overrides };
  if (view !== 'history' && !Object.hasOwn(response, 'as_of')) response.as_of = '2026-08-31T12:00:00+00:00';
  return response;
}

function adapter(result, calls = []) {
  return api.create({
    request: async (action, payload) => {
      calls.push({ action, payload });
      return typeof result === 'function' ? result(action, payload) : result;
    },
  });
}

test('module is bounded and performs no request on load', () => {
  let requests = 0;
  loadApi({ request: () => { requests += 1; } });
  assert.equal(requests, 0);
  assert.deepEqual(Object.keys(api), ['ACTIONS', 'ERROR_CODES', 'validateResponse', 'create']);
});

test('current read requires explicit Driver and returns one proven effective assignment', async () => {
  const calls = [];
  const response = wire('current');
  const before = JSON.stringify(response);
  const result = await adapter(response, calls).readCurrent(baseContext);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result), {
    ok: true,
    workspaceId: 'workspace-1',
    driverId: 'driver-1',
    effectiveAt: '2026-08-31T12:00:00+00:00',
    assignment: {
      id: 'assignment-1', workspaceId: 'workspace-1', driverId: 'driver-1', truckId: 'truck-1',
      effectiveFrom: '2026-08-31T08:00:00+00:00', effectiveTo: null, assignmentType: 'solo',
      status: 'active', version: 1, createdAt: '2026-08-31T07:00:00+00:00',
      updatedAt: '2026-08-31T07:00:00+00:00', provenance: { evidence_type: 'dispatch' },
    },
  });
  assert.deepEqual(plain(calls), [{
    action: 'driver_truck_assignment_current_read',
    payload: baseContext,
  }]);
  assert.equal(JSON.stringify(response), before);
  assert.notEqual(result.assignment, response.assignments[0]);
});

test('zero and multiple current assignments fail closed without selecting first', async () => {
  assert.equal((await adapter(wire('current', [])).readCurrent(baseContext)).code, 'driver_truck_assignment_not_found');
  const second = { ...assignment, id: 'assignment-2', truck_id: 'truck-2' };
  const ambiguous = await adapter(wire('current', [assignment, second])).readCurrent(baseContext);
  assert.equal(ambiguous.code, 'driver_truck_assignment_ambiguous');
  assert.equal(ambiguous.details.candidateCount, 2);
});

test('history preserves deterministic effective-dated records including revoked evidence', async () => {
  const closed = {
    ...assignment,
    id: 'assignment-2',
    truck_id: 'truck-2',
    effective_from: '2026-09-01T08:00:00+00:00',
    effective_to: '2026-09-01T16:00:00+00:00',
    status: 'closed',
    version: 2,
  };
  const result = await adapter(wire('history', [assignment, closed])).readHistory(baseContext);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.assignments.map(item => item.id)), ['assignment-1', 'assignment-2']);
  const revoked = { ...closed, id: 'assignment-3', status: 'revoked' };
  assert.equal((await adapter(wire('history', [assignment, closed, revoked])).readHistory(baseContext)).ok, true);
});

test('as-of read uses explicit timestamp and half-open effective semantics', async () => {
  const context = { ...baseContext, effectiveAt: '2026-08-31T12:00:00Z' };
  const result = await adapter(wire('as_of')).readAsOf(context);
  assert.equal(result.ok, true);
  const calls = [];
  await adapter(wire('as_of'), calls).readAsOf(context);
  assert.deepEqual(plain(calls), [{
    action: 'driver_truck_assignment_as_of_read',
    payload: context,
  }]);
  const ended = { ...assignment, effective_to: '2026-08-31T12:00:00+00:00', status: 'closed' };
  assert.equal((await adapter(wire('as_of', [ended])).readAsOf(context)).code, 'driver_truck_assignment_invalid_response');
  assert.equal((await adapter(wire('as_of', [assignment], { as_of: '2026-08-31T13:00:00Z' })).readAsOf(context)).code, 'driver_truck_assignment_invalid_response');
});

test('workspace, Driver, duplicate, malformed, and nondeterministic responses fail closed', async () => {
  assert.equal((await adapter(wire('current', [assignment], { workspace_id: 'other' })).readCurrent(baseContext)).code, 'driver_truck_assignment_workspace_mismatch');
  assert.equal((await adapter(wire('current', [{ ...assignment, workspace_id: 'other' }])).readCurrent(baseContext)).code, 'driver_truck_assignment_workspace_mismatch');
  assert.equal((await adapter(wire('current', [{ ...assignment, driver_id: 'other' }])).readCurrent(baseContext)).code, 'driver_truck_assignment_driver_mismatch');
  assert.equal((await adapter(wire('history', [assignment, { ...assignment }])).readHistory(baseContext)).code, 'driver_truck_assignment_invalid_response');
  const earlier = { ...assignment, id: 'assignment-0', effective_from: '2026-08-30T08:00:00+00:00' };
  assert.equal((await adapter(wire('history', [assignment, earlier])).readHistory(baseContext)).code, 'driver_truck_assignment_invalid_response');
  for (const malformed of [
    { ...assignment, id: '' },
    { ...assignment, truck_id: '' },
    { ...assignment, effective_from: 'invalid' },
    { ...assignment, effective_to: '2026-08-30T00:00:00Z' },
    { ...assignment, assignment_type: 'guessed' },
    { ...assignment, status: 'guessed' },
    { ...assignment, version: '1' },
    { ...assignment, provenance: [] },
  ]) {
    assert.equal((await adapter(wire('history', [malformed])).readHistory(baseContext)).code, 'driver_truck_assignment_invalid_response');
  }
});

test('missing proof, authorization, network, and server failures remain structured', async () => {
  let requests = 0;
  const runtime = api.create({ request: async () => { requests += 1; return wire('current'); } });
  assert.equal((await runtime.readCurrent({ ...baseContext, sessionToken: '' })).code, 'driver_truck_assignment_unauthorized');
  assert.equal((await runtime.readCurrent({ ...baseContext, workspaceId: '' })).code, 'driver_truck_assignment_unauthorized');
  assert.equal((await runtime.readCurrent({ ...baseContext, driverId: '' })).code, 'driver_truck_assignment_unauthorized');
  assert.equal(requests, 0);
  assert.equal((await adapter({ status: 403, data: { ok: false } }).readCurrent(baseContext)).code, 'driver_truck_assignment_unauthorized');
  assert.equal((await adapter({ status: 503, data: { ok: false } }).readCurrent(baseContext)).code, 'server_error');
  const offline = api.create({ request: async () => { const error = new Error('offline'); error.code = 'offline'; throw error; } });
  assert.equal((await offline.readCurrent(baseContext)).code, 'network_unavailable');
});

test('transport maps semantic actions only to authenticated no-store GET endpoints', () => {
  const body = coreSource.match(/async function adaptDriverTruckAssignmentRead\(payload, view\) \{[\s\S]*?\n  \}/);
  assert.ok(body, 'DriverTruckAssignment transport adapter must exist');
  assert.match(body[0], /getSessionToken\(payload\.sessionToken\)/);
  assert.match(body[0], /encodeURIComponent\(workspaceId\)/);
  assert.match(body[0], /driver_id: driverId/);
  assert.match(body[0], /params\.set\('at', effectiveAt\)/);
  assert.match(body[0], /method: 'GET'/);
  assert.match(body[0], /headers: authHeaders\(token\)/);
  assert.doesNotMatch(body[0], /method: '(POST|PUT|PATCH|DELETE)'|body:|localStorage|scopedSave|setItem/);
  for (const action of Object.values(api.ACTIONS)) assert.match(coreSource, new RegExp("body\\.type === '" + action + "'"));
});

test('adapter is loaded, lazily composed, disconnected, and cache-rotated', () => {
  assert.match(html, /<script src="driver-truck-assignment\.js\?v=20260831-slice4b1b3-s3-v1"><\/script>/);
  assert.match(html, /function getDriverTruckAssignmentAdapter\(\)/);
  assert.doesNotMatch(html, /getDriverTruckAssignmentAdapter\(\)\.(readCurrent|readHistory|readAsOf)/);
  assert.match(swSource, /crewbiq-driver-v96/);
  assert.match(swSource, /driver-truck-assignment\.js/);
});

test('adapter has no persistence, direct network, mutation, identity inference, or fallback selection', () => {
  for (const pattern of [
    /localStorage|indexedDB|sessionStorage/,
    /\bfetch\s*\(|XMLHttpRequest/,
    /driverProfiles|unitNumber|accountId|crewId|firstDriver|firstTruck|activeTrucks/,
    /setItem\s*\(/,
    /\b(create|close|revoke|update|delete|write|save)Assignment\b/i,
    /assignments\s*\[\s*0\s*\]/,
  ]) assert.doesNotMatch(source, pattern);
});
