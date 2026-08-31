import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../pti.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

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
  assert.match(submit, /selectedDriver\.workspaceId !== workspaceResolution\.workspaceId/);
  assert.match(submit, /workspaceId: workspaceResolution\.workspaceId/);
  assert.match(submit, /truckId: truck\.id/);
  assert.match(submit, /driverId: selectedDriver\.driverId/);
});

test('PTI has no AccountDriverLink inference or local roster fallback', () => {
  assert.doesNotMatch(source, /AccountDriverLink|loadDriverProfiles|driverProfiles|firstDriver|firstTruck/);
});

test('composition passes only canonical Truck IDs and accepted workspace roster reader', () => {
  assert.match(html, /getTrucks: \(\) => loadTrucks\(\)/);
  assert.match(html, /readWorkspaceDriverRoster: \(\) => readAuthorizedWorkspaceDriverRoster\(\)/);
});

test('cache-first PTI runtime is rotated', () => {
  assert.match(sw, /crewbiq-driver-v91/);
  assert.match(sw, /\/pti\.js/);
});
