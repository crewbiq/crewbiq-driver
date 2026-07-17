import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  clone,
  loginFleetA,
  makeRecordId,
  openFreshApplication,
  restoreFleet,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();
const FIXED_NOW = '2031-01-09T12:00:00.000Z';
const FIXED_DATE = FIXED_NOW.slice(0, 10);

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

function exactWeek(ownerData, truckId, weekKey) {
  const weekly = Array.isArray(ownerData?.weeklyDeductions) ? ownerData.weeklyDeductions : [];
  return weekly.find(item => item?.truckId === truckId && item?.weekKey === weekKey) || null;
}

function withoutWeek(weekly, truckId, weekKey) {
  return (Array.isArray(weekly) ? weekly : []).filter(item => !(
    item?.truckId === truckId && item?.weekKey === weekKey
  ));
}

async function apiJson(requestContext, config, pathname, token, options = {}) {
  const response = await requestContext.fetch(
    new URL(pathname, `${config.orchestratorUrl}/`).href,
    {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options.data === undefined ? {} : { data: options.data }),
    },
  );
  const status = response.status();
  let body = {};
  try { body = await response.json(); } catch { body = { nonJsonResponse: true }; }
  return { status, ok: response.ok(), body };
}

async function restorePwaDirect(requestContext, config, token) {
  return apiJson(requestContext, config, '/v1/restore/pwa', token);
}

async function revokeDirect(requestContext, config, token) {
  if (!token) return { status: 0, ok: false, body: { reason: 'missing_token' } };
  return apiJson(requestContext, config, '/v1/auth/logout', token, { method: 'POST' });
}

