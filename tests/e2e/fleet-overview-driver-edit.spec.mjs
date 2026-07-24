import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('fiqD_launchCleanResetVersion', '2026-05-29-clean-launch-v1');
    localStorage.setItem('fiqD_userRole', 'fleet');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Fleet Fix Tester', email: 'fleet-fix@example.test', crewId: 'CREW-FLEET-FIX',
      company: 'Test Carrier', unitNumber: '10', syncUrl: '', payType: 'cpm', cpmRate: 0,
    }));
  });
  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    const blocker = document.getElementById('ptiBlocker');
    if (blocker) blocker.classList.remove('show');
    window.syncFleetConfigMutation = async () => true;
  });
});

test('Fleet Overview counts restored loads by snake_case, unit and raw payload references', async ({ page }) => {
  const finance = await page.evaluate(() => {
    saveTrucks([
      { id: 'truck_10', unitNumber: ' 10 ', make: 'Volvo', active: true },
      { id: 'truck_20', unitNumber: '20', make: 'Mack', active: true },
    ]);
    saveDriverProfiles([{ id: 'driver_10', name: 'Gross Driver', pay_type: 'gross_percent', gross_percent: 25, truck_id: 'truck_10', active: true }]);
    loads = [
      { id: 'load_1', truck_id: 'TRUCK_10', pickup: today(), gross: 1000, loadedMiles: 400, totalMiles: 500 },
      { id: 'load_2', unit_number: '10', pickup: today(), gross: 500, loadedMiles: 200, totalMiles: 250 },
      { id: 'load_3', raw_payload: { unitNumber: ' 10 ' }, pickup: today(), gross: 300, loadedMiles: 100, totalMiles: 120 },
      { id: 'load_unknown', pickup: today(), gross: 9000, loadedMiles: 1, totalMiles: 1 },
    ];
    const truck10 = findTruckByIdOrUnit('10');
    const truck20 = findTruckByIdOrUnit('20');
    return {
      ten: ownerFinanceForTruck(truck10, 'week'),
      twenty: ownerFinanceForTruck(truck20, 'week'),
    };
  });

  expect(finance.ten.loads).toHaveLength(3);
  expect(finance.ten.gross).toBe(1800);
  expect(finance.ten.miles).toBe(870);
  expect(finance.ten.driverPay).toBe(450);
  expect(finance.twenty.loads).toHaveLength(0);
  expect(finance.twenty.gross).toBe(0);

  await page.evaluate(() => renderFleetPage());
  await expect(page.locator('#fleetTruckCards .stat-card .label', { hasText: 'Deductions' })).toHaveCount(2);
  await expect(page.locator('#fleetTruckCards .stat-card .label', { hasText: /^Dispatch/ })).toHaveCount(0);
});

test('Fleet Overview uses effective-dated carrier terms for historical loads and honors load snapshots', async ({ page }) => {
  const result = await page.evaluate(() => {
    const truck = {
      id: 'truck_history', unitNumber: '77', active: true,
      carrierAssignment: {
        company: 'Current Carrier', dispatchPercent: 12,
        effectiveFrom: '2026-07-01', effectiveTo: '',
      },
      carrierAssignmentHistory: [{
        company: 'Previous Carrier', dispatchPercent: 8,
        effectiveFrom: '2026-01-01', effectiveTo: '2026-07-01',
      }],
    };
    saveTrucks([truck]);
    loads = [
      { id: 'load_old', truckId: truck.id, pickup: '2026-06-15', gross: 1000 },
      { id: 'load_current', truckId: truck.id, pickup: '2026-07-15', gross: 1000 },
      { id: 'load_snapshot', truckId: truck.id, pickup: '2026-06-20', gross: 1000, dispatchPercent: 5 },
    ];
    return {
      oldRate: carrierAssignmentForLoad(truck, loads[0]).dispatchPercent,
      currentRate: carrierAssignmentForLoad(truck, loads[1]).dispatchPercent,
      boundaryRate: carrierAssignmentForDate(truck, '2026-07-01').dispatchPercent,
      finance: ownerFinanceForTruck(truck, 'year'),
    };
  });

  expect(result.oldRate).toBe(8);
  expect(result.currentRate).toBe(12);
  expect(result.boundaryRate).toBe(12);
  expect(result.finance.dispatchFee).toBe(250);

  await page.evaluate(() => {
    document.getElementById('fleetPeriod').value = 'all';
    renderFleetPage();
  });
  const breakdown = page.locator('#fleetTruckCards .fleet-deduction-breakdown');
  await expect(breakdown).toHaveCount(1);
  await breakdown.evaluate((node) => { node.open = true; });
  await expect(breakdown).toContainText('Carrier fees');
  await expect(breakdown).toContainText('$250.00');
  await expect(breakdown).toContainText('Confirmed weekly deductions');
  await expect(breakdown).toContainText('Automatic recurring deductions');
  await expect(breakdown).toContainText('Total deductions');

  const fleetBreakdown = page.locator('#fleetTotalCard .fleet-deduction-breakdown');
  await expect(fleetBreakdown).toHaveCount(1);
  await fleetBreakdown.evaluate((node) => { node.open = true; });
  await expect(fleetBreakdown).toContainText('Show fleet deductions breakdown');
  await expect(fleetBreakdown).toContainText('Carrier fees');
  await expect(fleetBreakdown).toContainText('$250.00');
  await expect(fleetBreakdown).toContainText('Total deductions');
});

