import { test, expect } from './fixtures/observability.mjs';
import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  attachSafeObservations,
  clone,
  exactlyOneById,
  loginFleetA,
  openFreshApplication,
  pushOwnerData,
  restoreFleet,
  revokeSession,
} from './support/staging-api.mjs';

const prerequisites = resolveStagingPrerequisites();

test.use({
  screenshot: 'off',
  trace: 'off',
  serviceWorkers: 'block',
});

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(45_000);
  test.skip(!prerequisites.ready, `not_run: ${prerequisites.reasons.join('; ')}`);
  testInfo.annotations.push({ type: 'context', description: 'isolated-fleet-a-browser-contexts' });
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

function activeFleetSnapshot(response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  return {
    trucks: Array.isArray(response.body.trucks) ? response.body.trucks : [],
    driverProfiles: Array.isArray(response.body.driver_profiles) ? response.body.driver_profiles : [],
  };
}

function softFleetSnapshot(response) {
  expect.soft(response && response.status).toBe(200);
  expect.soft(response && response.body && response.body.ok).toBe(true);
  return {
    trucks: Array.isArray(response && response.body && response.body.trucks)
      ? response.body.trucks : [],
    driverProfiles: Array.isArray(response && response.body && response.body.driver_profiles)
      ? response.body.driver_profiles : [],
  };
}

async function cleanupStep(label, observations, operation) {
  try {
    await operation();
    return true;
  } catch (error) {
    observations.push({
      cleanup: label,
      status: 'failed',
      error_class: error && error.name ? error.name : 'Error',
    });
    expect.soft(false, `${label} cleanup failed`).toBe(true);
    return false;
  }
}

async function softRevoke(page, config, token, observations, contextAlias) {
  if (!token) return;
  await cleanupStep(`revoke-${contextAlias}`, observations, async () => {
    const response = await revokeSession(page, config, token);
    expect.soft(response.status).toBe(200);
    observations.push({
      context: contextAlias,
      method: 'POST',
      path: '/v1/auth/logout',
      status: response.status,
      cleanup: 'session-revoked',
    });
  });
}

