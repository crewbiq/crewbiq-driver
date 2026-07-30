import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const resolverSource = readFileSync(
  new URL('./fleet-load-resolution.js', import.meta.url),
  'utf8',
);
const loadsSource = readFileSync(new URL('./loads.js', import.meta.url), 'utf8');

function createHarness({
  role = 'fleet',
  initialLoads,
  omitResolver = false,
  omitRoleProvider = false,
} = {}) {
  const trucks = [
    { id: 'T1', unitNumber: '101', active: true },
    { id: 'T2', unitNumber: '202', active: true },
    { id: 'T3', unitNumber: '303', active: false },
  ];
  let loads =
    initialLoads ||
    [
      {
        id: 'local-1',
        loadId: 'LOAD-1',
        pickup: '2026-07-28',
        gross: 2500,
        truckId: 'STALE-ID',
        unitNumber: 'STALE-UNIT',
        synced: true,
        notes: 'preserve me',
        nested: { source: 'historical' },
      },
    ];
  const originalLoad = loads[0];
  const calls = { save: 0, render: 0, sync: 0, events: [] };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math,
    Intl,
    document: {
      addEventListener() {},
      getElementById() {
        return null;
      },
    },
    getUserRole: () => role,
    loadTrucks: () => trucks,
    loadDriverProfiles: () => [],
    CrewBIQCore: {
      events: {
        on() {},
        emit(name, payload) {
          calls.events.push({ name, payload });
        },
      },
      toast() {},
      utils: {
        fmt: value => String(value),
        today: () => '2026-07-30',
        escHtml: value => String(value),
      },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(resolverSource, context, {
    filename: 'fleet-load-resolution.js',
  });
  if (omitResolver) context.CrewBIQFleetLoadResolution = undefined;
  if (omitRoleProvider) context.getUserRole = undefined;
  vm.runInNewContext(loadsSource, context, { filename: 'loads.js' });
  context.CrewBIQLoads.init({
    getDriver: () => ({
      crewId: 'crew-1',
      email: 'owner@example.com',
      unitNumber: '',
    }),
    getLoads: () => loads,
    setLoads: value => {
      loads = value;
    },
    getPtiLog: () => [],
    saveAll: () => {
      calls.save += 1;
    },
    doSync: () => {
      calls.sync += 1;
    },
    renderAll: () => {
      calls.render += 1;
    },
    showPage() {},
  });
  return {
    api: context.CrewBIQLoads,
    calls,
    context,
    getLoads: () => loads,
    originalLoad,
  };
}

test('protected API is module-only and driver calls fail closed', () => {
  const harness = createHarness({ role: 'driver' });
  assert.equal(typeof harness.api.assignUnresolvedLoad, 'function');
  assert.equal(harness.context.assignUnresolvedLoad, undefined);
  assert.equal(harness.api.assignUnresolvedLoad('local-1', 'T2'), false);
  assert.equal(harness.getLoads()[0], harness.originalLoad);
  assert.deepEqual(harness.calls, { save: 0, render: 0, sync: 0, events: [] });
});

test('protected API rejects missing, empty, inactive, and inexact choices', () => {
  for (const [loadKey, truckId] of [
    ['', 'T2'],
    ['missing-load', 'T2'],
    ['local-1', ''],
    ['local-1', 'T3'],
    ['local-1', 't2'],
  ]) {
    const harness = createHarness();
    assert.equal(harness.api.assignUnresolvedLoad(loadKey, truckId), false);
    assert.equal(harness.getLoads()[0], harness.originalLoad);
    assert.deepEqual(harness.calls, { save: 0, render: 0, sync: 0, events: [] });
  }
});

test('protected API fails closed when role or resolver infrastructure is absent', () => {
  for (const options of [
    { omitRoleProvider: true },
    { omitResolver: true },
  ]) {
    const harness = createHarness(options);
    assert.equal(harness.api.assignUnresolvedLoad('local-1', 'T2'), false);
    assert.equal(harness.getLoads()[0], harness.originalLoad);
    assert.deepEqual(harness.calls, { save: 0, render: 0, sync: 0, events: [] });
  }
});

test('protected API rejects loads already resolved directly or by unit', () => {
  for (const load of [
    {
      id: 'local-1',
      loadId: 'LOAD-1',
      truckId: 'T1',
      unitNumber: '101',
      synced: true,
    },
    {
      id: 'local-1',
      loadId: 'LOAD-1',
      truckId: '',
      unitNumber: '101',
      synced: true,
    },
  ]) {
    const harness = createHarness({ initialLoads: [load] });
    assert.equal(harness.api.assignUnresolvedLoad('local-1', 'T2'), false);
    assert.equal(harness.getLoads()[0], load);
    assert.deepEqual(harness.calls, { save: 0, render: 0, sync: 0, events: [] });
  }
});

test('protected API replaces stale identifiers immutably and preserves every other field', () => {
  const harness = createHarness();
  const before = structuredClone(harness.originalLoad);
  assert.equal(harness.api.assignUnresolvedLoad('local-1', 'T2'), true);

  const updated = harness.getLoads().find(load => load.id === 'local-1');
  assert.ok(updated);
  assert.notEqual(updated, harness.originalLoad);
  assert.deepEqual(harness.originalLoad, before);
  assert.deepEqual(
    {
      ...updated,
      truckId: before.truckId,
      unitNumber: before.unitNumber,
      synced: before.synced,
    },
    before,
  );
  assert.equal(updated.truckId, 'T2');
  assert.equal(updated.unitNumber, '202');
  assert.equal(updated.synced, false);
  assert.equal(harness.calls.save, 1);
  assert.equal(harness.calls.render, 1);
  assert.equal(harness.calls.sync, 1);

  const updates = harness.calls.events.filter(event => event.name === 'load:updated');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].payload.loadId, 'LOAD-1');
  assert.equal(updates[0].payload.truckId, 'T2');
  assert.equal(updates[0].payload.unitNumber, '202');
  assert.match(updates[0].payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
