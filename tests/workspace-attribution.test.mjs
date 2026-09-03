import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../workspace-attribution.js', import.meta.url), 'utf8');
const loadsSource = fs.readFileSync(new URL('../loads.js', import.meta.url), 'utf8');
const ptiSource = fs.readFileSync(new URL('../pti.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function loadApi(overrides = {}) {
  const window = {};
  const context = vm.createContext({ window, globalThis: window, Object, Array, String, ...overrides });
  vm.runInContext(source, context, { filename: 'workspace-attribution.js' });
  return window.CrewBIQWorkspaceAttribution;
}

const api = loadApi();
const membership = id => ({ workspace: { id, name: `Workspace ${id}` }, roles: ['driver'] });
const session = (overrides = {}) => ({
  sessionToken: 'authenticated-token',
  activeWorkspaceIdOverride: '',
  me: { active_workspace_id: 'workspace-1', memberships: [membership('workspace-1')] },
  ...overrides,
});

test('proven authenticated workspace context resolves deterministically', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolveActiveWorkspace(session()))), { ok: true, workspaceId: 'workspace-1' });
});

test('explicit override resolves only when it matches an authorized membership', () => {
  const context = session({ activeWorkspaceIdOverride: 'workspace-2', me: { active_workspace_id: 'workspace-1', memberships: [membership('workspace-1'), membership('workspace-2')] } });
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolveActiveWorkspace(context))), { ok: true, workspaceId: 'workspace-2' });
});

test('proven workspace context attributes a new Load', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.attributeNewRecord({ id: 'load-1' }, session()).record)), { id: 'load-1', workspaceId: 'workspace-1' });
});

test('proven workspace context attributes a new PTI', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.attributeNewRecord({ id: 'pti-1' }, session()).record)), { id: 'pti-1', workspaceId: 'workspace-1' });
});

test('duplicate active membership is ambiguous and does not guess', () => {
  const context = session({ me: { active_workspace_id: 'workspace-1', memberships: [membership('workspace-1'), membership('workspace-1')] } });
  const result = api.attributeNewRecord({ id: 'load-1' }, context);
  assert.equal(result.resolution.code, 'workspace_ambiguous');
  assert.equal('workspaceId' in result.record, false);
});

test('missing active workspace never falls back to first membership', () => {
  const context = session({ me: { active_workspace_id: '', memberships: [membership('first-workspace')] } });
  const result = api.attributeNewRecord({ id: 'pti-1' }, context);
  assert.equal(result.resolution.code, 'workspace_not_resolved');
  assert.equal('workspaceId' in result.record, false);
});

test('active workspace outside authenticated memberships is unauthorized', () => {
  const context = session({ me: { active_workspace_id: 'not-authorized', memberships: [membership('workspace-1')] } });
  assert.equal(api.resolveActiveWorkspace(context).code, 'workspace_unauthorized');
});

test('missing authenticated token fails closed', () => {
  assert.equal(api.resolveActiveWorkspace(session({ sessionToken: '' })).code, 'workspace_unauthorized');
});

test('resolver contains no first company, workspace, Driver, or Truck fallback', () => {
  for (const pattern of [/companies\s*\[\s*0\s*\]/, /memberships\s*\[\s*0\s*\]/, /drivers\s*\[\s*0\s*\]/, /trucks\s*\[\s*0\s*\]/, /localStorage|sessionStorage|indexedDB/]) {
    assert.doesNotMatch(source, pattern);
  }
});

test('legacy Load and PTI records remain unchanged on serialization and read', () => {
  const legacy = [{ id: 'load-old' }, { id: 'pti-old' }];
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), legacy);
  assert.equal(legacy.some(record => 'workspaceId' in record), false);
});

test('workspaceId survives local serialization and restore/import object roundtrip', () => {
  const attributed = api.attributeNewRecord({ id: 'load-new' }, session()).record;
  assert.deepEqual(JSON.parse(JSON.stringify(attributed)), { id: 'load-new', workspaceId: 'workspace-1' });
});

test('workspace-only attribution never adds driverId or truckId', () => {
  for (const id of ['load-new', 'pti-new']) {
    const record = api.attributeNewRecord({ id }, session()).record;
    assert.equal('driverId' in record, false);
    assert.equal('truckId' in record, false);
  }
  assert.doesNotMatch(source, /driverId|truckId/);
});

test('module load has no storage, network, or attribution side effects', () => {
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|setItem\s*\(|getItem\s*\(/);
  assert.deepEqual(Object.keys(loadApi()).sort(), ['ERROR_CODES', 'attributeNewRecord', 'resolveActiveWorkspace'].sort());
});

test('resolver and attribution do not mutate session or record inputs', () => {
  const context = session();
  const record = { id: 'load-1' };
  const before = JSON.stringify(context);
  const result = api.attributeNewRecord(record, context);
  assert.equal(JSON.stringify(context), before);
  assert.deepEqual(record, { id: 'load-1' });
  assert.notEqual(result.record, record);
});

test('Load and PTI constructors both require canonical workspace resolution', () => {
  assert.match(loadsSource, /if \(!editId && global\.CrewBIQWorkspaceAttribution\)/);
  assert.match(loadsSource, /attributeNewRecord\(entry, _get\.workspaceContext\(\)\)/);
  assert.match(ptiSource, /resolveActiveWorkspace\(_get\.workspaceContext\(\)\)/);
  assert.match(ptiSource, /workspaceId: workspaceResolution\.workspaceId/);
  assert.match(html, /getWorkspaceContext: \(\) => loadOrchestratorSession\(\)/);
});

test('editing preserves an existing workspaceId but does not backfill a legacy Load', () => {
  assert.match(loadsSource, /if \(existingEntry && Object\.prototype\.hasOwnProperty\.call\(existingEntry, 'workspaceId'\)\)/);
  assert.match(loadsSource, /if \(!editId && global\.CrewBIQWorkspaceAttribution\)/);
});

test('new resolver is loaded before constructors and cache-rotated in the app shell', () => {
  assert.ok(html.indexOf('workspace-attribution.js') < html.indexOf('pti.js'));
  assert.match(swSource, /crewbiq-driver-v97/);
  assert.match(swSource, /workspace-attribution\.js/);
});
