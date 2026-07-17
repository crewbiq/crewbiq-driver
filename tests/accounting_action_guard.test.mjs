import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const fixedNow = new Date('2026-07-16T12:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow.getTime(); }
}

const context = {
  console,
  JSON,
  Math,
  Date: FixedDate,
  confirm: () => false,
  window: null,
};
context.window = context;
context.globalThis = context;

for (const file of [
  '../deduction-policy-hotfix.js',
  '../settlement-week-hotfix.js',
  '../deduction-trip-resolution.js',
  '../accounting-action-guard.js',
]) {
  vm.runInNewContext(
    fs.readFileSync(new URL(file, import.meta.url), 'utf8'),
    context,
    { filename: file },
  );
}

const guard = context.CrewBIQAccountingGuard;
const resolver = context.CrewBIQDeductionTripResolution;
assert.equal(guard.version, '0.1.0');
assert.equal(guard.confirmAction('blocked'), false);
context.confirm = () => true;
assert.equal(guard.confirmAction('allowed'), true);

const truck = {
  id: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier A',
  weekType: 'custom',
  weekEndDay: 4,
};
const period = {
  weekType: 'custom',
  weekEndDay: 4,
  start: '2026-07-10',
  end: '2026-07-16',
};
const previous = {
  id: 'wd_truck_1919_2026-07-10',
  truckId: truck.id,
  unitNumber: truck.unitNumber,
  weekKey: period.start,
  settlementDate: period.end,
  weekEndDay: period.weekEndDay,
  items: [{ name: 'Insurance', amount: 450, category: 'insurance' }],
  total: 450,
};

const skipped = guard.buildSkipSnapshot(previous, truck, period, '2026-07-16T12:00:00.000Z');
assert.equal(skipped.id, previous.id);
assert.equal(skipped.total, 0);
assert.equal(skipped.items.length, 1);
assert.equal(skipped.items[0].category, 'week_exception');
assert.equal(skipped.items[0].status, 'skipped');
assert.equal(skipped.items[0].reason, 'truck_not_operating');
assert.equal(skipped.items[0].previousSnapshot.total, 450);
assert.equal(guard.isSkippedSnapshot(skipped), true);

// Restore uses the exact previous confirmed snapshot when the week was skipped
// after an amount had already been recorded.
const restoredPrevious = guard.restoreSnapshot(skipped, truck, period, []);
assert.deepEqual(restoredPrevious, previous);

const templates = [{
  id: 'insurance_v2',
  policyId: 'insurance_1919',
  version: 2,
  truckId: truck.id,
  unitNumber: truck.unitNumber,
  company: truck.company,
  name: 'Insurance',
  amount: 550,
  category: 'insurance',
  effectiveFrom: '2026-07-15',
  effectiveTo: '',
}];

// A week skipped before any snapshot existed can be restored from policies
// active on the configured settlement day.
const skippedWithoutPrevious = guard.buildSkipSnapshot(null, truck, period, '2026-07-16T12:00:00.000Z');
assert.equal(skippedWithoutPrevious.items[0].previousSnapshot, null);
const restoredFromPolicies = guard.restoreSnapshot(skippedWithoutPrevious, truck, period, templates);
assert.equal(restoredFromPolicies.total, 550);
assert.equal(restoredFromPolicies.items.length, 1);
assert.equal(restoredFromPolicies.items[0].policyVersionId, 'insurance_v2');
assert.equal(restoredFromPolicies.weekKey, period.start);
assert.equal(restoredFromPolicies.settlementDate, period.end);

// A durable skipped-week snapshot is authoritative. Even when loads arrive
// later, automatic resolution must not add the weekly amount back.
const loads = [
  { id: 'load_1', truckId: truck.id, pickup: '2026-07-14', gross: 1000 },
  { id: 'load_2', truckId: truck.id, pickup: '2026-07-16', gross: 1000 },
];
const suppressed = resolver.resolveSettlements(loads, truck, templates, [skippedWithoutPrevious]);
assert.equal(suppressed.settlements.length, 1);
assert.equal(suppressed.settlements[0].source, 'immutable_weekly_snapshot');
assert.equal(suppressed.settlements[0].total, 0);
assert.equal(suppressed.automaticTotal, 0);

console.log('Accounting skipped-week guard contract: ok');
