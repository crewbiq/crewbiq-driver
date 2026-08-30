import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function section(start, end) {
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, `missing start marker: ${start}`);
  assert.notEqual(endAt, -1, `missing end marker: ${end}`);
  return html.slice(startAt, endAt);
}

function assertOrdered(source, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const found = source.indexOf(marker, cursor + 1);
    assert.ok(found > cursor, `expected ordered marker: ${marker}`);
    cursor = found;
  }
}

test('STATIC_CONTRACT startup initializes dependencies before restore and always reaches boot', () => {
  const init = section('runLaunchCleanResetOnce();', '</script>');
  assertOrdered(init, [
    'runLaunchCleanResetOnce();',
    'migrateStorage();',
    'loadAll();',
    'initSync();',
    'initPTI();',
    'initLoads();',
    'applyRoleUI();',
    'const _savedSession = getSavedSessionToken();',
    'restoreSession({sessionToken:_savedSession',
    ".catch(e => console.warn('[CrewBIQ Auth] session restore failed:', e.message))",
    '.finally(() => boot());',
  ]);
  assert.match(init, /else \{\s*setFleetRestoreSettled\(true\);\s*boot\(\);\s*\}/);
});

test('STATIC_CONTRACT restore applies identity before optional fleet restore and render settlement', () => {
  const restore = section('async function restoreSession(options={}){', 'async function authLogin(){');
  assertOrdered(restore, [
    'setFleetRestoreSettled(false);',
    "if(!sessionToken) throw endpointError('auth_restore', 'sessionToken missing before restore');",
    "authPost('auth_restore', {sessionToken}, syncUrl)",
    'applyAuthRestoreData(data, syncUrl);',
    'restoreFleetConfigFromOrchestrator(driver.crewId)',
    'saveAll();',
    'saveDriverProfile();',
    'renderAll();',
    'setFleetRestoreSettled(true);',
  ]);
  assert.doesNotMatch(restore, /clearSessionToken|localStorage\.clear|removeItem\(K\+'sessionToken'/);
});

test('STATIC_CONTRACT boot keeps setup, PTI gate, and app visibility in their current order', () => {
  const boot = section('function boot(){', 'function showApp(){');
  assertOrdered(boot, [
    "if(!driver){ document.getElementById('setupScreen').style.display='flex'; return; }",
    'if(needsPTI()){ showPTIBlocker(); } else { showApp(); }',
  ]);
  assert.doesNotMatch(boot, /showApp\(\)[\s\S]*needsPTI\(\)/);
});

test('STATIC_CONTRACT logout clears only primary session shell and preserves configured continuity', () => {
  const logout = section('async function logoutDevice(){', 'function toggleSetupRate(){');
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

test('STATIC_CONTRACT confirms the ambiguous first-truck fallback was removed', () => {
  const getDefaultTruck = section('function getDefaultTruck(){', 'function truckDisplay(t){');
  assert.doesNotMatch(getDefaultTruck, /activeTrucks\(\)\[0\]/);
  assert.match(getDefaultTruck, /resolveDefaultTruck\(driver, activeTrucks\(\)\)/);
});
