import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadApi() {
  const context = vm.createContext({ window: {}, globalThis: {}, Date, Intl, Map, Set, Object, Number, String, Array });
  vm.runInContext(source, context, { filename: 'analytics.js' });
  return context.window.CrewBIQAnalytics;
}

const api = loadApi();
const baseActor = { authenticated: true, authorized: true, accountId: 'account-1', crewId: 'crew-1', workspaceId: 'workspace-1', role: 'driver' };
const baseScope = { type: 'self', workspaceId: 'workspace-1' };
const driverLink = { accountId: 'account-1', workspaceId: 'workspace-1', proof: 'authenticated_driver_partition', subjectId: 'crew-1', subjectIdSpace: 'account_crew_id', recordCrewId: 'crew-1' };
const profileLink = { accountId: 'account-1', workspaceId: 'workspace-1', proof: 'canonical_account_driver_link', driverProfileId: 'driver-9', recordCrewId: 'crew-1' };
const week = { period: 'week', referenceDate: '2026-08-30', timeZone: 'America/Chicago' };

function input(overrides = {}) {
  return {
    scope: baseScope,
    actor: baseActor,
    links: [driverLink],
    period: week,
    partition: { proof: 'canonical_account_partition', ownerCrewId: 'crew-1' },
    loads: [],
    ...overrides,
  };
}

test('module parses independently and exports bounded pure API', () => {
  assert.deepEqual(Object.keys(api), ['ERROR_CODES', 'resolvePeriod', 'resolveSelfScope', 'createAnalyticsSnapshot', 'getDashboardMetrics', 'getEarningsSeries', 'getMileageSeries', 'createDriverSelfAnalytics']);
});

test('SELF succeeds only with a proven authenticated driver partition link', () => {
  const result = api.resolveSelfScope(input());
  assert.equal(result.ok, true);
  assert.equal(result.subject.subjectIdSpace, 'account_crew_id');
  assert.equal(result.subject.driverProfileId, null);
});

test('SELF preserves explicit Driver-profile identity as a separate identifier space', () => {
  const result = api.resolveSelfScope(input({ links: [profileLink] }));
  assert.equal(result.ok, true);
  assert.equal(result.subject.driverProfileId, 'driver-9');
  assert.equal(result.subject.recordCrewId, 'crew-1');
  assert.notEqual(result.subject.driverProfileId, result.subject.recordCrewId);
});

test('SELF without a proven link fails self_not_linked', () => {
  assert.equal(api.resolveSelfScope(input({ links: [] })).code, 'self_not_linked');
  assert.equal(api.resolveSelfScope(input({ links: [{ ...driverLink, proof: 'name_match' }] })).code, 'self_not_linked');
});

test('multiple proven subjects fail self_ambiguous', () => {
  const other = { ...profileLink, driverProfileId: 'driver-10', recordCrewId: 'crew-10' };
  assert.equal(api.resolveSelfScope(input({ links: [profileLink, other] })).code, 'self_ambiguous');
});

test('unauthenticated, denied, and cross-workspace actors fail self_unauthorized', () => {
  assert.equal(api.resolveSelfScope(input({ actor: { ...baseActor, authenticated: false } })).code, 'self_unauthorized');
  assert.equal(api.resolveSelfScope(input({ actor: { ...baseActor, authorized: false } })).code, 'self_unauthorized');
  assert.equal(api.resolveSelfScope(input({ actor: { ...baseActor, workspaceId: 'other' } })).code, 'self_unauthorized');
});

test('non-SELF and narrowed SELF scopes are rejected', () => {
  assert.equal(api.resolveSelfScope(input({ scope: { type: 'driver', workspaceId: 'workspace-1' } })).code, 'invalid_scope');
  assert.equal(api.resolveSelfScope(input({ scope: { ...baseScope, driverId: 'driver-1' } })).code, 'invalid_scope');
});

test('no first-driver, single-driver, role, name, email, or array-position fallback exists', () => {
  const result = api.resolveSelfScope(input({ links: [], drivers: [{ id: 'driver-1', name: 'Only Driver', email: 'same@example.com' }] }));
  assert.equal(result.code, 'self_not_linked');
});

test('today bounds are deterministic and end-exclusive', () => {
  const result = api.resolvePeriod({ period: 'today', referenceDate: '2026-08-30', timeZone: 'America/Chicago' });
  assert.deepEqual(plain([result.startInclusive, result.endExclusive]), ['2026-08-30', '2026-08-31']);
});

test('week uses deterministic ISO Monday boundaries', () => {
  const result = api.resolvePeriod(week);
  assert.deepEqual(plain([result.startInclusive, result.endExclusive, result.calendar]), ['2026-08-24', '2026-08-31', 'iso_week_monday']);
});

test('month bounds cross year safely', () => {
  const result = api.resolvePeriod({ period: 'month', referenceDate: '2026-12-15', timeZone: 'UTC' });
  assert.deepEqual(plain([result.startInclusive, result.endExclusive]), ['2026-12-01', '2027-01-01']);
});

