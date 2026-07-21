import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.setItem('fiqD_userRole', 'fleet');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Svc Rate Tester', email: 'svcrate@example.test', crewId: 'CREW-SVCRATE-TEST',
      unitNumber: 'SR-01', syncUrl: '', payType: 'cpm', cpmRate: 0,
    }));
  });
  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    const blocker = document.getElementById('ptiBlocker');
    if (blocker) blocker.classList.remove('show');
    applyRoleUI();
  });
});

test('svcRate no longer leaks between accounts on the same device', async ({ page }) => {
  const result = await page.evaluate(() => {
    setSvcRate(0.35); // Account A sets their own default
    const aRate = getSvcRate();

    applyAuthRestoreData({ crewId: 'CREW-SVCRATE-OTHER', email: 'other@example.test' }, ''); // A -> B
    const bRateBeforeSet = getSvcRate(); // must NOT be 0.35

    setSvcRate(0.45); // B sets their own, different default
    const bRate = getSvcRate();

    applyAuthRestoreData({ crewId: 'CREW-SVCRATE-TEST', email: 'svcrate@example.test' }, ''); // B -> A
    const aRateAfterReturn = getSvcRate(); // A's own default must still be 0.35

    return { aRate, bRateBeforeSet, bRate, aRateAfterReturn };
  });
  expect(result.aRate).toBe(0.35);
  expect(result.bRateBeforeSet).toBe(0.20); // B never saw A's rate — plain default, not a leak
  expect(result.bRate).toBe(0.45);
  expect(result.aRateAfterReturn).toBe(0.35);
});

test('legacy fiqD_svcRate imports once into the current account\'s scope and never overwrites an existing scoped default', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_svcRate', '0.28');
    const firstRead = getSvcRate(); // should import the legacy value
    const scopedAfterImport = loadAccountSvcRateDefault();

    // A second account on this device must NOT inherit the same legacy value automatically —
    // simulate by explicitly setting a different scoped default and confirming import is skipped.
    saveAccountSvcRateDefault(0.99);
    localStorage.setItem('fiqD_svcRate', '0.11'); // legacy key changes again
    const secondRead = getSvcRate(); // must stay 0.99, not re-import 0.11

    return { firstRead, scopedAfterImport, secondRead };
  });
  expect(result.firstRead).toBe(0.28);
  expect(result.scopedAfterImport).toBe(0.28);
  expect(result.secondRead).toBe(0.99); // existing scoped default was never clobbered
});

test('the real leak: legacy 0.28 imported by A must NOT re-appear for B after an account switch', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_svcRate', '0.28');
    const aImported = getSvcRate(); // A imports and consumes the legacy value
    const legacyGoneAfterA = localStorage.getItem('fiqD_svcRate');
    const consumedMarkerSet = !!localStorage.getItem('fiqD_svcRateLegacyConsumed');

    applyAuthRestoreData({ crewId: 'CREW-SVCRATE-OTHER', email: 'other@example.test' }, ''); // A -> B
    const bRate = getSvcRate(); // must be the plain default, not A's imported 0.28
    const bScoped = loadAccountSvcRateDefault(); // B must have no scoped default of its own

    return { aImported, legacyGoneAfterA, consumedMarkerSet, bRate, bScoped };
  });
  expect(result.aImported).toBe(0.28);
  expect(result.legacyGoneAfterA).toBeNull(); // retired immediately on successful, verified import
  expect(result.consumedMarkerSet).toBe(true);
  expect(result.bRate).toBe(0.20); // NOT 0.28 — this is the leak that was found and must stay closed
  expect(result.bScoped).toBeNull();
});

test('a corrupted scoped default (non-numeric tampering) is treated as absent, not NaN', async ({ page }) => {
  const result = await page.evaluate(() => {
    // Simulate storage corruption directly, bypassing saveAccountSvcRateDefault().
    localStorage.setItem('fiqD_' + dataKey('svcRateDefault'), JSON.stringify('not-a-number'));
    return { scoped: loadAccountSvcRateDefault(), rate: getSvcRate() };
  });
  expect(result.scoped).toBeNull(); // Number.isFinite() rejects it rather than returning NaN
  expect(Number.isFinite(result.rate)).toBe(true);
  expect(result.rate).toBe(0.20);
});

test('an unparseable legacy value is quarantined, not lost, and the legacy key is retired', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_svcRate', 'not-a-rate-at-all');
    const rate = getSvcRate();
    const legacyAfter = localStorage.getItem('fiqD_svcRate');
    const quarantineKeys = Object.keys(localStorage).filter(k => k.startsWith('fiqD_svcRate_quarantine_'));
    const quarantinedRaw = quarantineKeys.length ? localStorage.getItem(quarantineKeys[0]) : null;
    return { rate, legacyAfter, quarantineKeys, quarantinedRaw };
  });
  expect(result.rate).toBe(0.20); // falls back cleanly, no NaN leaks out
  expect(result.legacyAfter).toBeNull(); // retired — quarantining counts as a resolved outcome
  expect(result.quarantineKeys.length).toBe(1);
  expect(result.quarantinedRaw).toBe('not-a-rate-at-all');
});

