import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../relationship-evidence.js', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function loadApi() {
  const window = {};
  vm.runInContext(source, vm.createContext({ window, globalThis: window, Date, Object, Array, Set, Number, String }), { filename: 'relationship-evidence.js' });
  return window.CrewBIQRelationshipEvidence;
}
const api = loadApi();
const at = '2026-09-03T12:00:00Z';
const ownership = { id: 'ownership-1', workspaceId: 'workspace-a', accountId: 'account-a', truckId: 'truck-a', status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, provenance: { source: 'explicit' } };
const assignment = { id: 'assignment-1', carrierWorkspaceId: 'carrier-home', fleetWorkspaceId: 'fleet-a', truckId: 'truck-a', driverId: 'driver-a', status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, provenance: { source: 'explicit' } };

test('module exports bounded pure adapter without requesting on load', () => {
  assert.deepEqual(Object.keys(api), ['ACTIONS', 'ERROR_CODES', 'validateTruckOwnershipResponse', 'validateCarrierAssignmentsResponse', 'create']);
});
test('TruckOwnership accepts only current same-workspace same-account evidence', () => {
  const context = { workspaceId: 'workspace-a', accountId: 'account-a', effectiveAt: at };
  const wire = { ok: true, workspaceId: 'workspace-a', accountId: 'account-a', accountIdSpace: 'crewbiq_account', ownerships: [ownership] };
  assert.deepEqual(plain(api.validateTruckOwnershipResponse(wire, context).ownerships), [ownership]);
  assert.equal(api.validateTruckOwnershipResponse({ ...wire, workspaceId: 'other' }, context).code, 'relationship_evidence_workspace_mismatch');
  assert.equal(api.validateTruckOwnershipResponse({ ...wire, accountId: 'other' }, context).code, 'relationship_evidence_account_mismatch');
  for (const bad of [{ ...ownership, workspaceId: 'other' }, { ...ownership, accountId: 'other' }, { ...ownership, effectiveFrom: '2026-10-01T00:00:00Z' }, { ...ownership, provenance: [] }])
    assert.equal(api.validateTruckOwnershipResponse({ ...wire, ownerships: [bad] }, context).ok, false);
});
test('CarrierAssignment preserves proven cross-workspace subjects and rejects same-home targets', () => {
  const context = { workspaceId: 'carrier-home', effectiveAt: at };
  const wire = { ok: true, carrierWorkspaceId: 'carrier-home', assignments: [assignment] };
  const result = api.validateCarrierAssignmentsResponse(wire, context);
  assert.equal(result.assignments[0].fleetWorkspaceId, 'fleet-a');
  assert.equal(api.validateCarrierAssignmentsResponse({ ...wire, assignments: [{ ...assignment, fleetWorkspaceId: 'carrier-home' }] }, context).ok, false);
  assert.equal(api.validateCarrierAssignmentsResponse({ ...wire, carrierWorkspaceId: 'other' }, context).code, 'relationship_evidence_workspace_mismatch');
});
test('empty lists are valid and duplicate IDs or truck subjects fail closed', () => {
  const context = { workspaceId: 'workspace-a', accountId: 'account-a', effectiveAt: at };
  const base = { ok: true, workspaceId: 'workspace-a', accountId: 'account-a', accountIdSpace: 'crewbiq_account' };
  assert.deepEqual(plain(api.validateTruckOwnershipResponse({ ...base, ownerships: [] }, context).ownerships), []);
  assert.equal(api.validateTruckOwnershipResponse({ ...base, ownerships: [ownership, { ...ownership, id: 'ownership-2' }] }, context).ok, false);
  assert.equal(api.validateCarrierAssignmentsResponse({ ok: true, carrierWorkspaceId: 'carrier-home', assignments: [assignment, { ...assignment }] }, { workspaceId: 'carrier-home', effectiveAt: at }).ok, false);
});
test('adapter requires canonical request context and maps failures without fallback', async () => {
  let calls = 0;
  const adapter = api.create({ request: async (action, payload) => {
    calls += 1;
    assert.equal(action, 'truck_ownership_read');
    assert.deepEqual(plain(payload), { sessionToken: 'token', workspaceId: 'workspace-a', accountId: 'account-a' });
    return { status: 200, data: { ok: true, workspaceId: 'workspace-a', accountId: 'account-a', accountIdSpace: 'crewbiq_account', ownerships: [] } };
  }, now: () => at });
  assert.equal((await adapter.readTruckOwnership({ workspaceId: 'workspace-a', accountId: 'account-a' })).code, 'relationship_evidence_unauthorized');
  assert.equal(calls, 0);
  assert.equal((await adapter.readTruckOwnership({ sessionToken: 'token', workspaceId: 'workspace-a', accountId: 'account-a' })).ok, true);
  const offline = api.create({ request: async () => { throw Object.assign(new Error('offline'), { code: 'offline' }); } });
  assert.equal((await offline.readCarrierAssignments({ sessionToken: 'token', workspaceId: 'carrier-home', effectiveAt: at })).code, 'network_unavailable');
});
test('transport uses authenticated no-store GET paths and app shell remains disconnected', () => {
  const body = coreSource.match(/async function adaptRelationshipEvidenceRead\(payload, kind\) \{[\s\S]*?\n  \}/);
  assert.ok(body);
  for (const pattern of [/getSessionToken\(payload\.sessionToken\)/, /encodeURIComponent\(workspaceId\)/, /method: 'GET'/, /headers: authHeaders\(token\)/, /cache: 'no-store'/]) assert.match(body[0], pattern);
  assert.doesNotMatch(body[0], /method: '(POST|PUT|PATCH|DELETE)'|body:|localStorage|scopedSave/);
  assert.match(coreSource, /body\.type === 'truck_ownership_read'/);
  assert.match(coreSource, /body\.type === 'carrier_assignments_read'/);
  assert.match(html, /<script src="relationship-evidence\.js\?v=20260903-ia1-prerequisite-v1"><\/script>/);
  assert.match(html, /function getRelationshipEvidenceAdapter\(\)/);
  assert.doesNotMatch(html, /getRelationshipEvidenceAdapter\(\)\.(readTruckOwnership|readCarrierAssignments)/);
  assert.match(swSource, /crewbiq-driver-v97/);
  assert.match(swSource, /relationship-evidence\.js/);
});
test('module contains no persistence, direct transport, legacy source, mutation, or fallback', () => {
  for (const pattern of [/localStorage|sessionStorage|indexedDB/, /\bfetch\s*\(|XMLHttpRequest/, /driverProfiles|activeTrucks|unitNumber|companyName|mcNumber|carrierAssignmentHistory/, /\[\s*0\s*\]/, /setItem\s*\(/, /\b(save|write|update|delete|infer|guess)\b/i]) assert.doesNotMatch(source, pattern);
});
