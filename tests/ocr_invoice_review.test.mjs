import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

const document = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
};

let savedLogs = null;
const context = {
  console,
  document,
  localStorage,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  confirm() { return true; },
  loadTrucks() {
    return [
      { id: 'truck_1010', unitNumber: '1010', make: 'Freightliner', model: 'Cascadia', active: true },
      { id: 'truck_1919', unitNumber: '1919', make: 'Mack', model: 'Anthem', active: true },
    ];
  },
  loadFuelLogs() { return savedLogs ? [...savedLogs] : []; },
  saveFuelLogs(value) { savedLogs = value; },
  showPage() {},
  renderFuelPage() {},
  toast() {},
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(
  fs.readFileSync(new URL('../ocr-invoice-review.js', import.meta.url), 'utf8'),
  context,
  { filename: 'ocr-invoice-review.js' },
);

assert.equal(context.CrewBIQInvoiceReview.version, '0.2.0');
localStorage.setItem('fiqD_driver', JSON.stringify({ name: 'Izzet', unitNumber: '1919' }));

const result = {
  ok: true,
  request_id: 'ocr_mpg16709',
  schema_version: '1.1',
  document_type: 'fuel_invoice',
  invoice_number: 'MPG16709',
  vendor: 'POWER MPG LLC',
  totals: { total_due: 2284.38 },
  transactions: [
    { driver: 'John Smith', unit: '1010', date: '2026-05-01', location: 'TA', state: 'AL', item: 'DEF', gallons: 8.26, amount: 39.56, discount: 0, fees: 0 },
    { driver: 'John Smith', unit: '1010', date: '2026-05-01', location: 'TA', state: 'AL', item: 'Fuel', gallons: 150.60, amount: 781.46, discount: 31.63, fees: 1.50 },
    { driver: 'John Smith', unit: '1010', date: '2026-05-05', location: 'TA', state: 'AL', item: 'DEF', gallons: 4.45, amount: 21.31, discount: 0, fees: 0 },
    { driver: 'John Smith', unit: '1010', date: '2026-05-05', location: 'TA', state: 'AL', item: 'Fuel', gallons: 129.03, amount: 721.15, discount: 99.35, fees: 1.50 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-05-02', location: 'PILOT', state: 'KS', item: 'Fuel', gallons: 167.50, amount: 921.08, discount: 73.70, fees: 1.50 },
  ],
};

const stops = context.CrewBIQInvoiceReview.buildStops(result, context.loadTrucks(), '1919');
assert.equal(stops.length, 3);
assert.equal(stops.filter(stop => stop.selected).length, 1);

const may1 = stops.find(stop => stop.unit === '1010' && stop.date === '2026-05-01');
assert.equal(may1.fuelGallons, 150.6);
assert.equal(may1.defGallons, 8.26);
assert.equal(may1.fuelCost, 751.33);
assert.equal(may1.defCost, 39.56);
assert.equal(may1.netTotal, 790.89);
assert.equal(may1.truckId, 'truck_1010');

const may5 = stops.find(stop => stop.unit === '1010' && stop.date === '2026-05-05');
assert.equal(may5.netTotal, 644.61);

const izzet = stops.find(stop => stop.unit === '1919');
assert.equal(izzet.fuelGallons, 167.5);
assert.equal(izzet.fuelCost, 848.88);
assert.equal(izzet.netTotal, 848.88);
assert.equal(izzet.selected, true);

const total = stops.reduce((sum, stop) => sum + stop.netTotal, 0);
assert.equal(Math.round(total * 100) / 100, 2284.38);

context.CrewBIQInvoiceReview.renderForResult(result);
assert.equal(savedLogs, null);
assert.equal(context.CrewBIQInvoiceReview.getState().stops.filter(stop => stop.selected).length, 1);

context.CrewBIQInvoiceReview.importSelected();
assert.equal(savedLogs.length, 1);
assert.equal(savedLogs[0].truckId, 'truck_1919');
assert.equal(savedLogs[0].unitNumber, '1919');
assert.equal(savedLogs[0].driverName, 'Izzet Isliamov');
assert.equal(savedLogs[0].fuelCost, 848.88);
assert.equal(savedLogs[0].invoiceNumber, 'MPG16709');
assert.equal(savedLogs[0].location, 'PILOT (KS)');

context.CrewBIQInvoiceReview.selectAllMatched();
context.CrewBIQInvoiceReview.importSelected();
assert.equal(savedLogs.length, 3);
assert.equal(savedLogs.reduce((sum, entry) => sum + entry.fuelCost + entry.defCost, 0), 2284.38);

context.CrewBIQInvoiceReview.importSelected();
assert.equal(savedLogs.length, 3);

console.log('safe multi-driver invoice review contract: ok');
