import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  loginFleetA,
  loginFleetB,
  openFreshApplication,
  pushTenantSubstitutionProbe,
  readMe,
  restoreFleet,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites(process.env, { requireFleetB: true });

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(45_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-tenant-a-and-tenant-b-contexts' });
});

function scenario(expectedResult, steps) {
  return {
    annotation: [
      { type: 'expected_result', description: expectedResult },
      ...steps.map(description => ({ type: 'step', description })),
    ],
  };
}

function assertEmptyStorage(state) {
  expect(state.cookies).toEqual([]);
  expect(state.origins).toEqual([]);
}

function tokenFrom(loginResponse) {
  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.ok).toBe(true);
  expect(loginResponse.body.session_token).toBeTruthy();
  return loginResponse.body.session_token;
}

function fleetSnapshot(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  return {
    owner: response.body.crewbiq_id,
    truckIds: (Array.isArray(response.body.trucks) ? response.body.trucks : [])
      .map(item => item.id).filter(Boolean).sort(),
    driverProfileIds: (Array.isArray(response.body.driver_profiles) ? response.body.driver_profiles : [])
      .map(item => item.id).filter(Boolean).sort(),
  };
}

function allFixtureIds(contract) {
  return {
    trucks: [...contract.activeTruckIds, ...contract.inactiveTruckIds],
    driverProfiles: [...contract.activeDriverProfileIds, ...contract.inactiveDriverProfileIds],
  };
}

function assertTenantScope(snapshot, baseline, own, other) {
  const otherIds = allFixtureIds(other);
  expect(snapshot.truckIds).toEqual(baseline.truckIds);
  expect(snapshot.driverProfileIds).toEqual(baseline.driverProfileIds);
  for (const id of own.inactiveTruckIds) expect(snapshot.truckIds).not.toContain(id);
  for (const id of own.inactiveDriverProfileIds) expect(snapshot.driverProfileIds).not.toContain(id);
  for (const id of otherIds.trucks) expect(snapshot.truckIds).not.toContain(id);
  for (const id of otherIds.driverProfiles) expect(snapshot.driverProfileIds).not.toContain(id);
}

async function safeRevoke(page, config, token, alias, observations) {
  if (!token) return;
  try {
    const response = await revokeSession(page, config, token);
    expect.soft(response.status).toBe(200);
    observations.push({
      context: alias,
      method: 'POST',
      path: '/v1/auth/logout',
      status: response.status,
      cleanup: 'session-revoked',
    });
  } catch (error) {
    observations.push({
      context: alias,
      cleanup: 'session-revoke-failed',
      error_class: error && error.name ? error.name : 'Error',
    });
    expect.soft(false, `${alias} session cleanup failed`).toBe(true);
  }
}

