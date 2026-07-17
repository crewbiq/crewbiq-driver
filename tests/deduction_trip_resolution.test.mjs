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
  window: null,
};
context.window = context;
context.globalThis = context;

for (const file of [
  '../deduction-policy-hotfix.js',
  '../deduction-period-hotfix.js',
  '../settlement-week-hotfix.js',
  '../deduction-trip-resolution.js',
]) {
  vm.runInNewContext(
    fs.readFileSync(new URL(file, import.meta.url), 'utf8'),
    context,
    { filename: file },
  );
}

const calendar = context.CrewBIQSettlementWeek;
const api = context.CrewBIQDeductionTripResolution;
assert.equal(calendar.version, '0.1.0');
assert.equal(api.version, '0.2.0');
assert.equal(calendar.configuredWeekEndDay({ weekType: 'custom', weekEndDay: 4 }), 4);
assert.equal(calendar.configuredWeekEndDay({ weekType: 'amazon', weekEndDay: 6 }), 0);

const truck = {
  id: 'truck_1919',
  unitNumber: '1919',
  company: 'Carrier A',
  dispatchPercent: 10,
  weekType: 'custom',
  weekEndDay: 4, // Thursday => Friday-Thursday settlement week.
};

const thursdayPeriod = calendar.periodForDate('2026-07-14', truck);
assert.equal(thursdayPeriod.weekType, 'custom');
assert.equal(thursdayPeriod.weekEndDay, 4);
assert.equal(thursdayPeriod.weekEndDayLabel, 'Thursday');
assert.equal(thursdayPeriod.start, '2026-07-10');
assert.equal(thursdayPeriod.end, '2026-07-16');
// Non-custom/legacy trucks preserve the PWA's existing Monday-Sunday calendar,
// regardless of the database's older weekEndDay default.
const legacyPeriod = calendar.periodForDate('2026-07-14', { weekType: 'amazon', weekEndDay: 6 });
assert.equal(legacyPeriod.weekEndDay, 0);
assert.equal(legacyPeriod.start, '2026-07-13');
assert.equal(legacyPeriod.end, '2026-07-19');

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
  { id: 'load_old_1', truckId: truck.id, pickup: '2026-07-13', gross: 1000, driverPay: 100, totalMiles: 500 },
  { id: 'load_old_2', truckId: truck.id, pickup: '2026-07-14', gross: 1000, driverPay: 100, totalMiles: 500 },
  { id: 'load_new_1', truckId: truck.id, pickup: '2026-07-15', gross: 1000, driverPay: 100, totalMiles: 500 },
  { id: 'load_new_2', truckId: truck.id, pickup: '2026-07-16', gross: 1000, driverPay: 100, totalMiles: 500 },
];

// A mid-week version change still produces exactly one weekly amount. The
// version active on the configured Thursday settlement day wins.
const resolved = api.resolveSettlements(loads, truck, templates, []);
assert.equal(resolved.settlements.length, 1);
assert.equal(resolved.settlements[0].weekKey, '2026-07-10');
assert.equal(resolved.settlements[0].settlementDate, '2026-07-16');
assert.equal(resolved.settlements[0].source, 'settlement_date_auto');
assert.equal(resolved.settlements[0].items.length, 1);
assert.equal(resolved.settlements[0].items[0].policyVersionId, 'ins_v2');
assert.equal(resolved.settlements[0].total, 550);
assert.equal(resolved.automaticTotal, 550);
assert.equal(resolved.loadResolutions.length, 4);
assert.equal(resolved.loadResolutions[0].items[0].policyVersionId, 'ins_v1');
assert.equal(resolved.loadResolutions[2].items[0].policyVersionId, 'ins_v2');

// Multiple loads never multiply the weekly amount.
const sameWeek = api.resolveSettlements(loads.concat([
  { id: 'load_extra', truckId: truck.id, pickup: '2026-07-16', gross: 900 },
]), truck, templates, []);
assert.equal(sameWeek.settlements[0].items.length, 1);
assert.equal(sameWeek.automaticTotal, 550);

