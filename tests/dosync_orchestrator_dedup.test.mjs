import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Proves the doSync() two-step push (pushToCloud() then, conditionally,
// pushToOrchestrator()) does not produce two real writes to the Orchestrator
// for the same record. Both steps ultimately call the SAME core-runtime.js
// routedFetch (installed as global.fetch before sync.js ever runs), which
// deduplicates by record_id within a short window and returns
// client_deduplicated:true for the second call without making a second
// request to the real Orchestrator. This test asserts that dynamically by
// counting actual native network calls, not by re-reading the source.

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
  throw new Error('Unexpected native fetch call in dedup test: ' + call.method + ' ' + call.url);
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

const driver = { crewId: 'CBQ-DEDUP', syncUrl: 'https://script.google.com/macros/s/example/exec' };
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
assert.equal(nativeSyncCalls[0].url.includes('script.google.com'), false);

const firstBody = JSON.parse(nativeSyncCalls[0].body);
const firstRecordId = firstBody.payload ? firstBody.payload.record_id : firstBody.record_id;
assert.ok(firstRecordId, 'the deduplicated real call must still carry the original record_id');

// The one-native-call count alone doesn't prove the second push actually ran
// and was deduplicated — it would also be 1 if pushToOrchestrator() were
// never called at all. Assert directly on doSync()'s own returned
// orchestratorCopy so a regression that silently drops the second push is
// caught, not just a regression that removes dedup.
assert.ok(result.orchestratorCopy, 'doSync() must return an orchestratorCopy from its second push step');
assert.equal(result.orchestratorCopy.ok, true, 'the second push step must have succeeded (been deduplicated, not skipped or failed)');
assert.equal(result.orchestratorCopy.skipped, undefined, 'the second push step must not have been skipped (e.g. no_orchestrator_url)');
assert.equal(
  result.orchestratorCopy.result && result.orchestratorCopy.result.client_deduplicated,
  true,
  'the second push step must have been recognized as a duplicate of the first by record_id, not treated as a distinct new write',
);
assert.equal(
  result.orchestratorCopy.result && result.orchestratorCopy.result.record_id,
  firstRecordId,
  'the deduplicated second push must reference the same record_id as the one real native write',
);

console.log('doSync() Orchestrator dedup contract: ok (native /v1/sync calls: ' + nativeSyncCalls.length + ')');
