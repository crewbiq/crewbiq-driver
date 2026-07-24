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

test('fleet saves and reloads complete owned-business details without changing the carrier shadow', async ({ page }) => {
  await page.evaluate(() => { setUserRole('fleet'); applyRoleUI(); showPage('settings'); });
  await page.locator('[data-settings-group="organization"]').click();

  const values = {
    setCompany: 'North Star Logistics', setCompanyBusinessType: 'llc',
    setCompanyDbaName: 'North Star', setCompanyLegalName: 'North Star Logistics LLC',
    setCompanyMC: 'MC-123456', setCompanyDOT: '9876543', setCompanyPhone: '+1 312 555 0100',
    setCompanyEmail: 'office@northstar.test', setCompanyWebsite: 'https://northstar.test',
    setCompanyAddress1: '100 Trucking Way',
    setCompanyAddress2: 'Suite 4', setCompanyCity: 'Chicago', setCompanyState: 'IL',
    setCompanyPostalCode: '60601', setCompanyCountry: 'US',
  };
  for (const [id, value] of Object.entries(values)) {
    const field = page.locator(`#${id}`);
    if (id === 'setCompanyBusinessType') await field.selectOption(value);
    else await field.fill(value);
  }
  await page.getByRole('button', { name: 'Save Organization Settings' }).click();

  let result = await page.evaluate(() => ({ company: loadCompanies()[0], carrierShadow: driver.company }));
  expect(result.carrierShadow).toBe('Legacy Shadow Carrier');
  expect(result.company).toMatchObject({
    name: 'North Star Logistics', businessType: 'llc', dbaName: 'North Star',
    legalName: 'North Star Logistics LLC', mcNumber: 'MC-123456',
    dotNumber: '9876543', phone: '+1 312 555 0100', email: 'office@northstar.test',
    website: 'https://northstar.test',
    address: { line1: '100 Trucking Way', line2: 'Suite 4', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' },
  });

  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    const blocker = document.getElementById('ptiBlocker'); if (blocker) blocker.classList.remove('show');
    showPage('settings');
  });
  await page.locator('[data-settings-group="organization"]').click();
  await expect(page.locator('#setCompanyLegalName')).toHaveValue('North Star Logistics LLC');
  await expect(page.locator('#setCompanyBusinessType')).toHaveValue('llc');
  await expect(page.locator('#setCompanyDbaName')).toHaveValue('North Star');
  await expect(page.locator('#setCompanyWebsite')).toHaveValue('https://northstar.test');
  await expect(page.locator('#setCompanyMC')).toHaveValue('MC-123456');
  await expect(page.locator('#setCompanyDOT')).toHaveValue('9876543');
  await expect(page.locator('#setCompanyAddress1')).toHaveValue('100 Trucking Way');
});

