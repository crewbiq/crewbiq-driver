import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../loads.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ptiSource = fs.readFileSync(new URL('../pti.js', import.meta.url), 'utf8');
const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function functionSource(body, signature) {
  const start = body.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < body.length; index += 1) {
    if (body[index] === '{') { depth += 1; opened = true; }
    if (body[index] === '}') depth -= 1;
    if (opened && depth === 0) return body.slice(start, index + 1);
  }
  throw new Error(`${signature} is incomplete`);
}

function loadApi() {
  const window = {
    CrewBIQCore: {
      events: { on() {}, emit() {} },
      toast() {},
      utils: {},
    },
  };
  vm.runInNewContext(source, { window, console, Date, Object, Array, String, Number, Set, Map }, { filename: 'loads.js' });
  return window.CrewBIQLoads;
}

const api = loadApi();
const saveSource = functionSource(source, 'function saveLoad()');
const populateSource = functionSource(source, 'async function populateLoadDriverSelect()');
const editSource = functionSource(source, 'function editLoad(id)');
const compositionSource = functionSource(html, 'async function readAuthorizedWorkspaceDriverRoster()');
const requestSource = functionSource(html, 'function getWorkspaceDriverRosterAdapter()');
const resolution = { ok: true, workspaceId: 'workspace-1' };
const driverA = { driverId: 'driver-a', workspaceId: 'workspace-1', name: 'Driver A' };

test('explicit proven Driver selection resolves a stable driverId', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolveNewLoadDriverAttribution(driverA, resolution))), {
    ok: true, driverId: 'driver-a', workspaceId: 'workspace-1', name: 'Driver A',
  });
});

test('missing, malformed, and cross-workspace Driver selections fail closed', () => {
  for (const selection of [null, {}, { ...driverA, driverId: '' }, { ...driverA, name: '' }]) {
    assert.equal(api.resolveNewLoadDriverAttribution(selection, resolution).code, 'driver_not_resolved');
  }
  assert.equal(api.resolveNewLoadDriverAttribution({ ...driverA, workspaceId: 'other' }, resolution).code, 'driver_workspace_mismatch');
  assert.equal(api.resolveNewLoadDriverAttribution(driverA, { ok: false }).code, 'driver_workspace_mismatch');
});

test('new Load writes only the explicit proven driverId and matching display name', () => {
  assert.match(saveSource, /resolveNewLoadDriverAttribution\(getLoadDriverSelection\(\), workspaceResolution\)/);
  assert.match(saveSource, /if \(!editId && !driverAttribution\.ok\) return _toast\('Driver assignment required'/);
  assert.match(saveSource, /if \(!editId\) \{[\s\S]*entry\.driverId = driverAttribution\.driverId;[\s\S]*entry\.driverName = driverAttribution\.name;/);
});

test('selector has no first, only-item, local profile, or default fallback', () => {
  assert.match(populateSource, /Driver assignment required/);
  assert.doesNotMatch(populateSource, /\[\s*0\s*\]|length\s*===\s*1|loadDriverProfiles|driverProfiles|defaultDriver|currentDriver/);
  assert.doesNotMatch(source, /_workspaceDrivers\s*\[\s*0\s*\]/);
  assert.match(html, /<select id="loadDriverSelect" disabled><\/select>/);
});

test('composition root consumes only accepted adapter and canonical workspace resolver', () => {
  assert.match(compositionSource, /CrewBIQWorkspaceAttribution/);
  assert.match(compositionSource, /resolveActiveWorkspace\(session\)/);
  assert.match(compositionSource, /adapter\.read\(\{sessionToken:session\.sessionToken, workspaceId:resolution\.workspaceId\}\)/);
  assert.doesNotMatch(compositionSource, /loadDriverProfiles|driverProfiles|\[\s*0\s*\]/);
  assert.match(requestSource, /workspace_driver_roster_read/);
});

test('new Load only: edit preserves existing driverId and never backfills legacy Loads', () => {
  assert.match(saveSource, /existingEntry && Object\.prototype\.hasOwnProperty\.call\(existingEntry, 'driverId'\)/);
  assert.match(saveSource, /entry\.driverId = existingEntry\.driverId/);
  assert.match(editSource, /hideLoadDriverSelect\(\)/);
  assert.doesNotMatch(editSource, /populateLoadDriverSelect/);
});

test('PTI attribution remains independent from the Load-specific selector helper', () => {
  assert.doesNotMatch(ptiSource, /loadDriverSelect|resolveNewLoadDriverAttribution/);
  assert.match(functionSource(ptiSource, 'function submitPTI()'), /entry\.driverId = attribution\.driverId/);
});

test('app shell is cache-rotated and roster loads before Loads module', () => {
  assert.ok(html.indexOf('workspace-driver-roster.js') < html.indexOf('loads.js'));
  assert.match(swSource, /crewbiq-driver-v92/);
  assert.match(swSource, /workspace-driver-roster\.js/);
});
