import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  clone,
  exactlyOneById,
  loginFleetA,
  makeRecordId,
  openFreshApplication,
  pushOwnerData,
  restoreFleet,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();
const QUEUE_KEY = 'fiqD_pendingSyncOperations';

// Authenticated evidence must remain text-only and redacted.
test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({
    type: 'context',
    description: 'isolated-offline-writer-and-clean-recovery-contexts',
  });
  testInfo.annotations.push({
    type: 'limitation',
    description: 'Uses an exact manifest-owned truck because the current load fixture does not share the authenticated PWA sync/restore contract; tracked by orchestrator issue 35.',
  });
});

function scenario(expectedResult, steps) {
  return {
    annotation: [
      { type: 'expected_result', description: expectedResult },
      ...steps.map(description => ({ type: 'step', description })),
    ],
  };
}

function assertEmptyStorage(state) {
  expect(state.cookies).toEqual([]);
  expect(state.origins).toEqual([]);
}

function tokenFrom(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.session_token).toBeTruthy();
  return response.body.session_token;
}

async function persistSession(page, token) {
  await page.evaluate(value => localStorage.setItem('fiqD_sessionToken', value), token);
}

function fleetSnapshot(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  return Array.isArray(response.body.trucks) ? response.body.trucks : [];
}

async function pwaDriverReport(page, baseUrl, payload) {
  return page.evaluate(async ({ entryUrl, body }) => {
    try {
      const response = await fetch(entryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const text = await response.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { nonJsonResponse: true }; }
      return { status: response.status, ok: response.ok, body: data };
    } catch (error) {
      return { status: 0, ok: false, body: { networkError: error.name || 'Error' } };
    }
  }, {
    entryUrl: new URL('/e2e-pwa-sync-entry', baseUrl).href,
    body: payload,
  });
}

function ownerReport(config, token, truck, recordId, sentAt) {
  return {
    type: 'driver_report',
    sessionToken: token,
    record_id: recordId,
    sentAt,
    deviceId: 'e2e-offline-01-device-a',
    driver: {
      crewId: config.fleetA.authCrewbiqId,
      email: 'e2e-redacted@example.test',
    },
    loads: [],
    ptiLog: [],
    ownerData: {
      trucks: [truck],
      driverProfiles: [],
      fuelLogs: [],
      serviceLogs: [],
      weeklyDeductions: [],
      deductionTemplates: [],
    },
  };
}

async function queueObservation(page, expectedRecordId) {
  return page.evaluate(({ queueKey, expected }) => {
    const raw = localStorage.getItem(queueKey) || '';
    let queue = [];
    try { queue = raw ? JSON.parse(raw) : []; } catch { queue = []; }
    const first = queue[0] || {};
    const serialized = raw.toLowerCase();
    return {
      count: queue.length,
      recordIdPreserved: first.record_id === expected && first.payload?.record_id === expected,
      containsSessionToken: serialized.includes('sessiontoken'),
      containsAuthorization: serialized.includes('authorization'),
      containsPassword: serialized.includes('password'),
      publicPendingCount: window.CrewBIQOfflineSync?.pendingCount?.() ?? -1,
      publicPendingState: window.CrewBIQOfflineSync?.pendingStatus?.().state || '',
    };
  }, { queueKey: QUEUE_KEY, expected: expectedRecordId });
}

async function safeRevoke(page, config, token, alias, observations) {
  if (!token) return;
  try {
    const response = await revokeSession(page, config, token);
    expect.soft(response.status).toBe(200);
    observations.push({
      context: alias,
      cleanup: 'session-revoked',
      status: response.status,
    });
  } catch (error) {
    observations.push({
      context: alias,
      cleanup: 'session-revoke-failed',
      error_class: error?.name || 'Error',
    });
    expect.soft(false, `${alias} session cleanup failed`).toBe(true);
  }
}

