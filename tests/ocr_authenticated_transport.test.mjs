import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storageMap = new Map();
const localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};

const documentListeners = new Map();
const document = {
  readyState: 'loading',
  addEventListener(name, handler) {
    const list = documentListeners.get(name) || [];
    list.push(handler);
    documentListeners.set(name, list);
  },
  getElementById() { return null; },
};

const nativeCalls = [];
async function nativeFetch(input, init = {}) {
  nativeCalls.push({
    url: String((input && input.url) || input),
    method: String(init.method || 'GET').toUpperCase(),
    headers: new Headers(init.headers || {}),
    body: typeof init.body === 'string' ? init.body : '',
    cache: init.cache,
  });
  return new Response(JSON.stringify({
    ok: true,
    schema_version: '1.0',
    request_id: 'ocr_test_1',
    stored: false,
    review_required: true,
    fields: { fuel_cost: 312.45 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const context = {
  console,
  localStorage,
  document,
  fetch: nativeFetch,
  Response,
  Headers,
  Request,
  setTimeout,
  clearTimeout,
  CrewBIQCore: {
    orchestratorTransport: {
      getOrchestratorBase() {
        return 'https://crewbiq-orchestrator-production.up.railway.app';
      },
    },
  },
};
context.window = context;
context.globalThis = context;

const source = fs.readFileSync(new URL('../ocr-hotfix.js', import.meta.url), 'utf8');
vm.runInNewContext(source, context, { filename: 'ocr-hotfix.js' });

assert.equal(context.CrewBIQOCR.version, '0.1.0');

const requestBody = JSON.stringify({
  document_type: 'fuel_receipt',
  media_type: 'image/jpeg',
  filename: 'receipt.jpg',
  data_base64: 'ZmFrZQ==',
});

// No session: reject locally so file bytes never leave the device.
const unauthenticated = await context.fetch(
  'https://crewbiq-orchestrator-production.up.railway.app/v1/ocr/extract/pwa',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
  },
);
assert.equal(unauthenticated.status, 401);
assert.equal((await unauthenticated.json()).reason, 'auth_required');
assert.equal(nativeCalls.length, 0);

// Authenticated request: rewrite both legacy secret and public URLs to the
// single Bearer PWA endpoint.
localStorage.setItem('fiqD_sessionToken', 'token-owner-1');
const authenticated = await context.fetch(
  'https://crewbiq-orchestrator-production.up.railway.app/v1/ocr/extract',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CrewBIQ-Secret': 'legacy-secret-must-not-leave-device',
    },
    body: requestBody,
  },
);
assert.equal(authenticated.status, 200);
assert.equal((await authenticated.json()).stored, false);
assert.equal(nativeCalls.length, 1);
assert.equal(
  nativeCalls[0].url,
  'https://crewbiq-orchestrator-production.up.railway.app/v1/ocr/extract/pwa',
);
assert.equal(nativeCalls[0].method, 'POST');
assert.equal(nativeCalls[0].headers.get('authorization'), 'Bearer token-owner-1');
assert.equal(nativeCalls[0].headers.get('x-crewbiq-secret'), null);
assert.equal(nativeCalls[0].headers.get('content-type'), 'application/json');
assert.equal(nativeCalls[0].body, requestBody);
assert.equal(nativeCalls[0].cache, 'no-store');

// Non-OCR traffic is untouched.
await context.fetch('https://example.com/health', { method: 'GET' });
assert.equal(nativeCalls.length, 2);
assert.equal(nativeCalls[1].url, 'https://example.com/health');

console.log('authenticated OCR transport contract: ok');
