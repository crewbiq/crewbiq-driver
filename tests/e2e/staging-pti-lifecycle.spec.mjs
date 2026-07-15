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

const DAILY_ITEM_IDS = ['tires', 'lights', 'brakes', 'mirrors', 'coupling', 'cargo', 'gauges', 'horn'];

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

function ptiLogStorageKey(crewbiqId) {
  return `fiqD_data_crew_${identitySlug(crewbiqId)}_ptiLog`;
}

// See testing/PWA_APP_REFERENCE.md section 5 — several UI actions already fire
// their own fire-and-forget doSync()/syncPTIEntry() call. Retry only on the
// specific _syncInProgress skip, exactly like LOAD-01 (crewbiq-driver PR #63).
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
  // not from the default about:blank document (PWA_APP_REFERENCE.md section 4).
  //
  // Deliberately does NOT set ptiEnabled: false — unlike LOAD-01, the PTI gate
  // (needsPTI() / #ptiBlocker) is the subject under test here, not a gotcha to
  // opt out of.
  await page.evaluate(({ authId, email, syncUrl, sessionToken, ptiLogKey }) => {
    localStorage.setItem('fiqD_driver', JSON.stringify({
      crewId: authId,
      email,
      nickname: 'E2E Driver',
      syncUrl,
      payType: 'cpm',
      cpmRate: 0.55,
      cpmBase: 'loaded',
      unitNumber: '',
    }));
    localStorage.setItem('fiqD_sessionToken', sessionToken);
    localStorage.setItem(ptiLogKey, '[]');
  }, {
    authId: config.fleetA.authCrewbiqId,
    email: 'e2e-redacted@example.test',
    syncUrl: `${config.orchestratorUrl}/v1/sync`,
    sessionToken: token,
    ptiLogKey: ptiLogStorageKey(config.fleetA.authCrewbiqId),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test(
  'PTI-01 daily inspection blocks the app until complete, then survives authenticated restore',
  scenario(
    'A driver identity with no PTI record for today sees the mandatory PTI blocker instead of the app; completing the real form unblocks the app and the record survives authenticated restore on another device. If a same-day record already exists (repeated same-day run), the gate is correctly skipped and only the existing record is verified.',
    [
      'Open independent writer and recovery contexts.',
      'Seed the writer context with a real driver identity, PTI gate left enabled.',
      'Wait for either the PTI blocker or the app itself, and branch accordingly.',
      'If blocked: complete all daily items, enter odometer, submit through the real form.',
      'Verify the app becomes visible only after submission.',
      'Force sync and verify the PTI record on a recovery context via authenticated restore.',
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

      // boot() calls showPTIBlocker() (adds 'show' to #ptiBlocker, removes it
      // from #app) instead of showApp() when needsPTI() is true. A same-day
      // record already restored from the server (e.g. a repeated same-day CI
      // run) makes needsPTI() false, so the app shows directly instead — both
      // are valid outcomes and must be handled, not just the blocked path.
      const gateState = await page.waitForFunction(() => {
        const blocker = document.getElementById('ptiBlocker');
        const app = document.getElementById('app');
        const blocked = !!(blocker && blocker.classList.contains('show'));
        const appShown = !!(app && app.classList.contains('show'));
        return (blocked || appShown) ? { blocked, appShown } : false;
      }, undefined, { timeout: 20_000 }).then(handle => handle.jsonValue());
      observations.push({ step: 'gate-resolved', ...gateState });

      if (gateState.blocked) {
        for (const itemId of DAILY_ITEM_IDS) {
          await page.locator(`#pti_${itemId}`).click();
        }
        await page.locator('#ptiOdometer').fill('612340');
        const submitEnabled = await page.evaluate(() => !document.getElementById('ptiSubmitBtn').disabled);
        expect(submitEnabled).toBe(true);
        observations.push({ step: 'checklist-complete', submit_enabled: submitEnabled });

        await page.evaluate(() => {
          const button = document.getElementById('ptiSubmitBtn');
          if (!button) throw new Error('PTI submit button is missing');
          button.click();
        });
        observations.push({ step: 'clicked-submit-pti' });

        await page.waitForFunction(() => {
          const app = document.getElementById('app');
          return !!(app && app.classList.contains('show'));
        }, undefined, { timeout: 20_000 });
        observations.push({ step: 'app-unblocked-after-submit' });

        const syncResult = await forceSyncWithRetry(page);
        expect(syncResult && syncResult.ok).toBe(true);
        observations.push({ step: 'forced-sync', sync_ok: true });
      } else {
        observations.push({ step: 'gate-already-satisfied-same-day', note: 'app shown directly; verifying existing record only' });
      }

      const restore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restore.status).toBe(200);
      expect(restore.body.ok).toBe(true);
      const restoredPti = Array.isArray(restore.body.ptiLog) ? restore.body.ptiLog : [];
      const today = new Date().toISOString().slice(0, 10);
      const todaysEntries = restoredPti.filter(item => item.date === today);
      expect(todaysEntries.length).toBeGreaterThan(0);
      const latest = todaysEntries[0];
      observations.push({
        step: 'verified-recovery-restore',
        has_today_entry: todaysEntries.length > 0,
        odometer_present: Number(latest.odometer) > 0,
        passed: !!latest.passed,
      });
    } finally {
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'pti-lifecycle-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
