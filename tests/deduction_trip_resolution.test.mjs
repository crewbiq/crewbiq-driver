import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {
  console,
  JSON,
  Math,
  Date,
  window: null,
};
context.window = context;
context.globalThis = context;

for (const file of [
  '../deduction-policy-hotfix.js',
  '../deduction-period-hotfix.js',
  '../deduction-trip-resolution.js',
]) {
  vm.runInNewContext(
    fs.readFileSync(new URL(file, import.meta.url), 'utf8'),
    context,
    { filename: file },
  );
}

const api = context.CrewBIQDeductionTripResolution;
assert.equal(api.version, '0.1.0');

const truck = {
  id: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier A',
};

const templates = [
  {
    id: 'ins_v1',
    policyId: 'insurance_1919',
    version: 1,
    truckId: truck.id,
    name: 'Insurance',
    amount: 450,
    category: 'insurance',
    effectiveFrom: '2026-06-01',
    effectiveTo: '2026-07-14',
  },
  {
    id: 'ins_v2',
    policyId: 'insurance_1919',
    version: 2,
    truckId: truck.id,
    name: 'Insurance',
    amount: 550,
    category: 'insurance',
    effectiveFrom: '2026-07-15',
    effectiveTo: '2026-07-31',
  },
];

const loads = [
  { id: 'load_old_1', truckId: truck.id, pickup: '2026-07-13', gross: 1000 },
  { id: 'load_old_2', truckId: truck.id, pickup: '2026-07-14', gross: 1000 },
  { id: 'load_new_1', truckId: truck.id, pickup: '2026-07-15', gross: 1000 },
  { id: 'load_new_2', truckId: truck.id, pickup: '2026-07-16', gross: 1000 },
];

const resolved = api.resolveSettlements(loads, truck, templates, []);
assert.equal(resolved.settlements.length, 1);
assert.equal(resolved.settlements[0].weekKey, '2026-07-13');
assert.equal(resolved.settlements[0].source, 'trip_date_auto');
assert.equal(resolved.settlements[0].items.length, 2);
assert.equal(resolved.settlements[0].total, 1000);
assert.equal(resolved.automaticTotal, 1000);
assert.equal(resolved.loadResolutions.length, 4);
assert.equal(resolved.loadResolutions[0].items[0].policyVersionId, 'ins_v1');
assert.equal(resolved.loadResolutions[2].items[0].policyVersionId, 'ins_v2');
assert.equal(resolved.loadResolutions[3].total, 550);

// Multiple loads under the same version create only one weekly charge.
const sameVersion = api.resolveSettlements(loads.slice(0, 2), truck, templates, []);
assert.equal(sameVersion.settlements[0].items.length, 1);
assert.equal(sameVersion.automaticTotal, 450);

// An immutable weekly snapshot wins and automatic resolution never duplicates it.
const existingSnapshot = [{
  id: 'wd_existing',
  truckId: truck.id,
  unitNumber: truck.unitNumber,
  weekKey: '2026-07-13',
  items: [{ name: 'Confirmed settlement', amount: 777 }],
  total: 777,
  policySnapshotVersion: 1,
}];
const immutable = api.resolveSettlements(loads, truck, templates, existingSnapshot);
assert.equal(immutable.settlements[0].source, 'immutable_weekly_snapshot');
assert.equal(immutable.settlements[0].immutable, true);
assert.equal(immutable.settlements[0].total, 777);
assert.equal(immutable.automaticTotal, 0);

// Gaps are explicit and do not invent a charge.
const gap = api.resolveLoad({ id: 'load_gap', pickup: '2026-08-10' }, truck, templates, 0);
assert.equal(gap.gap, true);
assert.equal(gap.total, 0);
assert.equal(gap.items.length, 0);

// Finance wrapper adds only unsnapshotted automatic settlement totals.
context.loadDedTemplates = () => templates;
context.loadWeeklyDeds = () => [];
context.ownerFinanceForTruck = () => ({
  loads,
  gross: 4000,
  dispatchFee: 400,
  truckNet: 3600,
  driverPay: 1600,
  ownerNet: 2000,
  fuelCost: 700,
  serviceCost: 200,
  deductionTotal: 100,
  realNet: 1000,
  miles: 2000,
  cpm: 0.5,
});
assert.equal(api.installFinanceWrapper(), true);
const finance = context.ownerFinanceForTruck(truck, 'week');
assert.equal(finance.automaticDeductionTotal, 1000);
assert.equal(finance.deductionTotal, 1100);
assert.equal(finance.realNet, 0);
assert.equal(finance.cpm, 0);
assert.equal(finance.deductionLoadResolutions.length, 4);

console.log('Trip-date deduction resolution contract: ok');
