import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  clone,
  loginFleetA,
  openFreshApplication,
  pushOwnerData,
  restoreFleet,
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
  testInfo.setTimeout(90_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-fleet-a-deduction-periods' });
});

function scenario(expectedResult, steps) {
  return {
    annotation: [
      { type: 'expected_result', description: expectedResult },
      ...steps.map(description => ({ type: 'step', description })),
    ],
  };
}

function tokenFrom(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.session_token).toBeTruthy();
  return response.body.session_token;
}

function uniquePolicyName(config) {
  const run = String(config.runId || Date.now())
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(-28);
  return `E2E Period Insurance ${run}`;
}

async function seedFleetOwnerUi(page, config, token, ownerData) {
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
    if (typeof applyOwnerSyncData !== 'function') {
      throw new Error('applyOwnerSyncData is missing');
    }
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
}

async function selectDeductionsTruck(page, truckId) {
  await page.evaluate(id => {
    if (typeof showPage === 'function') showPage('deductions');
    if (typeof renderDeductionsPage === 'function') renderDeductionsPage();
    const select = document.getElementById('dedTruckSelect');
    if (!select) throw new Error('dedTruckSelect is missing');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof renderDeductionsPage === 'function') renderDeductionsPage();
  }, truckId);
}

async function savePolicyThroughUi(page, {
  truckId,
  name,
  amount,
  company,
  startDate,
  endDate = '',
}) {
  await selectDeductionsTruck(page, truckId);
  await page.evaluate(() => {
    if (typeof openAddDedTemplate !== 'function') throw new Error('openAddDedTemplate is missing');
    openAddDedTemplate();
  });

  await expect(page.locator('#dedModal')).toBeVisible();
  await page.locator('#dedName').fill(name);
  await page.locator('#dedAmount').fill(String(amount));
  await page.locator('#dedCategory').selectOption('insurance');
  await page.locator('#dedPolicyCompany').fill(company);
  await page.locator('#dedPolicyEffectiveFrom').fill(startDate);
  await expect(page.locator('#dedPolicyEffectiveTo')).toBeVisible();
  if (endDate) await page.locator('#dedPolicyEffectiveTo').fill(endDate);
  else await page.locator('#dedPolicyEffectiveTo').fill('');

  await page.evaluate(() => {
    if (typeof saveDedModal !== 'function') throw new Error('saveDedModal is missing');
    saveDedModal();
  });
  await expect(page.locator('#dedModal')).not.toBeVisible();

  // saveDedTemplates schedules a snapshot sync. Give that authenticated write a
  // chance to finish, then issue one explicit fleet sync so the assertion below
  // never relies on a fire-and-forget timer.
  await page.waitForTimeout(1200);
  const sync = await page.evaluate(async () => {
    if (typeof cancelQueuedFleetConfigSync === 'function') cancelQueuedFleetConfigSync();
    if (typeof forceFleetConfigSync !== 'function') {
      return { ok: false, reason: 'forceFleetConfigSync_missing' };
    }
    return forceFleetConfigSync();
  });
  expect(sync && sync.ok).toBe(true);
  return sync;
}

function matchingPolicies(ownerData, truckId, name) {
  const templates = Array.isArray(ownerData && ownerData.deductionTemplates)
    ? ownerData.deductionTemplates
    : [];
  return templates
    .filter(item => item && item.truckId === truckId && item.name === name)
    .sort((a, b) => String(a.effectiveFrom || '').localeCompare(String(b.effectiveFrom || '')));
}

