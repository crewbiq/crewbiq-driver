import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// WRITE-ORCH-03, specified in docs/collaboration/LEGACY_SYNC_DECOMMISSION_CONTRACT.md
// section 4: an expense save must persist immediately to local storage and
// reach only the Orchestrator over the network, never script.google.com or
// the crewbiq-expenses literal. This exercises the REAL addExpense() from
// index.html (extracted by source location, the same convention used by
// tests/restore_orchestrator_transport.test.mjs and
// tests/index-startup-composition.test.mjs), the REAL
// installExpenseSaveHook()/scheduleExpenseSync() from restore-hotfix.js
// (which wraps the real saveExpenses(), exactly as production's script load
// order does), the real sync.js forceFullSync()/doSync(), and the real
// core-runtime.js dispatcher. The former dedicated syncExpensesNow() write
// was removed as redundant (attachExpensesToReport() already injects scoped
// expenses into every driver_report call the general sync path makes);
// scheduleExpenseSync() now debounce-triggers forceFullSync() instead.

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const restoreHotfixSource = fs.readFileSync(new URL('../restore-hotfix.js', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../core-runtime.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../sync.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, 'missing start marker: ' + start);
  assert.notEqual(endAt, -1, 'missing end marker: ' + end);
  return source.slice(startAt, endAt);
}

