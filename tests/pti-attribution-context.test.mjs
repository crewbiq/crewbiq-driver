import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../pti.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function loadApi() {
  const window = { CrewBIQCore: { events: { on() {}, emit() {} }, toast() {} } };
  vm.runInNewContext(source, { window, console, Date, Object, Array, String, Number, Promise, setTimeout }, { filename: 'pti.js' });
  return window.CrewBIQPTI;
}

const api = loadApi();

function fn(signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1);
  let depth = 0, opened = false;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') { depth++; opened = true; }
    if (source[i] === '}') depth--;
    if (opened && depth === 0) return source.slice(start, i + 1);
  }
}

const populate = fn('async function populatePTIAttributionSelectors()');
const submit = fn('function submitPTI()');

test('PTI form exposes explicit disabled-placeholder Truck and Driver selectors', () => {
  assert.match(html, /id="ptiTruckSelect"[\s\S]*selected disabled>Truck assignment required/);
  assert.match(html, /id="ptiDriverSelect"[\s\S]*selected disabled>Driver assignment required/);
});

test('PTI selectors never choose first, only, default, or local Driver profile', () => {
  assert.doesNotMatch(populate, /\[\s*0\s*\]|length\s*===\s*1|loadDriverProfiles|driverProfiles|defaultTruck|defaultDriver|currentTruck/);
  assert.match(populate, /_get\.workspaceDriverRoster\(\)/);
  assert.match(populate, /_get\.trucks\(\)/);
});

test('PTI submit validates selected canonical IDs and fresh workspace before writing', () => {
  assert.match(submit, /ptiTrucks\.find/);
  assert.match(submit, /ptiDrivers\.find/);
  assert.match(submit, /resolveActiveWorkspace\(_get\.workspaceContext\(\)\)/);
  assert.match(source, /driver\.workspaceId !== workspaceResolution\.workspaceId/);
  assert.match(submit, /resolvePTIAttribution\(ptiAttributionAuthority/);
  assert.match(submit, /entry\.workspaceId = attribution\.workspaceId/);
});

test('PTI has no AccountDriverLink inference or local roster fallback', () => {
  assert.doesNotMatch(source, /AccountDriverLink|loadDriverProfiles|driverProfiles|firstDriver|firstTruck/);
});

test('composition passes only canonical Truck IDs and accepted workspace roster reader', () => {
  assert.match(html, /getTrucks: \(\) => loadTrucks\(\)/);
  assert.match(html, /readWorkspaceDriverRoster: \(\) => readAuthorizedWorkspaceDriverRoster\(\)/);
});

test('cache-first PTI runtime is rotated', () => {
  assert.match(sw, /crewbiq-driver-v92/);
  assert.match(sw, /\/pti\.js/);
});

test('unavailable authority degrades without fabricating canonical IDs', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolvePTIAttribution('unavailable', {}, { ok: false }))), { ok: true, attributed: false });
  assert.match(submit, /canonical attribution unavailable/);
});

test('available authority accepts only explicit workspace-matched proof', () => {
  const selection = { truck: { id: 'truck-1' }, driver: { driverId: 'driver-1', workspaceId: 'workspace-1' } };
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolvePTIAttribution('available', selection, { ok: true, workspaceId: 'workspace-1' }))), {
    ok: true, attributed: true, workspaceId: 'workspace-1', truckId: 'truck-1', driverId: 'driver-1',
  });
  assert.equal(api.resolvePTIAttribution('available', selection, { ok: true, workspaceId: 'other' }).code, 'workspace_mismatch');
  assert.equal(api.resolvePTIAttribution('available', {}, { ok: true, workspaceId: 'workspace-1' }).code, 'invalid_selection');
});

test('loading authority cannot bypass validation and bounded timeout enables degradation', () => {
  assert.equal(api.resolvePTIAttribution('loading', {}, { ok: false }).code, 'attribution_pending');
  assert.match(populate, /Promise\.race/);
  assert.match(populate, /roster_timeout/);
});