test('company driver never sees or saves owned-business legal and authority fields', async ({ page }) => {
  await expect(page.locator('[data-settings-group="organization"]')).toHaveCount(0);
  await expect(page.locator('#setOrganizationDetails')).toBeHidden();
  await page.evaluate(() => {
    document.getElementById('setCompanyLegalName').value = 'Must Not Persist LLC';
    document.getElementById('setCompanyMC').value = 'MC-LEAK';
    saveSettings();
  });
  expect(await page.evaluate(() => loadCompanies())).toHaveLength(0);
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

test('adding a carrier from Truck keeps owned business separate and selects carrier terms', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveCompanies([normalizeCompany({
      id: 'company_owned_1', relationshipType: 'owned', name: 'North Star Logistics',
      legalName: 'North Star Logistics LLC', mcNumber: 'MC-OWNED'
    })]);
    openTruckForm();
    openCarrierCompanyForm();
  });

  await page.locator('#cfName').fill('Road Partner Carrier');
  await page.locator('#cfLegalName').fill('Road Partner Carrier Inc.');
  await page.locator('#cfMC').fill('MC-765432');
  await page.locator('#cfDOT').fill('7654321');
  await page.locator('#cfBusinessType').selectOption('c_corp');
  await page.locator('#cfDbaName').fill('Road Partner');
  await page.locator('#cfContactName').fill('Maria Dispatch');
  await page.locator('#cfWebsite').fill('https://roadpartner.test');
  await page.locator('#cfAddress2').fill('Dispatch Floor');
  await page.locator('#cfCountry').fill('US');
  await page.locator('#cfNotes').fill('Private negotiated carrier terms');
  await page.locator('#cfDispatch').fill('12.5');
  await page.locator('#cfDedName').fill('Cargo Insurance');
  await page.locator('#cfDedAmount').fill('85');
  await page.locator('#cfDedCategory').selectOption('insurance');
  await page.getByRole('button', { name: '+ Add Recurring Deduction' }).click();
  await page.getByRole('button', { name: 'Save & Select' }).click();

  await expect(page.locator('#tfCompany')).toHaveValue('Road Partner Carrier');
  await expect(page.locator('#tfMC')).toHaveValue('MC-765432');
  await expect(page.locator('#tfDispatch')).toHaveValue('12.5');

  const result = await page.evaluate(() => ({
    companies: loadCompanies(),
    owned: currentOwnedOrganization(),
    templates: loadDedTemplates(),
    selectedRef: document.getElementById('tfCompanyRef').value,
  }));
  expect(result.companies).toHaveLength(2);
  expect(result.owned).toMatchObject({ id: 'company_owned_1', name: 'North Star Logistics', relationshipType: 'owned' });
  const carrier = result.companies.find(company => company.relationshipType === 'carrier');
  expect(carrier).toMatchObject({
    name: 'Road Partner Carrier', legalName: 'Road Partner Carrier Inc.', mcNumber: 'MC-765432',
    dotNumber: '7654321', defaultCarrierFeePercent: 12.5, businessType: 'c_corp',
    dbaName: 'Road Partner', contactName: 'Maria Dispatch', website: 'https://roadpartner.test',
    notes: 'Private negotiated carrier terms', verificationStatus: 'candidate',
    address: { line2: 'Dispatch Floor', country: 'US' },
  });
  expect(result.selectedRef).toBe(carrier.id);
  expect(result.templates).toContainEqual(expect.objectContaining({
    name: 'Cargo Insurance', amount: 85, category: 'insurance',
    carrierCompanyRef: carrier.id, companyNameSnapshot: 'Road Partner Carrier',
  }));
});

test('verified Platform company remains read-only and is not promoted to a local carrier Company', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveOrchestratorCanonicalRead({
      status: 'ready', workspaceId: 'workspace_test', companies: [{
        id: 'canonical_company_1',
        display_name: 'Verified Road Carrier',
        legal_name: 'Verified Road Carrier LLC',
        verification_status: 'verified',
        authorities: [{ type: 'MC', value: 'MC-424242' }],
      }],
      companyCandidates: [], trucks: [], truckCandidates: [],
    });
    openTruckForm();
    const index = carrierDirectoryEntries().findIndex(entry => entry.ref === 'canonical_company_1');
    selectCarrierDirectoryEntry(index);
  });

  await expect(page.locator('#tfCompany')).toHaveValue('Verified Road Carrier');
  await expect(page.locator('#tfMC')).toHaveValue('MC-424242');
  await expect(page.locator('#tfCompanyRef')).toHaveValue('');
  await expect(page.locator('#tfCanonicalCompanyRef')).toHaveValue('canonical_company_1');
  await expect(page.locator('#editSelectedCarrierBtn')).toBeHidden();
  await expect(page.locator('#selectedCarrierDirectoryStatus')).toContainText('read-only');

  await page.locator('#tfUnit').fill('PLATFORM-1');
  await page.locator('#truckModal').getByRole('button', { name: 'Save', exact: true }).click();
  const result = await page.evaluate(() => ({
    companies: loadCompanies(),
    assignment: truckCarrierAssignment(loadTrucks().find(truck => truck.unitNumber === 'PLATFORM-1')),
  }));
  expect(result.companies).toEqual([]);
  expect(result.assignment).toMatchObject({
    companyRef: '',
    canonicalCompanyRef: 'canonical_company_1',
    companyNameSnapshot: 'Verified Road Carrier',
    mcNumberSnapshot: 'MC-424242',
  });
});

