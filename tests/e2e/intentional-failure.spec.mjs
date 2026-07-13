import { test, expect } from './fixtures/observability.mjs';

test('HARNESS-FAIL-01 records controlled evidence @intentional-failure', async ({ page }) => {
  test.skip(
    process.env.E2E_RUN_INTENTIONAL_FAILURE !== '1',
    'Run only through the explicit intentional-failure command.',
  );

  const endpoint = 'https://e2e.crewbiq.test/api/intentional-failure';
  await page.route(endpoint, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: false, reason: 'intentional_harness_failure' }),
  }));
  await page.setContent('<main><h1>Intentional harness failure</h1></main>');
  await page.evaluate(url => fetch(url), endpoint);
  console.warn('Intentional harness failure is about to run');

  await expect(page.getByTestId('element-that-must-not-exist')).toBeVisible();
});