test('Fleet Overview charges recurring deductions from the Carrier assigned on each settlement date', async ({ page }) => {
  const result = await page.evaluate(() => {
    const truck = {
      id: 'truck_carrier_terms',
      unitNumber: '88',
      active: true,
      carrierAssignment: {
        companyRef: 'company_beta',
        company: 'Beta Carrier',
        companyNameSnapshot: 'Beta Carrier',
        dispatchPercent: 0,
        effectiveFrom: '2026-07-10',
        effectiveTo: '',
      },
      carrierAssignmentHistory: [{
        companyRef: 'company_alpha',
        company: 'Alpha Carrier',
        companyNameSnapshot: 'Alpha Carrier',
        dispatchPercent: 0,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-07-10',
      }],
    };
    saveTrucks([truck]);
    saveDedTemplates([
      { id: 'alpha_insurance', carrierCompanyRef: 'company_alpha', name: 'Alpha insurance', amount: 80, category: 'insurance' },
      { id: 'beta_eld', carrierCompanyRef: 'company_beta', name: 'Beta ELD', amount: 120, category: 'equipment' },
      { id: 'candidate_fee', carrierCompanyRef: '', name: 'Unverified candidate fee', amount: 999, category: 'admin' },
    ]);
    loads = [
      // This trip settles before the July 10 carrier change. A July 9 trip
      // settles after the boundary and therefore correctly uses Beta instead.
      { id: 'load_alpha', truckId: truck.id, pickup: '2026-07-02', gross: 1000, totalMiles: 500 },
      { id: 'load_beta', truckId: truck.id, pickup: '2026-07-16', gross: 1000, totalMiles: 500 },
    ];
    const finance = ownerFinanceForTruck(truck, 'all');
    document.getElementById('fleetPeriod').value = 'all';
    renderFleetPage();
    return {
      automatic: finance.automaticDeductionTotal,
      total: finance.deductionTotal,
      settlementAmounts: finance.deductionSettlements.map((item) => item.total),
      carrierRefs: finance.deductionSettlements.map((item) => item.items[0] && item.items[0].carrierCompanyRef),
    };
  });

  expect(result.automatic).toBe(200);
  expect(result.total).toBe(200);
  expect(result.settlementAmounts).toEqual([80, 120]);
  expect(result.carrierRefs).toEqual(['company_alpha', 'company_beta']);

  const card = page.locator('#fleetTruckCards .card');
  await expect(card.locator('.stat-card .label', { hasText: 'Deductions' })).toHaveCount(1);
  await expect(card.locator('.stat-card', { hasText: 'Deductions' })).toContainText('$200.00');
  const breakdown = card.locator('.fleet-deduction-breakdown');
  await breakdown.evaluate((node) => { node.open = true; });
  await expect(breakdown).toContainText('Automatic recurring deductions');
  await expect(breakdown).toContainText('$200.00');
  await expect(breakdown).toContainText('Alpha insurance');
  await expect(breakdown).toContainText('Alpha Carrier');
  await expect(breakdown).toContainText('Beta ELD');
  await expect(breakdown).toContainText('Beta Carrier');
  await expect(breakdown).not.toContainText('$999.00');

  const fleetBreakdown = page.locator('#fleetTotalCard .fleet-deduction-breakdown');
  await fleetBreakdown.evaluate((node) => { node.open = true; });
  await expect(fleetBreakdown).toContainText('Alpha insurance');
  await expect(fleetBreakdown).toContainText('Beta ELD');
});

