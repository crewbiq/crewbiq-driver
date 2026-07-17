import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const fixedNow = new Date('2026-07-13T12:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow.getTime(); }
}

const context = {
  console,
  JSON,
  Math,
  Date: FixedDate,
  window: null,
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(
  fs.readFileSync(new URL('../deduction-policy-hotfix.js', import.meta.url), 'utf8'),
  context,
  { filename: 'deduction-policy-hotfix.js' },
);
vm.runInNewContext(
  fs.readFileSync(new URL('../deduction-period-hotfix.js', import.meta.url), 'utf8'),
  context,
  { filename: 'deduction-period-hotfix.js' },
);

const api = context.CrewBIQDeductionPolicies;
const periods = context.CrewBIQDeductionPeriods;
assert.equal(api.version, '0.1.0');
assert.equal(periods.version, '0.2.0');

const initial = [
  {
    id: 'dt_1919_ins_v1',
    policyId: 'dp_1919_ins',
    version: 1,
    truckId: 'truck_1919',
    unitNumber: '1919',
    company: 'Carrier A',
    name: 'Insurance',
    amount: 450,
    category: 'insurance',
    effectiveFrom: '2026-06-01',
    effectiveTo: '',
  },
  {
    id: 'dt_1010_ins_v1',
    policyId: 'dp_1010_ins',
    version: 1,
    truckId: 'truck_1010',
    unitNumber: '1010',
    company: 'Carrier B',
    name: 'Insurance',
    amount: 550,
    category: 'insurance',
    effectiveFrom: '2026-06-01',
    effectiveTo: '',
  },
  {
    id: 'legacy_eld',
    name: 'ELD',
    amount: 35,
    category: 'equipment',
  },
];

const created = api.versionPolicy(initial, {
  truckId: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier C',
  name: 'Insurance',
  amount: 500,
  category: 'insurance',
  effectiveFrom: '2026-07-15',
});

assert.equal(created.ok, true);
assert.equal(created.templates.length, 4);
const old1919 = created.templates.find(item => item.id === 'dt_1919_ins_v1');
const new1919 = created.policy;
const otherTruck = created.templates.find(item => item.id === 'dt_1010_ins_v1');
assert.equal(old1919.effectiveTo, '2026-07-14');
assert.equal(new1919.truckId, 'truck_1919');
assert.equal(new1919.company, 'Carrier C');
assert.equal(new1919.effectiveFrom, '2026-07-15');
assert.equal(new1919.amount, 500);
assert.equal(otherTruck.amount, 550);
assert.equal(otherTruck.effectiveTo, '');

const beforeChange = api.effectivePolicies(created.templates, 'truck_1919', '2026-07-13');
const afterChange = api.effectivePolicies(created.templates, 'truck_1919', '2026-07-20');
const truck1010 = api.effectivePolicies(created.templates, 'truck_1010', '2026-07-20');
assert.equal(beforeChange.length, 1);
assert.equal(beforeChange[0].amount, 450);
assert.equal(beforeChange[0].company, 'Carrier A');
assert.equal(afterChange.length, 1);
assert.equal(afterChange[0].amount, 500);
assert.equal(afterChange[0].company, 'Carrier C');
assert.equal(truck1010.length, 1);
assert.equal(truck1010[0].amount, 550);
assert.equal(api.effectivePolicies(created.templates, 'truck_unknown', '2026-07-20').length, 0);

const snapshot = api.buildWeeklySnapshot(null, {
  id: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier C',
}, '2026-07-20', afterChange);
assert.equal(snapshot.truckId, 'truck_1919');
assert.equal(snapshot.unitNumber, '1919');
assert.equal(snapshot.company, 'Carrier C');
assert.equal(snapshot.total, 500);
assert.equal(snapshot.items[0].policyVersionId, new1919.id);
assert.equal(snapshot.items[0].policyId, new1919.policyId);
assert.equal(snapshot.policySnapshotVersion, 1);

// Saving another amount on the same effective date updates that version, not history count.
const sameDateUpdate = api.versionPolicy(created.templates, {
  truckId: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier C',
  name: 'Insurance',
  amount: 525,
  category: 'insurance',
  effectiveFrom: '2026-07-15',
});
assert.equal(sameDateUpdate.updated, true);
assert.equal(sameDateUpdate.templates.length, 4);
assert.equal(sameDateUpdate.policy.amount, 525);
assert.equal(api.effectivePolicies(sameDateUpdate.templates, 'truck_1919', '2026-07-20')[0].amount, 525);

// Explicit End Date is retained and the earlier version closes automatically.
const explicitEnd = periods.versionPolicy(initial, {
  truckId: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier C',
  name: 'Insurance',
  amount: 500,
  category: 'insurance',
  effectiveFrom: '2026-07-15',
  effectiveTo: '2026-07-31',
});
assert.equal(explicitEnd.ok, true);
assert.equal(explicitEnd.policy.effectiveFrom, '2026-07-15');
assert.equal(explicitEnd.policy.effectiveTo, '2026-07-31');
assert.equal(explicitEnd.templates.find(item => item.id === 'dt_1919_ins_v1').effectiveTo, '2026-07-14');
assert.equal(explicitEnd.templates.find(item => item.id === 'dt_1010_ins_v1').effectiveTo, '');

// End Date before Start Date is rejected without changing the supplied history.
const invalid = periods.versionPolicy(initial, {
  truckId: 'truck_1919',
  name: 'ELD',
  amount: 50,
  category: 'equipment',
  effectiveFrom: '2026-08-01',
  effectiveTo: '2026-07-31',
});
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'end_before_start');
assert.equal(invalid.templates.length, initial.length);

// A version inserted before an already-planned future version cannot overlap it.
const withFuture = initial.concat([{
  id: 'dt_1919_ins_v3',
  policyId: 'dp_1919_ins',
  version: 3,
  truckId: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier D',
  name: 'Insurance',
  amount: 600,
  category: 'insurance',
  effectiveFrom: '2026-08-01',
  effectiveTo: '',
}]);
const inserted = periods.versionPolicy(withFuture, {
  truckId: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier C',
  name: 'Insurance',
  amount: 500,
  category: 'insurance',
  effectiveFrom: '2026-07-15',
  effectiveTo: '2026-08-10',
});
assert.equal(inserted.ok, true);
assert.equal(inserted.policy.effectiveTo, '2026-07-31');
assert.equal(inserted.templates.find(item => item.id === 'dt_1919_ins_v1').effectiveTo, '2026-07-14');
assert.equal(inserted.templates.find(item => item.id === 'dt_1919_ins_v3').effectiveFrom, '2026-08-01');

console.log('Effective deduction policy contract: ok');