// A different company calendar can end on Friday instead.
const fridayTruck = { ...truck, weekEndDay: 5 };
const fridayPeriod = calendar.periodForDate('2026-07-16', fridayTruck);
assert.equal(fridayPeriod.start, '2026-07-11');
assert.equal(fridayPeriod.end, '2026-07-17');
const fridayResolved = api.resolveSettlements(loads, fridayTruck, templates, []);
assert.equal(fridayResolved.settlements[0].weekKey, '2026-07-11');
assert.equal(fridayResolved.settlements[0].settlementDate, '2026-07-17');
assert.equal(fridayResolved.automaticTotal, 550);

// An immutable snapshot for the exact settlement week always wins.
const existingSnapshot = [{
  id: 'wd_existing',
  truckId: truck.id,
  unitNumber: truck.unitNumber,
  weekKey: '2026-07-10',
  settlementDate: '2026-07-16',
  weekEndDay: 4,
  items: [{ name: 'Confirmed settlement', amount: 777 }],
  total: 777,
  policySnapshotVersion: 1,
}];
const immutable = api.resolveSettlements(loads, truck, templates, existingSnapshot);
assert.equal(immutable.settlements[0].source, 'immutable_weekly_snapshot');
assert.equal(immutable.settlements[0].immutable, true);
assert.equal(immutable.settlements[0].total, 777);
assert.equal(immutable.automaticTotal, 0);

// Changing to a custom calendar cannot add an automatic charge on top of an
// overlapping historical Monday-based snapshot.
const legacySnapshot = [{
  id: 'wd_legacy',
  truckId: truck.id,
  weekKey: '2026-07-13',
  items: [{ name: 'Legacy confirmed week', amount: 450 }],
  total: 450,
}];
const guarded = api.resolveSettlements(loads, truck, templates, legacySnapshot);
assert.equal(guarded.settlements[0].source, 'legacy_snapshot_overlap_guard');
assert.equal(guarded.automaticTotal, 0);
assert.equal(guarded.overlapGuardCount, 1);

// Gaps remain explicit and never invent a charge.
const gapLoad = { id: 'load_gap', truckId: truck.id, pickup: '2026-08-10' };
const gap = api.resolveLoad(gapLoad, truck, templates, 0);
assert.equal(gap.gap, true);
assert.equal(gap.total, 0);
assert.equal(gap.items.length, 0);
const gapSettlement = api.resolveSettlements([gapLoad], truck, templates, []);
assert.equal(gapSettlement.settlements[0].gap, true);
assert.equal(gapSettlement.automaticTotal, 0);

// Fleet finance uses the truck's Friday-Thursday period and subtracts one
// unsnapshotted weekly amount from REAL NET.
context.loads = loads;
context.loadFuelLogs = () => [{ id: 'fuel_1', truckId: truck.id, date: '2026-07-12', fuelCost: 100, defCost: 0 }];
context.loadServiceLogs = () => [{ id: 'svc_1', truckId: truck.id, date: '2026-07-13', amount: 50 }];
context.loadWeeklyDeds = () => [];
context.loadDedTemplates = () => templates;
context.loadDriverProfiles = () => [];
context.ownerFinanceForTruck = () => ({ loads: [] });
assert.equal(api.installFinanceWrapper(), true);
const finance = context.ownerFinanceForTruck(truck, 'week');
assert.equal(finance.settlementBounds.from, '2026-07-10');
assert.equal(finance.settlementBounds.to, '2026-07-16');
assert.equal(finance.loads.length, 4);
assert.equal(finance.gross, 4000);
assert.equal(finance.dispatchFee, 400);
assert.equal(finance.driverPay, 400);
assert.equal(finance.fuelCost, 100);
assert.equal(finance.serviceCost, 50);
assert.equal(finance.automaticDeductionTotal, 550);
assert.equal(finance.deductionTotal, 550);
assert.equal(finance.realNet, 2500);
assert.equal(finance.cpm, 1.25);
assert.equal(finance.deductionSettlements[0].items.length, 1);

console.log('Settlement-date deduction resolution contract: ok');
