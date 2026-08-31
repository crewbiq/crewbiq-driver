import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const tooling = readFileSync(
  new URL('./tests/fleet_overview_driver_edit.test.mjs', import.meta.url),
  'utf8',
);
const moduleSource = readFileSync(
  new URL('./fleet-load-resolution.js', import.meta.url),
  'utf8',
);

function functionSource(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} must exist`);
  const next = source.indexOf('\nfunction ', start + signature.length);
  assert.ok(next > start, `${signature} must have a bounded body`);
  return source.slice(start, next);
}

test('protected integration loads the resolver before the inline application', () => {
  const tag = '<script src="fleet-load-resolution.js?v=20260730-issue20-v1"></script>';
  assert.equal(html.split(tag).length - 1, 1);
  assert.ok(html.indexOf('<script src="loads.js') < html.indexOf(tag));
  assert.ok(html.indexOf(tag) < html.indexOf('<style>'));

  const context = { window: null };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(moduleSource, context, { filename: 'fleet-load-resolution.js' });
  const api = context.CrewBIQFleetLoadResolution;
  assert.equal(api.version, '0.1.0');
  assert.equal(
    api.resolveLoadToTruck(
      { payload: { truck_id: ' T2 ' } },
      [{ id: 'T2', active: true }],
      [],
    ).id,
    'T2',
  );
});

test('protected bridge delegates once and fails closed when the module is absent', () => {
  const recordId = functionSource(html, 'function recordTruckId(record)');
  assert.match(recordId, /window\.CrewBIQFleetLoadResolution/);
  assert.match(
    recordId,
    /if\(!api \|\| typeof api\.resolveLoadToTruck !== 'function'\) return '';/,
  );
  assert.equal(
    (recordId.match(/api\.resolveLoadToTruck\(record, trucks, driverProfiles\)/g) || [])
      .length,
    1,
  );
  assert.equal((recordId.match(/activeTrucks\(\)/g) || []).length, 1);
  assert.equal((recordId.match(/loadDriverProfiles\(\)/g) || []).length, 1);
  assert.doesNotMatch(recordId, /trucks\[0\]/);

  const matches = functionSource(html, 'function recordMatchesTruck(record, truck)');
  assert.match(matches, /if\(!truck\) return false;/);
  assert.match(matches, /return recordTruckId\(record\) === truck\.id;/);
  assert.doesNotMatch(matches, /rawPayload|raw_payload|payload|unitNumber|truckUnit/);
});

test('protected app shell and tooling source recognize the extracted module', () => {
  assert.equal((sw.match(/const CACHE_NAME = 'crewbiq-driver-v86';/g) || []).length, 1);
  assert.equal(
    (sw.match(/'\/crewbiq-driver\/fleet-load-resolution\.js'/g) || []).length,
    1,
  );
  assert.ok(
    tooling.includes(
      'fleet-load-resolution\\.js\\?v=20260730-issue20-v1',
    ),
  );
  assert.match(tooling, /CrewBIQFleetLoadResolution/);
  assert.doesNotMatch(
    tooling,
    /assert\.match\(html, \/if\\\(!directId && !unitNumber && trucks\\\.length===1\\\)/,
  );
  assert.doesNotMatch(
    html,
    /if\(!directId && !unitNumber && trucks\.length===1\) return trucks\[0\]\.id;/,
  );
});
