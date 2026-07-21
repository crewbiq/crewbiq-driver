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
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.locator('#setCompany')).toHaveCount(1);
  await expect(page.locator('#setTruckName')).toHaveCount(1);
  await expect(page.locator('#setUnit')).toHaveCount(1);
});
