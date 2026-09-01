import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const coordinator = fs.readFileSync(new URL('../startup-session.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, 'missing start marker: ' + start);
  assert.notEqual(endAt, -1, 'missing end marker: ' + end);
  return source.slice(startAt, endAt);
}

function assertOrdered(source, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const found = source.indexOf(marker, cursor + 1);
    assert.ok(found > cursor, 'expected ordered marker: ' + marker);
    cursor = found;
  }
}

test('STATIC_CONTRACT startup initializes dependencies before one coordinator start', () => {
  const init = section(html, 'runLaunchCleanResetOnce();', '</script>');
  assertOrdered(init, [
    'runLaunchCleanResetOnce();',
    'migrateStorage();',
    'loadAll();',
    'initSync();',
    'initPTI();',
    'initLoads();',
    'applyRoleUI();',
    'getStartupCoordinator().start({savedUrl:_savedUrl});',
  ]);
  assert.equal(init.match(/getStartupCoordinator\(\)\.start\(/g)?.length, 1);
});

test('STATIC_CONTRACT restore applies identity before optional fleet restore and render settlement', () => {
  const restore = section(coordinator, 'async function restoreSession(options = {}) {', 'function showApp() {');
  assertOrdered(restore, [
    'deps.setFleetRestoreSettled(false);',
    "deps.endpointError('auth_restore', 'sessionToken missing before restore')",
    "deps.authPost('auth_restore', { sessionToken }, syncUrl)",
    'deps.applyAuthRestoreData(data, syncUrl);',
    'deps.restoreFleetConfigFromOrchestrator(driver.crewId)',
    'deps.saveAll();',
    'deps.saveDriverProfile();',
    'deps.renderAll();',
    'deps.setFleetRestoreSettled(true);',
  ]);
  assert.doesNotMatch(restore, /clearSessionToken|localStorage\.clear|removeItem/);
});

test('STATIC_CONTRACT boot keeps setup, PTI gate, and app visibility in order', () => {
  const boot = section(coordinator, 'function boot() {', 'function start(options = {}) {');
  assertOrdered(boot, [
    "deps.document.getElementById('setupScreen').style.display = 'flex';",
    'deps.renderStartupShell();',
    'if (deps.needsPTI()) deps.showPTIBlocker();',
    'else showApp();',
  ]);
});

test('STATIC_CONTRACT index exposes compatibility entry points without owning coordinator behavior', () => {
  assert.match(html, /function restoreSession\(options=\{\}\)\{\s*return getStartupCoordinator\(\)\.restoreSession\(options\);\s*\}/);
  assert.match(html, /function boot\(\)\{ return getStartupCoordinator\(\)\.boot\(\); \}/);
  assert.match(html, /function showApp\(\)\{ return getStartupCoordinator\(\)\.showApp\(\); \}/);
});

test('STATIC_CONTRACT logout clears only primary session shell and preserves configured continuity', () => {
  const logout = section(html, 'async function logoutDevice(){', 'function toggleSetupRate(){');
  assertOrdered(logout, [
    'registerAccountId({crewId: driver.crewId, email: driver.email}, driver.accountId);',
    'importLegacyPaySettingsIntoScope();',
    "authPost('auth_logout', {sessionToken}, syncUrl)",
    "localStorage.removeItem(K+'driver');",
    'clearSessionToken();',
    "localStorage.setItem(K+'_savedSyncUrl', syncUrl);",
    "localStorage.setItem(K+'_savedPtiSched', sched);",
    'location.reload();',
  ]);
  assert.doesNotMatch(logout, /localStorage\.clear\(\)/);
  assert.doesNotMatch(logout, /removeItem\(K\+'userRole'/);
});

test('STATIC_CONTRACT confirms the ambiguous first-truck fallback remains removed', () => {
  const getDefaultTruck = section(html, 'function getDefaultTruck(){', 'function truckDisplay(t){');
  assert.doesNotMatch(getDefaultTruck, /activeTrucks\(\)\[0\]/);
  assert.match(getDefaultTruck, /resolveDefaultTruck\(driver, activeTrucks\(\)\)/);
});