test(
  'OFFLINE-01 failed authenticated mutation retries with one durable operation identity',
  scenario(
    'A manifest-owned mutation becomes visibly pending after network failure, retries with the identical record_id, appears exactly once in a clean context, and is rolled back to its exact before-state.',
    [
      'Open independent clean writer and recovery contexts.',
      'Login both as E2E-FLEET-A and capture one exact active truck before-state.',
      'Abort the first real /v1/sync/pwa request.',
      'Verify one sanitized durable queue entry and visible pending state.',
      'Retry unchanged business content with a different candidate ID and verify the original queued ID is sent.',
      'Verify the queue clears only after authenticated success.',
      'Restore in the clean context and verify the same truck ID and marker exactly once.',
      'Restore the captured before-state and revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    const observations = [];
    const observedRequestIds = [];
    let writerToken = '';
    let recoveryToken = '';
    let originalTruck = null;
    let mutationMayHaveReachedServer = false;
    let firstRequest = true;

    const syncPattern = `${config.orchestratorUrl}/v1/sync/pwa`;
    await page.route(syncPattern, async route => {
      let recordId = '';
      try {
        const body = JSON.parse(route.request().postData() || '{}');
        const inner = body.payload && typeof body.payload === 'object' ? body.payload : body;
        recordId = String(inner.record_id || body.record_id || '');
      } catch {}
      observedRequestIds.push(recordId);
      if (firstRequest) {
        firstRequest = false;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    try {
      assertEmptyStorage(await openFreshApplication(page, context, config.baseUrl));
      assertEmptyStorage(await openFreshApplication(recoveryPage, recoveryContext, config.baseUrl));

      writerToken = tokenFrom(await loginFleetA(page, config));
      recoveryToken = tokenFrom(await loginFleetA(recoveryPage, config));
      await persistSession(page, writerToken);
      await persistSession(recoveryPage, recoveryToken);

      const before = fleetSnapshot(await restoreFleet(page, config, writerToken));
      const targetId = config.fleetA.activeTruckIds[0];
      const matches = exactlyOneById(before, targetId);
      expect(matches).toHaveLength(1);
      originalTruck = clone(matches[0]);

      const marker = `${config.displayPrefix}OFFLINE-01`.slice(0, 80);
      const editedTruck = { ...clone(originalTruck), id: targetId, plate: marker, active: true };
      const firstRecordId = makeRecordId(config, 'OFFLINE-01', 'queued');
      const secondCandidateId = makeRecordId(config, 'OFFLINE-01', 'retry-candidate');

      const failed = await pwaDriverReport(
        page,
        config.baseUrl,
        ownerReport(config, writerToken, editedTruck, firstRecordId, '2026-07-13T15:30:00Z'),
      );
      expect(failed.status).toBe(503);
      expect(failed.body.pending).toBe(true);

      const queued = await queueObservation(page, firstRecordId);
      expect(queued.count).toBe(1);
      expect(queued.publicPendingCount).toBe(1);
      expect(queued.recordIdPreserved).toBe(true);
      expect(queued.containsSessionToken).toBe(false);
      expect(queued.containsAuthorization).toBe(false);
      expect(queued.containsPassword).toBe(false);

      await page.evaluate(() => {
        window.CrewBIQCore?.events?.emit('sync:error', { message: 'offline-test' });
      });
      await expect(page.locator('#syncStatus')).toContainText('Pending sync');
      observations.push({
        step: 'offline-pending',
        failed_status: failed.status,
        pending_count: queued.count,
        queue_record_id_preserved: queued.recordIdPreserved,
        forbidden_session_material_present: false,
        visible_pending_state: true,
      });

      mutationMayHaveReachedServer = true;
      const retried = await pwaDriverReport(
        page,
        config.baseUrl,
        ownerReport(config, writerToken, editedTruck, secondCandidateId, '2026-07-13T15:31:00Z'),
      );
      expect(retried.status).toBe(200);
      expect(retried.body.record_id).toBe(firstRecordId);
      expect(observedRequestIds).toHaveLength(2);
      expect(observedRequestIds[0]).toBe(firstRecordId);
      expect(observedRequestIds[1]).toBe(firstRecordId);

      const cleared = await queueObservation(page, firstRecordId);
      expect(cleared.count).toBe(0);
      expect(cleared.publicPendingCount).toBe(0);
      observations.push({
        step: 'reconnect-retry',
        retry_status: retried.status,
        failed_and_retry_ids_equal: observedRequestIds[0] === observedRequestIds[1],
        retry_candidate_replaced_queued_identity: retried.body.record_id !== secondCandidateId,
        pending_count_after_success: cleared.count,
      });

      const recovered = fleetSnapshot(await restoreFleet(recoveryPage, config, recoveryToken));
      const recoveredMatches = exactlyOneById(recovered, targetId);
      expect(recoveredMatches).toHaveLength(1);
      expect(recoveredMatches[0].plate).toBe(marker);
      observations.push({
        step: 'clean-context-restore',
        restore_status: 200,
        same_stable_id: true,
        duplicate_count: recoveredMatches.length,
        marker_restored: recoveredMatches[0].plate === marker,
        server_idempotency: 'covered-by-orchestrator-pr-34',
      });
    } finally {
      if (mutationMayHaveReachedServer && originalTruck && writerToken) {
        try {
          const rollback = await pushOwnerData(
            page,
            config,
            writerToken,
            { trucks: [originalTruck] },
            'OFFLINE-01',
            'rollback',
          );
          expect.soft(rollback.status).toBe(200);
          observations.push({
            cleanup: 'restore-before-state',
            status: rollback.status,
          });
          if (rollback.status === 200 && recoveryToken) {
            const verify = fleetSnapshot(await restoreFleet(recoveryPage, config, recoveryToken));
            const restored = exactlyOneById(verify, originalTruck.id);
            expect.soft(restored).toHaveLength(1);
            if (restored.length === 1) {
              expect.soft(restored[0].plate || '').toBe(originalTruck.plate || '');
            }
          }
        } catch (error) {
          observations.push({
            cleanup: 'restore-before-state-failed',
            error_class: error?.name || 'Error',
          });
          expect.soft(false, 'OFFLINE-01 before-state rollback failed').toBe(true);
        }
      }

      await page.unroute(syncPattern);
      await safeRevoke(page, config, writerToken, 'writer', observations);
      await safeRevoke(recoveryPage, config, recoveryToken, 'recovery', observations);
      try {
        await attachSafeObservations(testInfo, 'offline-retry-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
