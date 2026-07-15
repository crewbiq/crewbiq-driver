import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  loginFleetA,
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
  testInfo.setTimeout(60_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-driver-browser-contexts' });
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

// Disputes go through the main window.doSync() path (like loads/PTI), not the
// separate debounced expenses path. addDriverDisputed() itself does not fire
// its own fire-and-forget sync (unlike saveLoad()), but this retry is kept for
// consistency with every other scenario in case a concurrent sync is racing.
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

test(
  'DISPUTE-01 add-and-resolve dispute survives authenticated restore on another device',
  scenario(
    'A dispute added through the real Add Dispute form is durably synced and appears with the same stable ID and values on a clean authenticated restore; resolving it (won) is a second synced write reflected the same way.',
    [
      'Open independent writer and recovery contexts.',
      'Seed the writer context with a real driver identity.',
      'Fill and submit the real Add Dispute form.',
      'Force an authenticated sync and confirm it succeeded.',
      'Restore on the recovery context and verify the pending dispute, values and stable ID.',
      'Resolve the dispute (won) and sync again.',
      'Restore again and verify the resolved status persisted.',
      'Revoke both sessions.',
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
    let addedDisputeId = '';

    try {
      const writerInitialState = await openFreshApplication(page, context, config);
      expect(writerInitialState.cookies).toEqual([]);
      expect(writerInitialState.origins).toEqual([]);
      const recoveryInitialState = await openFreshApplication(recoveryPage, recoveryContext, config);
      expect(recoveryInitialState.cookies).toEqual([]);
      expect(recoveryInitialState.origins).toEqual([]);

      writerToken = (await loginFleetA(page, config)).body.session_token;
      expect(writerToken).toBeTruthy();
      recoveryToken = (await loginFleetA(recoveryPage, config)).body.session_token;
      expect(recoveryToken).toBeTruthy();

      await seedDriverIdentity(page, config, writerToken);
      observations.push({ step: 'seeded-driver-identity' });

      await page.waitForFunction(() => {
        const app = document.getElementById('app');
        return !!(app && app.classList.contains('show'));
      }, undefined, { timeout: 20_000 });
      observations.push({ step: 'app-ready' });

      const marker = `${config.displayPrefix}DISPUTE-01`.slice(0, 40).toUpperCase().replace(/[^A-Z0-9-]/g, '');
      await page.evaluate(() => { if (typeof showPage === 'function') showPage('disputes'); });

      await page.locator('#dDisputeLoadId').fill(marker);
      await page.locator('#dDisputeAmount').fill('875.00');
      await page.locator('#dDisputeMiles').fill('420');
      await page.locator('#dDisputeNote').fill(marker);
      await page.evaluate(() => {
        if (typeof addDriverDisputed !== 'function') throw new Error('addDriverDisputed is missing');
        addDriverDisputed();
      });
      observations.push({ step: 'clicked-add-dispute', marker });

      const localAfterAdd = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), disputesStorageKey(config.fleetA.authCrewbiqId));
      const localMatch = localAfterAdd.find(item => item.loadId === marker);
      expect(localMatch && localMatch.id).toBeTruthy();
      expect(localMatch.status).toBe('pending');
      addedDisputeId = localMatch.id;
      observations.push({ step: 'verified-local-add', local_id: addedDisputeId });

      const syncResult = await forceSyncWithRetry(page);
      expect(syncResult && syncResult.ok).toBe(true);
      observations.push({ step: 'forced-sync', sync_ok: true });

      const restore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restore.status).toBe(200);
      expect(restore.body.ok).toBe(true);
      const restoredDisputes = Array.isArray(restore.body.disputes) ? restore.body.disputes : [];
      const matches = restoredDisputes.filter(item => item.loadId === marker);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe(addedDisputeId);
      expect(Number(matches[0].amount)).toBe(875);
      expect(Number(matches[0].miles)).toBe(420);
      expect(matches[0].status).toBe('pending');
      observations.push({
        step: 'verified-recovery-restore-pending',
        stable_id_preserved: matches[0].id === addedDisputeId,
        amount_match: Number(matches[0].amount) === 875,
        status: matches[0].status,
      });

      await page.evaluate(id => {
        if (typeof driverResolveDispute !== 'function') throw new Error('driverResolveDispute is missing');
        driverResolveDispute(id, 'won');
      }, addedDisputeId);
      observations.push({ step: 'resolved-dispute-won' });

      const resolveSyncResult = await forceSyncWithRetry(page);
      expect(resolveSyncResult && resolveSyncResult.ok).toBe(true);
      observations.push({ step: 'forced-sync-after-resolve', sync_ok: true });

      const restoreAfterResolve = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restoreAfterResolve.status).toBe(200);
      const resolvedDisputes = Array.isArray(restoreAfterResolve.body.disputes) ? restoreAfterResolve.body.disputes : [];
      const resolvedMatch = resolvedDisputes.find(item => item.id === addedDisputeId);
      expect(resolvedMatch).toBeTruthy();
      expect(resolvedMatch.status).toBe('won');
      expect(resolvedMatch.resolvedAt).toBeTruthy();
      observations.push({
        step: 'verified-recovery-restore-resolved',
        status: resolvedMatch.status,
        resolved_at_present: !!resolvedMatch.resolvedAt,
      });
    } finally {
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'dispute-lifecycle-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
