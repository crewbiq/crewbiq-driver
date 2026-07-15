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

function loadsStorageKey(crewbiqId) {
  return `fiqD_data_crew_${identitySlug(crewbiqId)}_loads`;
}

// saveLoad() (loads.js) already fires its own fire-and-forget doSync() call.
// Calling window.doSync() again immediately can race that in-flight sync and
// hit its `_syncInProgress` guard, which returns { ok:false, skipped:true,
// reason:'sync_in_progress' } even though the original sync succeeds moments
// later — confirmed via the "[CrewBIQ Orchestrator] sync ok" console line
// still appearing in a run where the explicit call reported skipped. Retry
// only that specific skip reason; treat anything else as a real result.
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
  // Caller must already have run openFreshApplication() and loginFleetA() on this
  // page — localStorage is only reachable after a real navigation has happened,
  // not from the default about:blank document.
  await page.evaluate(({ authId, email, syncUrl, sessionToken, loadsKey }) => {
    localStorage.setItem('fiqD_driver', JSON.stringify({
      crewId: authId,
      email,
      nickname: 'E2E Driver',
      syncUrl,
      payType: 'cpm',
      cpmRate: 0.55,
      cpmBase: 'loaded',
      unitNumber: '',
      // Without a PTI log entry for today, needsPTI() (pti.js) returns true and
      // boot() shows the mandatory PTI blocker instead of the app — explicitly
      // opting this synthetic identity out, since LOAD-01 tests load creation,
      // not the PTI gate.
      ptiEnabled: false,
    }));
    localStorage.setItem('fiqD_sessionToken', sessionToken);
    localStorage.setItem(loadsKey, '[]');
  }, {
    authId: config.fleetA.authCrewbiqId,
    email: 'e2e-redacted@example.test',
    syncUrl: `${config.orchestratorUrl}/v1/sync`,
    sessionToken: token,
    loadsKey: loadsStorageKey(config.fleetA.authCrewbiqId),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test(
  'LOAD-01 add load form entry survives authenticated restore on another device',
  scenario(
    'A load added through the real Add Load form is durably synced and appears with the same stable ID and values on a clean authenticated restore.',
    [
      'Open independent writer and recovery contexts.',
      'Seed the writer context with a real driver identity.',
      'Fill and submit the real Add Load form.',
      'Force an authenticated sync and confirm it succeeded.',
      'Restore on the recovery context and verify the load, values and stable ID.',
      'Mark the load cancelled as an inert cleanup state and revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    // The real Add Load form calls confirm() when a load already exists for the
    // same pickup date. Headless Chromium has no human to answer a native dialog,
    // so without a handler this hangs until the test timeout.
    page.on('dialog', dialog => dialog.accept());
    recoveryPage.on('dialog', dialog => dialog.accept());
    const observations = [];
    let writerToken = '';
    let recoveryToken = '';
    let addedLoadId = '';
    let markedInert = false;

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

      // boot() only runs inside restoreSession().finally() when a saved session
      // exists (index.html bottom-of-file init). boot() shows #ptiBlocker instead
      // of calling showApp() when needsPTI() is true (pti.js) — showPTIBlocker()
      // explicitly removes the 'show' class from #app, so a missing PTI record
      // for today makes this wait fail closed, not hang open, once ptiEnabled is
      // set correctly above. waitForFunction's signature is (pageFunction, arg,
      // options) — the timeout MUST be the third argument, not the second, or it
      // silently falls back to the outer test timeout instead of failing at 20s.
      await page.waitForFunction(() => {
        const app = document.getElementById('app');
        return !!(app && app.classList.contains('show'));
      }, undefined, { timeout: 20_000 }).catch(async error => {
        const ptiBlockerShown = await page.evaluate(() => {
          const blocker = document.getElementById('ptiBlocker');
          return !!(blocker && blocker.classList.contains('show'));
        }).catch(() => null);
        observations.push({ step: 'app-ready-failed', pti_blocker_shown: ptiBlockerShown });
        throw error;
      });
      observations.push({ step: 'app-ready' });

      const marker = `${config.displayPrefix}LOAD-01`.slice(0, 40).toUpperCase().replace(/[^A-Z0-9-]/g, '');
      await page.evaluate(() => { if (typeof showPage === 'function') showPage('load'); });

      await page.locator('#loadId').fill(marker);
      await page.locator('#loadedMiles').fill('612');
      await page.locator('#grossInput').fill('1850.00');
      const pickupDate = new Date().toISOString().slice(0, 10);
      await page.locator('#pickupDate').fill(pickupDate);
      await page.evaluate(() => {
        const button = document.getElementById('saveLoadBtn');
        if (!button) throw new Error('Add Load button is missing');
        button.click();
      });
      observations.push({ step: 'clicked-add-load', marker });

      const localAfterAdd = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), loadsStorageKey(config.fleetA.authCrewbiqId));
      const localMatch = localAfterAdd.find(item => item.loadId === marker);
      expect(localMatch && localMatch.id).toBeTruthy();
      addedLoadId = localMatch.id;
      observations.push({ step: 'verified-local-add', local_id: addedLoadId });

      const syncResult = await forceSyncWithRetry(page);
      expect(syncResult && syncResult.ok).toBe(true);
      observations.push({ step: 'forced-sync', sync_ok: true });

      const restore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restore.status).toBe(200);
      expect(restore.body.ok).toBe(true);
      const restoredLoads = Array.isArray(restore.body.loads) ? restore.body.loads : [];
      const matches = restoredLoads.filter(item => item.loadId === marker);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe(addedLoadId);
      expect(Number(matches[0].loadedMiles)).toBe(612);
      expect(Number(matches[0].gross)).toBe(1850);
      observations.push({
        step: 'verified-recovery-restore',
        stable_id_preserved: matches[0].id === addedLoadId,
        loaded_miles_match: Number(matches[0].loadedMiles) === 612,
        gross_match: Number(matches[0].gross) === 1850,
      });
    } finally {
      if (addedLoadId) {
        try {
          await page.evaluate(id => { window.setLoadStatus(id, 'cancel'); }, addedLoadId);
          const inertSync = await forceSyncWithRetry(page);
          markedInert = !!(inertSync && inertSync.ok);
          observations.push({ cleanup: 'load-marked-cancelled', status: markedInert ? 'complete' : 'best_effort' });
        } catch (error) {
          observations.push({ cleanup: 'load-marked-cancelled', status: 'failed', error_class: error && error.name ? error.name : 'Error' });
        }
      }
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'load-lifecycle-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
