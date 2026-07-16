import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../offline-sync-queue.js', import.meta.url), 'utf8');
const queueKey = 'fiqD_pendingSyncOperations';

function storageFrom(map) {
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function makeContext(nativeFetch) {
  const storage = new Map([['fiqD_sessionToken', 'session-token-canary']]);
  const listeners = new Map();
  const context = {
    console,
    localStorage: storageFrom(storage),
    document: { readyState: 'complete', addEventListener() {} },
    fetch: nativeFetch,
    Response,
    Headers,
    Request,
    setTimeout,
    clearTimeout,
    addEventListener(name, handler) { listeners.set(name, handler); },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'offline-sync-queue.js' });
  return { context, storage, listeners };
}

function payload(recordId) {
  return {
    type: 'driver_report',
    sessionToken: 'session-token-canary',
    record_id: recordId,
    deviceId: 'terminal-409-device',
    driver: { crewId: 'CBQ-CLIENT-IGNORED' },
    loads: [],
    ptiLog: [],
    ownerData: null,
  };
}

async function post(context, body) {
  return context.fetch('https://example.test/v1/sync/pwa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// A permanent ownership/idempotency conflict is not an offline condition.
{
  const upstreamBody = { detail: 'Entity ID is already owned by another tenant' };
  let calls = 0;
  const { context, storage, listeners } = makeContext(async () => {
    calls += 1;
    return new Response(JSON.stringify(upstreamBody), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const response = await post(context, payload('sync-terminal-409'));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), upstreamBody);
  assert.equal(calls, 1);
  assert.equal(storage.has(queueKey), false);
  assert.equal(context.CrewBIQOfflineSync.pendingCount(), 0);

  const online = listeners.get('online');
  assert.equal(typeof online, 'function');
  online();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(calls, 1, 'terminal 409 must not retry after reconnect');
}

// A retryable server failure remains durable and pending.
{
  const { context, storage } = makeContext(async () => new Response(
    JSON.stringify({ detail: 'temporary failure' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  ));

  const response = await post(context, payload('sync-retryable-503'));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.pending, true);
  assert.equal(body.upstream_status, 503);
  assert.equal(storage.has(queueKey), true);
  assert.equal(context.CrewBIQOfflineSync.pendingCount(), 1);
}

console.log('offline sync terminal 409 contract: ok');
