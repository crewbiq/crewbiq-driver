import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// WRITE-ORCH-01, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4: a load save must persist immediately to local storage and
// reach only the Orchestrator over the network, never script.google.com.
// This exercises the REAL saveLoad() from loads.js (not a restated claim
// about it), wired to the REAL doSync()/pushToCloud()/pushToOrchestrator()
// from sync.js and the REAL core-runtime.js dispatcher, matching
// index.html's own actual initLoads() injection (doSync: () => doSync()).

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

function fakeInput(value) {
  return { value, classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: '', addEventListener() {} };
}

const elements = {
  loadId: fakeInput('AMZ-100'),
  loadedMiles: fakeInput('500'),
  grossInput: fakeInput('1250.00'),
  deadMiles: fakeInput('20'),
  detentionPay: fakeInput('0'),
  layoverPay: fakeInput('0'),
  loadEditId: fakeInput('l_existing_1'), // editing, not creating - see rationale below
  pickupDate: fakeInput('2026-09-01'),
  deliveryDate: fakeInput('2026-09-02'),
  pickupLocation: fakeInput('Origin, ST'),
  deliveryLocation: fakeInput('Destination, ST'),
  loadNotes: fakeInput(''),
  loadTruckSelect: fakeInput('truck_1'),
  loadTruckRow: { style: {} },
  loadDriverSelect: fakeInput(''),
  loadDriverRow: { style: {} },
  loadPreview: { innerHTML: '' },
  saveLoadBtn: { textContent: '' },
  cancelEditBtn: { style: {} },
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
  throw new Error('Unexpected native fetch in WRITE-ORCH-01: ' + call.method + ' ' + call.url);
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

// Real fleet composition dependency saveLoad() calls directly (not injected
// via init()): getOwnerTrucks() reads global.loadTrucks(). One active truck
// is enough for resolveNewLoadTruckAttribution() to succeed, which runs
// even on an edit.
context.loadTrucks = () => [{ id: 'truck_1', unitNumber: '10', active: true }];

// Load in the real production order: core-runtime.js first (installs the
// Orchestrator dispatcher), matching core.js's own load list, before sync.js
// or loads.js ever run.
const runtime = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(runtime, context, { filename: 'core-runtime.js' });
assert.notEqual(context.fetch, nativeFetch, 'core-runtime.js must have installed its own Orchestrator dispatcher');

const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
vm.runInNewContext(syncSource, context, { filename: 'sync.js' });
assert.ok(context.CrewBIQSync, 'sync.js must expose CrewBIQSync on the shared context');

const loadsSource = fs.readFileSync(new URL('../loads.js', import.meta.url), 'utf8');
vm.runInNewContext(loadsSource, context, { filename: 'loads.js' });
assert.ok(context.CrewBIQLoads, 'loads.js must expose CrewBIQLoads on the shared context');
assert.equal(typeof context.CrewBIQLoads.saveLoad, 'function', 'the vm must expose the real saveLoad()');

localStorage.setItem('fiqD_sessionToken', 'token-write-1');

const driver = {
  crewId: 'CBQ-WRITE', email: 'driver@example.com', name: 'Driver', payType: 'cpm',
  syncUrl: 'https://script.google.com/macros/s/example/exec',
};
let loads = [{
  id: 'l_existing_1', loadId: 'AMZ-100', gross: 900, loadedMiles: 400, deadMiles: 10,
  totalMiles: 410, driverPay: 0, detention: 0, layover: 0,
  pickup: '2026-08-30', delivery: '2026-08-31',
  pickupLocation: 'Old Origin', deliveryLocation: 'Old Destination', notes: '',
  unitNumber: '10', driverName: 'Driver', ownerKey: 'crew_cbq_write', crewId: 'CBQ-WRITE',
  driverEmail: 'driver@example.com', status: 'active', adjAmount: 0, synced: true,
  truckId: 'truck_1',
}];
let ptiLog = [];
let savedAllCount = 0;
let renderAllCount = 0;

context.CrewBIQSync.init({
  getDriver: () => driver,
  getLoads: () => loads,
  setLoads: (v) => { loads = v; },
  getPtiLog: () => ptiLog,
  setPtiLog: (v) => { ptiLog = v; },
  saveAll: () => { savedAllCount += 1; },
  getTimer: () => null,
  setTimer: () => {},
});

context.CrewBIQLoads.init({
  getDriver: () => driver,
  getLoads: () => loads,
  setLoads: (v) => { loads = v; },
  getPtiLog: () => ptiLog,
  saveAll: () => { savedAllCount += 1; },
  doSync: () => context.CrewBIQSync.doSync(), // matches index.html's own initLoads(): doSync: () => doSync()
  renderAll: () => { renderAllCount += 1; },
  getWorkspaceContext: () => null,
  readWorkspaceDriverRoster: null,
});

const savedAllBefore = savedAllCount;

context.CrewBIQLoads.saveLoad();

// Local persistence must be immediate and synchronous - true regardless of
// what doSync()'s fire-and-forget network call does afterward.
assert.equal(loads.length, 1, 'editing an existing load must not create a duplicate entry');
assert.equal(loads[0].id, 'l_existing_1');
assert.equal(loads[0].gross, 1250, 'the edited gross amount must be persisted locally immediately');
assert.equal(loads[0].loadedMiles, 500, 'the edited loaded-miles amount must be persisted locally immediately');
assert.ok(savedAllCount > savedAllBefore, 'saveAll() must be called synchronously as part of the save, before any network result is known');
assert.equal(renderAllCount, 1, 'the UI must re-render exactly once after the save');

// The doSync() call saveLoad() fires is not awaited (fire-and-forget, same
// pattern as PTI submission) - give its promise chain a turn to settle
// before asserting on network behavior.
await new Promise((resolve) => setTimeout(resolve, 0));

assert.ok(nativeCalls.length > 0, 'the real doSync()/pushToCloud()/pushToOrchestrator() chain must have attempted at least one real network call');
assert.equal(
  nativeCalls.every((call) => call.url.startsWith('https://crewbiq-orchestrator-production.up.railway.app/')),
  true,
  'every real network call triggered by the load save must target the configured Orchestrator, never script.google.com, despite driver.syncUrl naming it',
);
assert.equal(
  nativeCalls.some((call) => call.url.includes('script.google.com')),
  false,
  'no real network call may target script.google.com',
);

console.log('WRITE-ORCH-01: ok (real load save persists locally and reaches only the Orchestrator, ' + nativeCalls.length + ' native call(s))');
