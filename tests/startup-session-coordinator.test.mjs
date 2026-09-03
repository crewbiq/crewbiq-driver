import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../startup-session.js', import.meta.url), 'utf8');

function loadModule() {
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context, { filename: 'startup-session.js' });
  return context.window.CrewBIQStartupSession;
}

function fixture(overrides = {}) {
  const events = [];
  const elements = {
    app: { classList: { add: value => events.push('app:' + value) } },
    setupScreen: { style: {} },
  };
  let driver = { crewId: 'crew-1', syncUrl: 'https://sync.example' };
  const deps = {
    applyAuthRestoreData: () => events.push('apply-auth'),
    authPost: async () => { events.push('auth-post'); return { ok: true }; },
    document: { getElementById: id => elements[id] },
    endpointError: (_action, message) => new Error(message),
    ensureDefaultTruckFromDriver: () => events.push('ensure-truck'),
    formatRestoreSummary: () => 'summary',
    defaultSyncUrl: 'https://sync.example',
    getDriver: () => driver,
    getPullFromCloud: () => null,
    getSavedSessionToken: () => 'session-1',
    loadDriverProfiles: () => [{ id: 'driver-1' }],
    loadTrucks: () => [{ id: 'truck-1' }],
    needsPTI: () => false,
    renderAll: () => events.push('render'),
    renderStartupShell: () => events.push('render-shell'),
    restoreFleetConfigFromOrchestrator: async () => { events.push('fleet-restore'); return { restored: true }; },
    saveAll: () => events.push('save-all'),
    saveDriverProfile: () => events.push('save-profile'),
    scheduleAutoSync: () => events.push('schedule-sync'),
    setFleetRestoreSettled: value => events.push('settled:' + value),
    setLoginStatus: () => events.push('login-status'),
    setTimeout: callback => callback(),
    showPTIBlocker: () => events.push('pti-blocker'),
    unwrapAuthResponse: value => value,
    warn: (...args) => events.push('warn:' + args.join(' ')),
    ...overrides,
  };
  return { deps, elements, events, setDriver: value => { driver = value; } };
}

test('coordinator restores identity before optional fleet data and settlement', async () => {
  const state = fixture();
  state.deps.loadTrucks = () => [];
  const coordinator = loadModule().create(state.deps);
  await coordinator.restoreSession({ sessionToken: 'session-1', syncUrl: 'https://sync.example' });
  assert.deepEqual(state.events, [
    'settled:false', 'auth-post', 'apply-auth', 'fleet-restore',
    'save-all', 'save-profile', 'render', 'settled:true', 'login-status',
  ]);
});

test('failed startup restore still reaches boot without clearing continuity state', async () => {
  const state = fixture();
  state.deps.authPost = async () => { state.events.push('auth-post'); throw new Error('offline'); };
  state.setDriver(null);
  const coordinator = loadModule().create(state.deps);
  await coordinator.start({ savedUrl: 'https://sync.example' });
  assert.equal(state.elements.setupScreen.style.display, 'flex');
  assert.deepEqual(state.events, [
    'settled:false', 'auth-post',
    'warn:[CrewBIQ Auth] session restore failed: offline',
  ]);
});

test('boot enforces the PTI gate before app visibility', () => {
  const blocked = fixture({ needsPTI: () => true });
  loadModule().create(blocked.deps).boot();
  assert.deepEqual(blocked.events, ['render-shell', 'pti-blocker']);
  const allowed = fixture();
  loadModule().create(allowed.deps).boot();
  assert.deepEqual(allowed.events, [
    'render-shell', 'app:show', 'ensure-truck', 'render', 'schedule-sync',
  ]);
});

test('one startup invocation performs one auth restore and one delayed pull', async () => {
  let authCalls = 0;
  let pullCalls = 0;
  let scheduleCalls = 0;
  const state = fixture({
    authPost: async () => { authCalls += 1; return { ok: true }; },
    getPullFromCloud: () => () => { pullCalls += 1; },
    scheduleAutoSync: () => { scheduleCalls += 1; },
  });
  await loadModule().create(state.deps).start({ savedUrl: 'https://sync.example' });
  assert.equal(authCalls, 1);
  assert.equal(state.events.filter(event => event === 'app:show').length, 1);
  assert.equal(scheduleCalls, 1);
  assert.equal(pullCalls, 1);
});