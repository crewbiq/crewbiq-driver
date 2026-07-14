import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  browserJson,
  loginFleetA,
  openFreshApplication,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();
const legacySentinelUrl = 'https://legacy-fallback.invalid/e2e';
const legacySentinelPattern = 'https://legacy-fallback.invalid/**';

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'fresh-independent-browser-context' });
});

function scenario(expectedResult, steps) {
  return {
    annotation: [
      { type: 'expected_result', description: expectedResult },
      ...steps.map(description => ({ type: 'step', description })),
    ],
  };
}

async function login(page, config) {
  return loginFleetA(page, config);
}

async function revoke(page, config, token) {
  return revokeSession(page, config, token);
}

test(
  'AUTH-01 login preserves application role and effective owner',
  scenario(
    'Login and /v1/me agree on the fleet role, auth identity, and manifest-derived effective owner.',
    ['Open a fresh context.', 'Login through Orchestrator.', 'Compare login with authenticated /v1/me.', 'Revoke session.'],
  ),
  async ({ page, context }) => {
    const config = prerequisites.config;
    let token = '';
    const initialState = await openFreshApplication(page, context, config);
    expect(initialState.cookies).toEqual([]);
    expect(initialState.origins).toEqual([]);
    try {
      const loginResponse = await login(page, config);
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.ok).toBe(true);
      token = loginResponse.body.session_token;
      expect(token).toBeTruthy();
      expect(loginResponse.body.user.crewbiq_id).toBe(config.fleetA.authCrewbiqId);
      expect(loginResponse.body.roles).toContain(config.fleetA.applicationRole);
      expect(loginResponse.body.effective_owner_crewbiq_id).toBe(config.fleetA.ownerCrewbiqId);

      const me = await browserJson(page, config.orchestratorUrl, '/v1/me', { token });
      expect(me.status).toBe(200);
      expect(me.body.user.crewbiq_id).toBe(config.fleetA.authCrewbiqId);
      expect(me.body.user.roles).toContain(config.fleetA.applicationRole);
      expect(me.body.user.effective_owner_crewbiq_id).toBe(config.fleetA.ownerCrewbiqId);
    } finally {
      if (token) expect.soft((await revoke(page, config, token)).status).toBe(200);
    }
  },
);

test(
  'AUTH-02 logout revokes session and protected endpoint returns 401',
  scenario(
    'After authenticated logout, the same Bearer session receives HTTP 401 from /v1/me.',
    ['Open a fresh context.', 'Login.', 'Logout with Bearer session.', 'Call /v1/me with the revoked session.'],
  ),
  async ({ page, context }) => {
    const config = prerequisites.config;
    let token = '';
    let loggedOut = false;
    const initialState = await openFreshApplication(page, context, config);
    expect(initialState.cookies).toEqual([]);
    expect(initialState.origins).toEqual([]);
    try {
      const loginResponse = await login(page, config);
      expect(loginResponse.status).toBe(200);
      token = loginResponse.body.session_token;
      expect(token).toBeTruthy();

      const logout = await revoke(page, config, token);
      expect(logout.status).toBe(200);
      loggedOut = true;
      const me = await browserJson(page, config.orchestratorUrl, '/v1/me', { token });
      expect(me.status).toBe(401);
    } finally {
      if (token && !loggedOut) await revoke(page, config, token);
    }
  },
);

