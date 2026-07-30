import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const moduleSource = readFileSync(
  new URL('./fleet-load-resolution.js', import.meta.url),
  'utf8',
);

function renderFleetStatsSource() {
  const start = html.indexOf('function renderFleetStats()');
  const end = html.indexOf('\nfunction selectFleetStatsTruck(', start);
  assert.ok(start >= 0 && end > start, 'renderFleetStats must have stable boundaries');
  return html.slice(start, end);
}

test('protected UI exposes exactly one owner-visible unassigned status', () => {
  assert.equal((html.match(/id="fleetUnassignedLoads"/g) || []).length, 1);
  const sectionStart = html.indexOf('<div id="fleetStatsSection"');
  const sectionEnd = html.indexOf('\n    </div>\n  </div>', sectionStart);
  const status = html.indexOf('id="fleetUnassignedLoads"');
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  assert.ok(status > sectionStart && status < sectionEnd);
  assert.match(
    html.slice(sectionStart, sectionEnd),
    /id="fleetUnassignedLoads"[^>]*>Unassigned loads: 0<\/div>/,
  );
});

test('protected count is period-aware, tab-independent, and fails closed', () => {
  const source = renderFleetStatsSource();
  assert.equal(
    (source.match(/var driverProfiles = loadDriverProfiles\(\);/g) || []).length,
    1,
  );
  assert.equal(
    (
      source.match(
        /resolutionApi\.unassignedFleetLoads\(periodLoads, trucks, driverProfiles\)/g,
      ) || []
    ).length,
    1,
  );
  assert.match(
    source,
    /var periodLoads = allLoads\.filter\(function\(l\)\{\s*return inPeriod\(l\.pickup \|\| l\.date \|\| ''\);\s*}\);/,
  );
  assert.match(source, /: periodLoads\.slice\(\);/);
  assert.match(
    source,
    /unassignedEl\.textContent = 'Unassigned loads: '\+unassignedLoads\.length;/,
  );

  const countStart = source.indexOf('var periodLoads = allLoads.filter');
  const countEnd = source.indexOf('//', countStart);
  const countBlock = source.slice(countStart, countEnd);
  assert.doesNotMatch(countBlock, /_fleetStatsTruck|filteredTrucks|selected/);
  assert.ok(source.indexOf('function inPeriod') < countStart);
  assert.ok(countStart < source.indexOf('var tabsEl'));
});

test('protected selected-truck helper uses the module without a fallback', () => {
  const source = renderFleetStatsSource();
  const start = source.indexOf('function truckForLoad(load)');
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start);
  const helper = source.slice(start, end);
  assert.match(
    helper,
    /resolutionApi\.resolveLoadToTruck\(load, trucks, driverProfiles\)/,
  );
  assert.match(helper, /return null;/);
  assert.doesNotMatch(helper, /trucks\[0\]|\.find\(/);
  assert.match(source, /var filteredLoads = periodLoads\.filter\(function\(l\)/);
  assert.doesNotMatch(
    source,
    /var filteredLoads = allLoads\.filter\(function\(l\)/,
  );
  assert.match(moduleSource, /function unassignedFleetLoads\(records, trucks, driverProfiles\)/);
});
