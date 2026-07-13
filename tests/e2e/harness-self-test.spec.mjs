import { test, expect } from './fixtures/observability.mjs';

test('HARNESS-SELF-01 captures browser evidence', async ({ page }) => {
  const endpoint = 'https://e2e.crewbiq.test/api/self-test';
  await page.route(endpoint, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, source: 'synthetic' }),
  }));
  await page.setContent(`
    <main>
      <h1>CrewBIQ E2E Harness</h1>
      <p data-testid="status">ready</p>
    </main>
  `);

  console.log('CrewBIQ harness self-test page ready');
  await expect(page.getByRole('heading', { name: 'CrewBIQ E2E Harness' })).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('ready');
  const response = await page.evaluate(async url => {
    const result = await fetch(url);
    return { status: result.status, body: await result.json() };
  }, endpoint);
  expect(response).toEqual({
    status: 200,
    body: { ok: true, source: 'synthetic' },
  });
});
