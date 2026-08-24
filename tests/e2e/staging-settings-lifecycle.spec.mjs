import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  browserJson,
  loginFleetA,
  openFreshApplication,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(90_000);
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

function settingsPayload(response) {
  return response?.body?.settings || response?.body || {};
}

function rateEffectiveDate(response) {
  return String(settingsPayload(response)?.preferences?.rateEffectiveDate || '').trim();
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function differentProbeDate(baseline) {
  return baseline === '2030-01-01' ? '2030-01-02' : '2030-01-01';
}

async function waitForVisibleApp(page) {
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return !!(app && app.classList.contains('show'));
  }, undefined, { timeout: 20_000 });
}

async function openSettings(page) {
  await page.evaluate(() => {
    if (typeof showPage !== 'function') throw new Error('showPage is unavailable');
    showPage('settings');
  });
  await page.waitForSelector('#setRateEffectiveDate', { state: 'visible', timeout: 20_000 });
  return page.locator('#setRateEffectiveDate').inputValue();
}

async function awaitFullSync(page) {
  return page.evaluate(async () => {
    const deadline = Date.now() + 20_000;
    while (true) {
      if (typeof window.forceFullSync !== 'function') throw new Error('forceFullSync is unavailable');
      const result = await window.forceFullSync();
      if (result?.ok === true) return result;
      if (!(result?.skipped === true && result?.reason === 'sync_in_progress')) {
        throw new Error(`full sync failed: ${JSON.stringify(result || {})}`);
      }
      if (Date.now() >= deadline) throw new Error('full sync remained in progress');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  });
}

async function waitForSettingsRestore(page, previousAt = '') {
  await page.waitForFunction(prior => {
    try {
      const report = JSON.parse(localStorage.getItem('fiqD_lastSettingsRestoreReport') || 'null');
      return !!(report && report.at && report.at !== prior && report.source);
    } catch {
      return false;
    }
  }, previousAt, { timeout: 20_000 });
  const report = await page.evaluate(() => JSON.parse(localStorage.getItem('fiqD_lastSettingsRestoreReport')));
  if (!report.source || /google|legacy/i.test(report.source)) {
    throw new Error(`unexpected settings restore source: ${report.source || 'missing'}`);
  }
  return report;
}

async function saveRateDateThroughUi(page, value) {
  await page.locator('#setRateEffectiveDate').fill(value);
  const selector = '#page-settings button[onclick="saveSettings()"], #page-settings button[onclick="saveSettings(event)"]';
  const button = page.locator(selector).first();
  await expect(button).toBeVisible();
  const priorToasts = await page.locator('.toast, #toast').count();
  await button.click();
  await page.waitForFunction(
    ({ message, priorCount }) => {
      const toasts = Array.from(document.querySelectorAll('.toast, #toast'));
      return toasts.length >= priorCount && toasts.some(toast => (toast.innerText || '').includes(message));
    },
    { message: 'Settings saved', priorCount: priorToasts },
    { timeout: 20_000 },
  );
  return awaitFullSync(page);
}

test(
  'SETTINGS-01 authenticated settings lifecycle preserves and restores rate effective date',
  scenario(
    'A cloud-baselined rate effective date changed through the visible Settings form is synchronized, restored through the real clean-device application path, and rolled back exactly.',
    [
      'Open independent writer and recovery contexts.',
      'Authenticate the writer and capture the exact reversible cloud baseline.',
      'Restore the writer normally and require its rendered Settings value to match the cloud baseline.',
      'Change the Rate Effective From field through visible Settings controls and save.',
      'Await successful full product sync and verify the server postimage.',
      'Authenticate a clean recovery context and reload through the shipped restore path.',
      'Verify restore diagnostics and the rendered Settings field.',
      'Restore the exact cloud baseline in finally and prove server and client postimages.',
      'Revoke both sessions and attach safe observations.',
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
    let baselineValue = '';
    let probeValue = '';
    let mutationPossible = false;
    let writeAcknowledged = false;
    let cleanupRestored = false;
    let cleanupError = null;

    try {
      const writerInitialState = await openFreshApplication(page, context, config);
      expect(writerInitialState.cookies).toEqual([]);
      expect(writerInitialState.origins).toEqual([]);

      writerToken = (await loginFleetA(page, config)).body.session_token;
      expect(writerToken).toBeTruthy();

      const baselineResponse = await browserJson(page, config.orchestratorUrl, '/v1/settings/pwa', {
        token: writerToken,
      });
      expect(baselineResponse.status).toBe(200);
      baselineValue = rateEffectiveDate(baselineResponse);
      expect(isIsoDate(baselineValue), 'cloud baseline must be an explicit reversible ISO date').toBe(true);

      await page.reload({ waitUntil: 'domcontentloaded' });
      const writerRestore = await waitForSettingsRestore(page);
      await waitForVisibleApp(page);
      expect(await openSettings(page)).toBe(baselineValue);

      probeValue = differentProbeDate(baselineValue);
      expect(isIsoDate(probeValue)).toBe(true);
      expect(probeValue).not.toBe(baselineValue);

      mutationPossible = true;
      await saveRateDateThroughUi(page, probeValue);
      writeAcknowledged = true;
      expect(await page.locator('#setRateEffectiveDate').inputValue()).toBe(probeValue);

      const mutationResponse = await browserJson(page, config.orchestratorUrl, '/v1/settings/pwa', {
        token: writerToken,
      });
      expect(mutationResponse.status).toBe(200);
      expect(rateEffectiveDate(mutationResponse)).toBe(probeValue);
      observations.push({
        step: 'writer-synchronized',
        baseline_valid: true,
        probe_distinct: true,
        source: writerRestore.source,
      });

      const recoveryInitialState = await openFreshApplication(recoveryPage, recoveryContext, config);
      expect(recoveryInitialState.cookies).toEqual([]);
      expect(recoveryInitialState.origins).toEqual([]);
      recoveryToken = (await loginFleetA(recoveryPage, config)).body.session_token;
      expect(recoveryToken).toBeTruthy();

      await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
      const recoveryRestore = await waitForSettingsRestore(recoveryPage);
      await waitForVisibleApp(recoveryPage);
      expect(await openSettings(recoveryPage)).toBe(probeValue);
      observations.push({
        step: 'clean-device-client-restored',
        rendered_match: true,
        source: recoveryRestore.source,
      });
    } finally {
      try {
        if (mutationPossible && isIsoDate(baselineValue)) {
          await waitForVisibleApp(page);
          await openSettings(page);
          await saveRateDateThroughUi(page, baselineValue);

          const rollbackResponse = await browserJson(page, config.orchestratorUrl, '/v1/settings/pwa', {
            token: writerToken,
          });
          if (rollbackResponse.status !== 200 || rateEffectiveDate(rollbackResponse) !== baselineValue) {
            throw new Error('shared staging server baseline rollback was not proven');
          }

          const previousReportAt = await page.evaluate(() => {
            try {
              return JSON.parse(localStorage.getItem('fiqD_lastSettingsRestoreReport') || 'null')?.at || '';
            } catch {
              return '';
            }
          });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await waitForSettingsRestore(page, previousReportAt);
          await waitForVisibleApp(page);
          if (await openSettings(page) !== baselineValue) {
            throw new Error('shared staging client baseline rollback was not proven');
          }
          cleanupRestored = true;
          observations.push({ step: 'cleanup-restored', server_match: true, client_match: true });
        }
      } catch (error) {
        cleanupError = error;
        observations.push({ step: 'cleanup-unproven', operator_inspection_required: true });
      } finally {
        if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
        if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
        try {
          await attachSafeObservations(testInfo, 'settings-lifecycle-observations', observations);
        } finally {
          await recoveryContext.close();
        }
      }
      if (cleanupError) {
        throw new Error(`SETTINGS-01 cleanup failed; shared staging state requires operator inspection: ${cleanupError.message}`);
      }
    }

    expect(writeAcknowledged, 'write acknowledgement was not observed').toBe(true);
    expect(cleanupRestored, 'cleanup restoration was not proven').toBe(true);
  },
);