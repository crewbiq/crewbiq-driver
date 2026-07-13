import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
storage.set('fiqD_driver', JSON.stringify({
  crewId: 'CBQ-OWNER',
  email: 'owner@example.com',
  syncUrl: 'https://crewbiq-orchestrator-production.up.railway.app/v1/sync',
}));

let expenses = [{ id: 'exp_acceptance', amount: 1 }, { id: 'exp_keep', amount: 25 }];
let serviceLogs = [
  { id: 'svc_wrong_unit', truckId: 'truck_1919', date: '2026-07-02', amount: 76.32 },
  { id: 'svc_keep', truckId: 'truck_1919', date: '2026-06-16', amount: 4185.30 },
];
let templates = [{ id: 'dt_old', name: 'Insurance', amount: 450 }];
let weekly = [{
  id: 'wd_current',
  weekKey: '2026-07-06',
  items: [{ name: 'Insurance', amount: 450 }, { name: 'ELD', amount: 35 }],
  total: 485,
}];
let cloudApplied = null;
let syncCalls = 0;
let lastRequest = null;
let responseOk = true;
const listeners = {};
const timers = [];

const context = {
  console,
  Date,
  Math,
  Promise,
  JSON,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
  document: {
    readyState: 'loading',
    addEventListener(name, fn) { listeners[name] = fn; },
  },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
  fetch: async function (input, init = {}) {
    lastRequest = { input, init };
    return { ok: responseOk, status: responseOk ? 200 : 503 };
  },
  loadExpenses() { return expenses; },
  saveExpenses(value) { expenses = structuredClone(value); },
  loadServiceLogs() { return serviceLogs; },
  saveServiceLogs(value) { serviceLogs = structuredClone(value); },
  loadDedTemplates() { return templates; },
  saveDedTemplates(value) { templates = structuredClone(value); },
  loadWeeklyDeds() { return weekly; },
  saveWeeklyDeds(value) { weekly = structuredClone(value); },
  applyOwnerSyncData(value) { cloudApplied = structuredClone(value); return { changed: true }; },
  forceFullSync() { syncCalls++; return Promise.resolve({ ok: true }); },
  structuredClone,
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(
  fs.readFileSync(new URL('../owner-snapshot-hotfix.js', import.meta.url), 'utf8'),
  context,
  { filename: 'owner-snapshot-hotfix.js' },
);
listeners.DOMContentLoaded();

assert.equal(context.CrewBIQOwnerSnapshots.version, '0.2.0');

// Deleting the acceptance expense creates a pending complete snapshot.
context.saveExpenses([{ id: 'exp_keep', amount: 25 }]);
let pending = context.CrewBIQOwnerSnapshots.loadPending();
assert.deepEqual(pending.expenses.value, [{ id: 'exp_keep', amount: 25 }]);

// Deleting a service entry creates a complete snapshot before cloud restore can
// resurrect the row that still exists in PostgreSQL.
context.saveServiceLogs([{ id: 'svc_keep', truckId: 'truck_1919', date: '2026-06-16', amount: 4185.30 }]);
pending = context.CrewBIQOwnerSnapshots.loadPending();
assert.deepEqual(pending.serviceLogs.value, serviceLogs);
assert.equal(pending.serviceLogs.value.some(item => item.id === 'svc_wrong_unit'), false);

// A cloud restore containing both deleted rows cannot resurrect either while pending.
context.applyOwnerSyncData({
  expenses: [{ id: 'exp_acceptance', amount: 1 }, { id: 'exp_keep', amount: 25 }],
  serviceLogs: [
    { id: 'svc_wrong_unit', truckId: 'truck_1919', date: '2026-07-02', amount: 76.32 },
    { id: 'svc_keep', truckId: 'truck_1919', date: '2026-06-16', amount: 4185.30 },
  ],
  deductionTemplates: templates,
  weeklyDeductions: weekly,
});
assert.deepEqual(cloudApplied.expenses, [{ id: 'exp_keep', amount: 25 }]);
assert.deepEqual(cloudApplied.serviceLogs, [{ id: 'svc_keep', truckId: 'truck_1919', date: '2026-06-16', amount: 4185.30 }]);

// Deleting a weekly item and a template also creates complete pending snapshots.
context.saveWeeklyDeds([{
  id: 'wd_current',
  weekKey: '2026-07-06',
  items: [{ name: 'ELD', amount: 35 }],
  total: 35,
}]);
context.saveDedTemplates([]);
pending = context.CrewBIQOwnerSnapshots.loadPending();
assert.equal(pending.weeklyDeductions.value[0].items.length, 1);
assert.deepEqual(pending.deductionTemplates.value, []);

// Authenticated report carries all complete arrays and explicit replacement markers.
await context.fetch('https://crewbiq-orchestrator-production.up.railway.app/v1/sync/pwa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'driver_report',
    driver: JSON.parse(storage.get('fiqD_driver')),
    ownerData: {},
    loads: [],
    ptiLog: [],
  }),
});

const sent = JSON.parse(lastRequest.init.body);
assert.deepEqual(
  Array.from(sent.ownerData.snapshotEntities).sort(),
  ['deductionTemplates', 'expenses', 'serviceLogs', 'weeklyDeductions'],
);
assert.deepEqual(sent.ownerData.expenses, [{ id: 'exp_keep', amount: 25 }]);
assert.deepEqual(sent.ownerData.serviceLogs, serviceLogs);
assert.deepEqual(sent.ownerData.deductionTemplates, []);
assert.equal(sent.ownerData.weeklyDeductions[0].total, 35);
assert.deepEqual(sent.expenses, sent.ownerData.expenses);

// Successful acknowledgement clears only the pending versions that were sent.
assert.deepEqual(context.CrewBIQOwnerSnapshots.loadPending(), {});

// A failed sync retains a service deletion for retry after app restart.
responseOk = false;
context.saveServiceLogs([]);
await context.fetch('https://crewbiq-orchestrator-production.up.railway.app/v1/sync/pwa', {
  method: 'POST',
  body: JSON.stringify({ type: 'driver_report', driver: JSON.parse(storage.get('fiqD_driver')), ownerData: {} }),
});
assert.deepEqual(context.CrewBIQOwnerSnapshots.loadPending().serviceLogs.value, []);

// Pending work schedules retry; execute one queued timer to prove full sync remains reachable.
const retry = timers.pop();
if (retry) await retry();
assert.ok(syncCalls >= 1);

console.log('Owner snapshot deletion durability contract: ok');
