import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('svcRate: device-global key replaced by an account-scoped default, import never touches trucks', () => {
  assert.match(html, /function loadAccountSvcRateDefault\(\)/);
  assert.match(html, /function saveAccountSvcRateDefault\(rate\)/);
  assert.match(html, /function importLegacySvcRateIntoScope\(\)/);
  // Account-scoped, not the old device-global key. Number.isFinite() guards a corrupted value.
  assert.match(html, /function loadAccountSvcRateDefault\(\)\{\s*var v = scopedLoad\('svcRateDefault', null\);\s*if\(v == null\) return null;\s*var n = Number\(v\);\s*return Number\.isFinite\(n\) \? n : null;/);
  assert.match(html, /function saveAccountSvcRateDefault\(rate\)\{\s*scopedSave\('svcRateDefault', Number\(rate\)\);/);
  // Import never overwrites an existing scoped default.
  assert.match(html, /function importLegacySvcRateIntoScope\(\)\{\s*var existing = loadAccountSvcRateDefault\(\);\s*if\(existing != null\) return existing;/);
  // getSvcRate/setSvcRate route through the scoped layer, not raw localStorage.
  assert.match(html, /function getSvcRate\(\)\{\s*var imported = importLegacySvcRateIntoScope\(\);/);
  assert.match(html, /function setSvcRate\(r\)\{\s*saveAccountSvcRateDefault\(r\);\s*\}/);
  // Nothing in the import path ever calls saveTrucks/loadTrucks — a legacy default must never
  // propagate into any truck's own maintenanceRate.
  const importBody = html.match(/function importLegacySvcRateIntoScope\(\)\{[\s\S]{0,1200}?\n\}/)[0];
  assert.doesNotMatch(importBody, /(saveTrucks|loadTrucks)\(/);
});

test('svcRate: legacy value is retired GLOBALLY on first successful import, not per-account, closing the A-imports/B-re-imports leak', () => {
  // A global consumed marker (not scoped) is checked before any legacy re-import attempt.
  assert.match(html, /var SVC_RATE_LEGACY_CONSUMED_KEY = K\+'svcRateLegacyConsumed';/);
  assert.match(html, /if\(localStorage\.getItem\(SVC_RATE_LEGACY_CONSUMED_KEY\)\) return null;/);
  // The scoped write is re-read and verified BEFORE the legacy key is retired — a failed or
  // partial write must not cause the value to be lost, and must not retire the key either.
  assert.match(html, /saveAccountSvcRateDefault\(legacyRate\);\s*var verified = loadAccountSvcRateDefault\(\);\s*if\(verified !== legacyRate\) return null;/);
  // Only after verification: remove the legacy key AND set the global consumed marker together.
  assert.match(html, /if\(verified !== legacyRate\) return null; \/\/[^\n]*\n\s*localStorage\.removeItem\(SVC_RATE_KEY\);\s*localStorage\.setItem\(SVC_RATE_LEGACY_CONSUMED_KEY, '1'\);\s*return legacyRate;/);
  // An unparseable legacy value is quarantined (never silently dropped) and ALSO retires the key.
  assert.match(html, /function quarantineLegacySvcRate\(rawValue\)/);
  assert.match(html, /if\(!Number\.isFinite\(legacyRate\) \|\| legacyRate < 0\)\{\s*var quarantineKey = quarantineLegacySvcRate\(legacyRaw\);\s*if\(quarantineKey\)\{\s*localStorage\.removeItem\(SVC_RATE_KEY\);\s*localStorage\.setItem\(SVC_RATE_LEGACY_CONSUMED_KEY, '1'\);/);
});

test('svcRate: legacy value is parsed strictly (Number, not parseFloat) and negative rates are rejected', () => {
  // parseFloat("0.28-corrupt") === 0.28 — it silently reads a valid prefix off garbage input.
  // Number("0.28-corrupt") === NaN — the whole string must be clean or it's rejected outright.
  assert.doesNotMatch(html, /var legacyRate = parseFloat\(legacyRaw\);/);
  assert.match(html, /var legacyRate = Number\(String\(legacyRaw\)\.trim\(\)\);/);
  // Negative rates are treated the same as unparseable ones — quarantined, not imported.
  assert.match(html, /if\(!Number\.isFinite\(legacyRate\) \|\| legacyRate < 0\)\{/);
});

test('svcRate: zero rate is never replaced by the 0.20 fallback', () => {
  // Service page display: truck rate read directly, not `|| 0.20`.
  assert.match(html, /var rate   = selectedTruck && selectedTruck\.maintenanceRate != null \? Number\(selectedTruck\.maintenanceRate\) : getSvcRate\(\);/);
  // Truck form save: explicit NaN guard, not `parseFloat(...)||0.20` (which would clobber 0).
  assert.doesNotMatch(html, /maintenanceRate: parseFloat\(document\.getElementById\('tfMaintRate'\)\.value\)\|\|0\.20/);
  assert.match(html, /var maintRateInput = parseFloat\(document\.getElementById\('tfMaintRate'\)\.value\);\s*var maintRate = isNaN\(maintRateInput\) \? 0\.20 : maintRateInput;/);
  assert.match(html, /maintenanceRate: maintRate,/);
  // Service-page rate edit: explicit NaN guard, not `parseFloat(...)||0.20`.
  assert.doesNotMatch(html, /setSvcRate\(parseFloat\(this\.value\)\|\|0\.20\)/);
  assert.match(html, /function applySvcRateFromInput\(value, truckId\)\{\s*var v = parseFloat\(value\);\s*if\(isNaN\(v\)\) v = 0;/);
});

test('svcRate: editing the Service-page rate routes to the truck when one is selected, to the account default otherwise', () => {
  assert.match(html, /onchange="applySvcRateFromInput\(this\.value, \\'\'\+\(selectedTruck\?selectedTruck\.id:''\)\+'\\'\)"/);
  assert.match(html, /function applySvcRateFromInput\(value, truckId\)\{[\s\S]{0,300}if\(truckId\)\{\s*var list = loadTrucks\(\);/);
  assert.match(html, /list\[idx\]\.maintenanceRate = v; saveTrucks\(list\);/);
  assert.match(html, /\} else \{\s*setSvcRate\(v\);\s*\}/);
});

console.log('svcRate contract: ok');
