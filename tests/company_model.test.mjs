import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Company module exposes the MVP schema and storage helpers', () => {
  assert.match(html, /function loadCompanies\(\)\{ return scopedLoad\('companies', \[\]\); \}/);
  assert.match(html, /function saveCompanies\(v\)\{ scopedSave\('companies', v \|\| \[\]\); \}/);
  assert.match(html, /function normalizeCompany\(raw\)/);
  for (const field of ['id', 'name', 'legalName', 'dbaName', 'businessType', 'relationshipType', 'verificationStatus', 'canonicalCompanyId', 'mcNumber', 'dotNumber', 'phone', 'email', 'website', 'contactName', 'notes', 'address', 'defaultCarrierFeePercent', 'logo', 'active', 'createdAt', 'updatedAt']) {
    assert.match(html, new RegExp(`normalizeCompany[\\s\\S]{0,2800}${field}:`), `normalizeCompany must set ${field}`);
  }
  assert.match(html, /address: \{\s*line1:[\s\S]*?postalCode:[\s\S]*?country:/);
  assert.match(html, /if\(!Number\.isFinite\(defaultCarrierFeePercent\) \|\| defaultCarrierFeePercent < 0\) defaultCarrierFeePercent = 0;/);
});

test('owned business and carrier directory records are explicitly separated', () => {
  assert.match(html, /function isOwnedCompany\(company\)/);
  assert.match(html, /\(company\.relationshipType \|\| company\.relationship_type \|\| 'owned'\) !== 'carrier'/);
  assert.match(html, /function currentOwnedOrganization\(\)\{[\s\S]{0,300}companies\.find\(isOwnedCompany\) \|\| null;/);
  assert.match(html, /function saveCarrierCompanyForm\(\)/);
  assert.match(html, /relationshipType:'carrier', verificationStatus:'candidate'/);
  assert.match(html, /name:name, legalName:value\('cfLegalName'\), dbaName:value\('cfDbaName'\)/);
  assert.match(html, /businessType:value\('cfBusinessType'\), mcNumber:value\('cfMC'\)/);
  assert.match(html, /defaultCarrierFeePercent:fee/);
  assert.match(html, /Carrier not found\? Add company &amp; terms|Carrier not found\? Add company & terms/);
});

test('carrier recurring deductions are separate templates scoped by companyRef', () => {
  assert.match(html, /function deductionTemplatesForTruck\(truck\)/);
  assert.match(html, /var carrierRef = assignment \? \(assignment\.companyRef \|\| ''\) : '';/);
  assert.match(html, /return !templateRef \|\| \(!!carrierRef && templateRef === carrierRef\);/);
  assert.match(html, /carrierCompanyRef:company\.id/);
  assert.match(html, /companyNameSnapshot:company\.name/);
  assert.match(html, /id="cfDeductionDraftList"/);
  assert.match(html, /function addCarrierDeductionDraft\(\)/);
  assert.match(html, /function openSelectedCarrierCompanyForm\(\)/);
  assert.match(html, /id="editSelectedCarrierBtn"/);
  assert.match(html, /var existingIndex = _carrierCompanyEditId \? companies\.findIndex/);
  assert.match(html, /if\(existingIndex >= 0\) companies\[existingIndex\] = company;/);
  assert.match(html, /loadDedTemplates\(\)\.filter\(function\(template\)\{\s*return \(template\.carrierCompanyRef \|\| ''\) !== company\.id;/);
});

test('new deduction templates inherit the selected truck Carrier Assignment', () => {
  assert.match(html, /var selectedTruck = findTruckByIdOrUnit\(selectedTruckId\('dedTruckSelect'\)\);/);
  assert.match(html, /carrierCompanyRef:\(assignment && assignment\.companyRef\) \|\| ''/);
  assert.match(html, /companyNameSnapshot:\(assignment && assignment\.companyNameSnapshot\) \|\| ''/);
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

test('saveTruckForm accepts an explicit directory ref and otherwise preserves it only when company and MC are unchanged', () => {
  assert.match(html, /var selectedCompanyRef = \(\(document\.getElementById\('tfCompanyRef'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\);/);
  assert.match(html, /var existingAssignment = \(mode === 'edit' && idx >= 0\) \? truckCarrierAssignment\(list\[idx\]\) : null;/);
  assert.match(html, /var carrierUnchanged = !!existingAssignment\s*&& existingAssignment\.companyNameSnapshot === carrierAssignment\.company\s*&& existingAssignment\.mcNumberSnapshot === carrierAssignment\.mc;/);
  assert.match(html, /carrierAssignment\.companyRef = selectedCompanyRef \|\| \(carrierUnchanged \? \(existingAssignment\.companyRef \|\| ''\) : ''\);/);
  assert.match(html, /id="tfCompany"[^>]*oninput="clearCarrierDirectoryRef\(\)"/);
  assert.match(html, /id="tfMC"[^>]*oninput="clearCarrierDirectoryRef\(\)"/);
});

test('Carrier Assignment terms are effective-dated and previous terms are preserved as history', () => {
  assert.match(html, /effectiveFrom: assignment\.effectiveFrom \|\| ''/);
  assert.match(html, /effectiveTo: assignment\.effectiveTo \|\| ''/);
  assert.match(html, /function truckCarrierAssignmentHistory\(truck\)/);
  assert.match(html, /function carrierAssignmentTermsChanged\(previous, next\)/);
  assert.match(html, /id="tfCarrierEffectiveFrom"/);
  assert.match(html, /carrierAssignmentHistory\.push\(Object\.assign\(\{\}, existingAssignment, \{ effectiveTo: requestedEffectiveFrom \}\)\);/);
  assert.match(html, /carrierAssignment\.effectiveFrom = requestedEffectiveFrom/);
  assert.match(html, /carrierAssignmentHistory: carrierAssignmentHistory/);
  assert.match(html, /Object\.assign\(\{\}, existingTruck \|\| \{\}, \{/);
  assert.match(html, /Previous Carrier Terms/);
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

test('owned business details reuse the Company model and never write the driver carrier shadow', () => {
  for (const id of ['setCompanyBusinessType', 'setCompanyDbaName', 'setCompanyLegalName', 'setCompanyMC', 'setCompanyDOT', 'setCompanyPhone', 'setCompanyEmail', 'setCompanyWebsite', 'setCompanyAddress1', 'setCompanyCity', 'setCompanyState', 'setCompanyPostalCode', 'setCompanyCountry']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} must exist once in the owned-business form`);
  }
  assert.match(html, /function applySettingsOrganizationDetails\(details\)/);
  assert.match(html, /if\(role !== 'owner_op' && role !== 'fleet'\) return;/);
  assert.match(html, /org\.legalName = String\(details\.legalName \|\| ''\)\.trim\(\);/);
  assert.match(html, /org\.businessType = String\(details\.businessType \|\| ''\)\.trim\(\);/);
  assert.match(html, /org\.dbaName = String\(details\.dbaName \|\| ''\)\.trim\(\);/);
  assert.match(html, /org\.website = String\(details\.website \|\| ''\)\.trim\(\);/);
  assert.match(html, /org\.address = \{/);
  const detailsBody = html.match(/function applySettingsOrganizationDetails\(details\)\{[\s\S]{0,1800}?\n\}/);
  assert.ok(detailsBody, 'owned-business save helper must be found');
  assert.doesNotMatch(detailsBody[0], /driver\.company\s*=/);
  assert.match(html, /applySettingsOrganizationDetails\(settingsOrganizationDetailsFromForm\(\)\);/);
});

test('Platform carrier selection stays a read-only canonical reference, separate from local Company links', () => {
  assert.match(html, /canonicalCompanyRef: assignment\.canonicalCompanyRef \|\| assignment\.canonical_company_ref \|\| ''/);
  assert.match(html, /id="tfCanonicalCompanyRef"/);
  assert.match(html, /if\(ref\) ref\.value = entry\.refKind === 'local' \? \(entry\.ref \|\| ''\) : '';/);
  assert.match(html, /if\(canonicalRef\) canonicalRef\.value = entry\.refKind === 'canonical' \? \(entry\.ref \|\| ''\) : '';/);
  assert.match(html, /if\(editButton\) editButton\.style\.display = entry\.localCompanyId \? '' : 'none';/);
  assert.match(html, /Verified Platform companies are read-only here/);
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

test('Company & Settlement save behavior is effective-dated and lossless', () => {
  var functionStart = html.indexOf('function saveCompanySettlementForm(){');
  var functionEnd = html.indexOf('\nfunction renderDeductionsPage(){', functionStart);
  var functionSource = html.slice(functionStart, functionEnd);
  var helperStart = html.indexOf('function truckCarrierAssignment(truck){');
  var helperEnd = html.indexOf('\nfunction carrierAssignmentHistoryHtml(truck){', helperStart);
  var helperSource = html.slice(helperStart, helperEnd);
  var helperFactory = new Function(helperSource + '\nreturn [truckCarrierAssignment, truckCarrierAssignmentHistory, carrierAssignmentHasTerms, carrierAssignmentTermsChanged];');
  var helpers = helperFactory();
  var truckCarrierAssignment = helpers[0];
  var truckCarrierAssignmentHistory = helpers[1];
  var carrierAssignmentHasTerms = helpers[2];
  var carrierAssignmentTermsChanged = helpers[3];
  function runScenario(formOverrides, confirmResult) {
    var truck1 = {
      id: 'truck-1',
      company: 'Alpha',
      mc: 'MC-1',
      dispatchPercent: 10,
      maintenanceRate: 0.15,
      weekEndDay: 5,
      carrierAssignment: {
        company: 'Alpha',
        mc: 'MC-1',
        dispatchPercent: 10,
        companyRef: 'ref-1',
        canonicalCompanyRef: 'canon-1',
        companyNameSnapshot: 'Alpha',
        mcNumberSnapshot: 'MC-1',
        effectiveFrom: '2023-01-01',
        effectiveTo: ''
      },
      carrierAssignmentHistory: []
    };
    var truck2 = {
      id: 'truck-2',
      company: 'Beta',
      mc: 'MC-2',
      dispatchPercent: 20,
      maintenanceRate: 0.10,
      weekEndDay: 0,
      carrierAssignment: {
        company: 'Beta',
        mc: 'MC-2',
        dispatchPercent: 20,
        companyRef: '',
        canonicalCompanyRef: '',
        companyNameSnapshot: 'Beta',
        mcNumberSnapshot: 'MC-2',
        effectiveFrom: '',
        effectiveTo: ''
      },
      carrierAssignmentHistory: []
    };
    var trucks = [truck1, truck2];
    var originalTrucks = JSON.parse(JSON.stringify(trucks));
    var unrelatedTruck = JSON.parse(JSON.stringify(truck2));
    var fieldValues = {csCompany: 'Alpha', csMC: 'MC-1', csDispatchPercent: '10', csMaintenanceRate: '0.15', csWeekEndDay: '5'};
    Object.assign(fieldValues, formOverrides || {});
    var confirmations = 0;
    var saves = 0;
    var syncs = 0;
    var renders = 0;
    var capturedSaved = null;
    var loadTrucks = function() { return trucks; };
    var selectedTruckId = function() { return 'truck-1'; };
    var document = {
      getElementById: function(id) {
        return { value: fieldValues[id] !== undefined ? fieldValues[id] : '' };
      }
    };
    var confirm = function(msg) { confirmations++; return confirmResult; };
    var saveTrucks = function(list) { saves++; capturedSaved = JSON.parse(JSON.stringify(list)); };
    var queueFleetConfigSync = function() { syncs++; };
    var renderDeductionsPage = function() { renders++; };
    var dependencyNames = ['loadTrucks', 'selectedTruckId', 'document', 'truckCarrierAssignment', 'truckCarrierAssignmentHistory', 'carrierAssignmentHasTerms', 'carrierAssignmentTermsChanged', 'confirm', 'saveTrucks', 'queueFleetConfigSync', 'renderDeductionsPage'];
    var dependencyValues = [loadTrucks, selectedTruckId, document, truckCarrierAssignment, truckCarrierAssignmentHistory, carrierAssignmentHasTerms, carrierAssignmentTermsChanged, confirm, saveTrucks, queueFleetConfigSync, renderDeductionsPage];
    var factory = new Function(...dependencyNames, functionSource + '\nreturn saveCompanySettlementForm;');
    var saveCompanySettlementForm = factory(...dependencyValues);
    saveCompanySettlementForm();
    return { trucks: trucks, originalTrucks: originalTrucks, unrelatedTruck: unrelatedTruck, confirmations: confirmations, saves: saves, syncs: syncs, renders: renders, saved: capturedSaved };
  }
  var unchanged = runScenario({}, true);
  var cancelled = runScenario({csDispatchPercent: '12'}, false);
  var dispatch = runScenario({csDispatchPercent: '12'}, true);
  var zero = runScenario({csMaintenanceRate: '0'}, true);
  var savedTruck0 = dispatch.saved[0];
  assert.equal(unchanged.confirmations, 0);
  assert.equal(cancelled.confirmations, 1);
  assert.equal(dispatch.saved.length, 2);
  assert.deepEqual(dispatch.saved[1], dispatch.unrelatedTruck);
  assert.equal(savedTruck0.carrierAssignment.canonicalCompanyRef, 'canon-1');
  assert.equal(savedTruck0.carrierAssignmentHistory.length, 1);
  assert.equal(savedTruck0.carrierAssignmentHistory[0].effectiveTo, new Date().toISOString().slice(0,10));
  assert.equal(zero.saved[0].maintenanceRate, 0);
  assert.equal(unchanged.saves, 0);
  assert.equal(unchanged.syncs, 0);
  assert.equal(unchanged.renders, 0);
  assert.equal(cancelled.saves, 0);
  assert.equal(cancelled.syncs, 0);
  assert.equal(cancelled.renders, 0);
  assert.deepEqual(cancelled.trucks, cancelled.originalTrucks);
  assert.equal(dispatch.confirmations, 1);
  assert.equal(dispatch.saves, 1);
  assert.equal(dispatch.syncs, 1);
  assert.equal(dispatch.renders, 1);
  assert.equal(dispatch.saved[0].dispatchPercent, 12);
  assert.equal(dispatch.saved[0].carrierAssignment.dispatchPercent, 12);
  assert.equal(dispatch.saved[0].carrierAssignment.companyRef, 'ref-1');
  assert.equal(dispatch.saved[0].carrierAssignment.canonicalCompanyRef, 'canon-1');
  assert.equal(dispatch.saved[0].carrierAssignmentHistory[0].dispatchPercent, 10);
  assert.equal(dispatch.saved[0].carrierAssignmentHistory[0].effectiveFrom, '2023-01-01');
  assert.equal(dispatch.saved[0].carrierAssignmentHistory[0].effectiveTo, new Date().toISOString().slice(0,10));
  assert.equal(dispatch.saved[0].carrierAssignment.effectiveFrom, new Date().toISOString().slice(0,10));
  assert.equal(dispatch.saved[0].carrierAssignment.effectiveTo, '');
  assert.equal(zero.confirmations, 1);
  assert.equal(zero.saves, 1);
});
