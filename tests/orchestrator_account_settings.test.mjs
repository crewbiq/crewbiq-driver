import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('orchestrator account section is created once and appended into the Account settings panel', () => {
  assert.match(html, /var orchAccount = document\.createElement\('div'\);/);
  assert.match(html, /orchAccount\.id = 'settingsOrchAccount';/);
  assert.match(html, /account\.appendChild\(orchAccount\);\s*renderOrchestratorAccountSection\(\);/);
});

test('orchestrator auth functions use getStoredOrchestratorUrl, not sync.js-private getOrchestratorSyncUrl', () => {
  // getOrchestratorSyncUrl() is declared inside sync.js's IIFE and never exposed on window —
  // calling it from index.html scope always silently resolves to '' (confirmed live: typeof
  // getOrchestratorSyncUrl === 'undefined' in the browser). getStoredOrchestratorUrl() is a
  // real global defined directly in index.html and needs no admin unlock to READ (only the
  // Advanced Sync form gates WRITING it).
  const bodyMatch = html.match(/function orchestratorAuthBaseUrl\(\)\{[\s\S]{0,600}?\n\}/);
  assert.ok(bodyMatch, 'orchestratorAuthBaseUrl body must be found');
  const body = bodyMatch[0];
  assert.match(body, /var orchUrl = \(typeof getStoredOrchestratorUrl === 'function'\) \? getStoredOrchestratorUrl\(\) : '';/);
  assert.doesNotMatch(body, /typeof getOrchestratorSyncUrl/);
  for (const fn of ['orchestratorAuthLogin', 'orchestratorAuthRegister', 'orchestratorFetchMe', 'orchestratorAuthLogout']) {
    assert.match(html, new RegExp(`function ${fn}\\(`), `${fn} must exist`);
  }
});

test('every orchestrator network call is wrapped in try/catch and never throws uncaught', () => {
  for (const fn of ['orchestratorAuthLogin', 'orchestratorAuthRegister', 'orchestratorFetchMe', 'orchestratorAuthLogout']) {
    const body = html.match(new RegExp(`async function ${fn}\\([^)]*\\)\\{[\\s\\S]{0,900}?\\n\\}`));
    assert.ok(body, `${fn} body must be found`);
    assert.match(body[0], /try\{/, `${fn} must wrap its fetch in try/catch`);
    assert.match(body[0], /catch\(e\)\{/, `${fn} must catch failures`);
  }
});

test('orchestrator session is stored per local identity (scopedSave/scopedLoad), not device-global', () => {
  assert.match(html, /function loadOrchestratorSession\(\)\{ return scopedLoad\('orchestratorSession', null\); \}/);
  assert.match(html, /function saveOrchestratorSession\(session\)\{ scopedSave\('orchestratorSession', session\); \}/);
  assert.match(html, /function clearOrchestratorSession\(\)\{ scopedSave\('orchestratorSession', null\); \}/);
  // No legacy device-global mirror — nothing else in the codebase reads this key today.
  assert.doesNotMatch(html, /K\+'orchestratorSession'/);
  assert.doesNotMatch(html, /K \+ 'orchestratorSession'/);
});

test('login and register both funnel through orchestratorFinishLogin, which fetches /v1/me before saving the session', () => {
  assert.match(html, /async function orchestratorFinishLogin\(sessionToken\)\{[\s\S]{0,400}orchestratorFetchMe\(sessionToken\)/);
  assert.match(html, /async function orchestratorFinishLogin\(sessionToken\)\{[\s\S]{0,600}saveOrchestratorSession\(/);
  assert.match(html, /async function onOrchLoginClick\(\)\{[\s\S]{0,500}orchestratorFinishLogin\(result\.sessionToken\)/);
  assert.match(html, /async function onOrchRegisterClick\(\)\{[\s\S]{0,500}orchestratorFinishLogin\(result\.sessionToken\)/);
});

test('a failed login or register never calls orchestratorFinishLogin (no partial/invalid session saved)', () => {
  const loginMatch = html.match(/async function onOrchLoginClick\(\)\{[\s\S]{0,800}?\n\}/);
  assert.ok(loginMatch, 'onOrchLoginClick body must be found');
  assert.match(loginMatch[0], /if\(!result\.ok\) return toast\(/);
  const registerMatch = html.match(/async function onOrchRegisterClick\(\)\{[\s\S]{0,800}?\n\}/);
  assert.ok(registerMatch, 'onOrchRegisterClick body must be found');
  assert.match(registerMatch[0], /if\(!result\.ok\) return toast\(/);
});

test('disconnect clears the scoped session and never touches other device-global or account-scoped data', () => {
  const body = html.match(/async function onOrchDisconnectClick\(\)\{[\s\S]{0,400}?\n\}/)[0];
  assert.match(body, /orchestratorAuthLogout\(session\.sessionToken\)/);
  assert.match(body, /clearOrchestratorSession\(\)/);
  assert.doesNotMatch(body, /(saveTrucks|saveCompanies|saveDriverProfiles|saveAccountPaySettings|localStorage\.removeItem)\(/);
});

test('workspace selection is purely local — never calls fetch or any orchestrator* network function', () => {
  const body = html.match(/function onOrchWorkspaceChange\(\)\{[\s\S]{0,400}?\n\}/)[0];
  assert.doesNotMatch(body, /fetch\(/);
  assert.doesNotMatch(body, /orchestratorAuth|orchestratorFetchMe/);
  assert.match(body, /activeWorkspaceIdOverride = select\.value/);
  assert.match(body, /saveOrchestratorSession\(session\)/);
});

test('none of the orchestrator account functions run during boot/app startup', () => {
  // loadAll() / boot() must not reference any orchestrator* function — this feature
  // is opt-in only, wired to button clicks and the Settings panel render.
  const loadAllBody = html.match(/function loadAll\(\)\{[\s\S]{0,700}?\n\}/);
  if (loadAllBody) assert.doesNotMatch(loadAllBody[0], /orchestrator(Auth|Fetch|FinishLogin)/);
  const bootBody = html.match(/function boot\(\)\{[\s\S]{0,700}?\n\}/);
  if (bootBody) assert.doesNotMatch(bootBody[0], /orchestrator(Auth|Fetch|FinishLogin)/);
});
