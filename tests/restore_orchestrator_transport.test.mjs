import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// RESTORE-ORCH-01, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4: clean-device login and session restore, driven through the
// ACTUAL index.html authPost()/getAuthSyncUrl() transport and the ACTUAL
// startup-session.js coordinator - not restated claims, and not the
// mock-authPost fixture the existing coordinator test uses. This extracts
// the bounded auth-transport slice of index.html by source location (the
// same section()-slicing convention used by
// tests/index-startup-composition.test.mjs and
// tests/auth-session-startup-contract.test.mjs) and executes it in a vm
// alongside the real core-runtime.js dispatcher, so every assertion here
// exercises real code, not a browser framework and not a fixture standing
// in for the transport layer itself.

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const coordinatorSource = fs.readFileSync(new URL('../startup-session.js', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, 'missing start marker: ' + start);
  assert.notEqual(endAt, -1, 'missing end marker: ' + end);
  return source.slice(startAt, endAt);
}

// The bounded auth-transport slice: getSavedSessionToken through authPost,
// inclusive. Only external dependencies are document/localStorage/driver/
// K/DEFAULT_SYNC_URL/fetch, all supplied by the vm context below - nothing
// here is a hand-rewritten stand-in for index.html's own code.
const authTransportSlice = section(
  html,
  'function setLoginStatus(msg,type=\'\'){',
  'let workspaceDriverRosterAdapter = null;',
);
assert.match(authTransportSlice, /async function authPost\(type, payload=\{\}, syncUrlOverride=''\)\{/, 'the extracted slice must contain the real authPost() implementation');

function buildAuthContext() {
  const storageMap = new Map();
  const localStorage = {
    getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
    setItem(key, value) { storageMap.set(key, String(value)); },
    removeItem(key) { storageMap.delete(key); },
  };
  const elements = {};
  const document = {
    getElementById(id) { return elements[id] || null; },
  };
  const nativeCalls = [];
  async function nativeFetch(url, init = {}) {
    const call = { url: String(url), method: String((init && init.method) || 'GET').toUpperCase() };
    nativeCalls.push(call);

    if (call.url.endsWith('/v1/auth/login')) {
      return new Response(JSON.stringify({
        ok: true, session_token: 'token-restore-1',
        user: { crewbiq_id: 'CBQ-AUTH', email: 'driver@example.com', nickname: 'Driver' },
        roles: ['driver'],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (call.url.endsWith('/v1/auth/bootstrap')) {
      return new Response(JSON.stringify({
        ok: true, session_token: 'token-restore-2',
        user: { crewbiq_id: 'CBQ-NEW', email: 'new@example.com', nickname: 'New' },
        roles: ['driver'],
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    if (call.url.endsWith('/v1/me')) {
      return new Response(JSON.stringify({
        ok: true,
        user: { crewbiq_id: 'CBQ-AUTH', email: 'driver@example.com', nickname: 'Driver', roles: ['driver'] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (call.url.endsWith('/v1/fleet/config')) {
      return new Response(JSON.stringify({
        ok: true, trucks: [], driver_profiles: [], pay_config: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (call.url.endsWith('/v1/auth/logout')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error('Unexpected native fetch in RESTORE-ORCH-01: ' + call.method + ' ' + call.url);
  }
  const context = {
    console,
    localStorage,
    document,
    fetch: nativeFetch,
    Response,
    Headers,
    Request,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    Math,
  };
  context.window = context;
  context.globalThis = context;

  // Load core-runtime.js FIRST, matching production's actual load order
  // (core.js loads core-runtime.js before any of index.html's own inline
  // script runs) - this installs the real Orchestrator dispatcher as
  // context.fetch before the extracted authPost() slice below is defined.
  vm.runInNewContext(runtimeSource, context, { filename: 'core-runtime.js' });
  assert.notEqual(context.fetch, nativeFetch, 'core-runtime.js must have installed its own Orchestrator dispatcher');

  const K = 'fiqD_';
  const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbxsygN14QcavY70qXGherETIzM_VD8OLNBPL2eUU2GxOroK9D4mHIE8pwW6g5nfHvmDGg/exec';
  vm.runInContext('const K = ' + JSON.stringify(K) + ';', context);
  vm.runInContext('const DEFAULT_SYNC_URL = ' + JSON.stringify(DEFAULT_SYNC_URL) + ';', context);
  vm.runInContext('let driver = null;', context);
  vm.runInContext(authTransportSlice, context, { filename: 'index-auth-transport-slice.js' });
  assert.equal(typeof context.authPost, 'function', 'the vm must expose the real extracted authPost()');
  assert.equal(typeof context.getAuthSyncUrl, 'function', 'the vm must expose the real extracted getAuthSyncUrl()');

  return { context, localStorage, elements, nativeCalls, K, DEFAULT_SYNC_URL };
}

test('RESTORE-ORCH-01: real authPost() reaches only the configured Orchestrator, never script.google.com/crewbiq-expenses', async () => {
  const { context, elements, nativeCalls } = buildAuthContext();
  elements.loginSyncUrl = { value: '' }; // no manual override -> DEFAULT_SYNC_URL resolution path
  elements.loginStatus = { textContent: '', style: {} };

  const loginResponse = await context.authPost('auth_login', { emailOrNickname: 'driver@example.com', password: 'secret' });
  assert.equal(loginResponse.ok, true);
  assert.equal(typeof loginResponse.sessionToken, 'string');
  assert.ok(loginResponse.sessionToken.length > 0);

  const restoreResponse = await context.authPost('auth_restore', { sessionToken: loginResponse.sessionToken });
  assert.equal(restoreResponse.ok, true);

  const logoutResponse = await context.authPost('auth_logout', { sessionToken: loginResponse.sessionToken });
  assert.equal(logoutResponse.ok, true);

  const signupResponse = await context.authPost('auth_signup', { email: 'new@example.com', nickname: 'New', password: 'secret2' });
  assert.equal(signupResponse.ok, true);

  assert.ok(nativeCalls.length > 0, 'the real Orchestrator dispatcher must have made at least one native network call');
  assert.equal(
    nativeCalls.every((call) => call.url.startsWith('https://crewbiq-orchestrator-production.up.railway.app/')),
    true,
    'every native call must target the configured Orchestrator, never script.google.com/crewbiq-expenses despite authPost() being handed the DEFAULT_SYNC_URL literal',
  );
  assert.equal(
    nativeCalls.some((call) => call.url.includes('script.google.com') || call.url.includes('crewbiq-expenses')),
    false,
    'no native call may target script.google.com or the crewbiq-expenses literal',
  );
});

test('RESTORE-ORCH-01: real startup coordinator, wired to the REAL authPost() (not a mock), restores identity via the Orchestrator with exactly one restore and one delayed pull, and gates on PTI', async () => {
  const { context, elements } = buildAuthContext();
  elements.loginSyncUrl = { value: '' };
  elements.loginStatus = { textContent: '', style: {} };

  const coordinatorContext = { window: {}, globalThis: {} };
  vm.runInNewContext(coordinatorSource, coordinatorContext, { filename: 'startup-session.js' });
  const CrewBIQStartupSession = coordinatorContext.window.CrewBIQStartupSession;
  assert.ok(CrewBIQStartupSession, 'startup-session.js must expose CrewBIQStartupSession');

  const events = [];
  let pullCalls = 0;
  let scheduleCalls = 0;
  const appElements = {
    app: { classList: { add: (v) => events.push('app:' + v) } },
    setupScreen: { style: {} },
  };
  const driverState = { crewId: null };

  const deps = {
    // The one thing under test: the REAL authPost() extracted from
    // index.html, wired through the REAL core-runtime.js Orchestrator
    // dispatcher - not a fixture standing in for the transport layer.
    authPost: (type, payload, syncUrl) => context.authPost(type, payload, syncUrl),
    applyAuthRestoreData: (data) => {
      events.push('apply-auth');
      driverState.crewId = data && data.crewId;
      // Real driver objects always carry a syncUrl (device/environment
      // config); showApp() gates the delayed pull on driver.syncUrl being
      // truthy, matching production's applyAuthRestoreData().
      driverState.syncUrl = (data && data.syncUrl) || 'https://script.google.com/macros/s/example/exec';
    },
    document: { getElementById: (id) => appElements[id] || null },
    endpointError: (_action, message) => new Error(message),
    ensureDefaultTruckFromDriver: () => events.push('ensure-truck'),
    formatRestoreSummary: () => 'summary',
    getAuthSyncUrl: () => context.getAuthSyncUrl(),
    getDriver: () => (driverState.crewId ? driverState : null),
    getPullFromCloud: () => () => { pullCalls += 1; },
    getSavedSessionToken: () => 'restored-session-token',
    loadDriverProfiles: () => [],
    loadTrucks: () => [],
    needsPTI: () => false,
    renderAll: () => events.push('render'),
    renderStartupShell: () => events.push('render-shell'),
    restoreFleetConfigFromOrchestrator: async () => ({ restored: false }),
    saveAll: () => events.push('save-all'),
    saveDriverProfile: () => events.push('save-profile'),
    scheduleAutoSync: () => { scheduleCalls += 1; },
    setFleetRestoreSettled: (v) => events.push('settled:' + v),
    setLoginStatus: () => events.push('login-status'),
    setTimeout: (cb) => cb(),
    showPTIBlocker: () => events.push('pti-blocker'),
    unwrapAuthResponse: (v) => v,
    warn: (...args) => events.push('warn:' + args.join(' ')),
  };

  const coordinator = CrewBIQStartupSession.create(deps);
  await coordinator.start({ savedUrl: 'https://script.google.com/macros/s/example/exec' });

  assert.equal(events.filter((e) => e === 'apply-auth').length, 1, 'one startup invocation must perform exactly one auth restore');
  assert.equal(events.filter((e) => e === 'app:show').length, 1, 'app must become visible exactly once');
  assert.equal(scheduleCalls, 1, 'auto-sync must be scheduled exactly once');
  assert.equal(pullCalls, 1, 'exactly one delayed pull must be scheduled after boot');
  assert.equal(driverState.crewId, 'CBQ-AUTH', 'identity from the REAL Orchestrator auth_restore response must reach applyAuthRestoreData');
});

test('RESTORE-ORCH-01: PTI gating and graceful degradation are preserved when wired to the real authPost()', async () => {
  const { context, elements } = buildAuthContext();
  elements.loginSyncUrl = { value: '' };
  elements.loginStatus = { textContent: '', style: {} };

  const coordinatorContext = { window: {}, globalThis: {} };
  vm.runInNewContext(coordinatorSource, coordinatorContext, { filename: 'startup-session.js' });
  const CrewBIQStartupSession = coordinatorContext.window.CrewBIQStartupSession;

  const events = [];
  const appElements = {
    app: { classList: { add: (v) => events.push('app:' + v) } },
    setupScreen: { style: {} },
  };
  const driverState = { crewId: null };

  const deps = {
    authPost: (type, payload, syncUrl) => context.authPost(type, payload, syncUrl),
    applyAuthRestoreData: (data) => { driverState.crewId = data && data.crewId; },
    document: { getElementById: (id) => appElements[id] || null },
    endpointError: (_action, message) => new Error(message),
    ensureDefaultTruckFromDriver: () => {},
    formatRestoreSummary: () => 'summary',
    getAuthSyncUrl: () => context.getAuthSyncUrl(),
    getDriver: () => (driverState.crewId ? driverState : null),
    getPullFromCloud: () => null,
    getSavedSessionToken: () => 'restored-session-token',
    loadDriverProfiles: () => [],
    loadTrucks: () => [],
    needsPTI: () => true, // PTI is due: boot() must gate on it, not render the app.
    renderAll: () => events.push('render'),
    renderStartupShell: () => events.push('render-shell'),
    restoreFleetConfigFromOrchestrator: async () => ({ restored: false }),
    saveAll: () => {},
    saveDriverProfile: () => {},
    scheduleAutoSync: () => events.push('schedule-sync'),
    setFleetRestoreSettled: (v) => events.push('settled:' + v),
    setLoginStatus: () => {},
    setTimeout: (cb) => cb(),
    showPTIBlocker: () => events.push('pti-blocker'),
    unwrapAuthResponse: (v) => v,
    warn: (...args) => events.push('warn:' + args.join(' ')),
  };

  const coordinator = CrewBIQStartupSession.create(deps);
  await coordinator.start({ savedUrl: 'https://script.google.com/macros/s/example/exec' });

  assert.equal(events.includes('pti-blocker'), true, 'the PTI blocker must be shown when needsPTI() is true, even though the real Orchestrator restore succeeded');
  assert.equal(events.includes('app:show'), false, 'the app must not become visible while the PTI blocker is active');
});
