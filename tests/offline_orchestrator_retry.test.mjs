import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// OFFLINE-ORCH-01, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4 / invariant 3.3: a failed authenticated Orchestrator write, while
// offline, must retain one durable operation identity and must not be
// acknowledged/removed from the pending queue until the Orchestrator
// actually confirms it; reconnect must retry through the real 'online'
// handler and must not duplicate the write. This loads the real
// core-runtime.js (Orchestrator dispatch) and offline-sync-queue.js (the
// actual pending-queue/retry mechanism) together, drives the real
// registered 'online' listener, and instruments the exact
// queue-to-core-dispatcher boundary - not just the underlying native layer,
// which core-runtime.js's own separate dedup cache can mask.

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

const listeners = new Map();
const document = { readyState: 'complete', addEventListener() {} };

// The true network layer. First invocation simulates "offline" (the request
// never completes); every later invocation simulates reconnect succeeding.
const nativeCalls = [];
let nativeCallCount = 0;
async function nativeFetch(url, init = {}) {
  nativeCallCount += 1;
  nativeCalls.push({ url: String(url), attempt: nativeCallCount });
  if (nativeCallCount === 1) {
    throw new Error('network unreachable (simulated offline)');
  }
  const body = JSON.parse((init && init.body) || '{}');
  return new Response(JSON.stringify({ ok: true, received: true, record_id: body.record_id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let doSyncCalls = [];

const context = {
  console,
  localStorage,
  document,
  fetch: nativeFetch,
  Response,
  Headers,
  Request,
  URLSearchParams,
  crypto: globalThis.crypto,
  setTimeout,
  clearTimeout,
  Date,
  Math,
};
context.window = context;
context.globalThis = context;
context.addEventListener = function (name, handler) {
  (listeners.get(name) || listeners.set(name, []).get(name)).push(handler);
};

// Load in the real production order: core-runtime.js first (installs the
// Orchestrator-dispatch fetch), then offline-sync-queue.js (wraps it with
// the pending-queue/retry mechanism) - matching core.js's own load list.
const runtime = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(runtime, context, { filename: 'core-runtime.js' });
assert.notEqual(context.fetch, nativeFetch, 'core-runtime.js must have installed its own Orchestrator dispatcher');

// Instrument the EXACT boundary offline-sync-queue.js will capture as its
// own "downstreamFetch" (core-runtime.js's dispatcher, at this point in the
// load order). Counting here proves how many attempts the QUEUE layer makes
// at the dispatcher, independent of core-runtime.js's own separate
// recentSyncRecordIds cache, which can silently absorb a duplicate BELOW
// this boundary and mask a queue-layer bug from native-layer-only counts.
const coreDispatch = context.fetch;
let downstreamCallCount = 0;
const downstreamCalls = [];
// Stable business-payload snapshot for each downstream attempt: driver,
// loads, ptiLog, and ownerData (when present), excluding only the
// legitimately transient/session fields (sessionToken, sentAt). Captured as
// a JSON string of a normalized object so the retry can be asserted to
// carry the SAME business content, not merely the same record_id label.
function businessPayloadSnapshot(body) {
  const target = body && body.payload && typeof body.payload === 'object' ? body.payload : body;
  if (!target || typeof target !== 'object') return null;
  return JSON.stringify({
    type: target.type,
    driver: target.driver,
    loads: target.loads,
    ptiLog: target.ptiLog,
    ownerData: target.ownerData,
  });
}
context.fetch = async function (input, init) {
  downstreamCallCount += 1;
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const recId = body && (body.record_id || (body.payload && body.payload.record_id));
  downstreamCalls.push({ record_id: recId, businessPayload: businessPayloadSnapshot(body) });
  return coreDispatch(input, init);
};

const queueSource = fs.readFileSync(new URL('../offline-sync-queue.js', import.meta.url), 'utf8');
vm.runInNewContext(queueSource, context, { filename: 'offline-sync-queue.js' });
assert.ok(context.CrewBIQOfflineSync, 'offline-sync-queue.js must expose CrewBIQOfflineSync on the shared context');

const onlineHandlers = listeners.get('online') || [];
assert.equal(onlineHandlers.length, 1, "offline-sync-queue.js must register exactly one real 'online' reconnect listener");

localStorage.setItem('fiqD_sessionToken', 'token-offline-1');

const recordId = 'sync_offline_test_1';
const driverReportBody = () => ({
  type: 'driver_report',
  sessionToken: 'token-offline-1',
  record_id: recordId,
  sentAt: new Date().toISOString(),
  deviceId: 'device-offline-test',
  driver: { crewId: 'CBQ-OFFLINE' },
  loads: [{ id: 'load_offline_1', synced: false }],
  ptiLog: [],
});

// sync.js's real doSync() is not loaded here (out of scope for this
// queue/dispatcher-focused test); a spy stands in for it, matching what the
// 'online' listener actually does: call global.doSync({reason:'online'}),
// which in production re-submits the same pending operation through
// pushToCloud() -> the same wrapped fetch() this test already exercises.
context.doSync = function (opts) {
  doSyncCalls.push(opts);
  return context.fetch('https://script.google.com/macros/s/example/exec', {
    method: 'POST',
    body: JSON.stringify(driverReportBody()),
  });
};

const legacyUrl = 'https://script.google.com/macros/s/example/exec';

// First attempt: the network is down. The write must be queued locally with
// its durable record_id, and the caller must be told it is pending, not
// acknowledged as successful and not silently dropped.
const firstResponse = await context.fetch(legacyUrl, {
  method: 'POST',
  body: JSON.stringify(driverReportBody()),
});
const firstData = await firstResponse.json();

assert.equal(firstResponse.status, 503, 'an offline write must be reported as pending (503), not silently swallowed or falsely acknowledged');
assert.equal(firstData.ok, false, 'a pending/offline write must not be reported as ok:true');
assert.equal(firstData.pending, true, 'the response must explicitly mark the operation as pending');
assert.equal(firstData.record_id, recordId, 'the pending response must carry the same durable record_id the caller submitted');
assert.equal(context.CrewBIQOfflineSync.pendingCount(), 1, 'exactly one operation must remain queued after the offline failure');
assert.equal(downstreamCallCount, 1, 'exactly one attempt must reach the queue-to-core dispatcher boundary (the failed one) - no retry loop on the first failure');
assert.equal(nativeCallCount, 1, 'exactly one real native network attempt must have been made');
assert.equal(nativeCalls.every((call) => !call.url.includes('script.google.com')), true, 'no real network attempt may target script.google.com despite it being the supplied URL');

// Reconnect: invoke the REAL registered 'online' handler (not a re-called
// fetch()), and prove it schedules exactly one doSync({reason:'online'})
// after its debounce delay.
onlineHandlers[0]();
await new Promise((resolve) => setTimeout(resolve, 300));

assert.equal(doSyncCalls.length, 1, "the 'online' handler must schedule exactly one doSync({reason:'online'}) call");
// Compared by field, not deepEqual against a plain object literal: opts is
// constructed inside the vm context, a different JS realm than this test's
// own object literals, so a cross-realm deepStrictEqual would spuriously
// fail on prototype identity even with matching own properties.
assert.equal(doSyncCalls[0] && doSyncCalls[0].reason, 'online', "doSync() must be invoked with the real reconnect reason, not a different or empty argument");

// The reconnect-triggered write must succeed exactly once at the
// queue-to-core boundary (this is the assertion the prior draft could not
// make: it counted only the native layer, below core-runtime.js's own
// separate dedup cache, which can silently absorb a queue-layer duplicate).
assert.equal(downstreamCallCount, 2, 'exactly one additional attempt must reach the queue-to-core dispatcher boundary for the reconnect retry - not zero (dropped) and not more than one (a queue-layer duplicate, even if core-runtime.js\'s own cache would separately absorb it)');
assert.deepEqual(
  downstreamCalls.map((call) => call.record_id),
  [recordId, recordId],
  'both dispatcher-boundary attempts must carry the SAME durable record_id - the retry must be recognized as the same operation, not a new one',
);
assert.ok(downstreamCalls[0].businessPayload, 'the first attempt must have a capturable business payload (type/driver/loads/ptiLog/ownerData)');
assert.equal(
  downstreamCalls[1].businessPayload,
  downstreamCalls[0].businessPayload,
  'the reconnect retry must carry the SAME business payload (driver, loads, ptiLog, ownerData) as the original failed attempt, not merely the same record_id label',
);
assert.equal(context.CrewBIQOfflineSync.pendingCount(), 0, 'the queue must be cleared only after the Orchestrator acknowledgement, and must be fully cleared once it arrives');
assert.equal(nativeCallCount, 2, 'exactly one additional real native network attempt (the successful retry) must have occurred');
assert.equal(nativeCalls[1].url.includes('script.google.com'), false, 'the successful retry must not target script.google.com either');

console.log('OFFLINE-ORCH-01: ok (offline write queued with durable identity, real reconnect handler drives one retry, queue cleared only on acknowledgement)');
