import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtimeSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
const queueSource = fs.readFileSync(new URL('../offline-sync-queue.js', import.meta.url), 'utf8');
const legacySyncUrl = 'https://script.google.com/macros/s/example/exec';
const queueKey = 'fiqD_pendingSyncOperations';

function storageFrom(map, options = {}) {
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) {
      if (options.failQueueWrites && key === queueKey) throw new Error('quota');
      map.set(key, String(value));
    },
    removeItem(key) {
      if (options.failQueueWrites && key === queueKey) throw new Error('quota');
      map.delete(key);
    },
  };
}

function makeContext({ storageMap, nativeFetch, failQueueWrites = false, doSync } = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const document = {
    readyState: 'loading',
    addEventListener(name, handler) { documentListeners.set(name, handler); },
  };
  const context = {
    console,
    localStorage: storageFrom(storageMap, { failQueueWrites }),
    document,
    fetch: nativeFetch,
    Response,
    Headers,
    Request,
    setTimeout,
    clearTimeout,
    addEventListener(name, handler) { windowListeners.set(name, handler); },
    doSync,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(runtimeSource, context, { filename: 'core-runtime.js' });
  vm.runInNewContext(queueSource, context, { filename: 'offline-sync-queue.js' });
  return { context, documentListeners, windowListeners };
}

function payload(recordId, notes = 'unchanged', timestamps = '2026-07-13T15:00:00Z') {
  return {
    type: 'driver_report',
    sessionToken: 'session-token-canary',
    record_id: recordId,
    sentAt: timestamps,
    deviceId: 'offline-device-a',
    driver: {
      crewId: 'CBQ-CLIENT-IGNORED',
      ownerKey: 'client-owner-ignored',
      email: 'driver@example.test',
    },
    profile: {
      updatedAt: timestamps,
      driver: { crewId: 'CBQ-CLIENT-IGNORED' },
    },
    loads: [{
      id: 'e2e-offline-load-1',
      loadId: 'E2E-OFFLINE-LOAD-1',
      notes,
      gross: 1000,
      loadedMiles: 500,
      updatedAt: timestamps,
      synced: false,
    }],
    ptiLog: [],
    ownerData: null,
  };
}

function post(context, body) {
  return context.fetch(legacySyncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
}

// Unchanged content after reload reuses the first durable operation identity.
{
  const storageMap = new Map([['fiqD_sessionToken', 'session-token-canary']]);
  const attempted = [];
  const successful = [];
  let failFirst = true;
  const nativeFetch = async (url, init = {}) => {
    assert.equal(String(url), 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync/pwa');
    const body = JSON.parse(init.body);
    attempted.push(body.record_id);
    if (failFirst) {
      failFirst = false;
      throw new TypeError('Failed to fetch');
    }
    successful.push(body);
    return new Response(JSON.stringify({ ok: true, record_id: body.record_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const first = makeContext({ storageMap, nativeFetch });
  const failed = await post(first.context, payload('sync-offline-original'));
  const failedBody = await failed.json();
  assert.equal(failed.status, 503);
  assert.equal(failedBody.pending, true);
  assert.equal(first.context.CrewBIQOfflineSync.pendingCount(), 1);

  const rawQueue = storageMap.get(queueKey);
  assert.ok(rawQueue);
  assert.equal(rawQueue.includes('session-token-canary'), false);
  assert.equal(rawQueue.toLowerCase().includes('password'), false);
  const queued = JSON.parse(rawQueue);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].record_id, 'sync-offline-original');
  assert.equal(queued[0].payload.record_id, 'sync-offline-original');
  assert.equal(Object.hasOwn(queued[0].payload, 'sessionToken'), false);

  const reloaded = makeContext({ storageMap, nativeFetch });
  const retried = await post(
    reloaded.context,
    payload('sync-new-attempt-must-not-win', 'unchanged', '2026-07-13T15:05:00Z'),
  );
  const retriedBody = await retried.json();
  assert.equal(retried.status, 200);
  assert.equal(retriedBody.record_id, 'sync-offline-original');
  assert.equal(storageMap.has(queueKey), false);
  assert.equal(reloaded.context.CrewBIQOfflineSync.pendingCount(), 0);
  assert.deepEqual(attempted, ['sync-offline-original', 'sync-offline-original']);
  assert.equal(successful.length, 1);
  assert.equal(successful[0].record_id, 'sync-offline-original');
  assert.equal(Object.hasOwn(successful[0], 'sessionToken'), false);
}

// Newer business content is a later FIFO operation, not silently marked as the old retry.
{
  const storageMap = new Map([['fiqD_sessionToken', 'session-token-canary']]);
  const successfulIds = [];
  let offline = true;
  const nativeFetch = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    if (offline) throw new TypeError('offline');
    successfulIds.push(body.record_id);
    return new Response(JSON.stringify({ ok: true, record_id: body.record_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const first = makeContext({ storageMap, nativeFetch });
  assert.equal((await post(first.context, payload('sync-fifo-old', 'old-notes'))).status, 503);
  offline = false;
  const second = makeContext({ storageMap, nativeFetch });
  const response = await post(second.context, payload('sync-fifo-new', 'newer-notes'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.record_id, 'sync-fifo-new');
  assert.deepEqual(successfulIds, ['sync-fifo-old', 'sync-fifo-new']);
  assert.equal(storageMap.has(queueKey), false);
}

// Persistence failure blocks network mutation instead of sending an unqueued operation.
{
  const storageMap = new Map([['fiqD_sessionToken', 'session-token-canary']]);
  let networkCalls = 0;
  const nativeFetch = async () => {
    networkCalls += 1;
    throw new Error('must not be reached');
  };
  const blocked = makeContext({ storageMap, nativeFetch, failQueueWrites: true });
  const response = await post(blocked.context, payload('sync-storage-failure'));
  const data = await response.json();
  assert.equal(response.status, 409);
  assert.equal(data.pending, true);
  assert.equal(data.reason, 'storage_unavailable');
  assert.equal(networkCalls, 0);
}

// Browser reconnect requests one guarded application sync when a pending entry exists.
{
  const storageMap = new Map([['fiqD_sessionToken', 'session-token-canary']]);
  let offline = true;
  const nativeFetch = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    if (offline) throw new TypeError('offline');
    return new Response(JSON.stringify({ ok: true, record_id: body.record_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const first = makeContext({ storageMap, nativeFetch });
  assert.equal((await post(first.context, payload('sync-online-event'))).status, 503);

  let syncCalls = 0;
  const reloaded = makeContext({
    storageMap,
    nativeFetch,
    doSync() { syncCalls += 1; },
  });
  const online = reloaded.windowListeners.get('online');
  assert.equal(typeof online, 'function');
  online();
  online();
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(syncCalls, 1);
}

console.log('offline sync queue contract: ok');
