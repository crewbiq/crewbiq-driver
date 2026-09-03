import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// DOSYNC-SIMPLIFY-01: doSync()'s two-step push (formerly pushToCloud() then,
// conditionally, pushToOrchestrator() — both reaching the same real
// Orchestrator /v1/sync surface and deduplicated by record_id) is now
// collapsed into a single call to pushToOrchestrator(). This proves the
// simplified path produces the same observable request/response behavior as
// the real (non-duplicate) write of the former two-step path: exactly one
// real native call, carrying the same request/response shape, for the same
// inputs — a regression guard for the cleanup itself, not a new behavior.

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

const fakeElement = {
  classList: { add() {}, remove() {}, toggle() {} },
  textContent: '',
  style: {},
};
const document = {
  readyState: 'complete',
  addEventListener() {},
  getElementById() { return fakeElement; },
};

const nativeSyncCalls = [];
async function nativeFetchMock(url, init = {}) {
  const call = {
    url: String(typeof url === 'string' ? url : (url && url.url) || ''),
    method: String((init && init.method) || 'GET').toUpperCase(),
    body: typeof (init && init.body) === 'string' ? init.body : '',
  };
  if (call.url.includes('/v1/sync')) {
    nativeSyncCalls.push(call);
    const body = JSON.parse(call.body || '{}');
    const recordId = (body.payload && body.payload.record_id) || body.record_id || 'unknown';
    return new Response(JSON.stringify({ ok: true, received: true, record_id: recordId }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  throw new Error('Unexpected native fetch call in DOSYNC-SIMPLIFY-01 test: ' + call.method + ' ' + call.url);
}

const CoreEventsStub = {
  _listeners: {},
  on(event, handler) {
    (this._listeners[event] = this._listeners[event] || []).push(handler);
  },
  emit(event, payload) {
    (this._listeners[event] || []).forEach(h => { try { h(payload); } catch (e) {} });
  },
};

const context = {
  console,
  localStorage,
  document,
  fetch: nativeFetchMock,
  Response,
  Headers,
  Request,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  Math,
  Date,
};
context.window = context;
context.globalThis = context;

const runtime = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(runtime, context, { filename: 'core-runtime.js' });
assert.notEqual(context.fetch, nativeFetchMock, 'core-runtime must have installed its own dispatcher');

const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
vm.runInNewContext(syncSource, context, { filename: 'sync.js' });
assert.ok(context.CrewBIQSync, 'sync.js must expose CrewBIQSync on the shared context');

localStorage.setItem('fiqD_sessionToken', 'token-dedup-1');

const driver = { crewId: 'CBQ-DEDUP' };
let loads = [{ id: 'load_1', synced: false, gross: 100 }];
let ptiLog = [];
let disputes = [];
let savedAllCount = 0;

context.CrewBIQSync.init({
  getDriver: () => driver,
  getLoads: () => loads,
  setLoads: (v) => { loads = v; },
  getPtiLog: () => ptiLog,
  setPtiLog: (v) => { ptiLog = v; },
  getDisputes: () => disputes,
  setDisputes: (v) => { disputes = v; },
  saveAll: () => { savedAllCount += 1; },
  getTimer: () => null,
  setTimer: () => {},
});

const result = await context.CrewBIQSync.doSync();

assert.equal(result.ok, true, 'doSync() should report success: ' + JSON.stringify(result));
assert.equal(
  nativeSyncCalls.length,
  1,
  'expected exactly ONE real network call to the Orchestrator /v1/sync surface for one doSync() run, got ' + nativeSyncCalls.length,
);

const firstBody = JSON.parse(nativeSyncCalls[0].body);
const firstRecordId = firstBody.payload ? firstBody.payload.record_id : firstBody.record_id;
assert.ok(firstRecordId, 'the single real call must carry a record_id');
assert.equal(firstBody.source, 'crewbiq_driver', 'the request wrapper shape (source/deviceId/sentAt/payload) must be unchanged by the collapse');
assert.ok(firstBody.deviceId, 'the request wrapper must still carry deviceId');
assert.ok(firstBody.sentAt, 'the request wrapper must still carry sentAt');
assert.equal(firstBody.payload.loads.length, 1, 'the single write must carry the same payload shape (loads array) as before');

// The single-native-call count alone doesn't prove pushToOrchestrator() was
// actually invoked and its result surfaced — it would also be 1 if a bug
// silently swallowed the write's own confirmation. Assert directly on
// doSync()'s own returned orchestratorCopy so a regression that silently
// drops or misreports the write is caught.
assert.ok(result.orchestratorCopy, 'doSync() must return an orchestratorCopy from its (sole) push step');
assert.equal(result.orchestratorCopy.ok, true, 'the sole push step must have succeeded');
assert.equal(result.orchestratorCopy.skipped, undefined, 'the sole push step must not have been skipped (e.g. no_orchestrator_url)');
assert.equal(
  result.orchestratorCopy.result && result.orchestratorCopy.result.client_deduplicated,
  undefined,
  'a single collapsed write is a fresh write, not a dedup of a prior legacy call — client_deduplicated must not be set',
);
assert.equal(
  result.orchestratorCopy.result && result.orchestratorCopy.result.record_id,
  firstRecordId,
  'the returned orchestratorCopy must reference the same record_id as the one real native write',
);
assert.equal(result.push.pushedLoads, 1, 'push bookkeeping (pushedLoads) must still reflect the pushed record count after the collapse');
assert.equal(loads[0].synced, true, 'the local record must be marked synced after a successful sole write, exactly as the former two-step path did');
assert.equal(savedAllCount > 0, true, 'local state must still be persisted after a successful write');

console.log('DOSYNC-SIMPLIFY-01: ok (single collapsed Orchestrator write, native /v1/sync calls: ' + nativeSyncCalls.length + ')');

// ── DOSYNC-SIMPLIFY-01 (failure path) ───────────────────────────────────────
//
// The collapse removes doSync()'s former legacy write; the Orchestrator is now
// the SOLE durable authority (invariant §3.2 of LEGACY_SYNC_DECOMMISSION_CONTRACT.md).
// A failed sole write must therefore behave like the old code's failure path
// (which always threw from pushToCloud() on a genuine failure): stop before
// the pull step, emit sync:error (not sync:success), not mark anything synced,
// and report {ok:false}. This is a materially different code path from the
// success case above and was not covered until this test — the collapse's
// SUCCESS-path equivalence to the old two-step flow does not by itself prove
// its FAILURE-path equivalence.

const nativeSyncCallsFail = [];
async function nativeFetchMockFail(url, init = {}) {
  const call = {
    url: String(typeof url === 'string' ? url : (url && url.url) || ''),
    method: String((init && init.method) || 'GET').toUpperCase(),
    body: typeof (init && init.body) === 'string' ? init.body : '',
  };
  if (call.url.includes('/v1/sync')) {
    nativeSyncCallsFail.push(call);
    return new Response(JSON.stringify({ ok: false, error: 'simulated Orchestrator failure' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  throw new Error('Unexpected native fetch call in DOSYNC-SIMPLIFY-01 failure-path test: ' + call.method + ' ' + call.url);
}

const eventsFail = [];

const storageMapFail = new Map();
const localStorageFail = {
  getItem(key) { return storageMapFail.has(key) ? storageMapFail.get(key) : null; },
  setItem(key, value) { storageMapFail.set(key, String(value)); },
  removeItem(key) { storageMapFail.delete(key); },
};

let toastMessages = [];
const contextFail = {
  console,
  localStorage: localStorageFail,
  document,
  fetch: nativeFetchMockFail,
  Response,
  Headers,
  Request,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  Math,
  Date,
  toast: (msg) => { toastMessages.push(msg); },
};
contextFail.window = contextFail;
contextFail.globalThis = contextFail;

vm.runInNewContext(runtime, contextFail, { filename: 'core-runtime.js' });
vm.runInNewContext(syncSource, contextFail, { filename: 'sync.js' });

contextFail.CrewBIQCore.events.on('sync:success', () => eventsFail.push('sync:success'));
contextFail.CrewBIQCore.events.on('sync:error', () => eventsFail.push('sync:error'));

localStorageFail.setItem('fiqD_sessionToken', 'token-dedup-2');

const driverFail = { crewId: 'CBQ-DEDUP-FAIL' };
let loadsFail = [{ id: 'load_fail_1', synced: false, gross: 200 }];
let ptiLogFail = [];
let disputesFail = [];
let savedAllCountFail = 0;

contextFail.CrewBIQSync.init({
  getDriver: () => driverFail,
  getLoads: () => loadsFail,
  setLoads: (v) => { loadsFail = v; },
  getPtiLog: () => ptiLogFail,
  setPtiLog: (v) => { ptiLogFail = v; },
  getDisputes: () => disputesFail,
  setDisputes: (v) => { disputesFail = v; },
  saveAll: () => { savedAllCountFail += 1; },
  getTimer: () => null,
  setTimer: () => {},
});

const failResult = await contextFail.CrewBIQSync.doSync();

assert.equal(failResult.ok, false, 'doSync() must report failure when the sole Orchestrator write fails: ' + JSON.stringify(failResult));
assert.ok(failResult.error, 'doSync() must surface an error message on sole-write failure');
assert.equal(
  nativeSyncCallsFail.length,
  1,
  'a failed write must not be retried within the same doSync() call, and must not be followed by a pull attempt',
);
assert.equal(loadsFail[0].synced, false, 'a failed sole write must NOT mark the local record as synced (it is pending/retryable, not durably saved)');
assert.equal(eventsFail.includes('sync:success'), false, 'a failed sole write must not emit sync:success');
assert.ok(eventsFail.includes('sync:error'), 'a failed sole write must emit sync:error');
assert.ok(
  toastMessages.some(m => /Sync failed/i.test(m)),
  'the user-facing toast must reflect a real failure, not a masked partial success',
);

console.log('DOSYNC-SIMPLIFY-01 (failure path): ok (sole write failure stops before pull, no synced-marking, sync:error emitted)');
