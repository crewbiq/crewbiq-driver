import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const prototypeUrl = pathToFileURL(path.resolve('prototype/crewbiq-next/crewbiq-next-standalone.html')).href;

for (const width of [360, 390, 412, 430]) {
  test(`standalone prototype fits a ${width}px phone viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.goto(prototypeUrl);
    await page.getByRole('button', { name: 'Enter prototype' }).click();

    await expect(page.locator('.rail')).toBeHidden();
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.role-switch')).toBeVisible();
    await expect(page.locator('.role-switch button')).toHaveCount(3);

    const overflow = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.root).toBeLessThanOrEqual(overflow.viewport + 1);

    await page.getByRole('button', { name: 'Open Functions' }).click();
    const cards = await page.locator('.function-card').evaluateAll(nodes => nodes.slice(0, 2).map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, height: box.height };
    }));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(width + 1);
      expect(card.height).toBeGreaterThanOrEqual(44);
    }
    if (width <= 390) expect(cards[1].top).toBeGreaterThan(cards[0].top);
    else expect(Math.abs(cards[1].top - cards[0].top)).toBeLessThan(2);

    await page.locator('[data-quick]').click();
    await expect(page.locator('#quickSheet')).toHaveClass(/show/);
    await page.waitForTimeout(450);
    const sheet = await page.locator('#quickSheet').evaluate(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    expect(sheet.left).toBeGreaterThanOrEqual(0);
    expect(sheet.right).toBeLessThanOrEqual(width + 1);
    expect(sheet.top).toBeGreaterThanOrEqual(0);
    expect(sheet.bottom).toBeLessThanOrEqual(821);
  });
}