test('Pay Type survives edit, modal reopen and a real reload while optional linkage is retained', async ({ page }) => {
  await page.evaluate(() => {
    saveDriverProfiles([{
      id: 'driver_edit', name: 'Edit Driver', pay_type: 'cpm', cpm_rate: 0.62,
      cpm_base: 'total', active: true, personId: 'person_keep_me', platformStatus: 'linked',
    }]);
    openDriverForm('driver_edit');
  });

  await page.locator('#dfPayType').selectOption('gross_percent');
  await page.locator('#dfRate').fill('27.5');
  await expect(page.locator('#dfCpmBaseRow')).toBeHidden();
  await page.locator('#driverModal button', { hasText: 'Save' }).click();
  await expect(page.locator('#driverModalWrap')).toHaveCount(0);

  let saved = await page.evaluate(() => loadDriverProfiles()[0]);
  expect(saved.payType).toBe('gross_percent');
  expect(saved.rate).toBe(27.5);
  expect(saved.personId).toBe('person_keep_me');
  expect(saved.platformStatus).toBe('linked');

  await page.evaluate(() => openDriverForm('driver_edit'));
  await expect(page.locator('#dfPayType')).toHaveValue('gross_percent');
  await expect(page.locator('#dfCpmBaseRow')).toBeHidden();
  await page.evaluate(() => closeDriverModal());

  await page.reload();
  saved = await page.evaluate(() => loadDriverProfiles()[0]);
  expect(saved.payType).toBe('gross_percent');
  expect(saved.rate).toBe(27.5);
  expect(saved.personId).toBe('person_keep_me');
});

test('Account shows CrewBIQ ID once', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet');
    applyRoleUI();
    showPage('settings');
  });
  await page.locator('[data-settings-group="account"]').click();
  await expect(page.locator('#settingsPanel-account #setCrewId')).toBeVisible();
  await expect(page.locator('#settingsPanel-account #settingsCrewId')).toHaveCount(0);
  expect(await page.locator('#settingsPanel-account').getByText('CrewBIQ ID', { exact: true }).count()).toBe(1);
});

test('Team driver links two existing roster records in both directions and survives reload', async ({ page }) => {
  await page.evaluate(() => {
    saveDriverProfiles([
      { id: 'driver_alpha', name: 'Alex Alpha', email: 'alex@example.test', phone: '555-1000', active: true },
      { id: 'driver_bravo', name: 'Blake Bravo', email: 'blake@example.test', phone: '555-2000', active: true },
      { id: 'driver_charlie', name: 'Casey Charlie', email: 'casey@example.test', phone: '555-3000', active: true },
    ]);
    openDriverForm('driver_alpha');
  });

  await expect(page.locator('#dfTeamFields')).toBeHidden();
  await page.locator('#dfTeam').check();
  await expect(page.locator('#dfTeamFields')).toBeVisible();
  await page.locator('#dfTeamMateSearch').fill('555-2000');
  await expect(page.locator('#dfTeamMateSearchStatus')).toHaveText('1 saved driver found.');
  expect(await page.locator('#dfTeamMateId').evaluate((select) => Array.from(select.options)
    .filter((option) => option.value && !option.hidden)
    .map((option) => option.value))).toEqual(['driver_bravo']);
  await page.locator('#dfTeamMateId').selectOption('driver_bravo');
  await expect(page.locator('#dfTeamMateName')).toHaveValue('Blake Bravo');
  await expect(page.locator('#dfTeamMateEmail')).toHaveValue('blake@example.test');
  await expect(page.locator('#dfTeamMateName')).toHaveAttribute('readonly', '');
  await page.locator('#driverModal button', { hasText: 'Save' }).click();

  let profiles = await page.evaluate(() => loadDriverProfiles());
  const alpha = profiles.find((profile) => profile.id === 'driver_alpha');
  const bravo = profiles.find((profile) => profile.id === 'driver_bravo');
  expect(alpha.teamDriver).toBe(true);
  expect(alpha.teamMateDriverId).toBe('driver_bravo');
  expect(bravo.teamDriver).toBe(true);
  expect(bravo.teamMateDriverId).toBe('driver_alpha');
  expect(bravo.teamMateNameSnapshot).toBe('Alex Alpha');
  expect(alpha.teamId).toBeUndefined();

  await page.reload();
  profiles = await page.evaluate(() => loadDriverProfiles());
  expect(profiles.find((profile) => profile.id === 'driver_alpha').teamMateDriverId).toBe('driver_bravo');
  await page.evaluate(() => openDriverForm('driver_alpha'));
  await expect(page.locator('#dfTeam')).toBeChecked();
  await expect(page.locator('#dfTeamMateId')).toHaveValue('driver_bravo');
});

