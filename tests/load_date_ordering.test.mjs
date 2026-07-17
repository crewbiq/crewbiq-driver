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
];

let capturedOptions = null;
context.CrewBIQLoads = {
  init(options) {
    capturedOptions = options;
    return true;
  },
};

assert.equal(context.CrewBIQLoads.loadOrderVersion, '0.1.0');
assert.equal(context.CrewBIQLoads.init({
  getLoads: () => rawLoads,
  setLoads: value => { rawLoads.splice(0, rawLoads.length, ...value); },
}), true);

assert.deepEqual(
  capturedOptions.getLoads().map(load => load.loadId),
  [
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
]);
assert.deepEqual(rawLoads.map(load => load.loadId), ['NEWER_LEGACY', 'OLDER']);

// Equal dates remain stable, preventing unexpected reordering of same-day loads.
assert.deepEqual(
  context.CrewBIQLoadOrder.sortLoadsByDate([
    { loadId: 'A', pickup: '2025-03-01' },
    { loadId: 'B', delivery: '2025-03-01' },
  ]).map(load => load.loadId),
  ['A', 'B'],
);

console.log('Load date ordering contract: ok');
