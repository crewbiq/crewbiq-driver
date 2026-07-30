import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const resolverSource = readFileSync(
  new URL('./fleet-load-resolution.js', import.meta.url),
  'utf8',
);
const loadsSource = readFileSync(new URL('./loads.js', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('./sync.js', import.meta.url), 'utf8');

function functionSource(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start + signature.length);
  assert.ok(start >= 0 && end > start, `${signature} must have stable boundaries`);
  return source.slice(start, end);
}

function namedFunctionSource(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} must exist`);
  const opening = source.indexOf('{', start + signature.length);
  assert.ok(opening > start, `${signature} must have a body`);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${signature} must have a balanced body`);
}

test('protected review UI is period-scoped, owner-only, empty-first, and API-backed', () => {
  const fleetMarkupStart = html.indexOf('id="fleetStatsSection"');
  const fleetMarkupEnd = html.indexOf('id="page-settings"', fleetMarkupStart);
  assert.ok(fleetMarkupStart >= 0 && fleetMarkupEnd > fleetMarkupStart);
  const fleetMarkup = html.slice(fleetMarkupStart, fleetMarkupEnd);
  assert.match(fleetMarkup, /id="[^"]*(?:Unresolved|unresolved)[^"]*"/);

  const renderSource = functionSource(
    html,
    'function renderFleetStats()',
    'function fleetReportPeriod(',
  );
  assert.match(renderSource, /if \(role === 'driver'\) \{ section\.style\.display = 'none'; return; \}/);
  assert.match(
    renderSource,
    /unassignedFleetLoads\(periodLoads, trucks, driverProfiles\)/,
  );
  assert.match(renderSource, /<option value="">[^<]*Select truck[^<]*<\/option>/i);
  assert.match(renderSource, /activeTrucks\(\)|loadTrucks\(\)/);
  assert.match(renderSource, /\.assignUnresolvedLoad\(/);
  assert.equal(
    (renderSource.match(/\.unassignedFleetLoads\(/g) || []).length,
    1,
    'renderFleetStats must reuse its existing unassignedLoads result',
  );
  assert.doesNotMatch(
    renderSource,
    /CrewBIQLoads\.assignUnresolvedLoad\([^,]+,\s*(?:trucks|activeTrucks\(\))\[0\]/,
  );
  assert.ok(
    renderSource.indexOf('var periodLoads = allLoads.filter') <
      renderSource.indexOf('unassignedFleetLoads(periodLoads, trucks, driverProfiles)'),
  );
});

test('protected assignment helper enforces role and explicit selection before one API call', () => {
  const helper = namedFunctionSource(
    html,
    'function assignFleetUnresolvedLoad(loadKey, selectId)',
  );
  const calls = [];
  const toasts = [];
  let role = 'driver';
  let selectedValue = 'T2';
  let apiResult = true;
  const api = {
    assignUnresolvedLoad(loadKey, truckId) {
      calls.push({ loadKey, truckId });
      return apiResult;
    },
  };
  const context = {
    CrewBIQLoads: api,
    Core: {
      toast(message, kind) {
        toasts.push({ message, kind });
      },
    },
    document: {
      getElementById(selectId) {
        return selectId === 'selector-1' ? { value: selectedValue } : null;
      },
    },
    getUserRole: () => role,
    renderAll() {},
    toast(message, kind) {
      toasts.push({ message, kind });
    },
    window: { CrewBIQLoads: api },
  };
  vm.runInNewContext(
    `${helper}; this.assign = assignFleetUnresolvedLoad;`,
    context,
  );

  context.assign('LOAD-1', 'selector-1');
  assert.equal(calls.length, 0);

  role = 'fleet';
  selectedValue = '';
  context.assign('LOAD-1', 'selector-1');
  assert.equal(calls.length, 0);

  selectedValue = 'T2';
  context.assign('LOAD-1', 'selector-1');
  assert.deepEqual(calls, [{ loadKey: 'LOAD-1', truckId: 'T2' }]);

  apiResult = false;
  selectedValue = 'T1';
  context.assign('LOAD-2', 'selector-1');
  assert.deepEqual(calls, [
    { loadKey: 'LOAD-1', truckId: 'T2' },
    { loadKey: 'LOAD-2', truckId: 'T1' },
  ]);
  assert.equal(toasts.at(-1)?.kind, 'err');
});

function createIntegratedHarness() {
  const storage = new Map([['fiqD_sessionToken', 'session-1']]);
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
  };
  const trucks = [
    { id: 'T1', unitNumber: '101', active: true },
    { id: 'T2', unitNumber: '202', active: true },
  ];
  let loads = [
    {
      id: 'local-1',
      loadId: 'LOAD-1',
      pickup: '2026-07-28',
      truckId: 'STALE',
      unitNumber: 'OLD',
      synced: true,
      notes: 'keep',
    },
  ];
  const events = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    JSON,
    Math,
    Intl,
    localStorage,
    navigator: { userAgent: 'SIDR protected contract' },
    location: { href: 'https://example.test/crewbiq-driver/' },
    document: {
      addEventListener() {},
      getElementById() {
        return null;
      },
    },
    getUserRole: () => 'fleet',
    loadTrucks: () => trucks,
    loadDriverProfiles: () => [],
    getOwnerSyncData: () => ({ trucks, driverProfiles: [] }),
    applyOwnerSyncData: () => ({ changed: false }),
    fetch: async () => ({
      ok: true,
      async json() {
        return {
          ok: true,
          loads: [
            {
              id: 'local-1',
              loadId: 'LOAD-1',
              truckId: 'REMOTE',
              unitNumber: '999',
              synced: true,
            },
          ],
          ptiLog: [],
          disputes: [],
        };
      },
    }),
    CrewBIQCore: {
      events: {
        on() {},
        emit(name, payload) {
          events.push({ name, payload });
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
  vm.runInNewContext(loadsSource, context, { filename: 'loads.js' });
  context.CrewBIQLoads.init({
    getDriver: () => ({
      crewId: 'crew-1',
      email: 'owner@example.com',
      unitNumber: '',
      syncUrl: 'https://sync.example.test',
    }),
    getLoads: () => loads,
    setLoads: value => {
      loads = value;
    },
    getPtiLog: () => [],
    saveAll() {},
    doSync() {},
    renderAll() {},
    showPage() {},
  });
  vm.runInNewContext(syncSource, context, { filename: 'sync.js' });
  context.CrewBIQSync.init({
    getDriver: () => ({
      crewId: 'crew-1',
      email: 'owner@example.com',
      unitNumber: '',
      syncUrl: 'https://sync.example.test',
    }),
    getLoads: () => loads,
    setLoads: value => {
      loads = value;
    },
    getPtiLog: () => [],
    setPtiLog() {},
    getDisputes: () => [],
    setDisputes() {},
    saveAll() {},
    getTimer: () => null,
    setTimer() {},
    renderAll() {},
  });
  return { context, events, getLoads: () => loads };
}

test('protected existing sync payload and restore contour preserve explicit assignment', async () => {
  const harness = createIntegratedHarness();
  assert.equal(
    harness.context.CrewBIQLoads.assignUnresolvedLoad('local-1', 'T2'),
    true,
  );

  const payload = harness.context.CrewBIQSync.buildSyncPayload(false);
  assert.equal(payload.loads.length, 1);
  assert.equal(payload.loads[0].truckId, 'T2');
  assert.equal(payload.loads[0].unitNumber, '202');
  assert.equal(payload.loads[0].synced, false);

  const restored = await harness.context.CrewBIQSync.pullFromCloud({
    silent: true,
    sessionToken: 'session-1',
  });
  assert.equal(restored.ok, true);
  const load = harness.getLoads().find(item => item.id === 'local-1');
  assert.equal(load.truckId, 'T2');
  assert.equal(load.unitNumber, '202');
  assert.equal(load.synced, false);
});
