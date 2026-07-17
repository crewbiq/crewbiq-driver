import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {
  console,
  Date,
  Number,
  Object,
  String,
  Array,
  window: null,
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(
  fs.readFileSync(new URL('../load-order-hotfix.js', import.meta.url), 'utf8'),
  context,
  { filename: 'load-order-hotfix.js' },
);

const rawLoads = [
  { loadId: 'PICKUP_15', pickup: '2025-12-15', delivery: '2025-12-16' },
  { loadId: 'DELIVERY_ONLY_22', pickup: '', delivery: '2025-12-22' },
  { loadId: 'PICKUP_14', pickup: '2025-12-14', delivery: '2025-12-15' },
  { loadId: 'DELIVERY_ALIAS_24', deliveryDate: '2025-12-24' },
  { loadId: 'LEGACY_DATE_23', date: '12/23/2025' },
  { loadId: 'PICKUP_WINS', pickup: '2025-12-13', delivery: '2025-12-30' },
  { loadId: 'NO_DATE' },
  {
    loadId: 'RESTORED_STRING_VALUES',
    pickup: '2025-12-25',
    gross: '2097.69',
    loadedMiles: '1377.74',
    deadMiles: '25',
    totalMiles: '1402.74',
    driverPay: '0.00',
    detention: '15.50',
    layover: '0',
  },
];

let capturedOptions = null;
let editedKey = '';
context.CrewBIQLoads = {
  init(options) {
    capturedOptions = options;
    return true;
  },
  editLoad(key) {
    editedKey = key;
    const load = capturedOptions.getLoads().find(item => item.id === key || item.loadId === key);
    assert.ok(load, 'prepared edit target must exist');
    // Mirrors the historic loads.js edit path that aborted when a restored
    // monetary field was a string instead of a JavaScript Number.
    assert.equal(load.gross.toFixed(2), '2097.69');
    assert.equal(load.detention.toFixed(2), '15.50');
    return true;
  },
};

assert.equal(context.CrewBIQLoads.loadOrderVersion, '0.2.0');
assert.equal(context.CrewBIQLoads.init({
  getLoads: () => rawLoads,
  setLoads: value => { rawLoads.splice(0, rawLoads.length, ...value); },
}), true);

assert.deepEqual(
  capturedOptions.getLoads().map(load => load.loadId),
  [
    'RESTORED_STRING_VALUES',
    'DELIVERY_ALIAS_24',
    'LEGACY_DATE_23',
    'DELIVERY_ONLY_22',
    'PICKUP_15',
    'PICKUP_14',
    'PICKUP_WINS',
    'NO_DATE',
  ],
);

// Pickup remains the canonical date even when delivery is later.
assert.equal(
  context.CrewBIQLoadOrder.loadDateKey(rawLoads.find(load => load.loadId === 'PICKUP_WINS')),
  '2025-12-13',
);

capturedOptions.setLoads([
  { loadId: 'OLDER', pickup: '2025-01-01' },
  { loadId: 'NEWER_LEGACY', delivery: '2025-02-01' },
  rawLoads.find(load => load.loadId === 'RESTORED_STRING_VALUES'),
]);
assert.deepEqual(
  rawLoads.map(load => load.loadId),
  ['RESTORED_STRING_VALUES', 'NEWER_LEGACY', 'OLDER'],
);

// Equal dates remain stable, preventing unexpected reordering of same-day loads.
assert.deepEqual(
  context.CrewBIQLoadOrder.sortLoadsByDate([
    { loadId: 'A', pickup: '2025-03-01' },
    { loadId: 'B', delivery: '2025-03-01' },
  ]).map(load => load.loadId),
  ['A', 'B'],
);

// API edit path: restored decimal strings are converted to finite numbers and
// an id-less legacy load receives an in-memory stable ID before edit opens.
assert.equal(context.CrewBIQLoads.editLoad('RESTORED_STRING_VALUES'), true);
const normalized = rawLoads.find(load => load.loadId === 'RESTORED_STRING_VALUES');
assert.match(normalized.id, /^l_restored_string_values$/);
assert.equal(normalized.gross, 2097.69);
assert.equal(normalized.loadedMiles, 1377.74);
assert.equal(normalized.detention, 15.5);
assert.equal(editedKey, normalized.id);

// Backwards-compatible global editLoad assignment is also intercepted because
// the rendered pencil button calls window.editLoad(...), not the module API.
let globalEditReceived = '';
context.editLoad = key => {
  globalEditReceived = key;
  const load = rawLoads.find(item => item.id === key);
  assert.equal(load.gross.toFixed(2), '2097.69');
  return 'opened';
};
assert.equal(context.editLoad('RESTORED_STRING_VALUES'), 'opened');
assert.equal(globalEditReceived, normalized.id);

console.log('Load date ordering and restored edit contract: ok');
