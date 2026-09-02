import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// WRITE-ORCH-04, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4: an owner-scoped entity save (service log, chosen as the
// representative owner-entity workflow) must persist immediately to local
// storage and reach only the Orchestrator over the network, never
// script.google.com. This exercises the REAL saveServiceLog()/
// saveServiceLogs() from index.html (extracted by source location, same
// convention as tests/write_orchestrator_expense_save.test.mjs), the REAL
// queueFleetConfigSync() from index.html, the REAL forceFullSync()/doSync()
// from sync.js, and the real core-runtime.js dispatcher.
//
// Peripheral UI concerns not part of this invariant (truck-selector
// rendering, service-page rendering) are stubbed rather than extracted -
// they pull in a large web of unrelated index.html rendering helpers
// (activeTrucks/findTruckByIdOrUnit/getDefaultTruck/truckDisplay/etc.) whose
// correctness is covered by other existing tests, not this one.

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, 'missing start marker: ' + start);
  assert.notEqual(endAt, -1, 'missing end marker: ' + end);
  return source.slice(startAt, endAt);
}

const identitySlice = section(html, 'function identitySlug(value){', 'function sortLoadsNewest(arr){');
const utilsSlice = section(html, 'function fmt(n){', '// ── SETUP ──');
const fleetConfigSyncSlice = section(html, 'var _suppressFleetConfigSync = false;', 'function cancelQueuedFleetConfigSync(){');
const serviceLogSlice = section(html, 'function loadServiceLogs(){', 'function editServiceLog(id){');
assert.match(serviceLogSlice, /function saveServiceLog\(\)\{/, 'the extracted slice must contain the real saveServiceLog() implementation');

function fakeInput(value) {
  return { value, checked: false, classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: '', addEventListener() {} };
}

function buildContext() {
  const storageMap = new Map();
  const localStorage = {
    getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
    setItem(key, value) { storageMap.set(key, String(value)); },
    removeItem(key) { storageMap.delete(key); },
  };
  const elements = {
    svcDate: fakeInput('2026-09-01'),
    svcOdo: fakeInput('123456'),
    svcAmount: fakeInput('250.00'),
    svcCategory: fakeInput('Oil & Fluids'),
    svcDesc: fakeInput('Oil change'),
    svcFromFund: { ...fakeInput(''), checked: true },
    svcEditId: fakeInput(''),
    saveSvcBtn: { textContent: '' },
    cancelSvcBtn: { style: {} },
    toast: { textContent: '', className: '', classList: { add() {}, remove() {} } },
  };
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
  };
  const nativeCalls = [];
  async function nativeFetch(url, init = {}) {
    const call = { url: String(url), method: String((init && init.method) || 'GET').toUpperCase() };
    nativeCalls.push(call);
    if (call.url.includes('/v1/sync')) {
      const body = JSON.parse((init && init.body) || '{}');
      const recId = (body.payload && body.payload.record_id) || body.record_id;
      return new Response(JSON.stringify({ ok: true, received: true, record_id: recId }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected native fetch in WRITE-ORCH-04: ' + call.method + ' ' + call.url);
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
    confirm: () => true,
  };
  context.window = context;
  context.globalThis = context;

  vm.runInNewContext(runtimeSource, context, { filename: 'core-runtime.js' });
  assert.notEqual(context.fetch, nativeFetch, 'core-runtime.js must have installed its own Orchestrator dispatcher');

  const K = 'fiqD_';
  vm.runInContext('const K = ' + JSON.stringify(K) + ';', context);
  vm.runInContext('let driver = null;', context);
  vm.runInContext(identitySlice, context, { filename: 'index-identity-slice.js' });
  vm.runInContext(utilsSlice, context, { filename: 'index-utils-slice.js' });
  vm.runInContext(fleetConfigSyncSlice, context, { filename: 'index-fleet-config-sync-slice.js' });
  vm.runInContext(serviceLogSlice, context, { filename: 'index-service-log-slice.js' });
  assert.equal(typeof context.saveServiceLog, 'function', 'the vm must expose the real extracted saveServiceLog()');
  assert.equal(typeof context.queueFleetConfigSync, 'function', 'the vm must expose the real extracted queueFleetConfigSync()');

  // Peripheral UI stubs - not the invariant this test proves (see file
  // header). Real behavior of both is covered by other existing tests.
  context.selectedTruckId = () => 'truck_1';
  context.renderServicePage = () => {};
  context.renderTruckSelect = () => '';

  // Load sync.js AFTER the index.html slices so it can see the same
  // top-level `driver` binding via its own accessor functions - it does not
  // read the bare `driver` identifier directly, only queueFleetConfigSync()
  // does (matching production: sync.js is a separate global-scoped module).
  vm.runInNewContext(syncSource, context, { filename: 'sync.js' });
  assert.ok(context.CrewBIQSync, 'sync.js must expose CrewBIQSync on the shared context');
  assert.equal(typeof context.forceFullSync, 'function', 'sync.js must expose the real forceFullSync() globally');

  return { context, localStorage, elements, nativeCalls };
}

const { context, elements, nativeCalls } = buildContext();

// vm.runInContext-declared `let driver` is a lexical binding inside the
// sandbox, not a context property - an outside `context.driver = {...}`
// assignment would be silently invisible to code running inside the vm
// (confirmed the hard way while writing tests/write_orchestrator_expense_save.test.mjs).
// Must reassign it via vm code, and also mirror it to localStorage for any
// code path that reads the driver via storedDriver()-style direct storage
// access rather than the in-memory binding.
const driverFixture = {
  crewId: 'CBQ-WRITE-OWNER', email: 'driver@example.com', name: 'Driver',
  syncUrl: 'https://script.google.com/macros/s/example/exec',
};
vm.runInContext('driver = ' + JSON.stringify(driverFixture) + ';', context);
context.localStorage.setItem('fiqD_driver', JSON.stringify(driverFixture));
context.localStorage.setItem('fiqD_sessionToken', 'token-write-owner-1');

let loads = [];
let ptiLog = [];
let savedAllCount = 0;
context.CrewBIQSync.init({
  getDriver: () => driverFixture,
  getLoads: () => loads,
  setLoads: (v) => { loads = v; },
  getPtiLog: () => ptiLog,
  setPtiLog: (v) => { ptiLog = v; },
  saveAll: () => { savedAllCount += 1; },
  getTimer: () => null,
  setTimer: () => {},
});

context.saveServiceLog();

// Local persistence must be immediate and synchronous, independent of
// whatever the debounced network sync (queueFleetConfigSync, 800ms) does
// afterward.
const persisted = JSON.parse(context.localStorage.getItem('fiqD_data_crew_cbq_write_owner_serviceLogs') || 'null');
assert.ok(Array.isArray(persisted), 'the service-log list must be persisted to the driver-scoped local storage key synchronously');
assert.equal(persisted.length, 1, 'exactly one service-log entry must be persisted');
assert.equal(persisted[0].amount, 250, 'the entered amount must be persisted exactly as entered');
assert.equal(persisted[0].truckId, 'truck_1', 'the resolved truck attribution must be persisted with the entry');

// queueFleetConfigSync() debounces 800ms before calling the real
// forceFullSync() -> doSync({forceAll:true}) chain; wait past it.
await new Promise((resolve) => setTimeout(resolve, 900));

assert.ok(nativeCalls.length > 0, 'the debounced fleet-config sync must have attempted at least one real network call');
assert.equal(
  nativeCalls.every((call) => call.url.startsWith('https://crewbiq-orchestrator-production.up.railway.app/')),
  true,
  'every real network call triggered by the owner-entity save must target the configured Orchestrator, never script.google.com, despite driver.syncUrl naming it',
);
assert.equal(
  nativeCalls.some((call) => call.url.includes('script.google.com')),
  false,
  'no real network call may target script.google.com',
);

console.log('WRITE-ORCH-04: ok (real owner-entity (service log) save persists locally and reaches only the Orchestrator, ' + nativeCalls.length + ' native call(s))');