test('quarter bounds cross year safely', () => {
  const result = api.resolvePeriod({ period: 'quarter', referenceDate: '2026-11-20', timeZone: 'UTC' });
  assert.deepEqual(plain([result.startInclusive, result.endExclusive]), ['2026-10-01', '2027-01-01']);
});

test('custom range normalizes inclusive dateTo to the following end-exclusive day', () => {
  const result = api.resolvePeriod({ period: 'custom', dateFrom: '2026-08-01', dateTo: '2026-08-31', timeZone: 'UTC' });
  assert.deepEqual(plain([result.startInclusive, result.endExclusive]), ['2026-08-01', '2026-09-01']);
});

test('single-day custom range is valid and includes that local operational date', () => {
  const period = { period: 'custom', dateFrom: '2026-08-30', dateTo: '2026-08-30', timeZone: 'America/Chicago' };
  const resolved = api.resolvePeriod(period);
  assert.deepEqual(plain([resolved.startInclusive, resolved.endExclusive]), ['2026-08-30', '2026-08-31']);
  const snapshot = api.createAnalyticsSnapshot(input({ period, loads: [
    { id: 'same-day', crewId: 'crew-1', pickup: '2026-08-30', gross: 100, loadedMiles: 80, deadMiles: 20 },
  ] }));
  assert.deepEqual(plain(snapshot.records.map(record => record.id)), ['same-day']);
});

test('custom range includes start and inclusive dateTo but excludes normalized endExclusive', () => {
  const snapshot = api.createAnalyticsSnapshot(input({
    period: { period: 'custom', dateFrom: '2026-08-28', dateTo: '2026-08-30', timeZone: 'America/Chicago' },
    loads: [
      { id: 'start', crewId: 'crew-1', pickup: '2026-08-28', gross: 1, loadedMiles: 1, deadMiles: 1 },
      { id: 'middle', crewId: 'crew-1', pickup: '2026-08-29', gross: 1, loadedMiles: 1, deadMiles: 1 },
      { id: 'date-to', crewId: 'crew-1', pickup: '2026-08-30', gross: 1, loadedMiles: 1, deadMiles: 1 },
      { id: 'end-exclusive', crewId: 'crew-1', pickup: '2026-08-31', gross: 1, loadedMiles: 1, deadMiles: 1 },
    ],
  }));
  assert.deepEqual(plain(snapshot.records.map(record => record.id)), ['start', 'middle', 'date-to']);
});

test('invalid custom and unsupported periods return invalid_period', () => {
  assert.equal(api.resolvePeriod({ period: 'custom', dateFrom: '2026-09-01', dateTo: '2026-08-01', timeZone: 'UTC' }).code, 'invalid_period');
  assert.equal(api.resolvePeriod({ period: 'year', referenceDate: '2026-01-01', timeZone: 'UTC' }).code, 'invalid_period');
});

test('timezone is required, validated, and returned as explicit metadata', () => {
  assert.equal(api.resolvePeriod({ period: 'today', referenceDate: '2026-08-30' }).code, 'invalid_period');
  assert.equal(api.resolvePeriod({ period: 'today', referenceDate: '2026-08-30', timeZone: 'Not/AZone' }).code, 'invalid_period');
  assert.equal(api.resolvePeriod({ period: 'today', referenceDate: '2026-08-30', timeZone: 'America/Chicago' }).timeZoneSource, 'explicit_argument');
});

test('period filter is start-inclusive and end-exclusive', () => {
  const snapshot = api.createAnalyticsSnapshot(input({ loads: [
    { id: 'before', crewId: 'crew-1', pickup: '2026-08-23', gross: 1, loadedMiles: 1, deadMiles: 1 },
    { id: 'start', crewId: 'crew-1', pickup: '2026-08-24', gross: 2, loadedMiles: 2, deadMiles: 2 },
    { id: 'end', crewId: 'crew-1', pickup: '2026-08-31', gross: 3, loadedMiles: 3, deadMiles: 3 },
  ] }));
  assert.deepEqual(plain(snapshot.records.map(record => record.id)), ['start']);
});

test('snapshot and selectors do not mutate input records', () => {
  const loads = [{ id: 'l1', crewId: 'crew-1', pickup: '2026-08-25', gross: 100, loadedMiles: 80, deadMiles: 20 }];
  const before = JSON.stringify(loads);
  const snapshot = api.createAnalyticsSnapshot(input({ loads }));
  api.getDashboardMetrics(snapshot); api.getEarningsSeries(snapshot); api.getMileageSeries(snapshot);
  assert.equal(JSON.stringify(loads), before);
  assert.notEqual(snapshot.records[0], loads[0]);
});

