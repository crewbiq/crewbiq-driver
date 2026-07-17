import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  clone,
  loginFleetA,
  makeRecordId,
  openFreshApplication,
  restoreFleet,
  restorePwa,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();
const FIXED_NOW = '2031-01-09T12:00:00.000Z'; // Thursday
const TEST_WEEK_KEY = '2031-01-03';
const TEST_SETTLEMENT_DATE = '2031-01-09';

test.use({ screenshot: 'off', trace: 'off', serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(90_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-fleet-a-deduction-week-exception' });
});

function tokenFrom(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.session_token).toBeTruthy();
  return response.body.session_token;
}

function exactWeek(ownerData, truckId) {
  const weekly = Array.isArray(ownerData?.weeklyDeductions) ? ownerData.weeklyDeductions : [];
  return weekly.find(item => item?.truckId === truckId && item?.weekKey === TEST_WEEK_KEY) || null;
}

function withoutTestWeek(weekly, truckId) {
  return (Array.isArray(weekly) ? weekly : []).filter(item => !(
    item?.truckId === truckId && item?.weekKey === TEST_WEEK_KEY
  ));
}

async function writeWeeklySnapshot(requestContext, config, token, weeklyDeductions, phase) {
  const response = await requestContext.post(
    new URL('/v1/sync/pwa', `${config.orchestratorUrl}/`).href,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      data: {
        record_id: makeRecordId(config, 'DEDUCTION-WEEK-OFF-01', phase),
        type: 'driver_report',
        deviceId: `e2e-deduction-week-off-01-${phase}`,
        driver: {
          crewId: config.fleetA.authCrewbiqId,
          email: 'e2e-redacted@example.test',
        },
        loads: [],
        ptiLog: [],
        ownerData: {
          snapshotEntities: ['weeklyDeductions'],
          weeklyDeductions: clone(weeklyDeductions),
        },
      },
    },
  );
  const status = response.status();
  let body = {};
  try { body = await response.json(); } catch { body = { nonJsonResponse: true }; }
  expect(status, `${phase}: HTTP ${status}`).toBe(200);
  expect(body?.ok, `${phase}: ${body?.error || body?.reason || 'server rejected snapshot'}`).toBe(true);
  return { status, body };
}

async function installFixedClock(context) {
  await context.addInitScript(({ fixedNow }) => {
    const NativeDate = Date;
    const fixed = new NativeDate(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed.getTime(); }
    }
    Object.defineProperty(window, 'Date', { value: FixedDate, configurable: true });
  }, { fixedNow: FIXED_NOW });
}

async function seedFleetOwnerUi(page, config, token, ownerData, truckId) {
  await page.evaluate(({ authId, sessionToken, syncUrl, snapshot, selectedTruckId }) => {
    localStorage.setItem('fiqD_driver', JSON.stringify({
      crewId: authId,
      email: 'e2e-redacted@example.test',
      nickname: 'E2E Fleet A',
      syncUrl,
      role: 'fleet',
    }));
    localStorage.setItem('fiqD_sessionToken', sessionToken);
    localStorage.setItem('fiqD_userRole', 'fleet');
    localStorage.setItem('fiqD_authRoles', JSON.stringify(['fleet']));
    if (typeof applyOwnerSyncData !== 'function') throw new Error('applyOwnerSyncData is missing');
    applyOwnerSyncData(snapshot);
    localStorage.setItem('fiqD_selectedTruck_dedTruckSelect', selectedTruckId);
  }, {
    authId: config.fleetA.authCrewbiqId,
    sessionToken: token,
    syncUrl: `${config.orchestratorUrl}/v1/sync`,
    snapshot: ownerData,
    selectedTruckId: truckId,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return !!(app && app.classList.contains('show'));
  }, undefined, { timeout: 25_000 });

  await page.evaluate(truckIdValue => {
    window.forceFullSync = async () => ({ ok: true, skipped: true, reason: 'e2e-controlled-write' });
    if (typeof showPage === 'function') showPage('deductions');
    const select = document.getElementById('dedTruckSelect');
    if (!select) throw new Error('dedTruckSelect is missing');
    select.value = truckIdValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof renderDeductionsPage === 'function') renderDeductionsPage();
  }, truckId);
}

async function localWeek(page, truckId) {
  return page.evaluate(({ id, weekKey }) => {
    if (typeof loadWeeklyDeds !== 'function') throw new Error('loadWeeklyDeds is missing');
    const weekly = loadWeeklyDeds();
    return weekly.find(item => item?.truckId === id && item?.weekKey === weekKey) || null;
  }, { id: truckId, weekKey: TEST_WEEK_KEY });
}

async function localWeekly(page) {
  return page.evaluate(() => {
    if (typeof loadWeeklyDeds !== 'function') throw new Error('loadWeeklyDeds is missing');
    return loadWeeklyDeds();
  });
}

