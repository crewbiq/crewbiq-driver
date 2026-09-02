import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

// SW-NO-LEGACY-01: after removing the service worker's Apps Script hostname
// bypass clause (script.google.com / googleapis.com), no cached or live PWA
// request targets those hosts — this is a cleanup regression test (proving
// removal of dead code doesn't change behavior), not an investigation of
// whether the clause was load-bearing.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('SW-NO-LEGACY-01 static: sw.js source contains no Apps Script hostname reference', () => {
  assert.doesNotMatch(swSource, /script\.google\.com/);
  assert.doesNotMatch(swSource, /googleapis\.com/);
  // The railway.app / POST bypass clause must remain intact — this cleanup
  // only removes the dead Apps Script clause, not the live Orchestrator one.
  assert.match(swSource, /railway\.app/);
  assert.match(swSource, /event\.request\.method === 'POST'/);
});

// Per LEGACY_SYNC_DECOMMISSION_CONTRACT.md §5 gate 3, the required static
// claim is not "sw.js alone is clean" but "the PWA's own shipped code, at the
// exact commit under review, contains no remaining source reference that can
// construct a request to script.google.com/googleapis.com". sw.js's own
// APP_SHELL array is the canonical, already-existing list of exactly which
// files are shipped — reuse it directly rather than re-deriving or
// hand-maintaining a second list that could drift from it.
test('SW-NO-LEGACY-01 static (PWA-wide): every shipped app-shell file is free of Apps Script hostname references', () => {
  const appShellMatch = swSource.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(appShellMatch, 'sw.js must define APP_SHELL as the canonical shipped-file list');
  const shippedPaths = [...appShellMatch[1].matchAll(/'\/crewbiq-driver\/([^']*)'/g)]
    .map(m => m[1])
    .filter(Boolean); // drops the '/' root entry, which has no on-disk file of its own

  assert.ok(shippedPaths.length > 20, 'sanity check: the app shell list must actually enumerate the shipped files');

  const offenders = [];
  for (const rel of shippedPaths) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue; // manifest.json etc. are covered by other contract tests' existence checks
    const source = fs.readFileSync(abs, 'utf8');
    if (/script\.google\.com|googleapis\.com/.test(source)) offenders.push(rel);
  }

  assert.deepEqual(offenders, [], 'no shipped app-shell file may contain an Apps Script hostname reference: ' + JSON.stringify(offenders));
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

test('SW-NO-LEGACY-01 dynamic (representative flow): a realistic auth+sync+PTI+restore sequence never targets a legacy hostname', async () => {
  const storageMap = new Map();
  const localStorage = {
    getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
    setItem(key, value) { storageMap.set(key, String(value)); },
    removeItem(key) { storageMap.delete(key); },
  };
  const fakeElement = { classList: { add() {}, remove() {}, toggle() {} }, textContent: '', style: {} };
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return fakeElement; },
  };

  const seenUrls = [];
  async function nativeFetchMock(url, init = {}) {
    const reqUrl = String(typeof url === 'string' ? url : (url && url.url) || '');
    seenUrls.push(reqUrl);
    if (/script\.google\.com|googleapis\.com/.test(reqUrl)) {
      throw new Error('representative flow must never reach a legacy Apps Script hostname: ' + reqUrl);
    }
    const body = typeof (init && init.body) === 'string' ? init.body : '{}';
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (e) {}
    if (reqUrl.includes('/v1/me')) {
      return new Response(JSON.stringify({ ok: true, user: { crewbiq_id: 'CBQ-FLOW', roles: ['driver'] } }), { status: 200 });
    }
    if (reqUrl.includes('/v1/restore/pwa')) {
      return new Response(JSON.stringify({ ok: true, loads: [], ptiLog: [], disputes: [], counts: {} }), { status: 200 });
    }
    if (reqUrl.includes('/v1/sync')) {
      const recordId = (parsed.payload && parsed.payload.record_id) || parsed.record_id || 'unknown';
      return new Response(JSON.stringify({ ok: true, received: true, record_id: recordId }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const context = {
    console, localStorage, document,
    fetch: nativeFetchMock,
    Response, Headers, Request, URLSearchParams,
    setTimeout, clearTimeout, Math, Date,
  };
  context.window = context;
  context.globalThis = context;

  for (const file of ['core-runtime.js', 'offline-sync-queue.js', 'restore-hotfix.js', 'sync.js']) {
    const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    vm.runInNewContext(source, context, { filename: file });
  }

  context.localStorage.setItem('fiqD_sessionToken', 'token-flow-1');

  // syncPTIEntry() still gates on driver.syncUrl being truthy (a pre-existing,
  // separate call site not touched by this cleanup — its actual destination is
  // already proven dead/ignored by core-runtime.js's body-type dispatch). Set
  // it to a realistic placeholder so the representative flow actually
  // exercises that call rather than silently no-op-ing.
  const driver = { crewId: 'CBQ-FLOW', syncUrl: 'https://crewbiq-orchestrator-production.up.railway.app' };
  let loads = [{ id: 'flow_load_1', synced: false, gross: 50 }];
  let ptiLog = [];
  let disputes = [];

  context.CrewBIQSync.init({
    getDriver: () => driver,
    getLoads: () => loads,
    setLoads: (v) => { loads = v; },
    getPtiLog: () => ptiLog,
    setPtiLog: (v) => { ptiLog = v; },
    getDisputes: () => disputes,
    setDisputes: (v) => { disputes = v; },
    saveAll: () => {},
    getTimer: () => null,
    setTimer: () => {},
  });

  // 1) a representative write (load save -> doSync)
  await context.CrewBIQSync.doSync();
  // 2) a representative PTI entry sync (fire-and-forget in production; awaited here for determinism)
  await context.CrewBIQSync.syncPTIEntry({ id: 'pti_flow_1', synced: false });
  // 3) a representative restore (the Orchestrator's own restore surface, via fullRestore())
  await context.CrewBIQRestoreHotfix.fullRestore({ sessionToken: 'token-flow-1' });

  assert.ok(seenUrls.length > 0, 'the representative flow must actually make network calls (a vacuous pass would prove nothing)');
  const legacyHits = seenUrls.filter(u => /script\.google\.com|googleapis\.com/.test(u));
  assert.deepEqual(legacyHits, [], 'no call in the representative auth+sync+PTI+restore flow may target a legacy Apps Script hostname');
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
