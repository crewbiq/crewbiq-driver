import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.setItem('fiqD_userRole', 'driver');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Navigation Tester',
      email: 'navigation@example.test',
      crewId: 'CREW-NAV-TEST',
      unitNumber: 'NAV-01',
      syncUrl: '',
      payType: 'cpm',
      cpmRate: 0,
    }));
  });
  await page.reload();
  await page.evaluate(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none';
    const ptiBlocker = document.getElementById('ptiBlocker');
    if (ptiBlocker) ptiBlocker.classList.remove('show');
    applyRoleUI();
  });
});

test('driver navigation exposes domain hubs and global add', async ({ page }) => {
  await expect(page.locator('.navbtn[data-page="home"]')).toBeVisible();
  await expect(page.locator('.navbtn[data-page="work"]')).toBeVisible();
  await expect(page.locator('.navbtn[data-page="truck"]')).toBeVisible();
  await expect(page.locator('.navbtn[data-page="team"]')).toBeHidden();
  await expect(page.locator('.navbtn[data-page="money"]')).toBeVisible();
  await page.getByRole('button', { name: 'Add' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add' });
  await expect(addDialog).toBeVisible();
  await expect(addDialog.locator('.quick-add-item', { hasText: 'Load' })).toBeVisible();
  await expect(addDialog.locator('.quick-add-item', { hasText: 'Expense' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Add' })).toBeHidden();
  await page.getByRole('button', { name: 'Work' }).click();
  await expect(page.locator('#page-work')).toHaveClass(/active/);
});

test('fleet role replaces Truck with Team and maps vehicle pages to Team', async ({ page }) => {
  await page.evaluate(() => {
    setUserRole('fleet');
    applyRoleUI();
    showPage('fuel');
  });

  await expect(page.locator('.navbtn[data-page="team"]')).toBeVisible();
  await expect(page.locator('.navbtn[data-page="truck"]')).toBeHidden();
  await expect(page.locator('.navbtn[data-page="team"]')).toHaveClass(/active/);
});

test('all-functions view is grouped by domain and adapts to role', async ({ page }) => {
  await page.evaluate(() => showPage('menu'));
  await expect(page.locator('[data-function-group="Work"]')).toBeVisible();
  await expect(page.locator('[data-function-group="Truck"]')).toBeVisible();
  await expect(page.locator('[data-function-group="Money"]')).toBeVisible();
  await expect(page.locator('[data-function-group="Resources & account"]')).toBeVisible();
  await expect(page.locator('[data-function-group="Team"]')).toHaveCount(0);
  await expect(page.locator('[data-function-group="Truck"]')).not.toContainText('Fuel');

  await page.evaluate(() => {
    setUserRole('fleet');
    applyRoleUI();
  });
  await expect(page.locator('[data-function-group="Team"]')).toBeVisible();
  await expect(page.locator('[data-function-group="Truck"]')).toContainText('Fuel');
});
