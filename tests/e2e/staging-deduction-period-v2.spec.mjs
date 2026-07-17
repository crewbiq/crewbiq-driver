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
const TEST_PREFIX = 'E2E Period Insurance ';

test.use({ screenshot: 'off', trace: 'off', serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(90_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-fleet-a-deduction-periods-v2' });
});

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
  return `${TEST_PREFIX}${run}`;
}

function matchingPolicies(ownerData, truckId, name) {
  const templates = Array.isArray(ownerData?.deductionTemplates)
    ? ownerData.deductionTemplates
    : [];
  return templates
    .filter(item => item && item.truckId === truckId && item.name === name)
    .sort((a, b) => String(a.effectiveFrom || '').localeCompare(String(b.effectiveFrom || '')));
}

function withoutStaleTestPolicies(templates) {
  return (Array.isArray(templates) ? templates : []).filter(item => (
    !String(item?.name || '').startsWith(TEST_PREFIX)
  ));
}

async function writeTemplateSnapshot(page, config, token, templates, phase) {
  const response = await pushOwnerData(
    page,
    config,
    token,
    {
      snapshotEntities: ['deductionTemplates'],
      deductionTemplates: clone(templates),
    },
    'DEDUCTION-PERIOD-01',
    phase,
  );
  expect(response.status, `${phase}: HTTP ${response.status}`).toBe(200);
  expect(response.body?.ok, `${phase}: ${response.body?.error || response.body?.reason || 'server rejected snapshot'}`).toBe(true);
  return response;
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

  // Persistence is issued explicitly by this journey through /v1/sync/pwa.
  // Suppress fire-and-forget UI timers so the evidence has one deterministic write.
  await page.evaluate(() => {
    window.forceFullSync = async () => ({ ok: true, skipped: true, reason: 'e2e-controlled-write' });
  });
}

async function savePolicyThroughUi(page, fields) {
  await page.evaluate(truckId => {
    if (typeof showPage === 'function') showPage('deductions');
    if (typeof renderDeductionsPage === 'function') renderDeductionsPage();
    const select = document.getElementById('dedTruckSelect');
    if (!select) throw new Error('dedTruckSelect is missing');
    select.value = truckId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof renderDeductionsPage === 'function') renderDeductionsPage();
    if (typeof openAddDedTemplate !== 'function') throw new Error('openAddDedTemplate is missing');
    openAddDedTemplate();
  }, fields.truckId);

  await expect(page.locator('#dedModal')).toBeVisible();
  await page.locator('#dedName').fill(fields.name);
  await page.locator('#dedAmount').fill(String(fields.amount));
  await page.locator('#dedCategory').selectOption('insurance');
  await page.locator('#dedPolicyCompany').fill(fields.company);
  await page.locator('#dedPolicyEffectiveFrom').fill(fields.startDate);
  await expect(page.locator('#dedPolicyEffectiveTo')).toBeVisible();
  await page.locator('#dedPolicyEffectiveTo').fill(fields.endDate || '');

  await page.evaluate(() => {
    if (typeof saveDedModal !== 'function') throw new Error('saveDedModal is missing');
    saveDedModal();
    if (typeof cancelQueuedFleetConfigSync === 'function') cancelQueuedFleetConfigSync();
  });
  await expect(page.locator('#dedModal')).not.toBeVisible();

  const templates = await page.evaluate(() => {
    if (typeof loadDedTemplates !== 'function') throw new Error('loadDedTemplates is missing');
    return loadDedTemplates();
  });
  expect(Array.isArray(templates)).toBe(true);
  return templates;
}

