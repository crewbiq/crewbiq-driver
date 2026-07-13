import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = [];
let serviceLogs = [{
  id: 'svc_legacy_aas',
  truckId: 'truck_1919',
  unitNumber: '1919',
  date: '2026-06-16',
  odometer: 819795,
  amount: 4185.30,
  category: 'Other',
  description: 'AAS TRUCK AND TRAILER REPAIR INC - Invoice #: INV-4671 - front axle, full PM and alignment',
  fromFund: true,
  createdAt: '2026-06-16T12:00:00Z',
}];
let saveCount = 0;
let lastToast = null;

const context = {
  console,
  Date,
  Math,
  JSON,
  localStorage: {
    values: new Map(),
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
    setItem(key, value) { this.values.set(key, String(value)); },
    removeItem(key) { this.values.delete(key); },
  },
  document: {
    readyState: 'loading',
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') listeners.push(fn); },
    getElementById() { return null; },
    createElement() { return { id: '', innerHTML: '' }; },
  },
  setTimeout,
  clearTimeout,
  loadTrucks() {
    return [{ id: 'truck_1919', unitNumber: '1919', year: 2019, make: 'Mack', model: 'Anthem', active: true }];
  },
  loadServiceLogs() { return serviceLogs; },
  saveServiceLogs(value) { serviceLogs = JSON.parse(JSON.stringify(value)); saveCount++; },
  confirm() { return true; },
  toast(message, type) { lastToast = { message, type }; },
  showPage() {},
  renderServicePage() {},
};
context.window = context;
context.globalThis = context;

for (const filename of ['ocr-service-invoice-review.js', 'service-invoice-legacy-upgrade.js']) {
  vm.runInNewContext(
    fs.readFileSync(new URL('../' + filename, import.meta.url), 'utf8'),
    context,
    { filename },
  );
}
listeners.forEach(fn => fn());

assert.equal(context.CrewBIQServiceLegacyUpgrade.version, '0.1.0');

const result = {
  ok: true,
  schema_version: '1.2',
  request_id: 'ocr_aas_4671_v2',
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
    { category: 'Front Axle / Suspension', description: 'Front axle repair', parts_amount: 2075.30, labor_amount: 1600, subtotal: 3675.30 },
    { category: 'Oil & Fluids', description: 'Full PM oil and filters', parts_amount: 300, labor_amount: 200, subtotal: 500 },
    { category: 'Alignment', description: 'Front axle alignment', labor_amount: 180, subtotal: 180 },
  ],
  warnings: [],
};

const state = context.CrewBIQServiceInvoice.buildState(result);
assert.equal(context.CrewBIQServiceLegacyUpgrade.isLegacyMatch(serviceLogs[0], state.parent), true);

context.CrewBIQServiceInvoice.importInvoice();

assert.equal(saveCount, 1);
assert.equal(serviceLogs.length, 1);
assert.equal(serviceLogs[0].id, 'svc_legacy_aas');
assert.equal(serviceLogs[0].category, 'Service Invoice');
assert.equal(serviceLogs[0].invoiceNumber, 'INV-4671');
assert.equal(serviceLogs[0].amount, 4185.30);
assert.equal(serviceLogs[0].serviceGroups.length, 3);
assert.equal(serviceLogs[0].upgradedFromLegacy, true);
assert.equal(serviceLogs[0].createdAt, '2026-06-16T12:00:00Z');
assert.equal(lastToast.message, '1 service invoice imported · counted once');

const upgradeReport = JSON.parse(context.localStorage.getItem('fiqD_lastServiceInvoiceUpgrade'));
assert.equal(upgradeReport.legacyId, 'svc_legacy_aas');
assert.equal(upgradeReport.invoiceNumber, 'INV-4671');

// A second scan is rejected as a duplicate after the in-place upgrade.
context.CrewBIQServiceInvoice.importInvoice();
assert.equal(saveCount, 1);
assert.equal(serviceLogs.length, 1);
assert.equal(lastToast.message, '0 invoices imported · duplicate skipped');

// Same amount/date/truck without vendor or invoice evidence is not upgraded.
const unrelated = {
  id: 'svc_unrelated', truckId: 'truck_1919', unitNumber: '1919',
  date: '2026-06-16', amount: 4185.30, category: 'Other', description: 'Unrelated repair'
};
assert.equal(context.CrewBIQServiceLegacyUpgrade.isLegacyMatch(unrelated, state.parent), false);

console.log('service invoice legacy in-place upgrade contract: ok');
