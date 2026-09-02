import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// PTI-LOCKOUT-01, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4 / invariant 3.1: an unavailable or failing Orchestrator must not
// prevent local PTI completion or leave the mandatory blocker active. This
// exercises the real pti.js submitPTI()/needsPTI() functions end-to-end
// (not a restated claim about them) with global.syncPTIEntry rejecting every
// call, simulating the Orchestrator being unreachable.

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

function fakeInput(value) {
  return {
    value,
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    textContent: '',
    addEventListener() {},
  };
}

const elements = {
  ptiOdometer: fakeInput('500123'),
  ptiTruckSelect: fakeInput(''),
  ptiDriverSelect: fakeInput(''),
  ptiIssueText: fakeInput(''),
  ptiBlocker: { classList: { removed: false, add() {}, remove() { this.removed = true; } } },
  app: { classList: { add() {}, remove() {} } },
};

const document = {
  readyState: 'complete',
  addEventListener() {},
  getElementById(id) {
    if (!elements[id]) elements[id] = fakeInput('');
    return elements[id];
  },
};

// Simulate an unreachable Orchestrator at the network layer: every fetch
// rejects. This exercises sync.js's REAL syncPTIEntry(), including its own
// internal try/catch, rather than assuming/mocking that it swallows errors.
let nativeFetchCalls = 0;
async function failingFetch() {
  nativeFetchCalls += 1;
  throw new Error('Orchestrator unreachable (simulated network failure)');
}

const context = {
  console,
  localStorage,
  document,
  fetch: failingFetch,
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

const runtime = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(runtime, context, { filename: 'core-runtime.js' });

const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
vm.runInNewContext(syncSource, context, { filename: 'sync.js' });
assert.ok(context.CrewBIQSync, 'sync.js must expose CrewBIQSync on the shared context');
assert.equal(typeof context.syncPTIEntry, 'function', 'sync.js must expose the real syncPTIEntry() globally');

const ptiSource = fs.readFileSync(new URL('../pti.js', import.meta.url), 'utf8');
vm.runInNewContext(ptiSource, context, { filename: 'pti.js' });
assert.ok(context.CrewBIQPTI, 'pti.js must expose CrewBIQPTI on the shared context');

const driver = { crewId: 'CBQ-LOCKOUT', ptiEnabled: true, ptiSchedule: 'daily', syncUrl: 'https://script.google.com/macros/s/example/exec' };
let loads = [];
let ptiLog = [];
let ptiCustom = [];
let savedAllCount = 0;

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

localStorage.setItem('fiqD_sessionToken', 'token-lockout-1');

context.CrewBIQPTI.init({
  getDriver: () => driver,
  getPtiLog: () => ptiLog,
  setPtiLog: (v) => { ptiLog = v; },
  getPtiCustom: () => ptiCustom,
  setPtiCustom: (v) => { ptiCustom = v; },
  saveAll: () => { savedAllCount += 1; },
});

// Before submission: PTI is due for today (no entry logged yet).
assert.equal(context.needsPTI(), true, 'needsPTI() must report the blocker is due before any submission');

// Submit PTI while the Orchestrator is unreachable. submitPTI() does not
// await syncPTIEntry() (fire-and-forget), so this call must complete
// synchronously and must not throw despite the sync rejecting.
assert.doesNotThrow(() => context.submitPTI(), 'submitPTI() must not throw even though the Orchestrator sync will fail');

// Give the fire-and-forget rejected promise a turn to settle so an
// unhandled-rejection crash (if any regression introduced one) would surface
// before the test's own assertions run.
await new Promise((resolve) => setTimeout(resolve, 0));

// Discovered while writing this test: PTI submission triggers two separate
// network attempts against the Orchestrator - syncPTIEntry()'s own direct
// fetch, plus sync.js's registerEventForwarders() reacting to the
// 'pti:submitted' event it emits via forwardEventToOrchestrator(). Both must
// independently fail gracefully (confirmed by the "syncPTIEntry silent
// fail" and "event forward failed" log lines above, neither of which
// crashed or rejected up to this test).
assert.equal(nativeFetchCalls, 2, 'both syncPTIEntry() and the pti:submitted event-forwarder must have attempted (and failed gracefully at) exactly one network call each');
assert.equal(ptiLog.length, 1, 'the PTI entry must be persisted to local ptiLog synchronously, independent of sync outcome');
assert.equal(savedAllCount, 1, 'saveAll() must have been called to persist the local write');
assert.equal(
  elements.ptiBlocker.classList.removed,
  true,
  'the mandatory PTI blocker must be cleared (classList "show" removed) even though sync failed',
);

// The blocker being cleared is necessary but not sufficient — needsPTI()
// itself must now report false, since it is what boot() consults to decide
// whether to re-show the blocker on the next check.
assert.equal(
  context.needsPTI(),
  false,
  "needsPTI() must become false for today's cadence after local submission, regardless of sync failure",
);

// No canonical identity may be fabricated: attribution authority was never
// set to 'available' in this test (populatePTIAttributionSelectors() was
// never called), so the entry must be saved WITHOUT workspaceId/truckId/
// driverId rather than guessing them from the empty select values.
const entry = ptiLog[0];
assert.equal(Object.hasOwn(entry, 'workspaceId'), false, 'no workspaceId may be fabricated when canonical attribution is unavailable');
assert.equal(Object.hasOwn(entry, 'truckId'), false, 'no truckId may be fabricated when canonical attribution is unavailable');
assert.equal(Object.hasOwn(entry, 'driverId'), false, 'no driverId may be fabricated when canonical attribution is unavailable');

console.log('PTI-LOCKOUT-01: ok (local completion and blocker clear survive a failing Orchestrator sync)');
