import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const deductionTripResolution = readFileSync(new URL('../deduction-trip-resolution.js', import.meta.url), 'utf8');

test('fleet records resolve truck references across restored payload shapes without guessing between units', () => {
  assert.match(html, /<script src="fleet-load-resolution\.js\?v=20260730-issue20-v1"><\/script>/);
  assert.match(html, /window\.CrewBIQFleetLoadResolution/);
  assert.match(html, /api\.resolveLoadToTruck\(record, trucks, driverProfiles\)/);
  assert.match(html, /function recordMatchesTruck\(record, truck\){[^}]*return recordTruckId\(record\) === truck\.id;[^}]*}/);
  assert.doesNotMatch(html, /trucks\.length===1/);
});

test('driver profiles normalize transport aliases and edits preserve non-form linkage fields', () => {
  assert.match(html, /function normalizeDriverProfileRecord\(profile\)/);
  assert.match(html, /driverProfileValue\(profile, 'payType', 'pay_type'\)/);
  assert.match(html, /driverProfileValue\(profile, 'grossPercent', 'gross_percent'\)/);
  assert.match(html, /list\[idx\]=normalizeDriverProfileRecord\(\{\.\.\.list\[idx\], \.\.\.entry\}\)/);
});

test('Account moves only one CrewBIQ ID control into the visible panel', () => {
  assert.match(html, /\['setEmail','setCrewId','setName'\]\.forEach/);
  assert.doesNotMatch(html, /\['settingsCrewId','setEmail','setCrewId','setName'\]\.forEach/);
});

test('fleet finance reads the application load state through the explicit bridge', () => {
  assert.match(html, /function currentFleetLoads\(\)/);
  assert.match(deductionTripResolution, /typeof global\.currentFleetLoads === 'function'/);
  assert.match(deductionTripResolution, /global\.currentFleetLoads\(\)/);
});

test('driver Pay Type options use valid selected markup', () => {
  assert.ok(html.includes(`'<option value="cpm" '+((!d||d.payType==='cpm')?'selected':'')+'>CPM ($/mile)</option>'+`));
  assert.ok(html.includes(`'<option value="gross_percent" '+(d&&d.payType==='gross_percent'?'selected':'')+'>% of Gross</option>'+`));
  assert.doesNotMatch(html, /selected"=""/);
});

test('team driver form stores a distinct reciprocal roster reference without inventing canonical teamId', () => {
  assert.match(html, /function toggleDriverTeamFields\(\)/);
  assert.match(html, /function syncDriverTeamMateFields\(\)/);
  assert.match(html, /id="dfTeamMateSearch"[^>]*oninput="filterDriverTeamMateOptions\(\)"/);
  assert.match(html, /function filterDriverTeamMateOptions\(\)/);
  assert.match(html, /\[profile\.name, profile\.email, profile\.phone\]/);
  assert.match(html, /function setDriverTeamMateFieldMode\(linked\)/);
  assert.match(html, /teamMateDriverId: teamMateDriverId/);
  assert.match(html, /team_mate_driver_id: teamMateDriverId/);
  assert.match(html, /teamMateDriverId:id/);
  assert.doesNotMatch(html, /teamId\s*:\s*teamMateId/);
});

test('optional professional driver fields are normalized with transport aliases and remain private copy', () => {
  for (const field of ['cdlNumber', 'cdlState', 'cdlExpiresOn', 'homeTerminal', 'profileNotes']) {
    assert.match(html, new RegExp(`${field}:`));
  }
  for (const alias of ['cdl_number', 'cdl_state', 'cdl_expires_on', 'home_terminal', 'profile_notes']) {
    assert.match(html, new RegExp(`${alias}:`));
  }
  assert.match(html, /Public platform visibility will require a separate consent-based profile flow/);
});

test('Fleet Overview presents carrier fees and weekly deductions as one Deductions total', () => {
  assert.match(html, /var allDeductions = Number\(dispFee\|\|0\) \+ Number\(f\.deductionTotal\|\|0\)/);
  assert.match(html, /<div class="label">Deductions<\/div><div class="stat-val red">-'\+fmt\(allDeductions\)/);
  assert.doesNotMatch(html, /<div class="label">Dispatch '\+assignment\.dispatchPercent/);
  assert.match(html, /fleetDeductions\+=allDeductions/);
});

test('Fleet Overview resolves carrier fee terms by load date while preserving load snapshots', () => {
  assert.match(html, /function carrierAssignmentForDate\(truck, value\)/);
  assert.match(html, /date >= assignment\.effectiveFrom/);
  assert.match(html, /date < assignment\.effectiveTo/);
  assert.match(html, /function carrierAssignmentForLoad\(truck, load\)/);
  assert.match(html, /var assignmentForLoad = carrierAssignmentForLoad\(truck, l\)/);
  assert.match(deductionTripResolution, /typeof global\.carrierAssignmentForLoad === 'function'/);
  assert.doesNotMatch(deductionTripResolution, /\(truck && truck\.dispatchPercent\)/);
});

test('Fleet Overview exposes carrier, confirmed and automatic deduction totals separately', () => {
  assert.match(html, /function fleetDeductionBreakdownHtml\(finance, total, label\)/);
  assert.match(html, /row\('Carrier fees', carrierFees, false\)/);
  assert.match(html, /row\('Confirmed weekly deductions', confirmed, false\)/);
  assert.match(html, /row\('Automatic recurring deductions', automatic, false\)/);
  assert.match(html, /Array\.isArray\(finance\.deductionSettlements\)/);
  assert.match(html, /item\.name \|\| item\.category \|\| 'Deduction'/);
  assert.match(html, /item\.companyNameSnapshot \|\| item\.company/);
  assert.match(html, /\.map\(function\(settlement\)/);
  assert.match(html, /settlement\.items\.map\(function\(item\)/);
  assert.match(html, /fleetDeductionBreakdownHtml\(f, allDeductions, 'Show deductions breakdown'\)/);
  assert.match(html, /fleetCarrierFees\+=Number\(dispFee\|\|0\)/);
  assert.match(html, /fleetDeductionSettlements = fleetDeductionSettlements\.concat\(f\.deductionSettlements\)/);
  assert.match(html, /confirmedDeductionTotal:fleetConfirmedDeductions/);
  assert.match(html, /automaticDeductionTotal:fleetAutomaticDeductions/);
  assert.match(html, /deductionSettlements:fleetDeductionSettlements/);
  assert.match(html, /fleetDeductions, 'Show fleet deductions breakdown'/);
});