test(
  'RESTORE-01 clean context restores active trucks and driver profiles',
  scenario(
    'Authenticated PWA restore returns manifest-owned active rows and omits manifest-owned inactive rows.',
    ['Open an independent clean context.', 'Login.', 'GET authenticated /v1/fleet/config/pwa.', 'Compare IDs with manifest.', 'Revoke session.'],
  ),
  async ({ page, context }) => {
    const config = prerequisites.config;
    let token = '';
    const initialState = await openFreshApplication(page, context, config);
    expect(initialState.cookies).toEqual([]);
    expect(initialState.origins).toEqual([]);
    try {
      const loginResponse = await login(page, config);
      expect(loginResponse.status).toBe(200);
      token = loginResponse.body.session_token;
      expect(token).toBeTruthy();

      const restore = await browserJson(page, config.orchestratorUrl, '/v1/fleet/config/pwa', { token });
      expect(restore.status).toBe(200);
      expect(restore.body.ok).toBe(true);
      const truckIds = restore.body.trucks.map(item => item.id);
      const profileIds = restore.body.driver_profiles.map(item => item.id);
      for (const id of config.fleetA.activeTruckIds) expect(truckIds).toContain(id);
      for (const id of config.fleetA.inactiveTruckIds) expect(truckIds).not.toContain(id);
      for (const id of config.fleetA.activeDriverProfileIds) expect(profileIds).toContain(id);
      for (const id of config.fleetA.inactiveDriverProfileIds) expect(profileIds).not.toContain(id);
    } finally {
      if (token) expect.soft((await revoke(page, config, token)).status).toBe(200);
    }
  },
);

test(
  'LEGACY-01 Orchestrator failure does not start silent Google fallback',
  scenario(
    'A forced Orchestrator network failure produces no request to the non-routable legacy sentinel.',
    ['Open a fresh staging PWA.', 'Login.', 'Configure synthetic sync state.', 'Fail Orchestrator network.', 'Assert no legacy request.', 'Revoke session.'],
  ),
  async ({ page, context }) => {
    const config = prerequisites.config;
    const legacyRequests = [];
    let token = '';
    await page.route(legacySentinelPattern, async route => {
      legacyRequests.push({ method: route.request().method(), url: route.request().url() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    const initialState = await openFreshApplication(page, context, config);
    expect(initialState.cookies).toEqual([]);
    expect(initialState.origins).toEqual([]);
    try {
      const loginResponse = await login(page, config);
      expect(loginResponse.status).toBe(200);
      token = loginResponse.body.session_token;
      expect(token).toBeTruthy();

      await page.evaluate(({ legacyUrl, orchestratorSyncUrl, sessionToken, crewbiqId }) => {
        const state = {
          driver: { crewId: crewbiqId, email: 'e2e-redacted@example.test', syncUrl: legacyUrl },
          loads: [],
          ptiLog: [],
          timer: null,
        };
        localStorage.setItem('fiqD_sessionToken', sessionToken);
        localStorage.setItem('fiqD_orchestratorUrl', orchestratorSyncUrl);
        localStorage.setItem('fiqD_orchestratorUrlBackup', orchestratorSyncUrl);
        const syncInput = document.getElementById('setSyncUrl');
        const orchestratorInput = document.getElementById('setOrchestratorUrl');
        if (syncInput) syncInput.value = legacyUrl;
        if (orchestratorInput) orchestratorInput.value = orchestratorSyncUrl;
        window.CrewBIQSync.init({
          getDriver: () => state.driver,
          getLoads: () => state.loads,
          setLoads: value => { state.loads = value; },
          getPtiLog: () => state.ptiLog,
          setPtiLog: value => { state.ptiLog = value; },
          saveAll: () => {},
          getTimer: () => state.timer,
          setTimer: value => { state.timer = value; },
          renderAll: () => {},
        });
      }, {
        legacyUrl: legacySentinelUrl,
        orchestratorSyncUrl: endpoint(config.orchestratorUrl, '/v1/sync'),
        sessionToken: token,
        crewbiqId: config.fleetA.authCrewbiqId,
      });

      await page.route(`${config.orchestratorUrl}/**`, route => route.abort('failed'));
      await page.evaluate(() => window.CrewBIQSync.doSync({ forceAll: true }));
      expect(legacyRequests).toEqual([]);
    } finally {
      await page.unroute(`${config.orchestratorUrl}/**`);
      await page.unroute(legacySentinelPattern);
      if (token) expect.soft((await revoke(page, config, token)).status).toBe(200);
    }
  },
);
