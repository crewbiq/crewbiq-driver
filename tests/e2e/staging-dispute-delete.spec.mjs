import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  browserJson,
  loginFleetA,
  makeRecordId,
  openFreshApplication,
  restorePwa,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(75_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-driver-delete-browser-contexts' });
});

function scenario(expectedResult, steps) {
  return {
    annotation: [
      { type: 'expected_result', description: expectedResult },
      ...steps.map(description => ({ type: 'step', description })),
    ],
  };
}

function identitySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function disputesStorageKey(crewbiqId) {
  return `fiqD_data_crew_${identitySlug(crewbiqId)}_disputed`;
}

async function seedDriverIdentity(page, config, token) {
  await page.evaluate(({ authId, email, syncUrl, sessionToken, disputesKey }) => {
    localStorage.setItem('fiqD_driver', JSON.stringify({
      crewId: authId,
      email,
      nickname: 'E2E Driver',
      syncUrl,
      payType: 'cpm',
      cpmRate: 0.55,
      cpmBase: 'loaded',
      unitNumber: '',
      ptiEnabled: false,
    }));
    localStorage.setItem('fiqD_sessionToken', sessionToken);
    localStorage.setItem(disputesKey, '[]');
  }, {
    authId: config.fleetA.authCrewbiqId,
    email: 'e2e-redacted@example.test',
    syncUrl: `${config.orchestratorUrl}/v1/sync`,
    sessionToken: token,
    disputesKey: disputesStorageKey(config.fleetA.authCrewbiqId),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function forceSyncWithRetry(page, { attempts = 5, retryDelayMs = 1000 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await page.evaluate(() => window.doSync({ forceAll: true }));
    if (last && last.ok) return last;
    if (last && last.skipped && last.reason === 'sync_in_progress') {
      await page.waitForTimeout(retryDelayMs);
      continue;
    }
    return last;
  }
  return last || { ok: false, reason: 'sync_retry_exhausted' };
}

async function pushDisputeState(page, config, token, dispute, phase) {
  return browserJson(page, config.orchestratorUrl, '/v1/sync/pwa', {
    method: 'POST',
    token,
    body: {
      record_id: makeRecordId(config, 'DISPUTE-DELETE-01', phase),
      type: 'driver_report',
      deviceId: `e2e-dispute-delete-${phase}`,
      driver: {
        crewId: config.fleetA.authCrewbiqId,
        email: 'e2e-redacted@example.test',
      },
      loads: [],
      ptiLog: [],
      disputes: [dispute],
      ownerData: null,
    },
  });
}

test(
  'DISPUTE-DELETE-01 deleted dispute stays absent after clean restore and stale replay',
  scenario(
    'A dispute deleted through the real UI is acknowledged by PostgreSQL, omitted from clean restore, and cannot be resurrected by a later same-ID stale pending replay.',
    [
      'Open independent writer and recovery contexts.',
      'Create a unique dispute through the real Add Dispute form.',
      'Sync and verify the pending dispute on clean authenticated restore.',
      'Delete through the real UI and require explicit PostgreSQL acknowledgement.',
      'Verify the dispute is absent on clean restore.',
      'Replay the captured pre-delete dispute with the same entity ID.',
      'Verify a second clean restore still omits it.',
      'Leave an exact test-owned deleted tombstone and revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    page.on('dialog', dialog => dialog.accept());
    recoveryPage.on('dialog', dialog => dialog.accept());

    const observations = [];
    let writerToken = '';
    let recoveryToken = '';
    let disputeId = '';
    let marker = '';
    let staleDispute = null;

    try {
      const writerInitialState = await openFreshApplication(page, context, config);
      expect(writerInitialState.cookies).toEqual([]);
      expect(writerInitialState.origins).toEqual([]);
      const recoveryInitialState = await openFreshApplication(recoveryPage, recoveryContext, config);
      expect(recoveryInitialState.cookies).toEqual([]);
      expect(recoveryInitialState.origins).toEqual([]);

      writerToken = (await loginFleetA(page, config)).body.session_token;
      recoveryToken = (await loginFleetA(recoveryPage, config)).body.session_token;
      expect(writerToken).toBeTruthy();
      expect(recoveryToken).toBeTruthy();

      await seedDriverIdentity(page, config, writerToken);
      await page.waitForFunction(() => {
        const app = document.getElementById('app');
        return !!(app && app.classList.contains('show'));
      }, undefined, { timeout: 20_000 });
      await page.waitForFunction(() => !!window.CrewBIQLoads?.__durableDisputeDeleteInstalled,
        undefined, { timeout: 20_000 });
      observations.push({ step: 'app-and-delete-contract-ready' });

      marker = `${config.displayPrefix}DISPUTE-DELETE-01-${Date.now()}`
        .slice(0, 70)
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '');
      await page.evaluate(() => { if (typeof showPage === 'function') showPage('disputes'); });
      await page.locator('#dDisputeLoadId').fill(marker);
      await page.locator('#dDisputeAmount').fill('431.00');
      await page.locator('#dDisputeMiles').fill('219');
      await page.locator('#dDisputeNote').fill(marker);
      await page.evaluate(() => {
        if (typeof addDriverDisputed !== 'function') throw new Error('addDriverDisputed is missing');
        addDriverDisputed();
      });

      const key = disputesStorageKey(config.fleetA.authCrewbiqId);
      const localAfterAdd = await page.evaluate(storageKey =>
        JSON.parse(localStorage.getItem(storageKey) || '[]'), key);
      staleDispute = localAfterAdd.find(item => item.loadId === marker) || null;
      expect(staleDispute?.id).toBeTruthy();
      disputeId = staleDispute.id;
      observations.push({ step: 'created-unique-dispute', stable_id_present: true });

      const createSync = await forceSyncWithRetry(page);
      expect(createSync?.ok).toBe(true);
      expect(createSync?.orchestratorCopy?.ok).toBe(true);

      const restoreBeforeDelete = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restoreBeforeDelete.status).toBe(200);
      expect((restoreBeforeDelete.body.disputes || []).filter(item => item.id === disputeId)).toHaveLength(1);
      observations.push({ step: 'verified-pending-on-clean-restore' });

      const deleteResult = await page.evaluate(id => window.driverDeleteDispute(id), disputeId);
      expect(deleteResult).toBe(true);
      const localAfterDelete = await page.evaluate(storageKey =>
        JSON.parse(localStorage.getItem(storageKey) || '[]'), key);
      expect(localAfterDelete.some(item => item.id === disputeId)).toBe(false);
      observations.push({ step: 'ui-delete-postgresql-acknowledged' });

      const restoreAfterDelete = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restoreAfterDelete.status).toBe(200);
      expect((restoreAfterDelete.body.disputes || []).filter(item => item.id === disputeId)).toHaveLength(0);
      observations.push({ step: 'verified-absent-after-delete' });

      const staleReplay = await pushDisputeState(recoveryPage, config, recoveryToken, {
        ...staleDispute,
        status: 'pending',
        synced: false,
      }, 'stale-replay');
      expect(staleReplay.status).toBe(200);
      observations.push({ step: 'submitted-same-id-stale-replay', accepted_without_resurrection: true });

      const restoreAfterStaleReplay = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restoreAfterStaleReplay.status).toBe(200);
      expect((restoreAfterStaleReplay.body.disputes || []).filter(item => item.id === disputeId)).toHaveLength(0);
      observations.push({ step: 'verified-absent-after-stale-replay' });
    } finally {
      if (disputeId && marker && writerToken) {
        const cleanup = await pushDisputeState(page, config, writerToken, {
          id: disputeId,
          loadId: marker,
          amount: Number(staleDispute?.amount || 0),
          miles: Number(staleDispute?.miles || 0),
          note: marker,
          status: 'deleted',
          createdAt: staleDispute?.createdAt || new Date().toISOString().slice(0, 10),
          deletedAt: new Date().toISOString(),
          synced: false,
        }, 'cleanup-tombstone');
        expect.soft(cleanup.status).toBe(200);
      }
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'dispute-delete-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
