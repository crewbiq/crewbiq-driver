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

const CANONICAL_CAPABILITY = 'canonical.company_truck.reconcile';
const OWNER_ME_RESPONSE = {
  ok: true,
  user: {
    ...ME_RESPONSE.user,
    email: 'owner@example.test',
    roles: ['owner_op'],
    memberships: [{
      ...ME_RESPONSE.user.memberships[0],
      id: 'membership-owner',
      roles: ['owner_op'],
      capabilities: [CANONICAL_CAPABILITY],
      workspace: { id: 'workspace-fleet', key: 'company:road-test', type: 'fleet', name: 'Road Test Fleet' },
    }],
    active_workspace_id: 'workspace-fleet',
  },
};

const CANONICAL_RESPONSE = {
  workspace_id: 'workspace-fleet',
  capability: CANONICAL_CAPABILITY,
  companies: [{ id: 'company-verified-1', legal_name: 'Verified Carrier LLC' }],
  company_candidates: [{ id: 'company-candidate-1', entered_name: 'Candidate Carrier' }],
  trucks: [{ id: 'truck-verified-1', vin: '1M1AN4GY5KM002234' }],
  truck_candidates: [{ id: 'truck-candidate-1', unit_number_hint: 'UNIT-77' }],
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

test('owner capability loads the server-active canonical read model without mutating local Company or Truck records', async ({ page }) => {
  await page.evaluate(() => {
    saveCompanies([{ id: 'local-company', name: 'Local Carrier', logo: '' }]);
    saveTrucks([{ id: 'local-truck', unitNumber: 'LOCAL-01', vin: 'LOCALVIN', active: true }]);
  });
  const before = await page.evaluate(() => ({ companies: JSON.stringify(loadCompanies()), trucks: JSON.stringify(loadTrucks()) }));
  let canonicalUrl = '';
  await page.route(`${ORCH_BASE}/v1/auth/login`, route => fulfillJson(route, 200, { ok: true, session_token: 'token-owner' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, OWNER_ME_RESPONSE));
  await page.route(`${ORCH_BASE}/v1/canonical/company-truck`, route => {
    canonicalUrl = route.request().url();
    return fulfillJson(route, 200, CANONICAL_RESPONSE);
  });

  await page.fill('#orchEmail', 'owner@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');

  await expect(page.locator('#orchCanonicalStatus')).toContainText('Companies: 1 verified/canonical, 1 candidates');
  await expect(page.locator('#orchCanonicalStatus')).toContainText('Trucks: 1 canonical, 1 candidates');
  await expect(page.locator('#orchCanonicalStatus')).toContainText('Candidate Carrier');
  await expect(page.locator('#orchCanonicalStatus')).toContainText('UNIT-77');
  expect(new URL(canonicalUrl).search).toBe('');
  const after = await page.evaluate(() => ({
    companies: JSON.stringify(loadCompanies()),
    trucks: JSON.stringify(loadTrucks()),
    cache: loadOrchestratorCanonicalRead(),
  }));
  expect(after.companies).toBe(before.companies);
  expect(after.trucks).toBe(before.trucks);
  expect(after.cache.workspaceId).toBe('workspace-fleet');
  expect(after.cache.status).toBe('ready');
});

test('driver membership without capability never calls the canonical endpoint and keeps local fallback active', async ({ page }) => {
  let canonicalCalls = 0;
  await page.route(`${ORCH_BASE}/v1/auth/login`, route => fulfillJson(route, 200, { ok: true, session_token: 'token-driver' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, ME_RESPONSE));
  await page.route(`${ORCH_BASE}/v1/canonical/company-truck`, route => {
    canonicalCalls++;
    return fulfillJson(route, 403, { detail: 'capability required' });
  });

  await page.fill('#orchEmail', 'driver@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');

  await expect(page.locator('#orchCanonicalStatus')).toContainText('not available for this workspace role');
  await expect(page.locator('#orchCanonicalRead')).toContainText('Local fallback');
  expect(canonicalCalls).toBe(0);
});

test('canonical service failure leaves Settings usable and never replaces local data', async ({ page }) => {
  await page.evaluate(() => saveTrucks([{ id: 'local-truck', unitNumber: 'SAFE-01', active: true }]));
  const before = await page.evaluate(() => JSON.stringify(loadTrucks()));
  await page.route(`${ORCH_BASE}/v1/auth/login`, route => fulfillJson(route, 200, { ok: true, session_token: 'token-owner' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, OWNER_ME_RESPONSE));
  await page.route(`${ORCH_BASE}/v1/canonical/company-truck`, route => fulfillJson(route, 503, { detail: 'canonical registry unavailable' }));

  await page.fill('#orchEmail', 'owner@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');

  await expect(page.locator('#orchCanonicalStatus')).toContainText('Canonical registry unavailable');
  await expect(page.locator('#setEmail')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(loadTrucks()))).toBe(before);
});

test('failed refresh preserves and labels the last matching workspace cache as stale', async ({ page }) => {
  let canonicalCalls = 0;
  await page.route(`${ORCH_BASE}/v1/auth/login`, route => fulfillJson(route, 200, { ok: true, session_token: 'token-owner' }));
  await page.route(`${ORCH_BASE}/v1/me`, route => fulfillJson(route, 200, OWNER_ME_RESPONSE));
  await page.route(`${ORCH_BASE}/v1/canonical/company-truck`, route => {
    canonicalCalls++;
    if(canonicalCalls === 1) return fulfillJson(route, 200, CANONICAL_RESPONSE);
    return fulfillJson(route, 503, { detail: 'temporary outage' });
  });

  await page.fill('#orchEmail', 'owner@example.test');
  await page.fill('#orchPassword', 'a-strong-password');
  await page.click('#orchLoginBtn');
  await expect(page.locator('#orchCanonicalStatus')).toContainText('Candidate Carrier');

  await page.click('#orchRefreshReadBtn');
  await expect(page.locator('#orchCanonicalStatus')).toContainText('Candidate Carrier');
  await expect(page.locator('#orchCanonicalStatus')).toContainText('Cached copy; last refresh failed: temporary outage');
  const cache = await page.evaluate(() => loadOrchestratorCanonicalRead());
  expect(cache.stale).toBe(true);
  expect(cache.workspaceId).toBe('workspace-fleet');
});
