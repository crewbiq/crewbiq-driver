import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  browserJson,
  loginFleetA,
  loginFleetB,
  makeRecordId,
  openFreshApplication,
  restoreFleet,
  restorePwa,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites(process.env, { requireFleetB: true });

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-stable-id-collision-contexts' });
});

function scenario(expectedResult, steps) {
  return {
    annotation: [
      { type: 'expected_result', description: expectedResult },
      ...steps.map(description => ({ type: 'step', description })),
    ],
  };
}

function tokenFrom(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.session_token).toBeTruthy();
  return response.body.session_token;
}

function truckSnapshot(truck) {
  return {
    id: String(truck?.id || ''),
    unitNumber: String(truck?.unitNumber || ''),
    make: String(truck?.make || ''),
    model: String(truck?.model || ''),
    plate: String(truck?.plate || ''),
    vin: String(truck?.vin || ''),
    company: String(truck?.company || ''),
    mc: String(truck?.mc || ''),
    active: truck?.active !== false,
  };
}

function loadSnapshot(load) {
  return {
    id: String(load?.id || ''),
    loadId: String(load?.loadId || ''),
    unitNumber: String(load?.unitNumber || ''),
    status: String(load?.status || ''),
    gross: Number(load?.gross || 0),
    loadedMiles: Number(load?.loadedMiles || 0),
    deadMiles: Number(load?.deadMiles || 0),
    notes: String(load?.notes || ''),
  };
}

function sortedIds(items) {
  return (Array.isArray(items) ? items : []).map(item => item?.id).filter(Boolean).sort();
}

async function collisionProbe(page, config, token, body) {
  return browserJson(page, config.orchestratorUrl, '/v1/sync/pwa', {
    method: 'POST',
    token,
    body,
  });
}

async function pendingQueueCount(page) {
  return page.evaluate(() => {
    const api = window.CrewBIQOfflineSync;
    return api && typeof api.pendingCount === 'function' ? api.pendingCount() : -1;
  });
}

async function safeRevoke(page, config, token, alias, observations) {
  if (!token) return;
  const response = await revokeSession(page, config, token);
  expect.soft(response.status).toBe(200);
  observations.push({ context: alias, cleanup: 'session-revoked', status: response.status });
}

