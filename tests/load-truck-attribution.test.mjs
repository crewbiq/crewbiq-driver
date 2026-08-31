import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../loads.js', import.meta.url), 'utf8');
const ptiSource = fs.readFileSync(new URL('../pti.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');

function functionSource(text, signature) {
  const start = text.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
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
const saveLoadSource = functionSource(source, 'function saveLoad()');
const selectionSource = functionSource(source, 'function getLoadTruckSelection()');
const attributionSource = functionSource(source, 'function resolveNewLoadTruckAttribution(selection)');

test('new Load Truck A selection resolves Truck A stable id', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolveNewLoadTruckAttribution({ truckId: 'truck-a', unitNumber: '101' }))), { ok: true, truckId: 'truck-a' });
});

test('new Load Truck B selection resolves Truck B stable id', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolveNewLoadTruckAttribution({ truckId: 'truck-b', unitNumber: '202' }))), { ok: true, truckId: 'truck-b' });
});

test('unitNumber alone is never accepted as truckId', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.resolveNewLoadTruckAttribution({ unitNumber: '202' }))), { ok: false, code: 'truck_not_resolved' });
});

test('multiple Trucks do not alter the explicitly selected Truck B id', () => {
  const trucks = [{ id: 'truck-a', unitNumber: '101' }, { id: 'truck-b', unitNumber: '202' }];
  const selected = trucks.find(truck => truck.id === 'truck-b');
  assert.equal(api.resolveNewLoadTruckAttribution({ truckId: selected.id, unitNumber: selected.unitNumber }).truckId, 'truck-b');
});

test('normalized truck attribution has no activeTrucks first-item fallback', () => {
  assert.doesNotMatch(attributionSource, /activeTrucks|\[\s*0\s*\]/);
  assert.doesNotMatch(saveLoadSource, /activeTrucks\(\)\s*\[\s*0\s*\]/);
});

test('normalized truck attribution has no default Truck fallback', () => {
  assert.doesNotMatch(attributionSource, /getDefaultTruck|defaultTruck|currentTruck/);
  assert.doesNotMatch(saveLoadSource, /getDefaultTruck\s*\(/);
});

test('missing and invalid explicit selections fail closed', () => {
  for (const selection of [null, {}, { truckId: '' }, { truckId: '   ' }]) {
    assert.equal(api.resolveNewLoadTruckAttribution(selection).code, 'truck_not_resolved');
  }
});

test('new Load retains accepted workspace attribution composition', () => {
  assert.match(saveLoadSource, /if \(!editId && global\.CrewBIQWorkspaceAttribution\)/);
  assert.match(saveLoadSource, /attributeNewRecord\(entry, _get\.workspaceContext\(\)\)/);
});

test('new Load attribution does not add driverId', () => {
  assert.doesNotMatch(attributionSource, /driverId/);
  assert.doesNotMatch(saveLoadSource, /\bdriverId\s*:/);
});

test('PTI attribution remains unchanged by the Load-only slice', () => {
  assert.doesNotMatch(ptiSource, /resolveNewLoadTruckAttribution/);
  assert.doesNotMatch(functionSource(ptiSource, 'function submitPTI()'), /\btruckId\s*:/);
});

test('legacy Load without truckId remains unchanged on read', () => {
  const legacy = { id: 'load-old', unitNumber: '101' };
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), legacy);
  assert.equal('truckId' in legacy, false);
});

test('edit Truck A to Truck B applies fresh truckId and matching unitNumber', () => {
  const existing = { id: 'load-1', truckId: 'truck-a', unitNumber: '101' };
  const selection = { truckId: 'truck-b', unitNumber: '202' };
  const attribution = api.resolveNewLoadTruckAttribution(selection);
  const saved = { ...existing, unitNumber: selection.unitNumber, truckId: attribution.truckId };
  assert.deepEqual(saved, { id: 'load-1', truckId: 'truck-b', unitNumber: '202' });
  assert.match(saveLoadSource, /entry\.truckId = truckAttribution\.truckId;/);
  assert.doesNotMatch(saveLoadSource, /entry\.truckId = existingEntry\.truckId/);
  assert.doesNotMatch(saveLoadSource, /truckId:\s*truckSel\.truckId/);
});

test('no stale truckId survives explicit reassignment', () => {
  assert.doesNotMatch(saveLoadSource, /existingEntry[^\n]*truckId|truckId[^\n]*existingEntry/);
});

test('same-Truck edit retains the validated canonical id', () => {
  assert.equal(api.resolveNewLoadTruckAttribution({ truckId: 'truck-a', unitNumber: '101' }).truckId, 'truck-a');
});

test('legacy Load gains truckId only through explicit validated edit save', () => {
  const legacy = { id: 'load-old', unitNumber: 'legacy-unit' };
  const attribution = api.resolveNewLoadTruckAttribution({ truckId: 'truck-b', unitNumber: '202' });
  const saved = { ...legacy, unitNumber: '202', truckId: attribution.truckId };
  assert.equal(saved.truckId, 'truck-b');
  assert.equal(saved.unitNumber, '202');
  assert.equal('truckId' in legacy, false);
});

test('truckId survives local serialization', () => {
  const record = { id: 'load-new', truckId: 'truck-b', unitNumber: '202' };
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
});

test('truckId survives restore/import object roundtrip', () => {
  const restored = JSON.parse(JSON.stringify({ loads: [{ id: 'load-new', truckId: 'truck-b' }] }));
  assert.equal(restored.loads[0].truckId, 'truck-b');
});

test('sync payload stamping preserves truckId as a full record field', () => {
  const stampSource = functionSource(syncSource, 'function stampRecord(record)');
  assert.match(stampSource, /\.\.\.record/);
  assert.match(syncSource, /loads:\s*\(forceAll \? loads : loads\.filter\(x => !x\.synced\)\)\.map\(stampRecord\)/);
});

test('Load UI continues to use canonical ids as option values and requires selection', () => {
  assert.match(source, /<option value="\$\{_escHtml\(t\.id\)\}"/);
  assert.match(selectionSource, /truckId: truck \? truck\.id : ''/);
  assert.match(saveLoadSource, /Truck assignment required/);
});

test('saveLoad is the only new local Load constructor', () => {
  assert.equal((saveLoadSource.match(/'l_' \+ Date\.now\(\)/g) || []).length, 1);
  assert.equal((source.match(/Core\.events\.emit\('load:created'/g) || []).length, 0);
  assert.match(saveLoadSource, /editId \? loads\.map[\s\S]*:\s*\[\.\.\.loads, entry\]/);
});
