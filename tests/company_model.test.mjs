import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Company module exposes the MVP schema and storage helpers', () => {
  assert.match(html, /function loadCompanies\(\)\{ return scopedLoad\('companies', \[\]\); \}/);
  assert.match(html, /function saveCompanies\(v\)\{ scopedSave\('companies', v \|\| \[\]\); \}/);
  assert.match(html, /function normalizeCompany\(raw\)/);
  for (const field of ['id', 'name', 'legalName', 'mcNumber', 'dotNumber', 'phone', 'email', 'address', 'logo', 'active', 'createdAt', 'updatedAt']) {
    assert.match(html, new RegExp(`normalizeCompany[\\s\\S]{0,900}${field}:`), `normalizeCompany must set ${field}`);
  }
  assert.match(html, /address: \{\s*line1:[\s\S]*?postalCode:[\s\S]*?country:/);
});

test('ownedOrganization and currentCarrierCompany are distinct, non-syncing readers', () => {
  assert.match(html, /function currentOwnedOrganization\(\)/);
  assert.match(html, /function currentCarrierCompany\(\)/);
  // Carrier company must prefer the truck's Carrier Assignment snapshot, then fall back to
  // the legacy driver.company shadow — never invent data and never touch ownedOrganization.
  assert.match(html, /function currentCarrierCompany\(\)\{[\s\S]{0,600}truckCarrierAssignment\(truck\)/);
  assert.match(html, /function currentCarrierCompany\(\)\{[\s\S]{0,900}driver && driver\.company/);
});

test('Carrier Assignment gains a company reference and point-in-time snapshot without dropping legacy fields', () => {
  assert.match(html, /companyRef: assignment\.companyRef \|\| ''/);
  assert.match(html, /companyNameSnapshot: assignment\.companyNameSnapshot != null \? assignment\.companyNameSnapshot : company/);
  assert.match(html, /mcNumberSnapshot: assignment\.mcNumberSnapshot != null \? assignment\.mcNumberSnapshot : mc/);
  // Legacy shadow fields must still be returned unchanged for existing readers.
  assert.match(html, /return \{[\s\S]{0,200}company: company,\s*mc: mc,\s*dispatchPercent: dispatchPercent,/);
  assert.match(html, /carrierAssignment\.companyNameSnapshot = carrierAssignment\.company;/);
  assert.match(html, /carrierAssignment\.mcNumberSnapshot = carrierAssignment\.mc;/);
});

test('saveTruckForm preserves companyRef only when company and MC are unchanged on edit', () => {
  assert.match(html, /var existingAssignment = \(mode === 'edit' && idx >= 0\) \? truckCarrierAssignment\(list\[idx\]\) : null;/);
  assert.match(html, /var carrierUnchanged = !!existingAssignment\s*&& existingAssignment\.companyNameSnapshot === carrierAssignment\.company\s*&& existingAssignment\.mcNumberSnapshot === carrierAssignment\.mc;/);
  assert.match(html, /carrierAssignment\.companyRef = carrierUnchanged \? \(existingAssignment\.companyRef \|\| ''\) : '';/);
});

test('Settings Company field routes by role instead of always writing driver.company', () => {
  assert.match(html, /function currentSettingsCompanyName\(\)/);
  assert.match(html, /function applySettingsCompanyName\(value\)/);
  assert.match(html, /document\.getElementById\('setCompany'\)\.value = currentSettingsCompanyName\(\);/);
  assert.match(html, /applySettingsCompanyName\(document\.getElementById\('setCompany'\)\.value\);/);
  // owner_op/fleet must never fall through to writing driver.company directly.
  assert.match(html, /applySettingsCompanyName[\s\S]{0,700}saveCompanies\(companies\);[\s\S]{0,160}\} else \{\s*driver\.company = value;/);
  // The old direct assignment this replaces must be gone.
  assert.doesNotMatch(html, /driver\.company = document\.getElementById\('setCompany'\)\.value\.trim\(\);/);
});

test('an explicit logo upload always overwrites Company.logo for owner_op/fleet', () => {
  assert.match(html, /function saveCurrentOrganizationLogo\(data\)/);
  assert.match(html, /saveCurrentOrganizationLogo[\s\S]{0,200}if\(role !== 'owner_op' && role !== 'fleet'\) return;/);
  // Must not bail out just because org.logo is already set — that's the bug being fixed.
  assert.doesNotMatch(html, /function saveCurrentOrganizationLogo\(data\)\{[\s\S]{0,400}if\(!org \|\| org\.logo\) return;/);
  assert.match(html, /function saveCurrentOrganizationLogo\(data\)\{[\s\S]{0,400}if\(!org\) return;/);
  assert.match(html, /org\.logo = data \|\| '';/);
  assert.match(html, /localStorage\.setItem\('fiqD_logo', data\);\s*saveCurrentOrganizationLogo\(data\);/);
});

test('legacy logo migration only ever fills an empty Company.logo, never overwrites', () => {
  assert.match(html, /function migrateLegacyLogoIntoOwnedOrganization\(logoData\)/);
  assert.match(html, /migrateLegacyLogoIntoOwnedOrganization[\s\S]{0,200}if\(role !== 'owner_op' && role !== 'fleet'\) return;/);
  assert.match(html, /migrateLegacyLogoIntoOwnedOrganization[\s\S]{0,300}if\(!org \|\| org\.logo\) return;/);
  assert.match(html, /migrateLegacyLogoIntoOwnedOrganization\(localStorage\.getItem\('fiqD_logo'\) \|\| ''\);/);
});

test('removeLogo clears Company.logo for owner_op/fleet and legacy fiqD_logo for everyone', () => {
  assert.match(html, /function removeLogo\(\)\{[\s\S]{0,500}if\(role === 'owner_op' \|\| role === 'fleet'\)/);
  assert.match(html, /function removeLogo\(\)\{[\s\S]{0,700}org\.logo = '';[\s\S]{0,100}saveCompanies\(companies\);/);
  assert.match(html, /function removeLogo\(\)\{[\s\S]{0,800}localStorage\.removeItem\('fiqD_logo'\);/);
});

test('logo preview reads Company.logo first with a legacy fallback', () => {
  assert.match(html, /let data = \(org && org\.logo\) \|\| localStorage\.getItem\('fiqD_logo'\)\|\|'';/);
});

console.log('Company model contract: ok');
