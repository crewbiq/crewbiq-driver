import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = {};
let serviceLogs = [];
let confirmCount = 0;
let saveCount = 0;
let lastToast = null;

const context = {
  console,
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  document: {
    readyState: 'loading',
    addEventListener(name, fn) { listeners[name] = fn; },
    getElementById() { return null; },
    createElement() { return { id: '', innerHTML: '' }; },
  },
  loadTrucks() {
    return [{ id: 'truck_1919', unitNumber: '1919', year: 2019, make: 'Mack', model: 'Anthem', active: true }];
  },
  loadServiceLogs() { return serviceLogs; },
  saveServiceLogs(value) { serviceLogs = JSON.parse(JSON.stringify(value)); saveCount++; },
  confirm() { confirmCount++; return true; },
  toast(message, type) { lastToast = { message, type }; },
  showPage() {},
  renderServicePage() {},
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(
  fs.readFileSync(new URL('../ocr-service-invoice-review.js', import.meta.url), 'utf8'),
  context,
  { filename: 'ocr-service-invoice-review.js' },
);

assert.equal(context.CrewBIQServiceInvoice.version, '0.1.0');

const result = {
  ok: true,
  schema_version: '1.2',
  request_id: 'ocr_aas_4671',
  document_type: 'service_invoice',
  requested_document_type: 'service_invoice',
  confidence: 'high',
  invoice_number: 'INV-4671',
  vendor: 'AAS TRUCK AND TRAILER REPAIR INC',
  location: 'Newton, KS',
  date: '2026-06-16',
  truck_unit: '1919',
  odometer: 819795,
  subtotal: 4355.30,
  discount: 170,
  tax: 0,
  fees: 0,
  total_due: 4185.30,
  service_groups: [
    {
      category: 'Front Axle / Suspension',
      description: 'Front leaf spring bushing, king pin and hub bearing repair',
      parts_amount: 2075.30,
      labor_amount: 1600,
      subtotal: 3675.30,
      part_numbers: ['005242'],
    },
    {
      category: 'Oil & Fluids',
      description: 'Full PM service: oil, filters and grease',
      parts_amount: 300,
      labor_amount: 200,
      subtotal: 500,
    },
    {
      category: 'Alignment',
      description: 'Front axle alignment',
      labor_amount: 180,
      subtotal: 180,
    },
  ],
  warnings: [],
};

const state = context.CrewBIQServiceInvoice.buildState(result);
assert.equal(state.parent.truckId, 'truck_1919');
assert.equal(state.parent.unitNumber, '1919');
assert.equal(state.groups.length, 3);
assert.equal(state.groupSubtotal, 4355.30);
assert.equal(state.allocatedNet, 4185.30);
assert.equal(state.reconciliationDifference, 0);
assert.deepEqual(
  state.groups.map(group => group.allocatedDiscount),
  [143.46, 19.52, 7.02],
);
assert.deepEqual(
  state.groups.map(group => group.net),
  [3531.84, 480.48, 172.98],
);

const key = context.CrewBIQServiceInvoice.sourceInvoiceKey(state.parent);
assert.equal(key, 'service_invoice|aas truck and trailer repair inc|inv-4671|2026-06-16|1919|4185.30');

context.CrewBIQServiceInvoice.importInvoice();
assert.equal(confirmCount, 1);
assert.equal(saveCount, 1);
assert.equal(serviceLogs.length, 1);
assert.equal(serviceLogs[0].amount, 4185.30);
assert.equal(serviceLogs[0].category, 'Service Invoice');
assert.equal(serviceLogs[0].invoiceNumber, 'INV-4671');
assert.equal(serviceLogs[0].sourceRequestId, 'ocr_aas_4671');
assert.equal(serviceLogs[0].sourceInvoiceKey, key);
assert.equal(serviceLogs[0].serviceGroups.length, 3);
assert.equal(
  Math.round(serviceLogs[0].serviceGroups.reduce((sum, group) => sum + group.net, 0) * 100) / 100,
  4185.30,
);
assert.equal(lastToast.message, '1 service invoice imported · counted once');

// The parent is the only accounting charge. Child groups remain nested detail.
assert.equal(serviceLogs.filter(log => log.category === 'Service Invoice').length, 1);
assert.equal(serviceLogs.some(log => log.category === 'Alignment'), false);

// Repeat import is idempotent and does not call save again.
context.CrewBIQServiceInvoice.importInvoice();
assert.equal(serviceLogs.length, 1);
assert.equal(saveCount, 1);
assert.equal(lastToast.message, '0 invoices imported · duplicate skipped');

// Editing one category changes analytics only; parent total remains one charge.
context.CrewBIQServiceInvoice.updateGroup(2, 'category', 'Steering');
assert.equal(context.CrewBIQServiceInvoice.getState().groups[2].category, 'Steering');
assert.equal(context.CrewBIQServiceInvoice.getState().allocatedNet, 4185.30);

console.log('segmented service invoice single-count contract: ok');
