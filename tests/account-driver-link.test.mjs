import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../account-driver-link.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadApi(overrides = {}) {
  const context = vm.createContext({ window: {}, globalThis: {}, Date, Object, Array, Set, Number, String, ...overrides });
  vm.runInContext(source, context, { filename: 'account-driver-link.js' });
  return context.window.CrewBIQIdentityLink;
}

const api = loadApi();
const context = { sessionToken: 'token-1', workspaceId: 'workspace-1', accountId: 'account-1', effectiveAt: '2026-08-30T12:00:00-05:00' };
const provenance = { source: 'explicit', attributedByAccountId: 'admin-1', attributedAt: '2026-08-01T12:00:00Z', reason: 'Verified onboarding' };
const link = { linkId: 'link-1', workspaceId: 'workspace-1', accountId: 'account-1', driverId: 'driver-1', status: 'active', effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null, provenance };

function wire(links = [link], overrides = {}) {
  return { ok: true, workspaceId: 'workspace-1', accountId: 'account-1', accountIdSpace: 'crewbiq_account', links, ...overrides };
}

function adapter(result, calls = []) {
  return api.create({
    now: () => context.effectiveAt,
    request: async (action, payload) => { calls.push({ action, payload }); return typeof result === 'function' ? result() : result; },
  });
}

test('module exports a bounded namespace without requesting on load', () => {
  let requests = 0;
  loadApi({ request: () => { requests += 1; } });
  assert.equal(requests, 0);
  assert.deepEqual(Object.keys(api), ['ACTION', 'ACCOUNT_ID_SPACE', 'ERROR_CODES', 'validateResponse', 'create']);
});

test('one valid active link returns canonical analytics proof', async () => {
  const calls = [];
  const result = await adapter(wire(), calls).read(context);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.proof), {
    type: 'canonical_account_driver_link', proof: 'canonical_account_driver_link',
    workspaceId: 'workspace-1', accountId: 'account-1', driverId: 'driver-1', driverProfileId: 'driver-1',
    recordCrewId: 'account-1', linkId: 'link-1', effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null,
    provenance,
  });
  assert.deepEqual(plain(calls), [{ action: 'account_driver_link_read', payload: { sessionToken: 'token-1', workspaceId: 'workspace-1', accountId: 'account-1' } }]);
});

test('zero qualifying links returns not_found', async () => {
  assert.equal((await adapter(wire([])).read(context)).code, 'account_driver_link_not_found');
});

test('two active links return ambiguous without choosing one', async () => {
  const second = { ...link, linkId: 'link-2', driverId: 'driver-2' };
  const result = await adapter(wire([link, second])).read(context);
  assert.equal(result.code, 'account_driver_link_ambiguous');
  assert.equal(result.details.candidateCount, 2);
});

test('response and record workspace mismatches fail closed', async () => {
  assert.equal((await adapter(wire([], { workspaceId: 'other' })).read(context)).code, 'account_driver_link_workspace_mismatch');
  assert.equal((await adapter(wire([{ ...link, workspaceId: 'other' }])).read(context)).code, 'account_driver_link_workspace_mismatch');
});

test('response and record account mismatches fail closed', async () => {
  assert.equal((await adapter(wire([], { accountId: 'other' })).read(context)).code, 'account_driver_link_account_mismatch');
  assert.equal((await adapter(wire([{ ...link, accountId: 'other' }])).read(context)).code, 'account_driver_link_account_mismatch');
});

test('wrong account namespace and malformed response fail invalid/account response checks', async () => {
  assert.equal((await adapter(wire([], { accountIdSpace: 'device_local' })).read(context)).code, 'account_driver_link_account_mismatch');
  assert.equal((await adapter({ ok: true, links: 'invalid' }).read(context)).code, 'account_driver_link_invalid_response');
  assert.equal((await adapter(wire([{ ...link, driverId: '' }])).read(context)).code, 'account_driver_link_invalid_response');
});

test('inactive and revoked links are ignored', async () => {
  const result = await adapter(wire([{ ...link, status: 'inactive' }, { ...link, linkId: 'link-2', status: 'revoked' }])).read(context);
  assert.equal(result.code, 'account_driver_link_not_found');
});

test('future effectiveFrom is ignored until active', async () => {
  const result = await adapter(wire([{ ...link, effectiveFrom: '2026-09-01T00:00:00Z' }])).read(context);
  assert.equal(result.code, 'account_driver_link_not_found');
});

test('expired effectiveTo is ignored using exclusive interval semantics', async () => {
  const result = await adapter(wire([{ ...link, effectiveTo: '2026-08-30T12:00:00-05:00' }])).read(context);
  assert.equal(result.code, 'account_driver_link_not_found');
});

test('manual_admin provenance without reason is invalid', async () => {
  const manual = { ...link, provenance: { source: 'manual_admin', attributedByAccountId: 'admin-1', attributedAt: '2026-08-01T12:00:00Z' } };
  assert.equal((await adapter(wire([manual])).read(context)).code, 'account_driver_link_invalid_response');
});

test('complete manual_admin provenance is accepted and preserved', async () => {
  const manualProvenance = { source: 'manual_admin', attributedByAccountId: 'admin-1', attributedAt: '2026-08-01T12:00:00Z', reason: 'Corrected verified roster link' };
  const result = await adapter(wire([{ ...link, provenance: manualProvenance }])).read(context);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.proof.provenance), manualProvenance);
});

test('adapter never consumes Driver or truck arrays as fallback', async () => {
  const result = await adapter(wire([])).read({ ...context, drivers: [{ id: 'driver-first' }], trucks: [{ id: 'truck-first' }] });
  assert.equal(result.code, 'account_driver_link_not_found');
});

test('response input is not mutated', async () => {
  const response = wire();
  const before = JSON.stringify(response);
  const result = await adapter(response).read(context);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(response), before);
  assert.notEqual(result.link, response.links[0]);
  assert.notEqual(result.proof.provenance, response.links[0].provenance);
});

test('transport failure returns structured network_unavailable', async () => {
  const runtime = api.create({ request: async () => { const error = new Error('offline'); error.code = 'offline'; throw error; } });
  const result = await runtime.read(context);
  assert.equal(result.code, 'network_unavailable');
  assert.equal(result.details.reason, 'offline');
});

test('server unauthorized response and thrown authorization are normalized', async () => {
  assert.equal((await adapter({ status: 401, data: { ok: false } }).read(context)).code, 'account_driver_link_unauthorized');
  const runtime = api.create({ request: async () => { const error = new Error('denied'); error.status = 403; throw error; } });
  assert.equal((await runtime.read(context)).code, 'account_driver_link_unauthorized');
});

test('server failures remain structured and do not expose guessed link state', async () => {
  const result = await adapter({ status: 503, data: { ok: false, error: 'database detail' } }).read(context);
  assert.equal(result.code, 'server_error');
  assert.deepEqual(plain(result.details), { status: 503 });
});

test('missing authenticated request context fails unauthorized without transport call', async () => {
  let requests = 0;
  const runtime = api.create({ request: async () => { requests += 1; return wire(); } });
  assert.equal((await runtime.read({ ...context, sessionToken: '' })).code, 'account_driver_link_unauthorized');
  assert.equal(requests, 0);
});

test('source contains no persistence, direct network, Driver selection, or load-time request path', () => {
  for (const pattern of [/localStorage|indexedDB|sessionStorage/, /\bfetch\s*\(/, /XMLHttpRequest/, /drivers\s*\[/, /trucks\s*\[/, /currentTruck|firstDriver|firstTruck/, /setItem\s*\(/]) {
    assert.doesNotMatch(source, pattern);
  }
});
