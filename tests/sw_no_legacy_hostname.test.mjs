import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// SW-NO-LEGACY-01: after removing the service worker's Apps Script hostname
// bypass clause (script.google.com / googleapis.com), no cached or live PWA
// request targets those hosts — this is a cleanup regression test (proving
// removal of dead code doesn't change behavior), not an investigation of
// whether the clause was load-bearing.

const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('SW-NO-LEGACY-01 static: sw.js source contains no Apps Script hostname reference', () => {
  assert.doesNotMatch(swSource, /script\.google\.com/);
  assert.doesNotMatch(swSource, /googleapis\.com/);
  // The railway.app / POST bypass clause must remain intact — this cleanup
  // only removes the dead Apps Script clause, not the live Orchestrator one.
  assert.match(swSource, /railway\.app/);
  assert.match(swSource, /event\.request\.method === 'POST'/);
});

function buildSandbox() {
  const listeners = {};
  const caches = new Map();

  const fakeCache = {
    matched: new Map(),
    async match(request) { return this.matched.get(request.url); },
    async put(request, response) { this.matched.set(request.url, response); },
    async addAll() {},
  };

  const self = {
    addEventListener(name, handler) {
      (listeners[name] = listeners[name] || []).push(handler);
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  const cachesApi = {
    async open() { return fakeCache; },
    async keys() { return []; },
    async match(request) { return fakeCache.matched.get(request.url); },
    async delete() { return true; },
  };

  const networkCalls = [];
  async function fetchMock(request) {
    networkCalls.push(request.url);
    return { status: 200, type: 'basic', clone() { return this; } };
  }

  const context = {
    console,
    self,
    caches: cachesApi,
    fetch: fetchMock,
    URL,
    Promise,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(swSource, context, { filename: 'sw.js' });

  return { listeners, networkCalls };
}

test('SW-NO-LEGACY-01 dynamic: a request to a former Apps Script hostname is handled by the generic network-first path, not a special bypass', async () => {
  const { listeners, networkCalls } = buildSandbox();
  assert.ok(listeners.fetch && listeners.fetch.length === 1, 'sw.js must register exactly one fetch listener');

  let responded = null;
  const fakeRequest = { url: 'https://script.google.com/macros/s/example/exec', method: 'GET' };
  const fakeEvent = {
    request: fakeRequest,
    respondWith(promise) { responded = promise; },
    waitUntil() {},
  };

  listeners.fetch[0](fakeEvent);
  assert.ok(responded, 'the fetch handler must respond to a request to a former Apps Script hostname');
  await responded;

  assert.equal(networkCalls.length, 1, 'the request must still be attempted over the network (generic path), not silently dropped');
  assert.equal(networkCalls[0], fakeRequest.url);
});

test('SW-NO-LEGACY-01 dynamic: railway.app and POST requests remain the live network-only bypass', async () => {
  const { listeners, networkCalls } = buildSandbox();

  let responded = null;
  const fakeRequest = { url: 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync', method: 'POST' };
  const fakeEvent = {
    request: fakeRequest,
    respondWith(promise) { responded = promise; },
    waitUntil() {},
  };

  listeners.fetch[0](fakeEvent);
  assert.ok(responded, 'the fetch handler must respond to a railway.app POST request');
  await responded;
  assert.equal(networkCalls.length, 1, 'railway.app requests must still bypass the cache and go straight to the network');
  assert.equal(networkCalls[0], fakeRequest.url);
});

console.log('SW-NO-LEGACY-01: ok');
