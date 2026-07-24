import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.setItem('fiqD_userRole', 'driver');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Settings Tester', email: 'settings@example.test', crewId: 'CREW-SETTINGS-TEST',
      company: 'Road Test Carrier', truckName: 'Freightliner Cascadia', unitNumber: 'SET-01', plate: 'TEST01',
      syncUrl: '', payType: 'cpm', cpmRate: 0,
    }));
  });
  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    const blocker = document.getElementById('ptiBlocker');
    if (blocker) blocker.classList.remove('show');
    showPage('settings');
  });
});

test('driver sees a focused catalog and self-managed work entities', async ({ page }) => {
  for (const key of ['account', 'work', 'operations', 'app-data']) {
    await expect(page.locator(`[data-settings-group="${key}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-settings-group="organization"]')).toHaveCount(0);
  await expect(page.locator('[data-settings-group="fleet"]')).toHaveCount(0);

  await page.locator('[data-settings-group="work"]').click();
  await expect(page.locator('#settingsPanel-work')).toHaveClass(/active/);
  await expect(page.locator('#settingsPanel-work #setCompany')).toBeVisible();
  await expect(page.locator('#settingsPanel-work #setTruckName')).toBeVisible();
  await expect(page.locator('#settingsPanel-work #setUnit')).toBeVisible();

  await page.getByRole('button', { name: 'Back to settings' }).click();
  await page.locator('[data-settings-group="app-data"]').click();
  await expect(page.locator('#setTheme')).toBeVisible();
  await expect(page.locator('#accentSwatches')).toBeVisible();
});

test('fleet separates organization, trucks and driver work without duplicate fields', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet');
    applyRoleUI();
    showPage('settings');
  });
  await expect(page.locator('[data-settings-group="organization"]')).toBeVisible();
  await expect(page.locator('[data-settings-group="fleet"]')).toContainText('Fleet & Trucks');

  await page.locator('[data-settings-group="organization"]').click();
  await expect(page.locator('#settingsPanel-organization #setCompany')).toBeVisible();
  await expect(page.locator('#settingsPanel-organization')).toContainText('My Business (Organization)');
  await expect(page.locator('#settingsPanel-organization')).toContainText('Do not enter the current carrier here');
  await expect(page.locator('#settingsPanel-organization #setCompanyLegalName')).toBeVisible();
  await expect(page.locator('#settingsPanel-organization #setCompanyMC')).toBeVisible();
  await expect(page.locator('#settingsPanel-organization #setCompanyDOT')).toBeVisible();
  await expect(page.locator('#settingsPanel-organization #setTruckName')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to settings' }).click();
  await page.locator('[data-settings-group="fleet"]').click();
  await expect(page.locator('#settingsPanel-fleet #setTruckName')).toBeVisible();
  await expect(page.locator('#settingsPanel-fleet #setUnit')).toBeVisible();

  await page.getByRole('button', { name: '+ Add Truck' }).click();
  await expect(page.locator('#truckModal')).toContainText('Physical Truck');
  await expect(page.locator('#truckModal')).toContainText('Current Carrier Assignment');
  await expect(page.locator('#tfVin')).toBeVisible();
  await expect(page.locator('#tfCompany')).toBeVisible();
  await expect(page.locator('#tfDispatch')).toBeVisible();
  await expect(page.locator('#truckModal')).toContainText('Carrier Fee % (Deduction)');
  await expect(page.locator('#truckModal')).toContainText('included in Team Overview Deductions');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.locator('#setCompany')).toHaveCount(1);
  await expect(page.locator('#setTruckName')).toHaveCount(1);
  await expect(page.locator('#setUnit')).toHaveCount(1);
});

test('fleet can search the read-only Company directory and save a carrier snapshot locally', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet');
    saveCompanies([normalizeCompany({ id: 'company-local-1', name: 'Local Business LLC', mcNumber: 'MC-100' })]);
    saveOrchestratorCanonicalRead({
      status: 'ready', workspaceId: 'workspace-fleet', companies: [{
        id: 'company-verified-1', display_name: 'Verified Carrier LLC', legal_name: 'Verified Carrier LLC',
        verification_status: 'verified', authorities: [{ type: 'MC', value: 'MC-777', status: 'verified' }],
      }],
      companyCandidates: [{ id: 'company-candidate-1', entered_name: 'Candidate Carrier', authority_type_hint: 'MC', authority_value_hint: 'MC-888' }],
      trucks: [], truckCandidates: [],
    });
    applyRoleUI();
    showPage('settings');
    openSettingsSection('fleet');
    openTruckForm();
  });

  await page.fill('#tfUnit', 'DIR-01');
  await page.click('#carrierDirectoryBtn');
  await page.fill('#carrierDirectorySearch', 'Verified');
  await expect(page.locator('#carrierDirectoryResults')).toContainText('Verified Carrier LLC');
  await page.getByRole('button', { name: /Verified Carrier LLC/ }).click();
  await expect(page.locator('#tfCompany')).toHaveValue('Verified Carrier LLC');
  await expect(page.locator('#tfMC')).toHaveValue('MC-777');
  await expect(page.locator('#tfCompanyRef')).toHaveValue('');
  await expect(page.locator('#tfCanonicalCompanyRef')).toHaveValue('company-verified-1');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const assignment = await page.evaluate(() => truckCarrierAssignment(loadTrucks().find(truck => truck.unitNumber === 'DIR-01')));
  expect(assignment).toMatchObject({
    companyRef: '',
    canonicalCompanyRef: 'company-verified-1',
    companyNameSnapshot: 'Verified Carrier LLC',
    mcNumberSnapshot: 'MC-777',
  });
  expect(await page.evaluate(() => loadCompanies())).toEqual([
    expect.objectContaining({ id: 'company-local-1', name: 'Local Business LLC' }),
  ]);
});
