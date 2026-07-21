import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.setItem('fiqD_userRole', 'driver');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Company Model Tester', email: 'company-model@example.test', crewId: 'CREW-COMPANY-MODEL-TEST',
      company: 'Legacy Shadow Carrier', truckName: 'Freightliner Cascadia', unitNumber: 'CM-01', plate: 'TEST01',
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

test('company driver keeps the legacy shadow field and never creates a Company record', async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById('setCompany').value = 'New Dispatch Office';
    saveSettings();
  });
  const result = await page.evaluate(() => ({ driverCompany: driver.company, companies: loadCompanies() }));
  expect(result.driverCompany).toBe('New Dispatch Office');
  expect(result.companies).toHaveLength(0);
});

test('owner_op creates and updates the owned Organization without touching driver.company', async ({ page }) => {
  await page.evaluate(() => { setUserRole('owner_op'); applyRoleUI(); showPage('settings'); });

  await page.evaluate(() => {
    document.getElementById('setCompany').value = 'Basaev LLC';
    saveSettings();
  });
  let result = await page.evaluate(() => ({ driverCompany: driver.company, companies: loadCompanies() }));
  expect(result.companies).toHaveLength(1);
  expect(result.companies[0].name).toBe('Basaev LLC');
  expect(result.driverCompany).toBe('Legacy Shadow Carrier'); // unchanged — rule 3: no auto-sync

  // Editing again must update the same record, not create a second one.
  await page.evaluate(() => {
    document.getElementById('setCompany').value = 'Basaev LLC II';
    saveSettings();
  });
  result = await page.evaluate(() => loadCompanies());
  expect(result).toHaveLength(1);
  expect(result[0].name).toBe('Basaev LLC II');
});

test('currentCarrierCompany prefers the truck Carrier Assignment snapshot, then falls back to legacy driver.company', async ({ page }) => {
  const withAssignment = await page.evaluate(() => {
    saveTrucks([{
      id: 'truck_test_1', unitNumber: 'CM-01', make: 'Freightliner', model: 'Cascadia', plate: 'TEST01',
      carrierAssignment: { company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12, companyRef: '', companyNameSnapshot: 'Prime Inc', mcNumberSnapshot: 'MC-999' },
      company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12,
      vin: '', maintenanceRate: 0.2, purchaseCost: 0, active: true,
    }]);
    return currentCarrierCompany();
  });
  expect(withAssignment).toEqual({ name: 'Prime Inc', mcNumber: 'MC-999', source: 'carrierAssignment' });

  const withoutAssignment = await page.evaluate(() => {
    saveTrucks([]);
    return currentCarrierCompany();
  });
  expect(withoutAssignment).toEqual({ name: 'Legacy Shadow Carrier', mcNumber: '', source: 'legacy' });
});

test('legacy logo migration fills an empty Company.logo but never overwrites an existing one', async ({ page }) => {
  // Company driver: no Organization exists, migration must no-op.
  const driverAttempt = await page.evaluate(() => {
    migrateLegacyLogoIntoOwnedOrganization('data:image/jpeg;base64,driverLogo');
    return loadCompanies();
  });
  expect(driverAttempt).toHaveLength(0);

  // owner_op with an Organization: migration fills the empty logo field.
  const migrated = await page.evaluate(() => {
    setUserRole('owner_op'); applyRoleUI();
    saveCompanies([normalizeCompany({ name: 'Basaev LLC' })]);
    migrateLegacyLogoIntoOwnedOrganization('data:image/jpeg;base64,ownerLogo');
    return loadCompanies();
  });
  expect(migrated[0].logo).toBe('data:image/jpeg;base64,ownerLogo');

  // A second migration attempt must not overwrite an already-set logo.
  const untouched = await page.evaluate(() => {
    migrateLegacyLogoIntoOwnedOrganization('data:image/jpeg;base64,otherLogo');
    return loadCompanies();
  });
  expect(untouched[0].logo).toBe('data:image/jpeg;base64,ownerLogo');
});