test(
  'DEDUCTION-PERIOD-01 new Start Date closes the previous period and preserves historical resolution',
  scenario(
    'Two deduction versions created through the real Fleet UI persist through authenticated staging restore; the second Start Date closes the first period on the prior day, leaves the new period open, and date-based resolution returns the historically correct amount.',
    [
      'Open independent writer and recovery browser contexts.',
      'Login to isolated E2E Fleet A and capture the complete owner baseline.',
      'Seed the real Fleet UI from that baseline without touching production data.',
      'Create an open $450 insurance period starting 2026-06-01.',
      'Create a $550 replacement period starting 2026-07-15.',
      'Restore on another context and verify 2026-06-01..2026-07-14 plus 2026-07-15..open.',
      'Resolve both historical dates and verify $450 before the boundary and $550 after it.',
      'Restore the exact deduction-template baseline and verify cleanup.',
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
    let baselineTemplates = [];
    let policyName = '';
    let mutationStarted = false;

    try {
      await openFreshApplication(page, context, config);
      await openFreshApplication(recoveryPage, recoveryContext, config);

      writerToken = tokenFrom(await loginFleetA(page, config));
      recoveryToken = tokenFrom(await loginFleetA(recoveryPage, config));

      const fleetResponse = await restoreFleet(page, config, writerToken);
      expect(fleetResponse.status).toBe(200);
      expect(fleetResponse.body.ok).toBe(true);
      const trucks = Array.isArray(fleetResponse.body.trucks) ? fleetResponse.body.trucks : [];
      const truckId = config.fleetA.activeTruckIds[0];
      const truck = trucks.find(item => item && item.id === truckId);
      expect(truck).toBeTruthy();

      const baselineResponse = await restorePwa(page, config, writerToken);
      expect(baselineResponse.status).toBe(200);
      expect(baselineResponse.body.ok).toBe(true);
      const baselineOwner = clone(baselineResponse.body.ownerData || {});
      baselineTemplates = clone(
        Array.isArray(baselineOwner.deductionTemplates) ? baselineOwner.deductionTemplates : [],
      );
      policyName = uniquePolicyName(config);
      observations.push({
        step: 'captured-baseline',
        truck_fixture_found: !!truck,
        baseline_template_count: baselineTemplates.length,
      });

      await seedFleetOwnerUi(page, config, writerToken, baselineOwner);
      await savePolicyThroughUi(page, {
        truckId,
        name: policyName,
        amount: 450,
        company: 'E2E Carrier A',
        startDate: '2026-06-01',
      });
      mutationStarted = true;

      const firstRestore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(firstRestore.status).toBe(200);
      const firstVersions = matchingPolicies(firstRestore.body.ownerData, truckId, policyName);
      expect(firstVersions).toHaveLength(1);
      expect(Number(firstVersions[0].amount)).toBe(450);
      expect(firstVersions[0].effectiveFrom).toBe('2026-06-01');
      expect(String(firstVersions[0].effectiveTo || '')).toBe('');
      observations.push({ step: 'verified-first-open-period', version_count: 1 });

      await savePolicyThroughUi(page, {
        truckId,
        name: policyName,
        amount: 550,
        company: 'E2E Carrier B',
        startDate: '2026-07-15',
      });

      const finalRestore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(finalRestore.status).toBe(200);
      expect(finalRestore.body.ok).toBe(true);
      const versions = matchingPolicies(finalRestore.body.ownerData, truckId, policyName);
      expect(versions).toHaveLength(2);
      expect(versions[0].effectiveFrom).toBe('2026-06-01');
      expect(versions[0].effectiveTo).toBe('2026-07-14');
      expect(Number(versions[0].amount)).toBe(450);
      expect(versions[1].effectiveFrom).toBe('2026-07-15');
      expect(String(versions[1].effectiveTo || '')).toBe('');
      expect(Number(versions[1].amount)).toBe(550);
      expect(versions[1].policyId).toBe(versions[0].policyId);

      const resolved = await recoveryPage.evaluate(({ templates, id }) => {
        if (!window.CrewBIQDeductionPolicies ||
            typeof window.CrewBIQDeductionPolicies.effectivePolicies !== 'function') {
          throw new Error('effectivePolicies is missing');
        }
        const before = window.CrewBIQDeductionPolicies.effectivePolicies(templates, id, '2026-06-15');
        const after = window.CrewBIQDeductionPolicies.effectivePolicies(templates, id, '2026-07-20');
        return {
          beforeAmount: before.length ? Number(before[0].amount) : null,
          afterAmount: after.length ? Number(after[0].amount) : null,
          beforeCount: before.length,
          afterCount: after.length,
        };
      }, { templates: finalRestore.body.ownerData.deductionTemplates, id: truckId });
      expect(resolved.beforeCount).toBeGreaterThan(0);
      expect(resolved.afterCount).toBeGreaterThan(0);
      expect(resolved.beforeAmount).toBe(450);
      expect(resolved.afterAmount).toBe(550);
      observations.push({
        step: 'verified-boundary-and-history',
        old_period_closed_on_prior_day: true,
        new_period_open: true,
        before_amount: resolved.beforeAmount,
        after_amount: resolved.afterAmount,
      });
    } finally {
      if (mutationStarted && writerToken) {
        try {
          const cleanup = await pushOwnerData(
            page,
            config,
            writerToken,
            {
              snapshotEntities: ['deductionTemplates'],
              deductionTemplates: baselineTemplates,
            },
            'DEDUCTION-PERIOD-01',
            'rollback',
          );
          expect.soft(cleanup.status).toBe(200);
          observations.push({ cleanup: 'deduction-template-baseline-restored', status: cleanup.status });

          if (recoveryToken && policyName) {
            const verify = await restorePwa(recoveryPage, config, recoveryToken);
            const leftovers = matchingPolicies(verify.body.ownerData, config.fleetA.activeTruckIds[0], policyName);
            expect.soft(leftovers).toHaveLength(0);
            observations.push({ cleanup: 'test-policy-absent-after-restore', complete: leftovers.length === 0 });
          }
        } catch (error) {
          observations.push({
            cleanup: 'deduction-template-baseline-restored',
            status: 'failed',
            error_class: error && error.name ? error.name : 'Error',
          });
          expect.soft(false, 'deduction baseline cleanup failed').toBe(true);
        }
      }

      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'deduction-period-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
