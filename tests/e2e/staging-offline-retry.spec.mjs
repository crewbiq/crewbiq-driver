import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations, clone, exactlyOneById, loginFleetA, makeRecordId,
  openFreshApplication, pushOwnerData, restoreFleet, revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();
const QUEUE_KEY = 'fiqD_pendingSyncOperations';

test.use({ screenshot: 'off', trace: 'off', serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-offline-writer-and-recovery-contexts' });
  testInfo.annotations.push({
    type: 'limitation',
    description: 'Uses one exact manifest-owned truck because the current load fixture does not share the authenticated PWA sync/restore contract; tracked by orchestrator issue 35.',
  });
});

function scenario(expected, steps) {
  return { annotation: [
    { type: 'expected_result', description: expected },
    ...steps.map(description => ({ type: 'step', description })),
  ] };
}

function tokenFrom(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.session_token).toBeTruthy();
  return response.body.session_token;
}

async function storeSession(page, token) {
  await page.evaluate(value => localStorage.setItem('fiqD_sessionToken', value), token);
}

function trucksFrom(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  return Array.isArray(response.body.trucks) ? response.body.trucks : [];
}

function ownerReport(config, token, truck, recordId, sentAt) {
  return {
    type: 'driver_report', sessionToken: token, record_id: recordId, sentAt,
    deviceId: 'e2e-offline-01-device-a',
    driver: { crewId: config.fleetA.authCrewbiqId, email: 'e2e-redacted@example.test' },
    loads: [], ptiLog: [], ownerData: { trucks: [truck] },
  };
}

async function sendThroughPwa(page, baseUrl, body) {
  return page.evaluate(async ({ entryUrl, payload }) => {
    const adapter = window.CrewBIQRestoreHotfix;
    const previous = {
      expensePrimary: adapter?.loadScopedExpenses,
      expenseFallback: window.loadExpenses,
      service: window.loadServiceLogs,
      templates: window.loadDedTemplates,
      weekly: window.loadWeeklyDeds,
    };

    // This scenario owns one truck mutation only. Suppress unrelated complete
    // snapshot providers so an empty cache cannot imply deletion elsewhere.
    if (adapter) adapter.loadScopedExpenses = undefined;
    window.loadExpenses = undefined;
    window.loadServiceLogs = undefined;
    window.loadDedTemplates = undefined;
    window.loadWeeklyDeds = undefined;
    try {
      const response = await fetch(entryUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload), cache: 'no-store',
      });
      const text = await response.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { nonJsonResponse: true }; }
      return { status: response.status, body: data };
    } catch (error) {
      return { status: 0, body: { networkError: error.name || 'Error' } };
    } finally {
      if (adapter) adapter.loadScopedExpenses = previous.expensePrimary;
      window.loadExpenses = previous.expenseFallback;
      window.loadServiceLogs = previous.service;
      window.loadDedTemplates = previous.templates;
      window.loadWeeklyDeds = previous.weekly;
    }
  }, { entryUrl: new URL('/e2e-pwa-sync-entry', baseUrl).href, payload: body });
}

async function queueState(page, expectedRecordId) {
  return page.evaluate(({ key, expected }) => {
    const raw = localStorage.getItem(key) || '';
    let entries = [];
    try { entries = raw ? JSON.parse(raw) : []; } catch {}
    const first = entries[0] || {};
    const lower = raw.toLowerCase();
    return {
      count: entries.length,
      recordIdPreserved: first.record_id === expected && first.payload?.record_id === expected,
      containsSessionToken: lower.includes('sessiontoken'),
      containsAuthorization: lower.includes('authorization'),
      containsCredentialField: lower.includes('password'),
      publicCount: window.CrewBIQOfflineSync?.pendingCount?.() ?? -1,
    };
  }, { key: QUEUE_KEY, expected: expectedRecordId });
}

async function safeLogout(page, config, token, alias, observations) {
  if (!token) return;
  try {
    const response = await revokeSession(page, config, token);
    expect.soft(response.status).toBe(200);
    observations.push({ context: alias, cleanup: 'session-revoked', status: response.status });
  } catch (error) {
    observations.push({ context: alias, cleanup: 'session-revoke-failed', error_class: error?.name || 'Error' });
    expect.soft(false, `${alias} session cleanup failed`).toBe(true);
  }
}