test('Team driver can keep private candidate details and unlinking clears an existing reciprocal link', async ({ page }) => {
  await page.evaluate(() => {
    saveDriverProfiles([
      { id: 'driver_one', name: 'Driver One', active: true },
      { id: 'driver_two', name: 'Driver Two', active: true },
    ]);
    openDriverForm('driver_one');
  });
  await page.locator('#dfTeam').check();
  await page.locator('#dfTeamMateSearch').fill('not-in-workspace@example.test');
  await expect(page.locator('#dfTeamMateSearchStatus')).toHaveText('No saved driver matches. Enter a private candidate below.');
  await expect(page.locator('#dfTeamMateName')).not.toHaveAttribute('readonly', '');
  await page.locator('#dfTeamMateName').fill('Future Driver');
  await page.locator('#dfTeamMateEmail').fill('future@example.test');
  await page.locator('#dfTeamMatePhone').fill('555-3000');
  await page.locator('#driverModal button', { hasText: 'Save' }).click();

  let one = await page.evaluate(() => loadDriverProfiles().find((profile) => profile.id === 'driver_one'));
  expect(one.teamMateDriverId).toBe('');
  expect(one.teamMateNameSnapshot).toBe('Future Driver');
  expect(one.teamMateEmailSnapshot).toBe('future@example.test');

  await page.evaluate(() => openDriverForm('driver_one'));
  await page.locator('#dfTeamMateId').selectOption('driver_two');
  await page.locator('#driverModal button', { hasText: 'Save' }).click();
  await page.evaluate(() => openDriverForm('driver_one'));
  await page.locator('#dfTeam').uncheck();
  await expect(page.locator('#dfTeamFields')).toBeHidden();
  await page.locator('#driverModal button', { hasText: 'Save' }).click();

  const profiles = await page.evaluate(() => loadDriverProfiles());
  one = profiles.find((profile) => profile.id === 'driver_one');
  const two = profiles.find((profile) => profile.id === 'driver_two');
  expect(one.teamDriver).toBe(false);
  expect(one.teamMateDriverId).toBe('');
  expect(two.teamDriver).toBe(false);
  expect(two.teamMateDriverId).toBe('');
});

test('optional professional driver details survive save, modal reopen and reload without becoming account identity', async ({ page }) => {
  await page.evaluate(() => {
    saveDriverProfiles([{ id: 'driver_professional', name: 'Professional Driver', active: true }]);
    openDriverForm('driver_professional');
  });
  await page.locator('#dfProfessionalDetails').evaluate((element) => { element.open = true; });
  await page.locator('#dfEmail').fill('professional@example.test');
  await page.locator('#dfPhone').fill('555-4444');
  await page.locator('#dfCdlNumber').fill('D1234567');
  await page.locator('#dfCdlState').fill('il');
  await page.locator('#dfCdlExpiresOn').fill('2028-06-30');
  await page.locator('#dfHomeTerminal').fill('Chicago, IL');
  await page.locator('#dfProfileNotes').fill('Hazmat endorsement verified locally.');
  await page.locator('#driverModal button', { hasText: 'Save' }).click();

  let profile = await page.evaluate(() => loadDriverProfiles().find((item) => item.id === 'driver_professional'));
  expect(profile).toMatchObject({
    email: 'professional@example.test', phone: '555-4444', cdlNumber: 'D1234567', cdlState: 'IL',
    cdlExpiresOn: '2028-06-30', homeTerminal: 'Chicago, IL', profileNotes: 'Hazmat endorsement verified locally.',
  });
  expect(profile.cdl_state).toBe('IL');
  expect(profile.accountId).toBeUndefined();

  await page.reload();
  await page.evaluate(() => openDriverForm('driver_professional'));
  await expect(page.locator('#dfEmail')).toHaveValue('professional@example.test');
  await expect(page.locator('#dfCdlState')).toHaveValue('IL');
  await expect(page.locator('#dfHomeTerminal')).toHaveValue('Chicago, IL');
});