test(
  'DEVICE-01 phone edit appears on desktop with the same stable truck ID',
  scenario(
    'A manifest-owned truck update from one clean context appears in another context with the same ID, one row, and no fleet-count increase.',
    [
      'Open independent phone and desktop contexts.',
      'Login both as E2E-FLEET-A.',
      'Capture the exact manifest-owned truck before-state.',
      'Update only its plate through authenticated sync while preserving its ID.',
      'Restore on desktop and verify the same ID exactly once.',
      'Restore the exact before-state and revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const desktopContext = await browser.newContext({ serviceWorkers: 'block' });
    const desktopPage = await desktopContext.newPage();
    const observations = [];
    let phoneToken = '';
    let desktopToken = '';
    let originalTruck = null;
    let mutationApplied = false;

    try {
      assertEmptyStorage(await openFreshApplication(page, context, config));
      assertEmptyStorage(await openFreshApplication(desktopPage, desktopContext, config));

      const phoneLogin = await loginFleetA(page, config);
      phoneToken = tokenFrom(phoneLogin);
      observations.push({ context: 'phone', method: 'POST', path: '/v1/auth/login', status: phoneLogin.status });

      const desktopLogin = await loginFleetA(desktopPage, config);
      desktopToken = tokenFrom(desktopLogin);
      observations.push({ context: 'desktop', method: 'POST', path: '/v1/auth/login', status: desktopLogin.status });

      const beforeResponse = await restoreFleet(page, config, phoneToken);
      const before = activeFleetSnapshot(beforeResponse);
      const targetId = config.fleetA.activeTruckIds[0];
      const matches = exactlyOneById(before.trucks, targetId);
      expect(matches).toHaveLength(1);
      originalTruck = clone(matches[0]);
      const activeCountBefore = before.trucks.length;
      const marker = `${config.displayPrefix}DEVICE-01`.slice(0, 80);
      const editedTruck = { ...clone(originalTruck), id: targetId, plate: marker, active: true };

      const write = await pushOwnerData(
        page, config, phoneToken, { trucks: [editedTruck] }, 'DEVICE-01', 'write',
      );
      mutationApplied = write.status === 200;
      expect(write.status).toBe(200);
      observations.push({
        context: 'phone', method: 'POST', path: '/v1/sync/pwa', status: write.status,
        stable_id_preserved: true,
      });

      const desktopRestore = await restoreFleet(desktopPage, config, desktopToken);
      const after = activeFleetSnapshot(desktopRestore);
      const desktopMatches = exactlyOneById(after.trucks, targetId);
      expect(desktopMatches).toHaveLength(1);
      expect(desktopMatches[0].id).toBe(targetId);
      expect(desktopMatches[0].plate).toBe(marker);
      expect(after.trucks).toHaveLength(activeCountBefore);
      observations.push({
        context: 'desktop', method: 'GET', path: '/v1/fleet/config/pwa',
        status: desktopRestore.status, same_stable_id: true, duplicate_count: desktopMatches.length,
        active_count_unchanged: after.trucks.length === activeCountBefore,
      });
    } finally {
      if (mutationApplied && originalTruck && phoneToken) {
        await cleanupStep('device-before-state-rollback', observations, async () => {
          const rollback = await pushOwnerData(
            page, config, phoneToken, { trucks: [originalTruck] }, 'DEVICE-01', 'rollback',
          );
          expect.soft(rollback.status).toBe(200);
          observations.push({
            context: 'phone', method: 'POST', path: '/v1/sync/pwa',
            status: rollback.status, cleanup: 'restore-before-state',
          });
          if (desktopToken && rollback.status === 200) {
            const verify = await restoreFleet(desktopPage, config, desktopToken);
            const restored = softFleetSnapshot(verify);
            const restoredMatches = exactlyOneById(restored.trucks, originalTruck.id);
            expect.soft(restoredMatches).toHaveLength(1);
            if (restoredMatches.length === 1) {
              expect.soft(restoredMatches[0].plate || '').toBe(originalTruck.plate || '');
            }
          }
        });
      }
      await softRevoke(page, config, phoneToken, observations, 'phone');
      await softRevoke(desktopPage, config, desktopToken, observations, 'desktop');
      try {
        await attachSafeObservations(testInfo, 'fleet-device-observations', observations);
      } finally {
        await desktopContext.close();
      }
    }
  },
);

test(
  'EDIT-01 missing local edit target shows conflict and never creates a truck',
  scenario(
    'The real PWA truck edit form reports a visible conflict when its target disappears and does not create a replacement or duplicate.',
    [
      'Open a fresh authenticated staging PWA.',
      'Restore manifest-owned fleet arrays.',
      'Open the real truck edit form.',
      'Remove the target only from local storage without scheduling backend sync.',
      'Invoke the real saveTruckForm().',
      'Verify visible conflict and no replacement truck.',
      'Restore local before-state and revoke the session.',
    ],
  ),
  async ({ page, context }, testInfo) => {
    const config = prerequisites.config;
    const observations = [];
    let token = '';
    let localBefore = null;

    try {
      assertEmptyStorage(await openFreshApplication(page, context, config));
      token = tokenFrom(await loginFleetA(page, config));
      const restoreResponse = await restoreFleet(page, config, token);
      const restored = activeFleetSnapshot(restoreResponse);
      const targetId = config.fleetA.activeTruckIds[0];
      expect(exactlyOneById(restored.trucks, targetId)).toHaveLength(1);

      const result = await page.evaluate(({ ownerData, targetId }) => {
        if (
          typeof window.applyOwnerSyncData !== 'function'
          || typeof window.openTruckForm !== 'function'
          || typeof window.saveTruckForm !== 'function'
          || typeof window.loadTrucks !== 'function'
          || typeof window.scopedSave !== 'function'
        ) {
          return { unsupported: true };
        }
        window.applyOwnerSyncData(ownerData);
        const before = JSON.parse(JSON.stringify(window.loadTrucks()));
        const target = before.find(item => item.id === targetId);
        if (!target) return { targetMissing: true, before };

        window.openTruckForm(targetId);
        const plate = document.getElementById('tfPlate');
        if (plate) plate.value = 'SHOULD-NOT-BE-SAVED';
        window.scopedSave('trucks', before.filter(item => item.id !== targetId));
        window.saveTruckForm();

        const after = JSON.parse(JSON.stringify(window.loadTrucks()));
        const conflict = document.getElementById('tfConflict');
        return {
          before,
          after,
          conflictText: conflict ? conflict.textContent : '',
          conflictVisible: !!conflict && conflict.style.display !== 'none',
          modalOpen: !!document.getElementById('truckModalWrap'),
          createdWithEditedPlate: after.some(item => item.plate === 'SHOULD-NOT-BE-SAVED'),
        };
      }, {
        ownerData: { trucks: restored.trucks, driverProfiles: restored.driverProfiles },
        targetId,
      });

      expect(result.unsupported).not.toBe(true);
      expect(result.targetMissing).not.toBe(true);
      localBefore = result.before;
      expect(result.conflictVisible).toBe(true);
      expect(result.conflictText).toContain('Truck edit conflict');
      expect(result.modalOpen).toBe(true);
      expect(result.createdWithEditedPlate).toBe(false);
      expect(result.after).toHaveLength(result.before.length - 1);
      expect(result.after.some(item => item.id === targetId)).toBe(false);
      const allowedIds = new Set(result.before.map(item => item.id));
      expect(result.after.every(item => allowedIds.has(item.id))).toBe(true);
      observations.push({
        context: 'single-pwa', local_only: true, visible_conflict: result.conflictVisible,
        replacement_created: result.createdWithEditedPlate,
      });
    } finally {
      if (localBefore) {
        await cleanupStep('local-edit-before-state-rollback', observations, async () => {
          await page.evaluate(before => {
            window.scopedSave('trucks', before);
            if (typeof window.closeTruckModal === 'function') window.closeTruckModal();
            if (typeof window.renderTrucksList === 'function') window.renderTrucksList();
          }, localBefore);
          observations.push({ cleanup: 'local-before-state-restored', status: 'complete' });
        });
      }
      await softRevoke(page, config, token, observations, 'single-pwa');
      await attachSafeObservations(testInfo, 'fleet-edit-conflict-observations', observations);
    }
  },
);

test(
  'RESTORE-02 deactivated manifest truck and profile are omitted then exactly restored',
  scenario(
    'The same stable truck/profile IDs disappear from clean restore when explicitly inactive and return exactly once after exact rollback.',
    [
      'Open independent writer and recovery contexts.',
      'Login both as E2E-FLEET-A.',
      'Capture exact active truck/profile before-state.',
      'Write the same IDs with active=false.',
      'Verify clean restore omits both and retains unrelated active fixtures.',
      'Restore exact before-state and verify both IDs return once.',
      'Revoke both sessions.',
    ],
  ),
  async ({ page, context, browser }, testInfo) => {
    const config = prerequisites.config;
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block' });
    const recoveryPage = await recoveryContext.newPage();
    const observations = [];
    let writerToken = '';
    let recoveryToken = '';
    let originalTruck = null;
    let originalProfile = null;
    let mutationApplied = false;

    try {
      assertEmptyStorage(await openFreshApplication(page, context, config));
      assertEmptyStorage(await openFreshApplication(recoveryPage, recoveryContext, config));
      writerToken = tokenFrom(await loginFleetA(page, config));
      recoveryToken = tokenFrom(await loginFleetA(recoveryPage, config));

      const beforeResponse = await restoreFleet(page, config, writerToken);
      const before = activeFleetSnapshot(beforeResponse);
      const truckId = config.fleetA.activeTruckIds[0];
      const profileId = config.fleetA.activeDriverProfileIds[0];
      const truckMatches = exactlyOneById(before.trucks, truckId);
      const profileMatches = exactlyOneById(before.driverProfiles, profileId);
      expect(truckMatches).toHaveLength(1);
      expect(profileMatches).toHaveLength(1);
      originalTruck = clone(truckMatches[0]);
      originalProfile = clone(profileMatches[0]);

      const deactivatedTruck = { ...clone(originalTruck), id: truckId, active: false };
      const deactivatedProfile = { ...clone(originalProfile), id: profileId, active: false };
      const write = await pushOwnerData(page, config, writerToken, {
        trucks: [deactivatedTruck],
        driverProfiles: [deactivatedProfile],
      }, 'RESTORE-02', 'deactivate');
      mutationApplied = write.status === 200;
      expect(write.status).toBe(200);

      const inactiveRestore = await restoreFleet(recoveryPage, config, recoveryToken);
      const after = activeFleetSnapshot(inactiveRestore);
      expect(exactlyOneById(after.trucks, truckId)).toHaveLength(0);
      expect(exactlyOneById(after.driverProfiles, profileId)).toHaveLength(0);
      for (const id of config.fleetA.activeTruckIds.filter(id => id !== truckId)) {
        expect(exactlyOneById(after.trucks, id)).toHaveLength(1);
      }
      for (const id of config.fleetA.activeDriverProfileIds.filter(id => id !== profileId)) {
        expect(exactlyOneById(after.driverProfiles, id)).toHaveLength(1);
      }
      for (const id of config.fleetA.inactiveTruckIds) {
        expect(exactlyOneById(after.trucks, id)).toHaveLength(0);
      }
      for (const id of config.fleetA.inactiveDriverProfileIds) {
        expect(exactlyOneById(after.driverProfiles, id)).toHaveLength(0);
      }
      observations.push({
        context: 'recovery', method: 'GET', path: '/v1/fleet/config/pwa',
        status: inactiveRestore.status, deactivated_truck_omitted: true,
        deactivated_profile_omitted: true,
      });
    } finally {
      if (mutationApplied && originalTruck && originalProfile && writerToken) {
        await cleanupStep('inactive-before-state-rollback', observations, async () => {
          const rollback = await pushOwnerData(page, config, writerToken, {
            trucks: [originalTruck],
            driverProfiles: [originalProfile],
          }, 'RESTORE-02', 'rollback');
          expect.soft(rollback.status).toBe(200);
          observations.push({
            context: 'writer', method: 'POST', path: '/v1/sync/pwa',
            status: rollback.status, cleanup: 'restore-truck-and-profile-before-state',
          });
          if (recoveryToken && rollback.status === 200) {
            const verify = await restoreFleet(recoveryPage, config, recoveryToken);
            const restored = softFleetSnapshot(verify);
            expect.soft(exactlyOneById(restored.trucks, originalTruck.id)).toHaveLength(1);
            expect.soft(exactlyOneById(restored.driverProfiles, originalProfile.id)).toHaveLength(1);
            for (const id of config.fleetA.inactiveTruckIds) {
              expect.soft(exactlyOneById(restored.trucks, id)).toHaveLength(0);
            }
            for (const id of config.fleetA.inactiveDriverProfileIds) {
              expect.soft(exactlyOneById(restored.driverProfiles, id)).toHaveLength(0);
            }
          }
        });
      }
      await softRevoke(page, config, writerToken, observations, 'writer');
      await softRevoke(recoveryPage, config, recoveryToken, observations, 'recovery');
      try {
        await attachSafeObservations(testInfo, 'fleet-inactive-restore-observations', observations);
      } finally {
        await recoveryContext.close();
      }
    }
  },
);
