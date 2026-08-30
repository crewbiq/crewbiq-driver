import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../prototype/crewbiq-next/charts.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../prototype/crewbiq-next/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../prototype/crewbiq-next/styles.css', import.meta.url), 'utf8');
const window = {};
new vm.Script(source, { filename: 'charts.js' }).runInNewContext({ window });
const charts = window.CrewBIQCharts;
const plain = value => JSON.parse(JSON.stringify(value));

test('UNIT_CONTRACT reusable chart layer parses and exports role analytics', () => {
  assert.ok(charts);
  assert.deepEqual(Object.keys(charts), ['ANALYTICS_DATA', 'formatValue', 'selectionDetail', 'zeroStateMarkup', 'renderDashboard']);
  assert.equal(charts.ANALYTICS_DATA.driver.length, 2);
  assert.equal(charts.ANALYTICS_DATA.owner_op.length, 3);
  assert.equal(charts.ANALYTICS_DATA.fleet.length, 3);
});

test('UNIT_CONTRACT Driver earnings and loaded/deadhead datasets are meaningful', () => {
  const earnings = charts.ANALYTICS_DATA.driver.find(chart => chart.id === 'driver-earnings');
  const miles = charts.ANALYTICS_DATA.driver.find(chart => chart.id === 'driver-miles');
  assert.ok(earnings.series[0].values.length >= 7);
  assert.ok(new Set(earnings.series[0].values).size > 3);
  assert.deepEqual(plain(miles.series.map(series => series.key)), ['loaded', 'deadhead']);
  assert.equal(miles.series[0].values.length, 7);
});

test('UNIT_CONTRACT Owner-Op and Fleet analytics use distinct operational questions', () => {
  assert.deepEqual(plain(charts.ANALYTICS_DATA.owner_op.map(chart => chart.id)), ['owner-revenue-net', 'owner-miles', 'owner-fuel-cost']);
  assert.deepEqual(plain(charts.ANALYTICS_DATA.fleet.map(chart => [chart.id, chart.kind])), [['fleet-gross', 'line'], ['fleet-utilization', 'bar'], ['fleet-readiness', 'progress']]);
});

test('UNIT_CONTRACT chart selection exposes future SIDR-ready structured data', () => {
  const config = charts.ANALYTICS_DATA.driver[0];
  assert.deepEqual(plain(charts.selectionDetail(config, 'driver', 2, 0)), {
    chartId: 'driver-earnings', role: 'driver', metric: 'gross', period: 'This week', selectedDate: 'Tue',
    selectedSeries: 'Gross earnings', selectedValue: 510, relatedEntityIds: [],
  });
});

test('STATIC_CONTRACT pointer/touch selection, animation, reduced motion, zero state, and app integration exist', () => {
  assert.match(source, /addEventListener\('pointermove'/);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /crewbiq:chart-select/);
  assert.match(source, /No earnings recorded this week/);
  assert.match(css, /@keyframes chartDraw/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.analytics-grid\{grid-template-columns:1fr\}/);
  assert.doesNotMatch(css + source, /chart\.js|highcharts|echarts|plotly|cdn/i);
  assert.match(app, /CrewBIQCharts\.renderDashboard/);
  assert.match(app, /chartSelection=e\.detail/);
});