// Three small, independently-locatable slices, concatenated: identity/scoped
// storage, general utils (fmt/today/escHtml/toast), and the Expenses module
// itself. Nothing here is a hand-rewritten stand-in for index.html's code.
const identitySlice = section(html, 'function identitySlug(value){', 'function sortLoadsNewest(arr){');
const utilsSlice = section(html, 'function fmt(n){', '// ── SETUP ──');
const expensesSlice = section(html, 'function loadExpenses(){', '// ── LAZY CAPTURE');
assert.match(expensesSlice, /function addExpense\(\)\{/, 'the extracted slice must contain the real addExpense() implementation');

function fakeInput(value) {
  return { value, classList: { add() {}, remove() {}, toggle() {} }, style: {}, textContent: '', addEventListener() {} };
}

function buildContext() {
  const storageMap = new Map();
  const localStorage = {
    getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null; },
    setItem(key, value) { storageMap.set(key, String(value)); },
    removeItem(key) { storageMap.delete(key); },
  };
  const elements = {
    expAmount: fakeInput('42.50'),
    expDate: fakeInput('2026-09-01'),
    expType: fakeInput('fuel'),
    expOwner: fakeInput('driver'),
    expLoadId: fakeInput('amz-100'),
    expStatus: fakeInput('pending'),
    expNote: fakeInput(''),
    expOdometer: fakeInput('123456'),
    expOdoRow: { style: {} },
    toast: { textContent: '', className: '', classList: { add() {}, remove() {} } },
  };
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
  };
  const nativeCalls = [];
  async function nativeFetch(url, init = {}) {
    const call = { url: String(url), method: String((init && init.method) || 'GET').toUpperCase() };
    nativeCalls.push(call);
    if (call.url.includes('/v1/sync')) {
      const body = JSON.parse((init && init.body) || '{}');
      const recId = (body.payload && body.payload.record_id) || body.record_id;
      return new Response(JSON.stringify({ ok: true, received: true, record_id: recId }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected native fetch in WRITE-ORCH-03: ' + call.method + ' ' + call.url);
  }
  const context = {
    console,
    localStorage,
    document,
    fetch: nativeFetch,
    Response,
    Headers,
    Request,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    confirm: () => true,
  };
  context.window = context;
  context.globalThis = context;

  // Production load order: core-runtime.js first (installs the Orchestrator
  // dispatcher), then restore-hotfix.js (captures whatever fetch is current
  // as its own previousFetch, and defers installExpenseSaveHook() via
  // setTimeout since document.readyState is not 'loading') - both BEFORE
  // index.html's own inline script (which defines saveExpenses) runs, just
  // as core.js's document.write() ordering guarantees in production.
  vm.runInNewContext(runtimeSource, context, { filename: 'core-runtime.js' });
  assert.notEqual(context.fetch, nativeFetch, 'core-runtime.js must have installed its own Orchestrator dispatcher');

  vm.runInNewContext(restoreHotfixSource, context, { filename: 'restore-hotfix.js' });
  assert.ok(context.CrewBIQRestoreHotfix, 'restore-hotfix.js must expose CrewBIQRestoreHotfix on the shared context');

  const K = 'fiqD_';
  vm.runInContext('const K = ' + JSON.stringify(K) + ';', context);
  vm.runInContext('let driver = null;', context);
  vm.runInContext(identitySlice, context, { filename: 'index-identity-slice.js' });
  vm.runInContext(utilsSlice, context, { filename: 'index-utils-slice.js' });
  vm.runInContext(expensesSlice, context, { filename: 'index-expenses-slice.js' });
  assert.equal(typeof context.saveExpenses, 'function', 'the vm must expose the real extracted saveExpenses()');
  assert.equal(typeof context.addExpense, 'function', 'the vm must expose the real extracted addExpense()');

  // sync.js, loaded and initialized so scheduleExpenseSync()'s forceFullSync()
  // trigger has something real to call. init()'s accessors are written as vm
  // source (not Node-side closures) because `driver` here is a lexical
  // binding created via vm.runInContext, invisible as a property from
  // outside the vm - a Node-side `() => driver` would read the wrong scope.
  vm.runInNewContext(syncSource, context, { filename: 'sync.js' });
  assert.ok(context.CrewBIQSync, 'sync.js must expose CrewBIQSync on the shared context');
  vm.runInContext(`
    CrewBIQSync.init({
      getDriver: () => driver,
      getLoads: () => [],
      setLoads: () => {},
      getPtiLog: () => [],
      setPtiLog: () => {},
      getDisputes: () => [],
      setDisputes: () => {},
      saveAll: () => {},
      getTimer: () => null,
      setTimer: () => {},
    });
  `, context, { filename: 'expense-test-sync-init.js' });

  return { context, localStorage, elements, nativeCalls };
}

const { context, elements, nativeCalls } = buildContext();

// context.driver = {...} would NOT work here: `let driver` was declared via
// vm.runInContext as a lexical binding inside the sandbox, not a property
// of the context object, so an outside assignment to context.driver is
// invisible to code running inside the vm. Must reassign it via vm code.
const driverFixture = {
  crewId: 'CBQ-WRITE-EXP', email: 'driver@example.com', name: 'Driver',
  syncUrl: 'https://script.google.com/macros/s/example/exec',
};
vm.runInContext('driver = ' + JSON.stringify(driverFixture) + ';', context);
context.localStorage.setItem('fiqD_sessionToken', 'token-write-exp-1');
// restore-hotfix.js's attachExpensesToReport() reads the driver via
// storedDriver(), which parses localStorage['fiqD_driver'] directly - a
// separate read path from the in-memory `driver` variable index.html's own
// code (and sync.js's CrewBIQSync.init() getDriver accessor) uses. Real
// saveAll() persists both in sync; this test must too.
context.localStorage.setItem('fiqD_driver', JSON.stringify(driverFixture));

// Let restore-hotfix.js's deferred installExpenseSaveHook() (setTimeout 0)
// run now that the real saveExpenses() it wraps has been defined above -
// this mirrors production's actual script ordering, not a workaround.
await new Promise((resolve) => setTimeout(resolve, 0));

const savedExpensesBefore = context.saveExpenses.__crewbiqExpenseHook;
assert.equal(savedExpensesBefore, true, 'restore-hotfix.js must have wrapped the real saveExpenses() with its expense-sync hook');

context.addExpense();

// Local persistence must be immediate and synchronous, independent of
// whatever the debounced network sync does afterward.
const persisted = JSON.parse(context.localStorage.getItem('fiqD_data_crew_cbq_write_exp_expenses') || 'null');
assert.ok(Array.isArray(persisted), 'the expense list must be persisted to the driver-scoped local storage key synchronously');
assert.equal(persisted.length, 1, 'exactly one expense must be persisted');
assert.equal(persisted[0].amount, 42.5, 'the entered amount must be persisted exactly as entered');
assert.equal(persisted[0].type, 'fuel');
assert.equal(persisted[0].synced, false, 'a freshly-saved expense must not be marked synced until the Orchestrator confirms it');

// forceFullSync() is scheduled with a 900ms debounce (scheduleExpenseSync);
// wait past it so the fire-and-forget network attempt actually fires before
// asserting on its destination.
await new Promise((resolve) => setTimeout(resolve, 950));

assert.ok(nativeCalls.length > 0, 'the debounced expense sync must have attempted at least one real network call');
assert.equal(
  nativeCalls.every((call) => call.url.startsWith('https://crewbiq-orchestrator-production.up.railway.app/')),
  true,
  'every real network call triggered by the expense save must target the configured Orchestrator, never script.google.com or the crewbiq-expenses literal',
);
assert.equal(
  nativeCalls.some((call) => call.url.includes('script.google.com') || call.url.includes('crewbiq-expenses')),
  false,
  'no real network call may target script.google.com or the crewbiq-expenses literal',
);

console.log('WRITE-ORCH-03: ok (real expense save persists locally and reaches only the Orchestrator, ' + nativeCalls.length + ' native call(s))');