test('each truck sees generic deductions plus only its current carrier terms', async ({ page }) => {
  const result = await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    const carrierA = normalizeCompany({ id: 'carrier_a', relationshipType: 'carrier', name: 'Carrier A' });
    const carrierB = normalizeCompany({ id: 'carrier_b', relationshipType: 'carrier', name: 'Carrier B' });
    saveCompanies([carrierA, carrierB]);
    saveDedTemplates([
      { id: 'generic', name: 'Generic', amount: 5, category: 'other' },
      { id: 'for_a', name: 'A Escrow', amount: 30, category: 'admin', carrierCompanyRef: carrierA.id },
      { id: 'for_b', name: 'B Trailer', amount: 45, category: 'equipment', carrierCompanyRef: carrierB.id },
    ]);
    const truckA = { id: 'truck_a', carrierAssignment: { companyRef: carrierA.id, companyNameSnapshot: carrierA.name } };
    const truckB = { id: 'truck_b', carrierAssignment: { companyRef: carrierB.id, companyNameSnapshot: carrierB.name } };
    return {
      a: deductionTemplatesForTruck(truckA).map(item => item.id),
      b: deductionTemplatesForTruck(truckB).map(item => item.id),
      none: deductionTemplatesForTruck({ id: 'truck_none' }).map(item => item.id),
    };
  });
  expect(result.a).toEqual(['generic', 'for_a']);
  expect(result.b).toEqual(['generic', 'for_b']);
  expect(result.none).toEqual(['generic']);
});

test('editing a selected Carrier updates its record and replaces only its recurring terms', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveCompanies([
      normalizeCompany({ id: 'owned_edit_guard', relationshipType: 'owned', name: 'My LLC' }),
      normalizeCompany({ id: 'carrier_edit_1', relationshipType: 'carrier', name: 'Old Carrier', mcNumber: 'MC-101', defaultCarrierFeePercent: 10 }),
    ]);
    saveDedTemplates([
      { id: 'generic_keep', name: 'Generic Keep', amount: 5, category: 'other' },
      { id: 'old_term', name: 'Old Escrow', amount: 25, category: 'admin', carrierCompanyRef: 'carrier_edit_1', companyNameSnapshot: 'Old Carrier' },
      { id: 'other_carrier_keep', name: 'Other Carrier', amount: 30, category: 'other', carrierCompanyRef: 'carrier_other' },
    ]);
    saveTrucks([{
      id: 'truck_edit_carrier', unitNumber: 'E-1', active: true,
      carrierAssignment: { company: 'Old Carrier', mc: 'MC-101', dispatchPercent: 10, companyRef: 'carrier_edit_1', companyNameSnapshot: 'Old Carrier', mcNumberSnapshot: 'MC-101' },
    }]);
    openTruckForm('truck_edit_carrier');
  });

  await page.locator('#editSelectedCarrierBtn').click();
  await expect(page.locator('#cfName')).toHaveValue('Old Carrier');
  await expect(page.locator('#cfDedName')).toHaveValue('');
  await expect(page.locator('#cfDeductionDraftList')).toContainText('Old Escrow');
  await page.locator('#cfDeductionDraftList button').click();
  await page.locator('#cfName').fill('Updated Carrier');
  await page.locator('#cfDispatch').fill('11.5');
  await page.locator('#cfDedName').fill('Trailer Rent');
  await page.locator('#cfDedAmount').fill('150');
  await page.locator('#cfDedCategory').selectOption('equipment');
  await page.getByRole('button', { name: '+ Add Recurring Deduction' }).click();
  await page.getByRole('button', { name: 'Update & Select' }).click();

  await expect(page.locator('#tfCompany')).toHaveValue('Updated Carrier');
  await expect(page.locator('#tfDispatch')).toHaveValue('11.5');
  const result = await page.evaluate(() => ({ companies: loadCompanies(), templates: loadDedTemplates() }));
  expect(result.companies).toHaveLength(2);
  expect(result.companies.find(item => item.id === 'owned_edit_guard')).toMatchObject({ name: 'My LLC', relationshipType: 'owned' });
  expect(result.companies.find(item => item.id === 'carrier_edit_1')).toMatchObject({ name: 'Updated Carrier', defaultCarrierFeePercent: 11.5 });
  expect(result.templates.map(item => item.id)).toContain('generic_keep');
  expect(result.templates.map(item => item.id)).toContain('other_carrier_keep');
  expect(result.templates.map(item => item.id)).not.toContain('old_term');
  expect(result.templates.filter(item => item.carrierCompanyRef === 'carrier_edit_1')).toEqual([
    expect.objectContaining({ name: 'Trailer Rent', amount: 150, category: 'equipment', companyNameSnapshot: 'Updated Carrier' }),
  ]);
});

test('a carrier-only directory record never becomes the owned Organization', async ({ page }) => {
  const result = await page.evaluate(() => {
    setUserRole('owner_op'); applyRoleUI();
    saveCompanies([normalizeCompany({ relationshipType: 'carrier', name: 'Carrier Only', mcNumber: 'MC-100' })]);
    return { owned: currentOwnedOrganization(), settingsName: currentSettingsCompanyName() };
  });
  expect(result.owned).toBeNull();
  expect(result.settingsName).toBe('');
});

