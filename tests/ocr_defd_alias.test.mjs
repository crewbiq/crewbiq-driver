import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {
  console,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  setTimeout,
  clearTimeout,
  Date,
  Math,
};
context.window = context;
context.globalThis = context;

for (const filename of ['ocr-invoice-review.js', 'ocr-item-alias-hotfix.js']) {
  vm.runInNewContext(
    fs.readFileSync(new URL('../' + filename, import.meta.url), 'utf8'),
    context,
    { filename },
  );
}

assert.equal(context.CrewBIQOCRItemAliases.version, '0.1.0');
assert.equal(context.CrewBIQOCRItemAliases.canonicalItem('DEFD'), 'DEF');
assert.equal(context.CrewBIQOCRItemAliases.canonicalItem('DEF Fluid'), 'DEF');
assert.equal(context.CrewBIQOCRItemAliases.canonicalItem('Diesel Exhaust Fluid'), 'DEF');
assert.equal(context.CrewBIQOCRItemAliases.canonicalItem('ULSD'), 'Fuel');
assert.equal(context.CrewBIQOCRItemAliases.canonicalItem('SCLE'), 'SCLE');

const invoice = {
  ok: true,
  request_id: 'ocr_tbc9880',
  schema_version: '1.1',
  document_type: 'fuel_invoice',
  invoice_number: 'TBC9880',
  vendor: 'TBC Fuel',
  unit: '1919',
  driver: 'Izzet Isliamov',
  totals: {
    fuel_gallons: 844.64,
    fuel_amount: 3035.10,
    def_gallons: 43.13,
    def_amount: 192.13,
    discount: 416.34,
    fees: 7.50,
    total_due: 2818.39,
  },
  transactions: [
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-01-30', location: 'LOVES', state: 'MO', fees: 1.50, item: 'ULSD', gallons: 140.5, amount: 490.28, discount: 46.23 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-01-30', location: 'LOVES', state: 'MO', fees: 0, item: 'DEFD', gallons: 15.1, amount: 66.11, discount: 0 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-02-01', location: 'LOVES', state: 'TX', fees: 1.50, item: 'ULSD', gallons: 132.6, amount: 483.84, discount: 63.52 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-02-02', location: 'LOVES', state: 'TX', fees: 1.50, item: 'ULSD', gallons: 177.8, amount: 638.03, discount: 74.49 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-02-02', location: 'LOVES', state: 'TX', fees: 0, item: 'DEFD', gallons: 12.1, amount: 54.38, discount: 0 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-02-04', location: 'LOVES', state: 'OK', fees: 1.50, item: 'ULSD', gallons: 198.1, amount: 710.91, discount: 132.52 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-02-05', location: 'LOVES', state: 'AR', fees: 1.50, item: 'ULSD', gallons: 195.7, amount: 712.04, discount: 99.60 },
    { driver: 'Izzet Isliamov', unit: '1919', date: '2026-02-05', location: 'LOVES', state: 'AR', fees: 0, item: 'DEFD', gallons: 16.0, amount: 71.64, discount: 0 },
  ],
};

const trucks = [{ id: 'truck_1919', unitNumber: '1919', make: 'Mack', model: 'Anthem', active: true }];
const stops = context.CrewBIQInvoiceReview.buildStops(invoice, trucks, '1919');

assert.equal(stops.length, 5);
assert.equal(stops.every(stop => stop.selected), true);
assert.equal(invoice.item_aliases_normalized, 8);

const jan30 = stops.find(stop => stop.date === '2026-01-30');
assert.equal(jan30.fuelGallons, 140.5);
assert.equal(jan30.fuelCost, 445.55);
assert.equal(jan30.defGallons, 15.1);
assert.equal(jan30.defCost, 66.11);
assert.equal(jan30.netTotal, 511.66);

const feb2 = stops.find(stop => stop.date === '2026-02-02');
assert.equal(feb2.fuelGallons, 177.8);
assert.equal(feb2.fuelCost, 565.04);
assert.equal(feb2.defGallons, 12.1);
assert.equal(feb2.defCost, 54.38);
assert.equal(feb2.netTotal, 619.42);

const feb5 = stops.find(stop => stop.date === '2026-02-05');
assert.equal(feb5.fuelGallons, 195.7);
assert.equal(feb5.fuelCost, 613.94);
assert.equal(feb5.defGallons, 16);
assert.equal(feb5.defCost, 71.64);
assert.equal(feb5.netTotal, 685.58);

assert.equal(
  Math.round(stops.reduce((sum, stop) => sum + stop.defGallons, 0) * 100) / 100,
  43.2,
);
assert.equal(
  Math.round(stops.reduce((sum, stop) => sum + stop.defCost, 0) * 100) / 100,
  192.13,
);
assert.equal(
  Math.round(stops.reduce((sum, stop) => sum + stop.netTotal, 0) * 100) / 100,
  2818.37,
);

console.log('TBC9880 DEFD alias grouping contract: ok');
