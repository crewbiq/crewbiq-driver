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

function expensesStorageKey(crewbiqId) {
  return `fiqD_data_crew_${identitySlug(crewbiqId)}_expenses`;
}

async function seedDriverIdentity(page, config, token) {
  // Same rules as LOAD-01/PTI-01: localStorage is only reachable after a real
  // navigation, so caller must already have run openFreshApplication() and
  // loginFleetA() on this page. ptiEnabled: false opts out of the PTI gate —
  // EXPENSES-01 tests the expenses module, not needsPTI()/#ptiBlocker.
  await page.evaluate(({ authId, email, syncUrl, sessionToken, expensesKey }) => {
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
    localStorage.setItem(expensesKey, '[]');
  }, {
    authId: config.fleetA.authCrewbiqId,
    email: 'e2e-redacted@example.test',
    syncUrl: `${config.orchestratorUrl}/v1/sync`,
    sessionToken: token,
    expensesKey: expensesStorageKey(config.fleetA.authCrewbiqId),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// Expenses use a wholly separate sync path from loads/PTI: restore-hotfix.js
// wraps window.saveExpenses to debounce-call syncExpensesNow() 900ms after any
// change, posting directly (no window.doSync() involvement, no
// _syncInProgress guard). Calling window.CrewBIQRestoreHotfix.syncExpensesNow()
// directly skips the debounce instead of waiting on a timer in the test.
async function forceExpenseSync(page) {
  return page.evaluate(() => window.CrewBIQRestoreHotfix.syncExpensesNow());
}

test(
  'EXPENSES-01 add expense form entry survives authenticated restore on another device',
  scenario(
    'An expense added through the real Add Expense form is durably synced via the expenses-specific sync path and appears with the same stable ID and values on a clean authenticated restore.',
    [
      'Open independent writer and recovery contexts.',
      'Seed the writer context with a real driver identity, PTI gate opted out.',
      'Fill and submit the real Add Expense form.',
      'Force the expenses-specific sync (syncExpensesNow, not doSync) and confirm it succeeded.',
      'Restore on the recovery context and verify the expense, values and stable ID.',
      'Mark the expense denied as an inert cleanup state (no delete sync path exists server-side) and revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    // deleteExpense() (index.html) calls confirm() before removing a row.
    page.on('dialog', dialog => dialog.accept());
    recoveryPage.on('dialog', dialog => dialog.accept());
    const observations = [];
    let writerToken = '';
    let recoveryToken = '';
    let addedExpenseId = '';
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

      // waitForFunction's signature is (pageFunction, arg, options) — the
      // timeout MUST be the third argument (PWA_APP_REFERENCE.md section 6).
      await page.waitForFunction(() => {
        const app = document.getElementById('app');
        return !!(app && app.classList.contains('show'));
      }, undefined, { timeout: 20_000 });
      observations.push({ step: 'app-ready' });

      const marker = `${config.displayPrefix}EXPENSES-01`.slice(0, 60);
      await page.evaluate(() => { if (typeof showPage === 'function') showPage('expenses'); });

      const expenseDate = new Date().toISOString().slice(0, 10);
      await page.locator('#expDate').fill(expenseDate);
      await page.locator('#expType').selectOption('fuel');
      await page.locator('#expAmount').fill('184.35');
      await page.locator('#expOwner').selectOption('driver');
      await page.locator('#expStatus').selectOption('pending');
      await page.locator('#expNote').fill(marker);
      await page.evaluate(() => {
        const button = document.querySelector('#page-expenses button[onclick="addExpense()"]');
        if (!button) throw new Error('Add Expense button is missing');
        button.click();
      });
      observations.push({ step: 'clicked-add-expense', marker });

      const localAfterAdd = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), expensesStorageKey(config.fleetA.authCrewbiqId));
      const localMatch = localAfterAdd.find(item => item.note === marker);
      expect(localMatch && localMatch.id).toBeTruthy();
      addedExpenseId = localMatch.id;
      observations.push({ step: 'verified-local-add', local_id: addedExpenseId });

      const syncResult = await forceExpenseSync(page);
      expect(syncResult && syncResult.ok).toBe(true);
      observations.push({ step: 'forced-expense-sync', sync_ok: true, count: syncResult && syncResult.count });

      const restore = await restorePwa(recoveryPage, config, recoveryToken);
      expect(restore.status).toBe(200);
      expect(restore.body.ok).toBe(true);
      const restoredExpenses = Array.isArray(restore.body.ownerData && restore.body.ownerData.expenses)
        ? restore.body.ownerData.expenses
        : [];
      const matches = restoredExpenses.filter(item => item.note === marker);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe(addedExpenseId);
      expect(Number(matches[0].amount)).toBe(184.35);
      expect(matches[0].type).toBe('fuel');
      observations.push({
        step: 'verified-recovery-restore',
        stable_id_preserved: matches[0].id === addedExpenseId,
        amount_match: Number(matches[0].amount) === 184.35,
        type_match: matches[0].type === 'fuel',
      });
    } finally {
      if (addedExpenseId) {
        try {
          // No delete-sync path exists server-side (driver_expenses rows are
          // upsert-only, see crewbiq-orchestrator/app/services/sync_repair.py
          // _write_expenses) — mark inert via status the same way LOAD-01
          // marks loads 'cancel' instead of attempting a true delete+sync.
          await page.evaluate(id => {
            const updated = loadExpenses().map(item => (item.id === id ? { ...item, status: 'denied' } : item));
            saveExpenses(updated);
          }, addedExpenseId);
          const inertSync = await forceExpenseSync(page);
          markedInert = !!(inertSync && inertSync.ok);
          observations.push({ cleanup: 'expense-marked-denied', status: markedInert ? 'complete' : 'best_effort' });
        } catch (error) {
          observations.push({ cleanup: 'expense-marked-denied', status: 'failed', error_class: error && error.name ? error.name : 'Error' });
        }
      }
      if (writerToken) expect.soft((await revokeSession(page, config, writerToken)).status).toBe(200);
      if (recoveryToken) expect.soft((await revokeSession(recoveryPage, config, recoveryToken)).status).toBe(200);
      try {
        await attachSafeObservations(testInfo, 'expenses-lifecycle-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