test('owner_op/fleet can replace an existing Company.logo with a new upload', async ({ page }) => {
  const result = await page.evaluate(() => {
    setUserRole('owner_op'); applyRoleUI();
    saveCompanies([normalizeCompany({ name: 'Basaev LLC', logo: 'data:image/jpeg;base64,oldLogo' })]);
    // saveCurrentOrganizationLogo is what handleLogoUpload calls after processing a new file —
    // this is the fixed bug: it must overwrite even though Company.logo is already set.
    saveCurrentOrganizationLogo('data:image/jpeg;base64,newLogo');
    return loadCompanies();
  });
  expect(result[0].logo).toBe('data:image/jpeg;base64,newLogo');
});

test('removeLogo clears Company.logo and the legacy fallback for owner_op/fleet', async ({ page }) => {
  const result = await page.evaluate(() => {
    setUserRole('owner_op'); applyRoleUI();
    saveCompanies([normalizeCompany({ name: 'Basaev LLC', logo: 'data:image/jpeg;base64,ownerLogo' })]);
    localStorage.setItem('fiqD_logo', 'data:image/jpeg;base64,ownerLogo');
    removeLogo();
    return { companies: loadCompanies(), legacyLogo: localStorage.getItem('fiqD_logo') };
  });
  expect(result.companies[0].logo).toBe('');
  expect(result.legacyLogo).toBeNull();
});

test('company driver removeLogo only clears the legacy key, never a Company record', async ({ page }) => {
  // Simulate leftover Company data (e.g. from a prior owner_op session) still present
  // while the active role is a plain company driver — removeLogo must not touch it.
  const result = await page.evaluate(() => {
    saveCompanies([normalizeCompany({ name: 'Basaev LLC', logo: 'data:image/jpeg;base64,ownerLogo' })]);
    localStorage.setItem('fiqD_logo', 'data:image/jpeg;base64,ownerLogo');
    removeLogo();
    return { companies: loadCompanies(), legacyLogo: localStorage.getItem('fiqD_logo') };
  });
  expect(result.companies[0].logo).toBe('data:image/jpeg;base64,ownerLogo');
  expect(result.legacyLogo).toBeNull();
});

test('editing a truck without changing carrier terms preserves an existing companyRef', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveTrucks([{
      id: 'truck_ref_1', unitNumber: 'REF-01', make: 'Freightliner', model: 'Cascadia', plate: 'REF01',
      carrierAssignment: { company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12, companyRef: 'company_existing_ref', companyNameSnapshot: 'Prime Inc', mcNumberSnapshot: 'MC-999' },
      company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12,
      vin: '', maintenanceRate: 0.2, purchaseCost: 0, active: true,
    }]);
    openTruckForm('truck_ref_1');
  });
  // Only touch a field unrelated to carrier terms — unit number stays the same, MC/company untouched.
  await page.locator('#tfYear').fill('2022');
  await page.locator('#truckModal').getByRole('button', { name: 'Save', exact: true }).click();

  const assignment = await page.evaluate(() => truckCarrierAssignment(loadTrucks().find(t => t.id === 'truck_ref_1')));
  expect(assignment.companyRef).toBe('company_existing_ref');
  expect(assignment.companyNameSnapshot).toBe('Prime Inc');
});

test('manually changing carrier company or MC on a truck clears its companyRef', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveTrucks([{
      id: 'truck_ref_2', unitNumber: 'REF-02', make: 'Freightliner', model: 'Cascadia', plate: 'REF02',
      carrierAssignment: { company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12, companyRef: 'company_existing_ref', companyNameSnapshot: 'Prime Inc', mcNumberSnapshot: 'MC-999' },
      company: 'Prime Inc', mc: 'MC-999', dispatchPercent: 12,
      vin: '', maintenanceRate: 0.2, purchaseCost: 0, active: true,
    }]);
    openTruckForm('truck_ref_2');
  });
  await page.locator('#tfCompany').fill('New Carrier LLC');
  await page.locator('#truckModal').getByRole('button', { name: 'Save', exact: true }).click();

  const assignment = await page.evaluate(() => truckCarrierAssignment(loadTrucks().find(t => t.id === 'truck_ref_2')));
  expect(assignment.companyRef).toBe('');
  expect(assignment.companyNameSnapshot).toBe('New Carrier LLC');
  expect(assignment.mcNumberSnapshot).toBe('MC-999');
});
