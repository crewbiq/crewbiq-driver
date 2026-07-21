import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appUrl = pathToFileURL(path.resolve('index.html')).href;
const ORCH_BASE = 'https://crewbiq-orchestrator-production.up.railway.app';

function fulfillJson(route, status, body) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

const ME_RESPONSE = {
  ok: true,
  user: {
    crewbiq_id: 'CBQ-TESTDRIVER',
    email: 'driver@example.test',
    nickname: 'Test Driver',
    roles: ['driver'],
    person: { id: 'person-1', display_name: 'Test Driver' },
    memberships: [
      {
        id: 'membership-1',
        status: 'active',
        is_default: true,
        version: 1,
        roles: ['driver'],
        workspace: { id: 'workspace-1', key: 'legacy-owner:CBQ-TESTDRIVER', type: 'personal', name: 'Test Driver' },
      },
    ],
    active_workspace_id: 'workspace-1',
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.setItem('fiqD_userRole', 'driver');
    localStorage.setItem('fiqD_driver', JSON.stringify({
      name: 'Settings Tester', email: 'settings@example.test', crewId: 'CREW-ORCH-TEST',
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
  await page.locator('[data-settings-group="account"]').click();
});

test('unauthenticated view shows email/password fields and Login/Create Account buttons', async ({ page }) => {
  await expect(page.locator('#settingsOrchAccount #orchEmail')).toBeVisible();
  await expect(page.locator('#settingsOrchAccount #orchPassword')).toBeVisible();
  await expect(page.locator('#orchLoginBtn')).toBeVisible();
  await expect(page.locator('#orchRegisterBtn')).toBeVisible();
});

test('successful login fetches /v1/me and renders the authenticated view', async ({ page }) => {
  await page.route(`${ORCH_BASE}/v1/auth/login`, route =>
    fulfillJson(route, 200, { ok: true, session_token: 'token-abc' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, ME_RESPONSE));

  await page.fill('#orchEmail', 'driver@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');

  await expect(page.locator('#settingsOrchAccount')).toContainText('driver@example.test');
  await expect(page.locator('#settingsOrchAccount')).toContainText('Test Driver');
  await expect(page.locator('#orchWorkspaceSelect')).toBeVisible();
  await expect(page.locator('#orchDisconnectBtn')).toBeVisible();

  const session = await page.evaluate(() => loadOrchestratorSession());
  expect(session.sessionToken).toBe('token-abc');
  expect(session.me.crewbiq_id).toBe('CBQ-TESTDRIVER');
});

test('failed login shows an error toast and leaves the form in the unauthenticated state', async ({ page }) => {
  await page.route(`${ORCH_BASE}/v1/auth/login`, route =>
    fulfillJson(route, 401, { detail: 'Invalid email or password' }));

  await page.fill('#orchEmail', 'driver@example.test');
  await page.fill('#orchPassword', 'wrong-password');
  await page.click('#orchLoginBtn');

  await expect(page.locator('#toast')).toContainText('Orchestrator login failed');
  await expect(page.locator('#settingsOrchAccount #orchEmail')).toBeVisible();
  const session = await page.evaluate(() => loadOrchestratorSession());
  expect(session).toBeNull();
});

test('register behaves like login on success', async ({ page }) => {
  await page.route(`${ORCH_BASE}/v1/auth/register`, route =>
    fulfillJson(route, 201, { ok: true, session_token: 'token-new' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, ME_RESPONSE));

  await page.fill('#orchEmail', 'newdriver@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchRegisterBtn');

  await expect(page.locator('#settingsOrchAccount')).toContainText('driver@example.test');
  const session = await page.evaluate(() => loadOrchestratorSession());
  expect(session.sessionToken).toBe('token-new');
});

test('disconnect calls logout best-effort, clears the session, and reverts to the unauthenticated view', async ({ page }) => {
  await page.route(`${ORCH_BASE}/v1/auth/login`, route =>
    fulfillJson(route, 200, { ok: true, session_token: 'token-abc' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, ME_RESPONSE));
  let logoutCalled = false;
  await page.route(`${ORCH_BASE}/v1/auth/logout`, route => {
    logoutCalled = true;
    return fulfillJson(route, 200, { ok: true });
  });

  await page.fill('#orchEmail', 'driver@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');
  await expect(page.locator('#orchDisconnectBtn')).toBeVisible();

  await page.click('#orchDisconnectBtn');

  await expect(page.locator('#settingsOrchAccount #orchEmail')).toBeVisible();
  const session = await page.evaluate(() => loadOrchestratorSession());
  expect(session).toBeNull();
  expect(logoutCalled).toBe(true);
});

test('workspace selection updates the locally-cached active_workspace_id without any network call', async ({ page }) => {
  const twoMemberships = {
    ok: true,
    user: {
      ...ME_RESPONSE.user,
      memberships: [
        ME_RESPONSE.user.memberships[0],
        {
          id: 'membership-2', status: 'active', is_default: false, version: 1, roles: ['driver'],
          workspace: { id: 'workspace-2', key: 'legacy-owner:CBQ-OTHER', type: 'personal', name: 'Other Workspace' },
        },
      ],
    },
  };
  await page.route(`${ORCH_BASE}/v1/auth/login`, route =>
    fulfillJson(route, 200, { ok: true, session_token: 'token-abc' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, twoMemberships));

  await page.fill('#orchEmail', 'driver@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');
  await expect(page.locator('#orchWorkspaceSelect')).toBeVisible();

  let networkCallsAfterLogin = 0;
  await page.route(`${ORCH_BASE}/**`, route => { networkCallsAfterLogin++; return route.abort(); });

  await page.selectOption('#orchWorkspaceSelect', 'workspace-2');

  const session = await page.evaluate(() => loadOrchestratorSession());
  expect(session.activeWorkspaceIdOverride).toBe('workspace-2');
  expect(networkCallsAfterLogin).toBe(0);
});

test('a network failure never throws uncaught and leaves the rest of the Settings panel usable', async ({ page }) => {
  await page.route(`${ORCH_BASE}/v1/auth/login`, route => route.abort('failed'));

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err));

  await page.fill('#orchEmail', 'driver@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');

  await expect(page.locator('#toast')).toContainText('Orchestrator login failed');
  expect(pageErrors).toEqual([]);

  // The rest of the Account panel must still work normally.
  await expect(page.locator('#setEmail')).toBeVisible();
  await page.getByRole('button', { name: 'Back to settings' }).click();
  await expect(page.locator('[data-settings-group="account"]')).toBeVisible();
});
