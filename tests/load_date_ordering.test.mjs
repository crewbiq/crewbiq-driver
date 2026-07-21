import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = new Map();
let formScrollCalls = 0;
let windowScrollCalls = 0;

function scrollNode(name) {
  return {
    name,
    scrollTop: 999,
    scrollLeft: 50,
    style: {
      overflowAnchor: '',
      removeProperty(prop) {
        if (prop === 'overflow-anchor') this.overflowAnchor = '';
      },
    },
    scrollTo(options) {
      if (typeof options === 'object') {
        this.scrollTop = options.top;
        this.scrollLeft = options.left;
      } else {
        this.scrollTop = arguments[1] || 0;
        this.scrollLeft = arguments[0] || 0;
      }
    },
  };
}

const documentElement = scrollNode('documentElement');
const body = scrollNode('body');
const app = scrollNode('app');
const pageLoad = scrollNode('page-load');
const allLoads = scrollNode('allLoads');
const formCard = scrollNode('form-card');
formCard.scrollIntoView = options => {
  formScrollCalls += 1;
  assert.equal(options.block, 'start');
  assert.equal(options.inline, 'nearest');
};
const editField = {
  closest(selector) {
    assert.equal(selector, '.card');
    return formCard;
  },
};

const document = {
  readyState: 'complete',
  scrollingElement: documentElement,
  documentElement,
  body,
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  getElementById(id) {
    return ({
      app,
      'page-load': pageLoad,
      allLoads,
      loadEditId: editField,
    })[id] || null;
  },
};

const context = {
  console,
  Date,
  Number,
  Object,
  String,
  Array,
  JSON,
  document,
  setTimeout(handler) {
    handler();
    return 1;
  },
  requestAnimationFrame(handler) {
    handler();
    return 1;
  },
  scrollTo(options) {
    windowScrollCalls += 1;
    assert.equal(options.top, 0);
  },
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
function originalEdit(key) {
  editedKey = key;
  const load = capturedOptions.getLoads().find(item => item.id === key || item.loadId === key);
  assert.ok(load, 'prepared edit target must exist');
  assert.equal(load.gross.toFixed(2), '2097.69');
  assert.equal(load.detention.toFixed(2), '15.50');
  return true;
}

context.CrewBIQLoads = {
  init(options) {
    capturedOptions = options;
    return true;
  },
  editLoad: originalEdit,
};
context.editLoad = originalEdit;
context.CrewBIQLoadOrder.installRuntimeGuard();

assert.equal(context.CrewBIQLoads.loadOrderVersion, '0.5.0');
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

assert.deepEqual(
  context.CrewBIQLoadOrder.sortLoadsByDate([
    { loadId: 'A', pickup: '2025-03-01' },
    { loadId: 'B', delivery: '2025-03-01' },
  ]).map(load => load.loadId),
  ['A', 'B'],
);

function assertEditorRevealed() {
  assert.ok(formScrollCalls >= 1);
  assert.ok(windowScrollCalls >= 1);
  for (const node of [documentElement, body, app, pageLoad]) {
    assert.equal(node.scrollTop, 0, `${node.name} scrollTop`);
    assert.equal(node.scrollLeft, 0, `${node.name} scrollLeft`);
    assert.equal(node.style.overflowAnchor, '', `${node.name} overflow-anchor restored`);
  }
  assert.equal(formCard.style.scrollMarginTop, '78px');
}

// Module API path normalizes values and reveals the actual form card.
assert.equal(context.CrewBIQLoads.editLoad('RESTORED_STRING_VALUES'), true);
const normalized = rawLoads.find(load => load.loadId === 'RESTORED_STRING_VALUES');
assert.match(normalized.id, /^l_restored_string_values$/);
assert.equal(normalized.gross, 2097.69);
assert.equal(normalized.loadedMiles, 1377.74);
assert.equal(normalized.detention, 15.5);
assert.equal(editedKey, normalized.id);
assertEditorRevealed();

// Backwards-compatible global path used by inline onclick.
editedKey = '';
assert.equal(context.editLoad('RESTORED_STRING_VALUES'), true);
assert.equal(editedKey, normalized.id);
assertEditorRevealed();

// Capture-phase delegated guard invokes the guarded editor from the rendered
// pencil button and still reveals the form above the long list.
const clickHandler = listeners.get('click');
assert.equal(typeof clickHandler, 'function');
let prevented = false;
let stopped = false;
const button = {
  getAttribute(name) {
    assert.equal(name, 'onclick');
    return 'editLoad("RESTORED_STRING_VALUES")';
  },
  closest(selector) {
    assert.equal(selector, 'button[onclick^="editLoad("]');
    return this;
  },
};
editedKey = '';
clickHandler({
  target: button,
  preventDefault() { prevented = true; },
  stopImmediatePropagation() { stopped = true; },
});
assert.equal(prevented, true);
assert.equal(stopped, true);
assert.equal(editedKey, normalized.id);
assertEditorRevealed();
assert.equal(
  context.CrewBIQLoadOrder.parseInlineEditKey('editLoad("RESTORED_STRING_VALUES")'),
  'RESTORED_STRING_VALUES',
);

console.log('Load date ordering, pencil guard, and mobile form reveal contract: ok');