test('changing carrier terms archives the previous effective-dated assignment', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveTrucks([{
      id: 'truck_history_1', unitNumber: 'H-01', make: 'Freightliner', customFutureField: 'preserve-me', active: true,
      carrierAssignment: {
        company: 'Alpha Carrier', mc: 'MC-100', dispatchPercent: 10, companyRef: 'company_alpha',
        companyNameSnapshot: 'Alpha Carrier', mcNumberSnapshot: 'MC-100', effectiveFrom: '2026-01-01', effectiveTo: '',
      },
      carrierAssignmentHistory: [],
    }]);
    openTruckForm('truck_history_1');
  });

  await page.locator('#tfCompany').fill('Beta Carrier');
  await page.locator('#tfMC').fill('MC-200');
  await page.locator('#tfDispatch').fill('12.5');
  await page.locator('#tfCarrierEffectiveFrom').fill('2026-07-01');
  await page.evaluate(() => saveTruckForm());

  const truck = await page.evaluate(() => loadTrucks().find(item => item.id === 'truck_history_1'));
  expect(truck.customFutureField).toBe('preserve-me');
  expect(truck.carrierAssignment).toMatchObject({
    company: 'Beta Carrier', mc: 'MC-200', dispatchPercent: 12.5,
    companyRef: '', effectiveFrom: '2026-07-01', effectiveTo: '',
  });
  expect(truck.carrierAssignmentHistory).toHaveLength(1);
  expect(truck.carrierAssignmentHistory[0]).toMatchObject({
    companyRef: 'company_alpha', companyNameSnapshot: 'Alpha Carrier', mcNumberSnapshot: 'MC-100',
    dispatchPercent: 10, effectiveFrom: '2026-01-01', effectiveTo: '2026-07-01',
  });
});

test('editing physical truck data does not create duplicate carrier history', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveTrucks([{
      id: 'truck_history_2', unitNumber: 'H-02', make: 'Volvo', active: true,
      carrierAssignment: {
        company: 'Stable Carrier', mc: 'MC-300', dispatchPercent: 9, companyRef: 'company_stable',
        companyNameSnapshot: 'Stable Carrier', mcNumberSnapshot: 'MC-300', effectiveFrom: '2026-03-15', effectiveTo: '',
      },
      carrierAssignmentHistory: [{
        company: 'Prior Carrier', mc: 'MC-250', dispatchPercent: 8, companyRef: 'company_prior',
        companyNameSnapshot: 'Prior Carrier', mcNumberSnapshot: 'MC-250', effectiveFrom: '2025-01-01', effectiveTo: '2026-03-15',
      }],
    }]);
    openTruckForm('truck_history_2');
  });

  await expect(page.locator('#truckModalWrap')).toContainText('Previous Carrier Terms');
  await expect(page.locator('#truckModalWrap')).toContainText('Prior Carrier');
  await page.locator('#tfModel').fill('VNL 860');
  await page.evaluate(() => saveTruckForm());

  const truck = await page.evaluate(() => loadTrucks().find(item => item.id === 'truck_history_2'));
  expect(truck.model).toBe('VNL 860');
  expect(truck.carrierAssignment.effectiveFrom).toBe('2026-03-15');
  expect(truck.carrierAssignmentHistory).toHaveLength(1);
  expect(truck.carrierAssignmentHistory[0].companyNameSnapshot).toBe('Prior Carrier');
});

test('correcting only the current assignment start date does not create history', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet'); applyRoleUI();
    saveTrucks([{
      id: 'truck_history_3', unitNumber: 'H-03', make: 'Kenworth', active: true,
      carrierAssignment: {
        company: 'Same Carrier', mc: 'MC-400', dispatchPercent: 7, companyRef: 'company_same',
        companyNameSnapshot: 'Same Carrier', mcNumberSnapshot: 'MC-400', effectiveFrom: '2026-04-01', effectiveTo: '',
      },
      carrierAssignmentHistory: [],
    }]);
    openTruckForm('truck_history_3');
  });

  await page.locator('#tfCarrierEffectiveFrom').fill('2026-04-15');
  await page.evaluate(() => saveTruckForm());

  const truck = await page.evaluate(() => loadTrucks().find(item => item.id === 'truck_history_3'));
  expect(truck.carrierAssignment.effectiveFrom).toBe('2026-04-15');
  expect(truck.carrierAssignment.companyRef).toBe('company_same');
  expect(truck.carrierAssignmentHistory).toEqual([]);
});
