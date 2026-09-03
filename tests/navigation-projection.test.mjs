import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(fs.readFileSync(new URL('../navigation-model.js', import.meta.url), 'utf8'), { window });
vm.runInNewContext(fs.readFileSync(new URL('../navigation-projection.js', import.meta.url), 'utf8'), { window });
const model = window.CrewBIQNavigationModel;
const project = window.CrewBIQNavigationProjection.projectNavigation;
const plain = (value) => JSON.parse(JSON.stringify(value));
const context = (role, legacyPersona = null) => ({ status: 'resolved', workspaceId: 'workspace-a', membershipRole: role, capabilities: [], relationshipScope: {}, legacyPersona });

test('non-resolved PresentationContext statuses stay fail-closed and empty', () => {
  for (const status of ['unavailable', 'unauthorized', 'ambiguous']) {
    const result = project({ ...context('fleet'), status }, model);
    assert.equal(result.status, status); assert.equal(result.workspaceId, null); assert.equal(result.membershipRole, null);
    assert.deepEqual(plain(result.roleMenuTargets), []); assert.deepEqual(plain(result.functionGroups), []); assert.equal(result.pageRegistry, null);
  }
});
test('canonical driver cannot be elevated by owner_op or fleet legacy persona', () => {
  for (const persona of ['owner_op', 'fleet']) {
    const result = project(context('driver', persona), model);
    assert.equal(result.status, 'resolved'); assert.equal(result.membershipRole, 'driver'); assert.equal(result.presentationPersona, 'driver');
    assert.deepEqual(plain(result.roleMenuTargets), plain(model.roleMenuTargets('driver')));
  }
});
test('canonical fleet may preserve a narrower legacy presentation persona only', () => {
  for (const persona of ['driver', 'owner_op']) {
    const result = project(context('fleet', persona), model);
    assert.equal(result.membershipRole, 'fleet'); assert.equal(result.presentationPersona, persona);
    assert.deepEqual(plain(result.roleMenuTargets), plain(model.roleMenuTargets(persona)));
  }
});
test('canonical fleet defaults to fleet presentation without a narrower persona', () => {
  const result = project(context('fleet'), model);
  assert.equal(result.presentationPersona, 'fleet');
  assert.deepEqual(plain(result.bottomDestinations), ['home', 'work', 'team', 'money']);
});
test('canonical carrier remains unavailable and is never approximated as fleet', () => {
  const result = project(context('carrier', 'fleet'), model);
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'carrier_navigation_not_available');
  assert.equal(result.presentationPersona, null); assert.deepEqual(plain(result.roleMenuTargets), []);
});
test('projection references canonical registries and never defines replacement inventory', () => {
  const result = project(context('fleet'), model);
  assert.equal(result.roleConfig, model.ROLE_CONFIG.fleet); assert.equal(result.pageRegistry, model.PAGE_REGISTRY);
  const source = fs.readFileSync(new URL('../navigation-projection.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /const ROLE_CONFIG\s*=|const FUNCTION_GROUPS\s*=|const PAGE_REGISTRY\s*=/);
});
test('all projected targets retain current page IDs and model ordering', () => {
  for (const persona of ['driver', 'owner_op', 'fleet']) {
    const role = persona === 'driver' ? 'driver' : 'fleet';
    const result = project(context(role, persona), model);
    assert.deepEqual(plain(result.roleMenuTargets), plain(model.roleMenuTargets(persona)));
    assert.deepEqual(plain(result.groupedTargets), plain(model.groupedTargets(persona)));
    for (const page of [...result.roleMenuTargets, ...result.groupedTargets, ...result.bottomDestinations]) assert.ok(model.PAGE_REGISTRY[page]);
  }
});
test('invalid model, role, workspace, or legacy persona fails closed without driver fallback', () => {
  assert.equal(project(context('owner'), model).status, 'unauthorized');
  assert.equal(project({ ...context('driver'), workspaceId: '' }, model).status, 'unauthorized');
  assert.equal(project(context('fleet', 'owner'), model).status, 'unauthorized');
  assert.equal(project(context('driver'), {}).status, 'unauthorized');
});
test('projection is deterministic, does not mutate inputs, and owns no DOM/router effects', () => {
  const input = context('fleet', 'owner_op'); const before = JSON.stringify(input);
  assert.deepEqual(plain(project(input, model)), plain(project(input, model))); assert.equal(JSON.stringify(input), before);
  const source = fs.readFileSync(new URL('../navigation-projection.js', import.meta.url), 'utf8');
  for (const token of ['showPage', 'render', 'document.', 'localStorage', 'sessionStorage', 'fetch(']) assert.equal(source.includes(token), false);
});