async function writeWeeklySnapshot(requestContext, config, token, weeklyDeductions, phase) {
  const response = await apiJson(requestContext, config, '/v1/sync/pwa', token, {
    method: 'POST',
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
  });
  expect(response.status, `${phase}: HTTP ${response.status}`).toBe(200);
  expect(
    response.body?.ok,
    `${phase}: ${response.body?.error || response.body?.reason || 'server rejected snapshot'}`,
  ).toBe(true);
  return response;
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
  await page.evaluate(({ authId, sessionToken, syncUrl, snapshot }) => {
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
  }, {
    authId: config.fleetA.authCrewbiqId,
    sessionToken: token,
    syncUrl: `${config.orchestratorUrl}/v1/sync`,
    snapshot: ownerData,
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

async function deployedPeriod(page, truckId) {
  return page.evaluate(({ id, targetDate }) => {
    if (typeof findTruckByIdOrUnit !== 'function') throw new Error('findTruckByIdOrUnit is missing');
    const truck = findTruckByIdOrUnit(id);
    if (!truck) throw new Error('selected truck is missing');
    const calendar = window.CrewBIQSettlementWeek;
    if (!calendar || typeof calendar.periodForDate !== 'function') {
      throw new Error('CrewBIQSettlementWeek.periodForDate is missing');
    }
    return {
      truck,
      period: calendar.periodForDate(targetDate, truck),
    };
  }, { id: truckId, targetDate: FIXED_DATE });
}

async function saveLocalWeekly(page, weekly) {
  await page.evaluate(records => {
    if (typeof saveWeeklyDeds !== 'function') throw new Error('saveWeeklyDeds is missing');
    saveWeeklyDeds(records);
    if (typeof renderDeductionsPage === 'function') renderDeductionsPage();
  }, weekly);
}

async function localWeek(page, truckId, weekKey) {
  return page.evaluate(({ id, key }) => {
    if (typeof loadWeeklyDeds !== 'function') throw new Error('loadWeeklyDeds is missing');
    const weekly = loadWeeklyDeds();
    return weekly.find(item => item?.truckId === id && item?.weekKey === key) || null;
  }, { id: truckId, key: weekKey });
}

async function localWeekly(page) {
  return page.evaluate(() => {
    if (typeof loadWeeklyDeds !== 'function') throw new Error('loadWeeklyDeds is missing');
    return loadWeeklyDeds();
  });
}

async function clickConfirm(button, action, expectedText) {
  const dialogPromise = button.page().waitForEvent('dialog');
  const clickPromise = button.click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  expect(dialog.type()).toBe('confirm');
  expect(message).toContain(expectedText);
  await dialog[action]();
  await clickPromise;
  return message;
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
    let baselineExact = null;
    let truckId = '';
    let period = null;

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

      const baselineResponse = await restorePwaDirect(context.request, config, writerToken);
      expect(baselineResponse.status).toBe(200);
      expect(baselineResponse.body.ok).toBe(true);
      const baselineOwner = clone(baselineResponse.body.ownerData || {});
      baselineWeekly = clone(baselineOwner.weeklyDeductions || []);

      await seedFleetOwnerUi(page, config, writerToken, baselineOwner, truckId);
      const deployed = await deployedPeriod(page, truckId);
      period = deployed.period;
      expect(period?.start).toBeTruthy();
      expect(period?.end).toBeTruthy();
      baselineExact = clone(exactWeek(baselineOwner, truckId, period.start));

      const cleanWeekly = withoutWeek(baselineWeekly, truckId, period.start);
      const seededWeek = {
        id: `wd_${truckId}_${period.start}`,
        truckId,
        unitNumber: deployed.truck.unitNumber || fleetTruck.unitNumber || '',
        company: deployed.truck.company || fleetTruck.company || 'E2E Carrier',
        weekKey: period.start,
        settlementDate: period.end,
        weekEndDay: Number(period.weekEndDay),
        weekType: period.weekType,
        total: 450,
        items: [{
          id: 'e2e_week_insurance',
          name: 'E2E Insurance',
          amount: 450,
          category: 'insurance',
        }],
        resolutionRule: 'e2e_confirmed_baseline',
      };
      const seededWeekly = [...cleanWeekly, seededWeek];
      await saveLocalWeekly(page, seededWeekly);
      await writeWeeklySnapshot(context.request, config, writerToken, seededWeekly, 'seed');

      const skipButton = page.getByRole('button', { name: 'Skip deductions for this week' });
      await expect(skipButton).toBeVisible();

      const cancelMessage = await clickConfirm(skipButton, 'dismiss', 'Skip all deductions');
      expect(cancelMessage).toContain(`${period.start} – ${period.end}`);
      const afterCancel = await localWeek(page, truckId, period.start);
      expect(Number(afterCancel?.total)).toBe(450);
      expect(afterCancel?.items?.[0]?.category).toBe('insurance');

      const acceptMessage = await clickConfirm(skipButton, 'accept', 'replaced by $0');
      expect(acceptMessage).toContain(`${period.start} – ${period.end}`);
      await expect(page.getByText('Week off · deductions $0')).toBeVisible();

      const skippedLocal = await localWeek(page, truckId, period.start);
      expect(Number(skippedLocal?.total)).toBe(0);
      expect(skippedLocal?.items).toHaveLength(1);
      expect(skippedLocal?.items?.[0]?.category).toBe('week_exception');
      expect(skippedLocal?.items?.[0]?.status).toBe('skipped');
      expect(Number(skippedLocal?.items?.[0]?.previousSnapshot?.total)).toBe(450);

      await writeWeeklySnapshot(
        context.request, config, writerToken, await localWeekly(page), 'skip-persist',
      );
      const skippedRestore = await restorePwaDirect(context.request, config, recoveryToken);
      expect(skippedRestore.status).toBe(200);
      const skippedRemote = exactWeek(skippedRestore.body.ownerData, truckId, period.start);
      expect(Number(skippedRemote?.total)).toBe(0);
      expect(skippedRemote?.items?.[0]?.category).toBe('week_exception');

      const restoreButton = page.getByRole('button', { name: 'Restore deductions for this week' });
      await expect(restoreButton).toBeVisible();
      const restoreMessage = await clickConfirm(restoreButton, 'accept', 'Restore deductions');
      expect(restoreMessage).toContain(`${period.start} – ${period.end}`);

      const restoredLocal = await localWeek(page, truckId, period.start);
      expect(Number(restoredLocal?.total)).toBe(450);
      expect(restoredLocal?.items?.[0]?.category).toBe('insurance');

      await writeWeeklySnapshot(
        context.request, config, writerToken, await localWeekly(page), 'restore-persist',
      );
      const finalRestore = await restorePwaDirect(context.request, config, recoveryToken);
      expect(finalRestore.status).toBe(200);
      const restoredRemote = exactWeek(finalRestore.body.ownerData, truckId, period.start);
      expect(Number(restoredRemote?.total)).toBe(450);
      expect(restoredRemote?.items?.[0]?.category).toBe('insurance');

      observations.push({
        journey: 'DEDUCTION-WEEK-OFF-01',
        settlement_period_derived_from_deployed_truck: true,
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
          if (recoveryToken && truckId && period?.start) {
            const verify = await restorePwaDirect(context.request, config, recoveryToken);
            expect.soft(exactWeek(verify.body.ownerData, truckId, period.start)).toEqual(baselineExact);
          }
        } catch (error) {
          observations.push({ cleanup: 'weekly-baseline-restored', status: 'failed', error_class: error?.name || 'Error' });
          expect.soft(false, 'weekly deduction baseline cleanup failed').toBe(true);
        }
      }
      if (writerToken) expect.soft((await revokeDirect(context.request, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeDirect(context.request, config, recoveryToken)).status).toBe(200);
      await attachSafeObservations(testInfo, 'deduction-week-off-observations', observations);
      await recoveryContext.close();
    }
  },
);
