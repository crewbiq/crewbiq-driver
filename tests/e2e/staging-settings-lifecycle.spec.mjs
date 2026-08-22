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

test(
  'SETTINGS-01 authenticated settings lifecycle preserves and restores rate effective date',
  scenario(
    'A rate effective date changed through the visible Settings form and saved is restored after a clean-device re-auth from /v1/settings/pwa without Google fallback.',
    [
      'Open independent writer and recovery contexts.',
      'Login and seed the writer context with driver identity.',
      'Capture the exact reversible before-state of the Rate Effective From field.',
      'Change the Rate Effective From field through the Settings controls and save.',
      'Confirm the write acknowledgement (Settings saved toast) appeared.',
      'Clear client state and reinitialize on a clean device.',
      'Authenticated restore pulls the saved value from /v1/settings/pwa.',
      'Verify the restored value is not from the Google fallback.',
      'Restore the exact before-state and verify restoration.',
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
    let beforeValue = '';
    let afterValue = '';
    let restoredValue = '';
    let writeAcknowledged = false;
    let cleanupRestored = false;

    try {
      // Writer context: open, login, and open the Settings page.
      const writerInitialState = await openFreshApplication(page, context, config);
      expect(writerInitialState.cookies).toEqual([]);
      expect(writerInitialState.origins).toEqual([]);
      writerToken = (await loginFleetA(page, config)).body.session_token;
      expect(writerToken).toBeTruthy();
      await page.evaluate(({ authId, email, syncUrl, sessionToken }) => {
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
      }, {
        authId: config.fleetA.authCrewbiqId,
        email: 'e2e-redacted@example.test',
        syncUrl: `${config.orchestratorUrl}/v1/sync`,
        sessionToken: writerToken,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => {
        const app = document.getElementById('app');
        return !!(app && app.classList.contains('show'));
      }, undefined, { timeout: 20_000 });
      await page.evaluate(() => { if (typeof showPage === 'function') showPage('settings'); });
      await page.waitForSelector('#setRateEffectiveDate', { state: 'visible', timeout: 20_000 });

      // Capture exact before-state (blank or a valid ISO date).
      beforeValue = await page.locator('#setRateEffectiveDate').inputValue();

      // Mutate only through the Settings controls and the existing save action.
      const mutatingValue = '2030-01-01';
      await page.locator('#setRateEffectiveDate').fill(mutatingValue);
      await page.evaluate(() => {
        const button = document.querySelector('#page-settings button[onclick="saveSettings()"], #page-settings button[onclick="saveSettings(event)"]');
        if (!button) throw new Error('Save Settings button is missing');
        button.click();
      });
      await page.waitForFunction(
        msg => {
          const toasts = document.querySelectorAll('.toast, #toast');
          return Array.from(toasts).some(t => (t.innerText || '').includes(msg));
        },
        'Settings saved',
        { timeout: 20_000 },
      );
      writeAcknowledged = true;
      afterValue = await page.locator('#setRateEffectiveDate').inputValue();
      expect(afterValue).toBe(mutatingValue);
      observations.push({ step: 'writer-saved', before_value_present: !!beforeValue, after_value: afterValue });

      // Clear and reinitialize client state using the clean-device pattern.
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => localStorage.getItem('fiqD_driver'))).toBeNull();

      // Recovery context: open fresh, login, and get the value via /v1/settings/pwa.
      const recoveryInitialState = await openFreshApplication(recoveryPage, recoveryContext, config);
      expect(recoveryInitialState.cookies).toEqual([]);
      expect(recoveryInitialState.origins).toEqual([]);
      recoveryToken = (await loginFleetA(recoveryPage, config)).body.session_token;
      expect(recoveryToken).toBeTruthy();

      // Assert the authenticated /v1/settings/pwa endpoint reflects the saved value
      // (this is the same endpoint settings-hotfix.js calls, not the Google fallback).
      const settingsResponse = await browserJson(recoveryPage, config.orchestratorUrl, '/v1/settings/pwa', {
        token: recoveryToken,
      });
      expect(settingsResponse.status).toBe(200);
      const settingsPayload = settingsResponse.body?.settings || settingsResponse.body;
      restoredValue = settingsPayload?.preferences?.rateEffectiveDate || settingsPayload?.rateEffectiveDate || '';
      expect(restoredValue).toBe(mutatingValue);
      observations.push({
        step: 'recovery-restored',
        restored_value: restoredValue,
        source: settingsPayload?.source || settingsResponse.body?.source || 'pwa_endpoint',
      });

      // Restore the exact before-state in the writer context and verify.
      await page.evaluate(() => { if (typeof showPage === 'function') showPage('settings'); });
      await page.waitForSelector('#setRateEffectiveDate', { state: 'visible', timeout: 20_000 });
      await page.locator('#setRateEffectiveDate').fill(beforeValue);
      await page.evaluate(() => {
        const button = document.querySelector('#page-settings button[onclick="saveSettings()"], #page-settings button[onclick="saveSettings(event)"]');
        if (!button) throw new Error('Save Settings button is missing');
        button.click();
      });
      await page.waitForFunction(
        msg => {
          const toasts = document.querySelectorAll('.toast, #toast');
          return Array.from(toasts).some(t => (t.innerText || '').includes(msg));
        },
        'Settings saved',
        { timeout: 20_000 },
      );
      const restoredFieldValue = await page.locator('#setRateEffectiveDate').inputValue();
      expect(restoredFieldValue).toBe(beforeValue);
      cleanupRestored = true;
      observations.push({ step: 'cleanup-restored', value: restoredFieldValue });
    } finally {
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'settings-lifecycle-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }

    // Fail explicitly if the write acknowledgement or cleanup cannot be proven.
    expect(writeAcknowledged, 'write acknowledgement was not observed').toBe(true);
    expect(cleanupRestored, 'cleanup restoration was not proven').toBe(true);
  },
);