test('a partially-corrupted legacy value like "0.28-corrupt" is quarantined whole, not silently truncated to 0.28', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_svcRate', '0.28-corrupt');
    const rate = getSvcRate();
    const legacyAfter = localStorage.getItem('fiqD_svcRate');
    const quarantineKeys = Object.keys(localStorage).filter(k => k.startsWith('fiqD_svcRate_quarantine_'));
    const quarantinedRaw = quarantineKeys.length ? localStorage.getItem(quarantineKeys[0]) : null;
    return { rate, legacyAfter, quarantineKeys, quarantinedRaw };
  });
  // Number("0.28-corrupt") is NaN (unlike parseFloat, which would silently read 0.28 off the
  // front) — the whole malformed string is quarantined, never partially trusted.
  expect(result.rate).toBe(0.20);
  expect(result.legacyAfter).toBeNull();
  expect(result.quarantineKeys.length).toBe(1);
  expect(result.quarantinedRaw).toBe('0.28-corrupt');
});

test('a negative legacy rate is rejected and quarantined, not imported as a valid rate', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('fiqD_svcRate', '-0.5');
    const rate = getSvcRate();
    const legacyAfter = localStorage.getItem('fiqD_svcRate');
    const quarantineKeys = Object.keys(localStorage).filter(k => k.startsWith('fiqD_svcRate_quarantine_'));
    const quarantinedRaw = quarantineKeys.length ? localStorage.getItem(quarantineKeys[0]) : null;
    return { rate, legacyAfter, quarantineKeys, quarantinedRaw };
  });
  expect(result.rate).toBe(0.20);
  expect(result.legacyAfter).toBeNull();
  expect(result.quarantineKeys.length).toBe(1);
  expect(result.quarantinedRaw).toBe('-0.5');
});

test('legacy svcRate import never propagates into any truck\'s own maintenanceRate', async ({ page }) => {
  const result = await page.evaluate(() => {
    saveTrucks([{
      id: 'truck_svc_1', unitNumber: 'SR-01', make: 'Freightliner', model: 'Cascadia', plate: 'SR01',
      maintenanceRate: 0.5, carrierAssignment: {}, vin: '', purchaseCost: 0, active: true,
    }]);
    localStorage.setItem('fiqD_svcRate', '0.15');
    getSvcRate(); // triggers the one-time import
    return loadTrucks()[0].maintenanceRate;
  });
  expect(result).toBe(0.5); // untouched by the legacy default import
});

test('a deliberately saved zero maintenance rate is preserved, not replaced by 0.20', async ({ page }) => {
  const result = await page.evaluate(() => {
    saveAccountSvcRateDefault(0);
    const accountZero = loadAccountSvcRateDefault();

    saveTrucks([{
      id: 'truck_svc_zero', unitNumber: 'SR-02', make: 'Kenworth', model: 'T680', plate: 'SR02',
      maintenanceRate: 0, carrierAssignment: {}, vin: '', purchaseCost: 0, active: true,
    }]);
    const truckZero = loadTrucks()[0].maintenanceRate;

    return { accountZero, truckZero };
  });
  expect(result.accountZero).toBe(0);
  expect(result.truckZero).toBe(0);
});

test('editing the Service-page rate with a truck selected updates that truck, not the account default', async ({ page }) => {
  await page.evaluate(() => {
    saveTrucks([{
      id: 'truck_svc_edit', unitNumber: 'SR-01', make: 'Freightliner', model: 'Cascadia', plate: 'SR01',
      maintenanceRate: 0.2, carrierAssignment: {}, vin: '', purchaseCost: 0, active: true,
    }]);
    saveAccountSvcRateDefault(0.2);
    showPage('service');
  });
  await page.evaluate(() => applySvcRateFromInput('0.6', 'truck_svc_edit'));
  const result = await page.evaluate(() => ({
    truckRate: loadTrucks().find(t => t.id === 'truck_svc_edit').maintenanceRate,
    accountDefault: loadAccountSvcRateDefault(),
  }));
  expect(result.truckRate).toBe(0.6);
  expect(result.accountDefault).toBe(0.2); // untouched — the edit went to the truck, not here
});

test('editing the Service-page rate with no truck selected updates only the account default', async ({ page }) => {
  await page.evaluate(() => {
    saveTrucks([]);
    saveAccountSvcRateDefault(0.2);
  });
  await page.evaluate(() => applySvcRateFromInput('0.33', ''));
  const result = await page.evaluate(() => loadAccountSvcRateDefault());
  expect(result).toBe(0.33);
});
