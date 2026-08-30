import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const loadsSource = fs.readFileSync(new URL('../loads.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, `missing start marker: ${start}`);
  assert.notEqual(endAt, -1, `missing end marker: ${end}`);
  return source.slice(startAt, endAt);
}

const resolverSource = section(html, 'function resolveDefaultTruck(driverValue, trucks){', 'function truckDisplay(t){');
const resolveDefaultTruck = Function(`${resolverSource}; return resolveDefaultTruck;`)();

const truckA = { id: 'truck-a', unitNumber: '101', active: true };
const truckB = { id: 'truck-b', unitNumber: '202', active: true };

test('explicit assigned truck resolves correctly', () => {
  assert.equal(resolveDefaultTruck({ unitNumber: '202' }, [truckA, truckB]), truckB);
  assert.equal(resolveDefaultTruck({ unitNumber: 'truck-a' }, [truckA, truckB]), truckA);
});

test('multiple active trucks without explicit assignment resolve no truck', () => {
  assert.equal(resolveDefaultTruck({}, [truckA, truckB]), null);
});

test('invalid explicit assignment never falls back even when one truck is active', () => {
  assert.equal(resolveDefaultTruck({ unitNumber: 'missing' }, [truckA]), null);
});

test('zero active trucks resolve no truck', () => {
  assert.equal(resolveDefaultTruck({}, []), null);
  assert.equal(resolveDefaultTruck({}, [{ ...truckA, active: false }]), null);
});

test('single active truck is unambiguous only when no explicit assignment exists', () => {
  assert.equal(resolveDefaultTruck({}, [truckA]), truckA);
  assert.equal(resolveDefaultTruck({ unitNumber: '' }, [truckA]), truckA);
});

test('selectors surface assignment-required state instead of browser-defaulting first truck', () => {
  const indexSelector = section(html, 'function renderTruckSelect(', 'function selectedTruckId(');
  const loadSelector = section(loadsSource, 'function populateLoadTruckSelect(', 'function getDriverDisputed(');
  assert.match(indexSelector, /Truck assignment required/);
  assert.match(loadSelector, /Truck assignment required/);
  assert.doesNotMatch(indexSelector, /\|\|\s*trucks\[0\]/);
  assert.doesNotMatch(loadSelector, /preferredTruck\s*\?[^:]+:\s*trucks\[0\]\.id/);
});

test('mutation callers fail closed when no truck resolves', () => {
  for (const [source, start, end] of [
    [loadsSource, 'function saveLoad()', 'function editLoad('],
    [html, 'function saveFuelLog()', 'function editFuelLog('],
    [html, 'function applyDedTemplate()', 'var _dedModalMode'],
    [html, 'function saveServiceLog()', 'function editServiceLog('],
  ]) {
    const body = section(source, start, end);
    assert.match(body, /Truck assignment required/);
  }

  const currentDeduction = section(html, 'function getCurrentWeekDed()', 'function applyDedTemplate()');
  assert.match(currentDeduction, /if\(!truckId\) return \{[^}]*unresolvedTruck:true\}/);
  assert.ok(currentDeduction.indexOf('if(!truckId)') < currentDeduction.indexOf('saveWeeklyDeds(list)'),
    'unresolved deduction render must return before persistence');
});

test('unsafe direct first-truck fallback is absent from relevant assignment paths', () => {
  const defaultTruck = section(html, 'function getDefaultTruck()', 'function truckDisplay(t){');
  const loadSelector = section(loadsSource, 'function populateLoadTruckSelect(', 'function getDriverDisputed(');
  assert.doesNotMatch(defaultTruck, /activeTrucks\(\)\[0\]/);
  assert.match(defaultTruck, /trucks\.length === 1 \? trucks\[0\] : null/);
  assert.doesNotMatch(loadSelector, /:\s*trucks\[0\]\.id/);
});