test('gross uses only proven attributable and eligible records', () => {
  const result = api.createDriverSelfAnalytics(input({ loads: [
    { id: 'mine', crewId: 'crew-1', pickup: '2026-08-25', gross: 500, loadedMiles: 100, deadMiles: 20 },
    { id: 'other', crewId: 'crew-2', pickup: '2026-08-25', gross: 900, loadedMiles: 100, deadMiles: 20 },
    { id: 'cancel', crewId: 'crew-1', pickup: '2026-08-26', status: 'cancel', gross: 700, loadedMiles: 50, deadMiles: 5 },
  ] }));
  assert.equal(result.metrics.gross, 500);
  assert.equal(result.snapshot.excludedRecords.length, 1);
});

test('mileage uses only proven records and never derives deadhead from another field', () => {
  const result = api.createDriverSelfAnalytics(input({ loads: [
    { id: 'mine', crewId: 'crew-1', pickup: '2026-08-25', gross: 500, loadedMiles: 100, deadMiles: 20, totalMiles: 999 },
    { id: 'other', crewId: 'crew-2', pickup: '2026-08-25', gross: 500, loadedMiles: 400, deadMiles: 300 },
  ] }));
  assert.equal(result.metrics.loadedMiles, 100);
  assert.equal(result.metrics.deadheadMiles, 20);
});

test('unproven ambiguous records are excluded and flagged', () => {
  const snapshot = api.createAnalyticsSnapshot(input({ partition: {}, loads: [
    { id: 'unknown', pickup: '2026-08-25', gross: 500, loadedMiles: 100, deadMiles: 20 },
  ] }));
  assert.equal(snapshot.records.length, 0);
  assert.equal(snapshot.dataQuality.attribution, 'partial');
  assert.ok(snapshot.dataQuality.warnings.includes('records_excluded_unproven_attribution'));
});

test('canonical partition proof attributes records without inventing record identity', () => {
  const snapshot = api.createAnalyticsSnapshot(input({ loads: [
    { id: 'partition-record', pickup: '2026-08-25', gross: 500, loadedMiles: 100, deadMiles: 20 },
  ] }));
  assert.equal(snapshot.records[0].attribution, 'canonical_account_partition');
  assert.ok(snapshot.dataQuality.warnings.includes('record_identity_proven_by_partition'));
});

test('series preserve available related record IDs', () => {
  const snapshot = api.createAnalyticsSnapshot(input({ loads: [
    { id: 'record-1', crewId: 'crew-1', pickup: '2026-08-25', gross: 100, loadedMiles: 80, deadMiles: 20 },
    { record_id: 'record-2', crewId: 'crew-1', pickup: '2026-08-25', gross: 200, loadedMiles: 120, deadMiles: 30 },
  ] }));
  assert.deepEqual(plain(api.getEarningsSeries(snapshot).points[0].relatedRecordIds), ['record-1', 'record-2']);
});

test('unavailable provenance remains an empty array and is reported', () => {
  const snapshot = api.createAnalyticsSnapshot(input({ loads: [
    { crewId: 'crew-1', pickup: '2026-08-25', gross: 100, loadedMiles: 80, deadMiles: 20 },
  ] }));
  assert.deepEqual(plain(api.getMileageSeries(snapshot).points[0].relatedRecordIds), []);
  assert.ok(snapshot.dataQuality.missingFields.includes('load.recordId'));
});

test('missing metric values are unavailable rather than coerced to zero', () => {
  const snapshot = api.createAnalyticsSnapshot(input({ loads: [
    { id: 'missing', crewId: 'crew-1', pickup: '2026-08-25', loadedMiles: 80 },
  ] }));
  const metrics = api.getDashboardMetrics(snapshot);
  assert.equal(metrics.gross, null);
  assert.equal(metrics.deadheadMiles, null);
  assert.equal(metrics.availability.gross, 'unavailable');
});

test('RPM remains explicitly unavailable until its production definition is approved', () => {
  const result = api.createDriverSelfAnalytics(input()).metrics;
  assert.equal(result.rpm, null);
  assert.equal(result.availability.rpm, 'unavailable');
  assert.ok(result.dataQuality.warnings.includes('rpm_definition_unapproved'));
});

test('current truck is returned only from deterministic proof metadata', () => {
  const without = api.createDriverSelfAnalytics(input({ trucks: [{ id: 'first-truck' }] })).metrics;
  assert.equal(without.currentTruckId, null);
  const withTruck = api.createDriverSelfAnalytics(input({ links: [{ ...driverLink, currentTruckId: 'truck-9' }], trucks: [{ id: 'first-truck' }] })).metrics;
  assert.equal(withTruck.currentTruckId, 'truck-9');
});

test('module contains no persistence, network, DOM, or business mutation path', () => {
  for (const pattern of [/localStorage\s*\./, /\bfetch\s*\(/, /XMLHttpRequest/, /\bdocument\s*\./, /innerHTML|appendChild|classList/, /saveAll|saveCLinks|saveDriverProfile|setItem\s*\(/]) {
    assert.doesNotMatch(source, pattern);
  }
});
