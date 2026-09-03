import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../presentation-context.js', import.meta.url), 'utf8'), context);
const resolve = context.CrewBIQPresentationContext.resolvePresentationContext;
const AT = '2026-09-03T12:00:00Z';
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function membership(workspaceId, role, capabilities = []) { return { status: 'active', workspace: { id: workspaceId }, roles: [role], capabilities }; }
function base(overrides = {}) {
  return { session: { authenticated: true, activeWorkspaceId: 'workspace-a', accountId: 'account-a' }, memberships: [membership('workspace-a', 'driver', ['read.self'])], effectiveAt: AT, legacyPersona: null, ...overrides };
}
function active(fields) { return { status: 'active', effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, ...fields }; }
function empty(status, persona = null) {
  return { status, workspaceId: null, membershipRole: null, capabilities: [], relationshipScope: { carrierAssignmentIds: [], accountDriverLinkId: null, truckOwnershipIds: [], currentDriverTruckAssignment: null }, legacyPersona: persona };
}

test('V1 no session is unavailable with a fully zeroed payload', () => {
  assert.deepEqual(plain(resolve({ legacyPersona: 'driver' })), empty('unavailable', 'driver'));
});
test('V2 each single canonical role resolves without coercion', () => {
  for (const role of ['driver', 'fleet', 'carrier']) {
    const result = plain(resolve(base({ memberships: [membership('workspace-a', role, ['z', 'a'])] })));
    assert.equal(result.status, 'resolved'); assert.equal(result.membershipRole, role); assert.deepEqual(result.capabilities, ['a', 'z']);
  }
});
test('V3 owner-who-drives carries all proven relationship evidence but remains fleet', () => {
  const result = plain(resolve(base({
    legacyPersona: 'owner_op', memberships: [membership('workspace-a', 'fleet', ['fleet.read'])],
    accountDriverLink: { ok: true, link: active({ linkId: 'link-a', workspaceId: 'workspace-a', accountId: 'account-a', driverId: 'driver-a' }) },
    truckOwnership: { ok: true, ownerships: ['a', 'b', 'c'].map((id) => active({ id: `ownership-${id}`, workspaceId: 'workspace-a', accountId: 'account-a', truckId: `truck-${id}` })) },
    driverTruckAssignments: { ok: true, assignment: active({ workspaceId: 'workspace-a', driverId: 'driver-a', truckId: 'truck-a' }) },
  })));
  assert.equal(result.membershipRole, 'fleet'); assert.equal(result.relationshipScope.accountDriverLinkId, 'link-a');
  assert.deepEqual(result.relationshipScope.truckOwnershipIds, ['ownership-a', 'ownership-b', 'ownership-c']);
  assert.deepEqual(result.relationshipScope.currentDriverTruckAssignment, { truckId: 'truck-a', driverId: 'driver-a', effectiveFrom: '2026-09-01T00:00:00Z' });
});
test('V4 duplicate active membership is ambiguous and fully zeroed', () => {
  assert.deepEqual(plain(resolve(base({ memberships: [membership('workspace-a', 'driver', ['one']), membership('workspace-a', 'fleet', ['two'])] }))), empty('ambiguous'));
});
test('V5 unrecognized or multi-role membership is unauthorized and fully zeroed', () => {
  assert.deepEqual(plain(resolve(base({ memberships: [membership('workspace-a', 'owner', ['leak'])] }))), empty('unauthorized'));
  const multi = membership('workspace-a', 'driver', ['leak']); multi.roles.push('fleet');
  assert.deepEqual(plain(resolve(base({ memberships: [multi] }))), empty('unauthorized'));
});
test('V6 legacy owner persona never promotes a canonical driver role', () => {
  const result = plain(resolve(base({ legacyPersona: 'owner_op' })));
  assert.equal(result.status, 'resolved'); assert.equal(result.membershipRole, 'driver'); assert.equal(result.legacyPersona, 'owner_op');
});
test('V7 ended and revoked carrier assignments never surface', () => {
  const result = plain(resolve(base({ memberships: [membership('workspace-a', 'carrier')], carrierAssignments: { ok: true, assignments: [
    active({ id: 'ended', carrierWorkspaceId: 'workspace-a', fleetWorkspaceId: 'workspace-b', truckId: 'truck-b', status: 'ended', effectiveTo: '2026-09-02T00:00:00Z' }),
    active({ id: 'revoked', carrierWorkspaceId: 'workspace-a', fleetWorkspaceId: 'workspace-c', truckId: 'truck-c', status: 'revoked' }),
  ] } })));
  assert.deepEqual(result.relationshipScope.carrierAssignmentIds, []);
});
test('V8 active workspace isolates membership and same-workspace evidence', () => {
  const result = plain(resolve(base({ memberships: [membership('workspace-a', 'driver', ['a']), membership('workspace-b', 'fleet', ['b'])], truckOwnership: { ok: true, ownerships: [active({ id: 'wrong', workspaceId: 'workspace-b', accountId: 'account-a', truckId: 'truck-b' })] } })));
  assert.equal(result.membershipRole, 'driver'); assert.deepEqual(result.capabilities, ['a']); assert.deepEqual(result.relationshipScope.truckOwnershipIds, []);
});
test('V9 assignment evidence fails closed for missing, malformed, ended, future and ambiguous cases', async (t) => {
  const link = { ok: true, link: active({ linkId: 'link-a', workspaceId: 'workspace-a', accountId: 'account-a', driverId: 'driver-a' }) };
  const valid = active({ workspaceId: 'workspace-a', driverId: 'driver-a', truckId: 'truck-a' });
  const cases = { missing: { ok: true, assignments: [] }, malformed: { ok: true, assignments: [{ ...valid, effectiveFrom: 'not-a-date' }] }, ended: { ok: true, assignments: [{ ...valid, effectiveTo: '2026-09-02T00:00:00Z' }] }, future: { ok: true, assignments: [{ ...valid, effectiveFrom: '2026-09-04T00:00:00Z' }] }, ambiguous: { ok: true, assignments: [valid, { ...valid, truckId: 'truck-b' }] } };
  for (const [name, driverTruckAssignments] of Object.entries(cases)) await t.test(name, () => {
    const result = plain(resolve(base({ accountDriverLink: link, driverTruckAssignments })));
    assert.equal(result.status, 'resolved'); assert.equal(result.relationshipScope.currentDriverTruckAssignment, null);
  });
});
test('resolver is deterministic and has no network persistence or DOM dependency', () => {
  const evidence = base(); assert.deepEqual(plain(resolve(evidence)), plain(resolve(evidence)));
  const source = fs.readFileSync(new URL('../presentation-context.js', import.meta.url), 'utf8');
  for (const token of ['fetch(', 'localStorage', 'sessionStorage', 'document.', 'XMLHttpRequest']) assert.equal(source.includes(token), false);
});
