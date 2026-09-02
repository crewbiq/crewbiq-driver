import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// OFFLINE-ORCH-01, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4 / invariant 3.3: a failed authenticated Orchestrator write, while
// offline, must retain one durable operation identity and must not be
// acknowledged/removed from the pending queue until the Orchestrator
// actually confirms it; the retry must not duplicate the write. This loads
// the real core-runtime.js (Orchestrator dispatch) and offline-sync-queue.js
// (the actual pending-queue/retry mechanism) together and drives them
// end-to-end - it does not restate claims about their behavior.

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

const listeners = new Map();
const document = { readyState: 'complete', addEventListener() {} };

// The true network layer. First invocation simulates "offline" (the request
// never completes); second invocation simulates reconnect succeeding.
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

const queueSource = fs.readFileSync(new URL('../offline-sync-queue.js', import.meta.url), 'utf8');
vm.runInNewContext(queueSource, context, { filename: 'offline-sync-queue.js' });
assert.ok(context.CrewBIQOfflineSync, 'offline-sync-queue.js must expose CrewBIQOfflineSync on the shared context');

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
assert.equal(nativeCallCount, 1, 'exactly one real network attempt must have been made (the failed one) - no retry loop on the first failure');
assert.equal(nativeCalls.every((call) => !call.url.includes('script.google.com')), true, 'no real network attempt may target script.google.com despite it being the supplied URL');

// Second attempt: reconnect. Submitting the SAME operation again (same
// canonical identity, ignoring volatile fields like sentAt) must reuse the
// existing queued entry rather than enqueueing a duplicate, and must result
// in exactly one additional real network attempt that succeeds and clears
// the queue - not an extra retry, and not a second competing write.
//
// Discovered while mutation-testing this assertion: this "no duplicate
// write" outcome is defended at two independent layers, not one -
// offline-sync-queue.js's own same-identity reuse in enqueue(), AND
// core-runtime.js's separate recentSyncRecordIds cache in adaptSync(),
// which also recognizes a repeated record_id within its own window and
// returns client_deduplicated:true without a second native call. Removing
// only the offline-queue layer's reuse check did not make this specific
// assertion fail, because core-runtime's cache still caught the would-be
// duplicate before it reached the native fetch layer. This assertion
// therefore proves the invariant that matters (no duplicate write reaches
// the Orchestrator), but does not in isolation prove offline-sync-queue.js's
// own reuse-by-identity logic specifically - only removing the durable
// write acknowledgement (see the failed-request assertions above, verified
// by mutation to actually catch a silently-dropped pending write) was
// confirmed as this test's primary regression guard.
const secondResponse = await context.fetch(legacyUrl, {
  method: 'POST',
  body: JSON.stringify(driverReportBody()),
});
const secondData = await secondResponse.json();

assert.equal(secondResponse.status, 200, 'the retried write must succeed once the Orchestrator is reachable again');
assert.equal(secondData.ok, true, 'the retried write must be acknowledged as ok:true only after the Orchestrator actually confirms it');
assert.equal(secondData.record_id, recordId, 'the successful retry must confirm the SAME durable record_id submitted before the failure - not a new, different operation');
assert.equal(context.CrewBIQOfflineSync.pendingCount(), 0, 'the queue must be cleared only after the Orchestrator acknowledgement, and must be fully cleared once it arrives');
assert.equal(nativeCallCount, 2, 'exactly one additional real network attempt (the successful retry) must have occurred - not zero (silently dropped) and not more than one (duplicate write)');
assert.equal(nativeCalls[1].url.includes('script.google.com'), false, 'the successful retry must not target script.google.com either');

console.log('OFFLINE-ORCH-01: ok (offline write queued with durable identity, single successful retry, queue cleared only on acknowledgement)');