test(
  'DEDUCTION-WEEK-OFF-01 confirmation blocks accidental skip, $0 exception persists, and restore returns prior snapshot',
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    const observations = [];
    let writerToken = '';
    let recoveryToken = '';
    let baselineWeekly = [];
    let truckId = '';

    try {
      await installFixedClock(context);
      await installFixedClock(recoveryContext);
      await openFreshApplication(page, context, config);
      await openFreshApplication(recoveryPage, recoveryContext, config);
      writerToken = tokenFrom(await loginFleetA(page, config));
      recoveryToken = tokenFrom(await loginFleetA(recoveryPage, config));

      const fleetResponse = await restoreFleet(page, config, writerToken);
      expect(fleetResponse.status).toBe(200);
      expect(fleetResponse.body.ok).toBe(true);
      truckId = config.fleetA.activeTruckIds[0];
      const fleetTruck = (fleetResponse.body.trucks || []).find(item => item?.id === truckId);
      expect(fleetTruck).toBeTruthy();

      const baselineResponse = await restorePwa(page, config, writerToken);
      expect(baselineResponse.status).toBe(200);
      expect(baselineResponse.body.ok).toBe(true);
      const baselineOwner = clone(baselineResponse.body.ownerData || {});
      baselineWeekly = withoutTestWeek(baselineOwner.weeklyDeductions, truckId);

      const trucks = Array.isArray(baselineOwner.trucks) ? baselineOwner.trucks : [];
      baselineOwner.trucks = trucks.map(truck => truck?.id === truckId
        ? { ...truck, weekType: 'custom', weekEndDay: 4 }
        : truck);

      const seededWeek = {
        id: `wd_${truckId}_${TEST_WEEK_KEY}`,
        truckId,
        unitNumber: fleetTruck.unitNumber || '',
        company: fleetTruck.company || 'E2E Carrier',
        weekKey: TEST_WEEK_KEY,
        settlementDate: TEST_SETTLEMENT_DATE,
        weekEndDay: 4,
        weekType: 'custom',
        total: 450,
        items: [{
          id: 'e2e_week_insurance',
          name: 'E2E Insurance',
          amount: 450,
          category: 'insurance',
        }],
        resolutionRule: 'e2e_confirmed_baseline',
      };
      baselineOwner.weeklyDeductions = [...baselineWeekly, seededWeek];

      await writeWeeklySnapshot(context.request, config, writerToken, baselineOwner.weeklyDeductions, 'seed');
      await seedFleetOwnerUi(page, config, writerToken, baselineOwner, truckId);

      const skipButton = page.getByRole('button', { name: 'Skip deductions for this week' });
      await expect(skipButton).toBeVisible();

      page.once('dialog', async dialog => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('Skip all deductions');
        expect(dialog.message()).toContain(`${TEST_WEEK_KEY} – ${TEST_SETTLEMENT_DATE}`);
        await dialog.dismiss();
      });
      await skipButton.click();
      const afterCancel = await localWeek(page, truckId);
      expect(Number(afterCancel?.total)).toBe(450);
      expect(afterCancel?.items?.[0]?.category).toBe('insurance');

      page.once('dialog', async dialog => {
        expect(dialog.message()).toContain('replaced by $0');
        await dialog.accept();
      });
      await skipButton.click();
      await expect(page.getByText('Week off · deductions $0')).toBeVisible();

      const skippedLocal = await localWeek(page, truckId);
      expect(Number(skippedLocal?.total)).toBe(0);
      expect(skippedLocal?.items).toHaveLength(1);
      expect(skippedLocal?.items?.[0]?.category).toBe('week_exception');
      expect(skippedLocal?.items?.[0]?.status).toBe('skipped');
      expect(Number(skippedLocal?.items?.[0]?.previousSnapshot?.total)).toBe(450);

      await writeWeeklySnapshot(
        context.request, config, writerToken, await localWeekly(page), 'skip-persist',
      );
      const skippedRestore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(skippedRestore.status).toBe(200);
      const skippedRemote = exactWeek(skippedRestore.body.ownerData, truckId);
      expect(Number(skippedRemote?.total)).toBe(0);
      expect(skippedRemote?.items?.[0]?.category).toBe('week_exception');

      const restoreButton = page.getByRole('button', { name: 'Restore deductions for this week' });
      await expect(restoreButton).toBeVisible();
      page.once('dialog', async dialog => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('Restore deductions');
        await dialog.accept();
      });
      await restoreButton.click();

      const restoredLocal = await localWeek(page, truckId);
      expect(Number(restoredLocal?.total)).toBe(450);
      expect(restoredLocal?.items?.[0]?.category).toBe('insurance');

      await writeWeeklySnapshot(
        context.request, config, writerToken, await localWeekly(page), 'restore-persist',
      );
      const finalRestore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(finalRestore.status).toBe(200);
      const restoredRemote = exactWeek(finalRestore.body.ownerData, truckId);
      expect(Number(restoredRemote?.total)).toBe(450);
      expect(restoredRemote?.items?.[0]?.category).toBe('insurance');

      observations.push({
        journey: 'DEDUCTION-WEEK-OFF-01',
        cancel_prevented_mutation: true,
        zero_week_exception_persisted: true,
        prior_snapshot_retained_for_restore: true,
        restore_returned_exact_prior_amount: true,
      });
    } finally {
      if (writerToken) {
        try {
          await writeWeeklySnapshot(context.request, config, writerToken, baselineWeekly, 'rollback');
          observations.push({ cleanup: 'weekly-baseline-restored', status: 200 });
          if (recoveryToken && truckId) {
            const verify = await restorePwa(recoveryPage, config, recoveryToken);
            expect.soft(exactWeek(verify.body.ownerData, truckId)).toBeNull();
          }
        } catch (error) {
          observations.push({ cleanup: 'weekly-baseline-restored', status: 'failed', error_class: error?.name || 'Error' });
          expect.soft(false, 'weekly deduction baseline cleanup failed').toBe(true);
        }
      }
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      await attachSafeObservations(testInfo, 'deduction-week-off-observations', observations);
      await recoveryContext.close();
    }
  },
);