test(
  'TENANT-ID-01 foreign stable IDs cannot mutate or reassign business rows',
  scenario(
    'Tenant B receives bounded HTTP 409 when reusing Tenant A manifest-owned truck and load IDs, the permanent rejection is not left in the offline retry queue, and both tenants retain their exact pre-probe fleet/load baselines.',
    [
      'Open clean independent Tenant A and Tenant B contexts.',
      'Login using the exact protected E2E identities.',
      'Capture Tenant A manifest-owned truck and driver-load rows plus both tenant baselines.',
      'Submit a Tenant B truck mutation using Tenant A exact truck ID.',
      'Require bounded normalized 409 without foreign owner or row details and no queued retry.',
      'Submit a Tenant B load mutation using Tenant A exact driver-load record ID.',
      'Require the same bounded terminal response and empty queue.',
      'Re-read both tenants and prove no IDs or target fields changed.',
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
      expect((await openFreshApplication(page, context, config)).cookies).toEqual([]);
      expect((await openFreshApplication(tenantBPage, tenantBContext, config)).cookies).toEqual([]);

      tokenA = tokenFrom(await loginFleetA(page, config));
      tokenB = tokenFrom(await loginFleetB(tenantBPage, config));
      expect(tokenA).not.toBe(tokenB);

      const fleetABeforeResponse = await restoreFleet(page, config, tokenA);
      const fleetBBeforeResponse = await restoreFleet(tenantBPage, config, tokenB);
      const pwaABeforeResponse = await restorePwa(page, config, tokenA);
      const pwaBBeforeResponse = await restorePwa(tenantBPage, config, tokenB);
      for (const response of [fleetABeforeResponse, fleetBBeforeResponse, pwaABeforeResponse, pwaBBeforeResponse]) {
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
      }

      const targetTruckId = config.fleetA.activeTruckIds[0];
      const targetLoadId = config.fleetA.driverLoadIds[0];
      const targetTruck = (fleetABeforeResponse.body.trucks || []).find(item => item.id === targetTruckId);
      const targetLoad = (pwaABeforeResponse.body.loads || []).find(item => item.id === targetLoadId);
      expect(targetTruck).toBeTruthy();
      expect(targetLoad).toBeTruthy();

      const truckBefore = truckSnapshot(targetTruck);
      const loadBefore = loadSnapshot(targetLoad);
      const aTruckIdsBefore = sortedIds(fleetABeforeResponse.body.trucks);
      const bTruckIdsBefore = sortedIds(fleetBBeforeResponse.body.trucks);
      const aLoadIdsBefore = sortedIds(pwaABeforeResponse.body.loads);
      const bLoadIdsBefore = sortedIds(pwaBBeforeResponse.body.loads);
      observations.push({
        step: 'captured-owner-baselines',
        tenant_a_truck_target_present: true,
        tenant_a_load_target_present: true,
        tenant_a_and_b_distinct: config.fleetA.ownerCrewbiqId !== config.fleetB.ownerCrewbiqId,
      });

      const marker = `${config.displayPrefix}TENANT-ID-01-${Date.now()}`.slice(0, 70);
      const commonDriver = {
        crewId: config.fleetB.authCrewbiqId,
        email: 'e2e-redacted@example.test',
      };
      const boundedClientError = {
        ok: false,
        error: 'Entity ID is already owned by another tenant',
      };

      const truckProbe = await collisionProbe(tenantBPage, config, tokenB, {
        record_id: makeRecordId(config, 'TENANT-ID-01', 'truck-collision'),
        type: 'driver_report',
        deviceId: 'e2e-tenant-id-truck-collision',
        driver: commonDriver,
        loads: [],
        ptiLog: [],
        ownerData: {
          trucks: [{
            ...targetTruck,
            id: targetTruckId,
            plate: marker,
            company: marker,
            active: true,
          }],
        },
      });
      expect(truckProbe.status).toBe(409);
      expect(truckProbe.body).toEqual(boundedClientError);
      expect(JSON.stringify(truckProbe.body)).not.toContain(config.fleetA.ownerCrewbiqId);
      expect(JSON.stringify(truckProbe.body)).not.toContain(targetTruckId);
      expect(await pendingQueueCount(tenantBPage)).toBe(0);
      observations.push({
        step: 'foreign-truck-id-rejected',
        status: truckProbe.status,
        bounded_detail: true,
        foreign_identifiers_exposed: false,
        terminal_rejection_queued: false,
      });

      const loadProbe = await collisionProbe(tenantBPage, config, tokenB, {
        record_id: makeRecordId(config, 'TENANT-ID-01', 'load-collision'),
        type: 'driver_report',
        deviceId: 'e2e-tenant-id-load-collision',
        driver: commonDriver,
        loads: [{
          ...targetLoad,
          id: targetLoadId,
          loadId: targetLoad.loadId,
          notes: marker,
          status: 'success',
        }],
        ptiLog: [],
        ownerData: null,
      });
      expect(loadProbe.status).toBe(409);
      expect(loadProbe.body).toEqual(boundedClientError);
      expect(JSON.stringify(loadProbe.body)).not.toContain(config.fleetA.ownerCrewbiqId);
      expect(JSON.stringify(loadProbe.body)).not.toContain(targetLoadId);
      expect(await pendingQueueCount(tenantBPage)).toBe(0);
      observations.push({
        step: 'foreign-load-id-rejected',
        status: loadProbe.status,
        bounded_detail: true,
        foreign_identifiers_exposed: false,
        terminal_rejection_queued: false,
      });

      const fleetAAfterResponse = await restoreFleet(page, config, tokenA);
      const fleetBAfterResponse = await restoreFleet(tenantBPage, config, tokenB);
      const pwaAAfterResponse = await restorePwa(page, config, tokenA);
      const pwaBAfterResponse = await restorePwa(tenantBPage, config, tokenB);
      for (const response of [fleetAAfterResponse, fleetBAfterResponse, pwaAAfterResponse, pwaBAfterResponse]) {
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
      }

      expect(sortedIds(fleetAAfterResponse.body.trucks)).toEqual(aTruckIdsBefore);
      expect(sortedIds(fleetBAfterResponse.body.trucks)).toEqual(bTruckIdsBefore);
      expect(sortedIds(pwaAAfterResponse.body.loads)).toEqual(aLoadIdsBefore);
      expect(sortedIds(pwaBAfterResponse.body.loads)).toEqual(bLoadIdsBefore);

      const truckAfter = (fleetAAfterResponse.body.trucks || []).find(item => item.id === targetTruckId);
      const loadAfter = (pwaAAfterResponse.body.loads || []).find(item => item.id === targetLoadId);
      expect(truckSnapshot(truckAfter)).toEqual(truckBefore);
      expect(loadSnapshot(loadAfter)).toEqual(loadBefore);
      observations.push({
        step: 'verified-no-business-row-mutation',
        tenant_a_truck_unchanged: true,
        tenant_a_load_unchanged: true,
        tenant_b_fleet_unchanged: true,
        tenant_b_loads_unchanged: true,
      });
    } finally {
      await safeRevoke(page, config, tokenA, 'tenant-a', observations);
      await safeRevoke(tenantBPage, config, tokenB, 'tenant-b', observations);
      try {
        await attachSafeObservations(testInfo, 'tenant-stable-id-collision-observations', observations);
      } finally {
        await tenantBContext.close();
      }
    }
  },
);