test(
  'DEDUCTION-PERIOD-01 new Start Date closes the previous period and preserves historical resolution',
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    const observations = [];
    let writerToken = '';
    let recoveryToken = '';
    let baselineTemplates = [];
    let policyName = '';

    try {
      await openFreshApplication(page, context, config);
      await openFreshApplication(recoveryPage, recoveryContext, config);
      writerToken = tokenFrom(await loginFleetA(page, config));
      recoveryToken = tokenFrom(await loginFleetA(recoveryPage, config));

      const fleetResponse = await restoreFleet(page, config, writerToken);
      expect(fleetResponse.status).toBe(200);
      expect(fleetResponse.body.ok).toBe(true);
      const truckId = config.fleetA.activeTruckIds[0];
      const truck = (fleetResponse.body.trucks || []).find(item => item?.id === truckId);
      expect(truck).toBeTruthy();

      const baselineResponse = await restorePwa(page, config, writerToken);
      expect(baselineResponse.status).toBe(200);
      expect(baselineResponse.body.ok).toBe(true);
      const baselineOwner = clone(baselineResponse.body.ownerData || {});
      baselineTemplates = withoutStaleTestPolicies(baselineOwner.deductionTemplates);
      baselineOwner.deductionTemplates = clone(baselineTemplates);

      // Clean a possible leftover from an interrupted earlier E2E run.
      await writeTemplateSnapshot(page, config, writerToken, baselineTemplates, 'preflight-clean');
      await seedFleetOwnerUi(page, config, writerToken, baselineOwner);
      policyName = uniquePolicyName(config);

      let templates = await savePolicyThroughUi(page, {
        truckId,
        name: policyName,
        amount: 450,
        company: 'E2E Carrier A',
        startDate: '2026-06-01',
      });
      await writeTemplateSnapshot(page, config, writerToken, templates, 'first-period');

      const firstRestore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(firstRestore.status).toBe(200);
      expect(firstRestore.body.ok).toBe(true);
      const firstVersions = matchingPolicies(firstRestore.body.ownerData, truckId, policyName);
      expect(firstVersions).toHaveLength(1);
      expect(Number(firstVersions[0].amount)).toBe(450);
      expect(firstVersions[0].effectiveFrom).toBe('2026-06-01');
      expect(String(firstVersions[0].effectiveTo || '')).toBe('');

      templates = await savePolicyThroughUi(page, {
        truckId,
        name: policyName,
        amount: 550,
        company: 'E2E Carrier B',
        startDate: '2026-07-15',
      });
      await writeTemplateSnapshot(page, config, writerToken, templates, 'second-period');

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

      const resolved = await recoveryPage.evaluate(({ records, id }) => {
        const api = window.CrewBIQDeductionPolicies;
        if (!api || typeof api.effectivePolicies !== 'function') throw new Error('effectivePolicies is missing');
        const before = api.effectivePolicies(records, id, '2026-06-15');
        const after = api.effectivePolicies(records, id, '2026-07-20');
        return {
          beforeAmount: before.length ? Number(before[0].amount) : null,
          afterAmount: after.length ? Number(after[0].amount) : null,
          beforeCount: before.length,
          afterCount: after.length,
        };
      }, { records: finalRestore.body.ownerData.deductionTemplates, id: truckId });

      expect(resolved.beforeCount).toBeGreaterThan(0);
      expect(resolved.afterCount).toBeGreaterThan(0);
      expect(resolved.beforeAmount).toBe(450);
      expect(resolved.afterAmount).toBe(550);
      observations.push({
        journey: 'DEDUCTION-PERIOD-01',
        first_period_persisted: true,
        previous_period_closed_on_prior_day: true,
        replacement_period_open: true,
        historical_resolution_correct: true,
      });
    } finally {
      if (writerToken) {
        try {
          const cleanup = await writeTemplateSnapshot(
            page, config, writerToken, baselineTemplates, 'rollback',
          );
          observations.push({ cleanup: 'baseline-restored', status: cleanup.status });
          if (recoveryToken && policyName) {
            const verify = await restorePwa(recoveryPage, config, recoveryToken);
            expect.soft(matchingPolicies(
              verify.body.ownerData,
              config.fleetA.activeTruckIds[0],
              policyName,
            )).toHaveLength(0);
          }
        } catch (error) {
          observations.push({ cleanup: 'baseline-restored', status: 'failed', error_class: error?.name || 'Error' });
          expect.soft(false, 'deduction baseline cleanup failed').toBe(true);
        }
      }
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      await attachSafeObservations(testInfo, 'deduction-period-observations', observations);
      await recoveryContext.close();
    }
  },
);