test(
  'OFFLINE-01 failed authenticated mutation retries with one durable operation identity',
  scenario(
    'One manifest-owned mutation becomes visibly pending, retries with the same record_id, appears once in a clean context, and returns to its exact before-state.',
    [
      'Open independent clean writer and recovery contexts.',
      'Capture one manifest-owned active truck before-state.',
      'Abort the first real authenticated sync request.',
      'Verify a sanitized durable pending entry and visible pending UI.',
      'Retry unchanged content and verify the original queued identity is sent.',
      'Verify one stable record in a clean context.',
      'Restore exact before-state and revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    const observations = [];
    const observedRequestIds = [];
    const observedSnapshotMarkerCounts = [];
    let writerToken = '';
    let recoveryToken = '';
    let originalTruck = null;
    let rollbackRequired = false;
    let failFirst = true;

    const syncPattern = `${config.orchestratorUrl}/v1/sync/pwa`;
    await page.route(syncPattern, async route => {
      let body = {};
      try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
      const report = body.payload && typeof body.payload === 'object' ? body.payload : body;
      observedRequestIds.push(String(report.record_id || body.record_id || ''));
      const markers = report.ownerData?.snapshotEntities;
      observedSnapshotMarkerCounts.push(Array.isArray(markers) ? markers.length : 0);
      if (failFirst) {
        failFirst = false;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    try {
      const writerInitial = await context.storageState();
      const recoveryInitial = await recoveryContext.storageState();
      expect(writerInitial.cookies).toEqual([]);
      expect(writerInitial.origins).toEqual([]);
      expect(recoveryInitial.cookies).toEqual([]);
      expect(recoveryInitial.origins).toEqual([]);
      await openFreshApplication(page, context, config.baseUrl);
      await openFreshApplication(recoveryPage, recoveryContext, config.baseUrl);

      writerToken = tokenFrom(await loginFleetA(page, config));
      recoveryToken = tokenFrom(await loginFleetA(recoveryPage, config));
      await storeSession(page, writerToken);
      await storeSession(recoveryPage, recoveryToken);

      const targetId = config.fleetA.activeTruckIds[0];
      const beforeMatches = exactlyOneById(trucksFrom(await restoreFleet(page, config, writerToken)), targetId);
      expect(beforeMatches).toHaveLength(1);
      originalTruck = clone(beforeMatches[0]);
      const marker = `${config.displayPrefix}OFFLINE-01`.slice(0, 80);
      const editedTruck = { ...clone(originalTruck), id: targetId, plate: marker, active: true };
      const queuedId = makeRecordId(config, 'OFFLINE-01', 'queued');
      const retryCandidateId = makeRecordId(config, 'OFFLINE-01', 'candidate');

      const failed = await sendThroughPwa(
        page, config.baseUrl,
        ownerReport(config, writerToken, editedTruck, queuedId, '2026-07-13T15:30:00Z'),
      );
      expect(failed.status).toBe(503);
      expect(failed.body.pending).toBe(true);

      const pending = await queueState(page, queuedId);
      expect(pending.count).toBe(1);
      expect(pending.publicCount).toBe(1);
      expect(pending.recordIdPreserved).toBe(true);
      expect(pending.containsSessionToken).toBe(false);
      expect(pending.containsAuthorization).toBe(false);
      expect(pending.containsCredentialField).toBe(false);
      await page.evaluate(() => window.CrewBIQCore?.events?.emit('sync:error', { message: 'offline-test' }));
      await expect(page.locator('#syncStatus')).toContainText('Pending sync');
      observations.push({
        step: 'pending', status: failed.status, pending_count: pending.count,
        stable_operation_identity: pending.recordIdPreserved,
        forbidden_session_material_present: false, visible_pending_state: true,
      });

      rollbackRequired = true;
      const retried = await sendThroughPwa(
        page, config.baseUrl,
        ownerReport(config, writerToken, editedTruck, retryCandidateId, '2026-07-13T15:31:00Z'),
      );
      expect(retried.status).toBe(200);
      expect(retried.body.record_id).toBe(queuedId);
      expect(observedRequestIds).toHaveLength(2);
      expect(observedRequestIds[0]).toBe(observedRequestIds[1]);
      expect(observedRequestIds[0]).toBe(queuedId);
      expect(observedSnapshotMarkerCounts).toEqual([0, 0]);
      expect((await queueState(page, queuedId)).count).toBe(0);

      const recovered = exactlyOneById(
        trucksFrom(await restoreFleet(recoveryPage, config, recoveryToken)), targetId,
      );
      expect(recovered).toHaveLength(1);
      expect(recovered[0].plate).toBe(marker);
      observations.push({
        step: 'retry-and-recovery', retry_status: retried.status,
        failed_and_retry_ids_equal: observedRequestIds[0] === observedRequestIds[1],
        retry_candidate_ignored: retried.body.record_id !== retryCandidateId,
        unrelated_snapshot_markers_present: false,
        duplicate_count: recovered.length, marker_restored: recovered[0].plate === marker,
        server_idempotency: 'covered-by-orchestrator-pr-34',
      });
    } finally {
      if (rollbackRequired && originalTruck && writerToken) {
        try {
          const rollback = await pushOwnerData(
            page, config, writerToken, { trucks: [originalTruck] },
            'OFFLINE-01', 'rollback',
          );
          expect.soft(rollback.status).toBe(200);
          observations.push({ cleanup: 'restore-before-state', status: rollback.status });
          if (rollback.status === 200 && recoveryToken) {
            const restored = exactlyOneById(
              trucksFrom(await restoreFleet(recoveryPage, config, recoveryToken)), originalTruck.id,
            );
            expect.soft(restored).toHaveLength(1);
            if (restored.length === 1) expect.soft(restored[0].plate || '').toBe(originalTruck.plate || '');
          }
        } catch (error) {
          observations.push({ cleanup: 'restore-before-state-failed', error_class: error?.name || 'Error' });
          expect.soft(false, 'OFFLINE-01 before-state rollback failed').toBe(true);
        }
      }
      await page.unroute(syncPattern);
      await safeLogout(page, config, writerToken, 'writer', observations);
      await safeLogout(recoveryPage, config, recoveryToken, 'recovery', observations);
      try { await attachSafeObservations(testInfo, 'offline-retry-observations', observations); }
      finally { await recoveryContext.close(); }
    }
  },
);
