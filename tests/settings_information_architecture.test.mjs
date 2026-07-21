import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('settings use one role-aware category catalog', () => {
  assert.match(html, /const SETTINGS_GROUPS = \[/);
  for (const key of ['account', 'work', 'organization', 'fleet', 'operations', 'app-data']) {
    assert.match(html, new RegExp(`key:'${key}'`));
    assert.match(html, new RegExp(`id="settingsPanel-${key}"`));
  }
  assert.match(html, /roles:\['owner_op','fleet'\]/);
  assert.match(html, /visibleSettingsGroups\(\)/);
});

test('company and physical truck fields are single entities moved by role', () => {
  assert.match(html, /companyFields\.id = 'settingsCompanyFields'/);
  assert.match(html, /truckFields\.id = 'settingsTruckFields'/);
  assert.match(html, /role === 'driver'[\s\S]*?work\.appendChild\(companyFields\)[\s\S]*?work\.appendChild\(truckFields\)/);
  assert.match(html, /organization\.appendChild\(companyFields\)/);
  assert.match(html, /fleet\.insertBefore\(truckFields/);

  for (const id of ['setCompany', 'setTruckName', 'setUnit', 'setPlate']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist once`);
  }
});

test('themes and accents retain their existing controls and handlers', () => {
  assert.match(html, /id="setTheme" onchange="applyTheme\(this\.value\)"/);
  assert.match(html, /id="accentSwatches"/);
  for (const accent of ['orange', 'blue', 'green', 'red', 'purple', 'cyan']) {
    assert.match(html, new RegExp(`onclick="setAccent\\('${accent}'\\)"`));
  }
});

test('opening settings resets to catalog while internal renders preserve context', () => {
  assert.match(html, /if\(name==='settings'\) renderSettingsPage\(true\)/);
  assert.match(html, /function renderSettingsPage\(resetNavigation\)/);
  assert.match(html, /renderSettingsNavigation\(!!resetNavigation\)/);
  assert.match(html, /function renderAll\(\)[\s\S]*?renderSettingsPage\(\)/);
});

test('settings field ids remain unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicates, []);
});

test('truck form separates vehicle identity from carrier assignment', () => {
  assert.match(html, /Physical Truck/);
  assert.match(html, /Current Carrier Assignment/);
  assert.match(html, /function truckCarrierAssignment\(truck\)/);
  assert.match(html, /carrierAssignment: carrierAssignment/);
  assert.match(html, /Compatibility shadow for reports and older sync clients/);
  assert.match(html, /Commercial terms can change without changing the physical truck/);
});

test('fleet views read commercial terms through carrier assignment', () => {
  assert.match(html, /function ownerFinanceForTruck[\s\S]*?var carrierAssignment = truckCarrierAssignment\(truck\)/);
  assert.match(html, /perTruckEl\.innerHTML = trucks\.map\(function\(tr\)\{[\s\S]*?var assignment = truckCarrierAssignment\(tr\)/);
  assert.match(html, /function fleetReportRows[\s\S]*?var assignment = truckCarrierAssignment\(t\)/);
  assert.match(html, /function renderTrucksList[\s\S]*?var assignment = truckCarrierAssignment\(t\)/);
  assert.doesNotMatch(html, /\b(?:tr|t)\.(?:company|mc|dispatchPercent)\b/);
});
