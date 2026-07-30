import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('./fleet-load-resolution.js', import.meta.url),
  'utf8',
);

function loadApi() {
  const context = { console: { info() {} }, window: null };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'fleet-load-resolution.js' });
  return context.CrewBIQFleetLoadResolution;
}

test('protected module exposes the closed pure API', () => {
  const api = loadApi();
  assert.ok(api);
  assert.equal(api.version, '0.1.0');
  assert.deepEqual(
    Object.keys(api).sort(),
    ['normalizeFleetLookupValue', 'resolveLoadToTruck', 'unassignedFleetLoads', 'version'],
  );
  assert.equal(api.normalizeFleetLookupValue('  TrUcK-1  '), 'truck-1');
  assert.equal(api.normalizeFleetLookupValue(null), '');
});

test('protected resolver fails closed across every precedence tier', () => {
  const { resolveLoadToTruck } = loadApi();
  const active = [
    { id: 'T1', unitNumber: '101', active: true },
    { id: 'T2', unitNumber: '202', active: true },
    { id: 'T3', unitNumber: '303', active: false },
  ];
  const cases = [
    {
      name: 'explicit active id wins over conflicting lower tiers',
      record: { truckId: ' T1 ', unitNumber: '202', crewId: 'crew-2' },
      profiles: [{ id: 'crew-2', truckId: 'T2', active: true }],
      expectedId: 'T1',
    },
    {
      name: 'payload direct id resolves',
      record: { payload: { truck_id: ' T2 ' } },
      profiles: [],
      expectedId: 'T2',
    },
    {
      name: 'invalid explicit id is terminal',
      record: { truckId: 'missing', unitNumber: '101' },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'conflicting record and payload direct ids are ambiguous',
      record: { truckId: 'T1', payload: { truck_id: 'T2' } },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'rawPayload and raw_payload direct ids participate independently',
      record: {
        rawPayload: { truckId: 'T1' },
        raw_payload: { truck_id: 'T2' },
      },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'duplicate aliases for one active id are not ambiguous',
      record: { truckId: ' T1 ', payload: { truck_id: 't1' } },
      profiles: [],
      expectedId: 'T1',
    },
    {
      name: 'duplicate active truck ids are ambiguous',
      record: { truckId: 'T1' },
      trucks: [
        ...active,
        { id: ' t1 ', unitNumber: '404', active: true },
      ],
      profiles: [],
      expectedId: null,
    },
    {
      name: 'unique normalized active unit resolves',
      record: { truck_unit: ' 202 ' },
      profiles: [],
      expectedId: 'T2',
    },
    {
      name: 'payload unit resolves',
      record: { rawPayload: { unit_number: ' 101 ' } },
      profiles: [],
      expectedId: 'T1',
    },
    {
      name: 'normalized-empty direct id does not block a valid unit',
      record: { truckId: '  ', unitNumber: '202' },
      profiles: [],
      expectedId: 'T2',
    },
    {
      name: 'conflicting record and payload units are ambiguous',
      record: { unitNumber: '101', payload: { truck_unit: '202' } },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'all payload envelopes contribute independently to unit ambiguity',
      record: {
        rawPayload: { unitNumber: '101' },
        raw_payload: { unit_number: '202' },
        payload: { truckUnit: '101' },
      },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'duplicate active unit is ambiguous',
      record: { unitNumber: '101' },
      trucks: [...active, { id: 'T4', unitNumber: ' 101 ', active: true }],
      profiles: [],
      expectedId: null,
    },
    {
      name: 'inactive explicit truck never resolves',
      record: { truckId: 'T3' },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'inactive unit never resolves',
      record: { unitNumber: '303' },
      profiles: [],
      expectedId: null,
    },
    {
      name: 'unique crew identity resolves',
      record: { crew_id: ' Crew-A ' },
      profiles: [{ crewId: 'crew-a', truck_id: 'T1', active: true }],
      expectedId: 'T1',
    },
    {
      name: 'payload email alias resolves',
      record: { raw_payload: { driver_email: 'DRIVER@example.com ' } },
      profiles: [{ email: 'driver@example.com', truckId: 'T2', active: true }],
      expectedId: 'T2',
    },
    {
      name: 'empty record alias does not mask a payload alias',
      record: { driverEmail: ' ', payload: { driver_email: 'driver@example.com' } },
      profiles: [{ email: 'driver@example.com', truckId: 'T2', active: true }],
      expectedId: 'T2',
    },
    {
      name: 'record and payload identities participate together in ambiguity',
      record: { driverId: 'driver-a', payload: { driver_email: 'b@example.com' } },
      profiles: [
        { driverId: 'driver-a', truckId: 'T1', active: true },
        { email: 'b@example.com', truckId: 'T2', active: true },
      ],
      expectedId: null,
    },
    {
      name: 'all payload envelopes contribute independently to identity ambiguity',
      record: {
        rawPayload: { driverId: 'driver-a' },
        raw_payload: { driver_email: 'b@example.com' },
        payload: { crewId: 'driver-a' },
      },
      profiles: [
        { driverId: 'driver-a', truckId: 'T1', active: true },
        { email: 'b@example.com', truckId: 'T2', active: true },
      ],
      expectedId: null,
    },
    {
      name: 'two matching active profiles are ambiguous',
      record: { driverId: 'shared' },
      profiles: [
        { driverId: 'shared', truckId: 'T1', active: true },
        { crewId: 'shared', truckId: 'T2', active: true },
      ],
      expectedId: null,
    },
    {
      name: 'inactive profile is ignored',
      record: { driverId: 'shared' },
      profiles: [
        { driverId: 'shared', truckId: 'T1', active: false },
        { crewId: 'shared', truckId: 'T2', active: true },
      ],
      expectedId: 'T2',
    },
    {
      name: 'synchronized profile truck aliases resolve as one distinct link',
      record: { driverRef: 'driver-a' },
      profiles: [{
        id: 'driver-a',
        truckId: ' T1 ',
        truck_id: 't1',
        active: true,
      }],
      expectedId: 'T1',
    },
    {
      name: 'profile link to a duplicate active truck id is ambiguous',
      record: { driverRef: 'driver-a' },
      trucks: [
        ...active,
        { id: 't1', unitNumber: '404', active: true },
      ],
      profiles: [{
        id: 'driver-a',
        truckId: 'T1',
        active: true,
      }],
      expectedId: null,
    },
    {
      name: 'conflicting profile truck aliases fail closed',
      record: { driverRef: 'driver-a' },
      profiles: [{
        id: 'driver-a',
        truckId: 'T1',
        truck_id: 'T2',
        active: true,
      }],
      expectedId: null,
    },
    {
      name: 'missing linked truck fails closed',
      record: { driverRef: 'driver-a' },
      profiles: [{ id: 'driver-a', truckId: 'missing', active: true }],
      expectedId: null,
    },
    {
      name: 'inactive linked truck fails closed',
      record: { driverRef: 'driver-a' },
      profiles: [{ id: 'driver-a', truckId: 'T3', active: true }],
      expectedId: null,
    },
    {
      name: 'unrelated reference is not an identity alias',
      record: { reference: 'driver-a' },
      profiles: [{ id: 'driver-a', truckId: 'T1', active: true }],
      expectedId: null,
    },
    {
      name: 'fully unresolved load remains unassigned',
      record: { reference: 'unrelated' },
      profiles: [],
      expectedId: null,
    },
  ];

  for (const item of cases) {
    const trucks = item.trucks || active;
    const before = JSON.stringify([item.record, trucks, item.profiles]);
    const result = resolveLoadToTruck(item.record, trucks, item.profiles);
    assert.equal(result ? result.id : null, item.expectedId, item.name);
    assert.equal(JSON.stringify([item.record, trucks, item.profiles]), before, item.name);
  }
});

test('protected unassigned helper preserves order and never mutates inputs', () => {
  const { unassignedFleetLoads } = loadApi();
  const trucks = [
    { id: 'T1', unitNumber: '101', active: true },
    { id: 'T2', unitNumber: '202', active: true },
  ];
  const profiles = [{ id: 'driver-a', truckId: 'T1', active: true }];
  const records = [
    { id: 'L1', truckId: 'T2' },
    { id: 'L2', driverId: 'driver-a' },
    { id: 'L3', unitNumber: 'missing' },
    { id: 'L4' },
  ];
  const before = JSON.stringify([records, trucks, profiles]);
  const result = unassignedFleetLoads(records, trucks, profiles);
  assert.deepEqual(
    Array.from(result, (record) => record.id),
    ['L3', 'L4'],
  );
  assert.notEqual(result, records);
  assert.equal(JSON.stringify([records, trucks, profiles]), before);
});