test(
  'TENANT-01 client identity substitution cannot redirect read or write scope',
  scenario(
    'Fleet A and Fleet B remain isolated when query and sync payload owner fields claim the opposite tenant.',
    [
      'Open clean independent Tenant A and Tenant B browser contexts.',
      'Login with the exact E2E-FLEET-A and E2E-FLEET-B identities.',
      'Verify /v1/me returns distinct auth identities and effective owners from the manifest.',
      'Capture each tenant exact active fleet fixture set.',
      'Request each fleet while claiming the opposite owner in the query string.',
      'Submit an empty business-state sync probe from A whose client identity fields claim B.',
      'Verify both tenant exact fleet fixture sets remain unchanged and no cross-tenant IDs appear.',
      'Revoke both scenario sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const tenantBContext = await browser.newContext({ serviceWorkers: 'block' });
    const tenantBPage = await tenantBContext.newPage();
    const observations = [];
    let tokenA = '';
    let tokenB = '';

    try {
      assertEmptyStorage(await openFreshApplication(page, context, config));
      assertEmptyStorage(await openFreshApplication(tenantBPage, tenantBContext, config));

      const loginA = await loginFleetA(page, config);
      tokenA = tokenFrom(loginA);
      const loginB = await loginFleetB(tenantBPage, config);
      tokenB = tokenFrom(loginB);
      observations.push({
        step: 'login',
        tenant_a_status: loginA.status,
        tenant_b_status: loginB.status,
        distinct_sessions: tokenA !== tokenB,
      });
      expect(tokenA).not.toBe(tokenB);

      const meA = await readMe(page, config, tokenA);
      const meB = await readMe(tenantBPage, config, tokenB);
      expect(meA.status).toBe(200);
      expect(meB.status).toBe(200);
      expect(meA.body.user.crewbiq_id).toBe(config.fleetA.authCrewbiqId);
      expect(meA.body.user.effective_owner_crewbiq_id).toBe(config.fleetA.ownerCrewbiqId);
      expect(meB.body.user.crewbiq_id).toBe(config.fleetB.authCrewbiqId);
      expect(meB.body.user.effective_owner_crewbiq_id).toBe(config.fleetB.ownerCrewbiqId);
      expect(meA.body.user.crewbiq_id).not.toBe(meB.body.user.crewbiq_id);
      expect(meA.body.user.effective_owner_crewbiq_id)
        .not.toBe(meB.body.user.effective_owner_crewbiq_id);
      observations.push({
        step: 'me',
        tenant_a_status: meA.status,
        tenant_b_status: meB.status,
        auth_identities_distinct: true,
        effective_owners_distinct: true,
        roles_match_manifest: meA.body.user.roles.includes('fleet') && meB.body.user.roles.includes('fleet'),
      });

      const normalAResponse = await restoreFleet(page, config, tokenA);
      const normalBResponse = await restoreFleet(tenantBPage, config, tokenB);
      const normalA = fleetSnapshot(normalAResponse);
      const normalB = fleetSnapshot(normalBResponse);
      expect(normalA.owner).toBe(config.fleetA.ownerCrewbiqId);
      expect(normalB.owner).toBe(config.fleetB.ownerCrewbiqId);
      assertTenantScope(normalA, normalA, config.fleetA, config.fleetB);
      assertTenantScope(normalB, normalB, config.fleetB, config.fleetA);

      const hostileAResponse = await restoreFleet(
        page, config, tokenA, config.fleetB.ownerCrewbiqId,
      );
      const hostileBResponse = await restoreFleet(
        tenantBPage, config, tokenB, config.fleetA.ownerCrewbiqId,
      );
      const hostileA = fleetSnapshot(hostileAResponse);
      const hostileB = fleetSnapshot(hostileBResponse);
      expect(hostileA.owner).toBe(config.fleetA.ownerCrewbiqId);
      expect(hostileB.owner).toBe(config.fleetB.ownerCrewbiqId);
      expect(hostileA.truckIds).toEqual(normalA.truckIds);
      expect(hostileA.driverProfileIds).toEqual(normalA.driverProfileIds);
      expect(hostileB.truckIds).toEqual(normalB.truckIds);
      expect(hostileB.driverProfileIds).toEqual(normalB.driverProfileIds);
      assertTenantScope(hostileA, normalA, config.fleetA, config.fleetB);
      assertTenantScope(hostileB, normalB, config.fleetB, config.fleetA);
      observations.push({
        step: 'hostile-read-query',
        tenant_a_status: hostileAResponse.status,
        tenant_b_status: hostileBResponse.status,
        a_remained_a_scoped: true,
        b_remained_b_scoped: true,
        cross_tenant_ids_observed: false,
      });

      const probe = await pushTenantSubstitutionProbe(page, config, tokenA);
      expect(probe.status).toBe(200);
      expect(probe.body.record_id).toMatch(/^e2e_[A-Za-z0-9_-]+_tenant-01_audit_probe$/);

      const afterA = fleetSnapshot(await restoreFleet(page, config, tokenA));
      const afterB = fleetSnapshot(await restoreFleet(tenantBPage, config, tokenB));
      expect(afterA.owner).toBe(config.fleetA.ownerCrewbiqId);
      expect(afterB.owner).toBe(config.fleetB.ownerCrewbiqId);
      expect(afterA.truckIds).toEqual(normalA.truckIds);
      expect(afterA.driverProfileIds).toEqual(normalA.driverProfileIds);
      expect(afterB.truckIds).toEqual(normalB.truckIds);
      expect(afterB.driverProfileIds).toEqual(normalB.driverProfileIds);
      assertTenantScope(afterA, normalA, config.fleetA, config.fleetB);
      assertTenantScope(afterB, normalB, config.fleetB, config.fleetA);
      observations.push({
        step: 'hostile-write-probe',
        sync_status: probe.status,
        deterministic_idempotency_key: true,
        business_state_changed: false,
        cross_tenant_ids_observed: false,
        server_owner_handoff: 'verified-by-companion-orchestrator-regression',
      });
    } finally {
      await safeRevoke(page, config, tokenA, 'tenant-a', observations);
      await safeRevoke(tenantBPage, config, tokenB, 'tenant-b', observations);
      try {
        await attachSafeObservations(testInfo, 'tenant-isolation-observations', observations);
      } finally {
        await tenantBContext.close();
      }
    }
  },
);
