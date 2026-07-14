import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';
import {
  openFreshApplication,
  persistAuthenticatedSession,
} from './support/staging-api.mjs';

const manifest = {
  schema_version: '1.1',
  environment: 'staging',
  run_id: 'fleet-integrity-01',
  display_prefix: 'E2E-fleet-integrity-01-',
  tenants: [
    { alias: 'A', owner_crewbiq_id: 'CBQ-E2E-TENANT-A' },
    { alias: 'B', owner_crewbiq_id: 'CBQ-E2E-TENANT-B' },
  ],
  identities: [
    {
      alias: 'E2E-FLEET-A',
      auth_crewbiq_id: 'CBQ-E2E-FLEET-A',
      role: 'fleet',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-A',
    },
    {
      alias: 'E2E-FLEET-B',
      auth_crewbiq_id: 'CBQ-E2E-FLEET-B',
      role: 'fleet',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-B',
    },
  ],
  fixtures: [
    { entity: 'trucks', key: 'truck-a-active', owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: true },
    { entity: 'trucks', key: 'truck-a-inactive', owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: false },
    {
      entity: 'fleet_driver_profiles', key: 'driver-a-active',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: true,
    },
    {
      entity: 'fleet_driver_profiles', key: 'driver-a-inactive',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: false,
    },
    { entity: 'trucks', key: 'truck-b-active', owner_crewbiq_id: 'CBQ-E2E-TENANT-B', is_active: true },
    {
      entity: 'fleet_driver_profiles', key: 'driver-b-active',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-B', is_active: true,
    },
    {
      entity: 'driver_loads', key: 'load-a-1', owner_crewbiq_id: 'CBQ-E2E-TENANT-A',
      owner_column: 'crewbiq_id',
    },
    {
      entity: 'driver_loads', key: 'load-b-1', owner_crewbiq_id: 'CBQ-E2E-TENANT-B',
      owner_column: 'crewbiq_id',
    },
  ],
};

function validEnvironment() {
  return {
    E2E_ENVIRONMENT: 'staging',
    E2E_AUTHENTICATED_RUN: '1',
    E2E_BASE_URL: 'https://driver.staging.example.test/app/',
    E2E_ORCHESTRATOR_URL: 'https://orchestrator.staging.example.test',
    E2E_ALLOWED_HOSTS: 'driver.staging.example.test,orchestrator.staging.example.test',
    E2E_FIXTURE_MANIFEST_PATH: 'manifest.json',
    CREWBIQ_E2E_FLEET_A_EMAIL: 'fleet-a@example.test',
    CREWBIQ_E2E_FLEET_A_PASSWORD: 'password-a-secret-canary',
    CREWBIQ_E2E_FLEET_B_EMAIL: 'fleet-b@example.test',
    CREWBIQ_E2E_FLEET_B_PASSWORD: 'password-b-secret-canary',
  };
}

function manifestReader() {
  return { readFile: () => JSON.stringify(manifest) };
}

test('missing prerequisites are not ready and never include secret values', () => {
  const env = {
    CREWBIQ_E2E_FLEET_A_PASSWORD: 'password-a-secret-canary',
    CREWBIQ_E2E_FLEET_B_PASSWORD: 'password-b-secret-canary',
  };
  const result = resolveStagingPrerequisites(env, { readFile: () => { throw new Error('missing'); } });
  assert.equal(result.ready, false);
  assert.equal(result.config, null);
  assert.doesNotMatch(JSON.stringify(result), /password-[ab]-secret-canary/);
});

test('production and non-allowlisted hosts fail closed', () => {
  const env = validEnvironment();
  env.E2E_BASE_URL = 'https://crewbiq-driver-production.example.test';
  env.E2E_ALLOWED_HOSTS = 'crewbiq-driver-production.example.test';
  const result = resolveStagingPrerequisites(env, manifestReader());
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('production host')));
  assert.ok(result.reasons.some(reason => reason.includes('not present in E2E_ALLOWED_HOSTS')));
});

test('valid Fleet A prerequisites expose exact active and inactive manifest IDs', () => {
  const result = resolveStagingPrerequisites(validEnvironment(), manifestReader());
  assert.equal(result.ready, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.config.runId, 'fleet-integrity-01');
  assert.equal(result.config.displayPrefix, 'E2E-fleet-integrity-01-');
  assert.equal(result.config.fleetA.applicationRole, 'fleet');
  assert.equal(result.config.fleetA.ownerCrewbiqId, 'CBQ-E2E-TENANT-A');
  assert.deepEqual(result.config.fleetA.activeTruckIds, ['truck-a-active']);
  assert.deepEqual(result.config.fleetA.inactiveTruckIds, ['truck-a-inactive']);
  assert.deepEqual(result.config.fleetA.activeDriverProfileIds, ['driver-a-active']);
  assert.deepEqual(result.config.fleetA.inactiveDriverProfileIds, ['driver-a-inactive']);
  assert.deepEqual(result.config.fleetA.driverLoadIds, ['load-a-1']);
  assert.doesNotMatch(JSON.stringify(result), /password-[ab]-secret-canary/);
});

test('TENANT-01 prerequisites require distinct Fleet A and Fleet B contracts', () => {
  const result = resolveStagingPrerequisites(validEnvironment(), {
    ...manifestReader(),
    requireFleetB: true,
  });
  assert.equal(result.ready, true);
  assert.equal(result.config.fleetB.applicationRole, 'fleet');
  assert.equal(result.config.fleetB.ownerCrewbiqId, 'CBQ-E2E-TENANT-B');
  assert.deepEqual(result.config.fleetB.activeTruckIds, ['truck-b-active']);
  assert.deepEqual(result.config.fleetB.activeDriverProfileIds, ['driver-b-active']);
  assert.deepEqual(result.config.fleetB.driverLoadIds, ['load-b-1']);
  assert.notEqual(result.config.fleetA.authCrewbiqId, result.config.fleetB.authCrewbiqId);
  assert.notEqual(result.config.fleetA.ownerCrewbiqId, result.config.fleetB.ownerCrewbiqId);
});

test('Fleet B credentials are required only for tenant-isolation scenarios', () => {
  const env = validEnvironment();
  delete env.CREWBIQ_E2E_FLEET_B_PASSWORD;

  const fleetAOnly = resolveStagingPrerequisites(env, manifestReader());
  const tenantIsolation = resolveStagingPrerequisites(env, {
    ...manifestReader(),
    requireFleetB: true,
  });

  assert.equal(fleetAOnly.ready, true);
  assert.equal(tenantIsolation.ready, false);
  assert.ok(tenantIsolation.reasons.some(reason => reason.includes('CREWBIQ_E2E_FLEET_B_PASSWORD')));
});

test('same auth identity or effective owner for A and B fails closed', () => {
  const unsafe = structuredClone(manifest);
  unsafe.identities[1].auth_crewbiq_id = unsafe.identities[0].auth_crewbiq_id;
  unsafe.identities[1].owner_crewbiq_id = unsafe.identities[0].owner_crewbiq_id;
  unsafe.tenants[1].owner_crewbiq_id = unsafe.tenants[0].owner_crewbiq_id;
  const result = resolveStagingPrerequisites(validEnvironment(), {
    readFile: () => JSON.stringify(unsafe),
    requireFleetB: true,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('effective owners must be distinct')));
  assert.ok(result.reasons.some(reason => reason.includes('auth identities must be distinct')));
});

test('manifest environment and tenant mismatches fail closed', () => {
  const mismatched = structuredClone(manifest);
  mismatched.environment = 'test';
  mismatched.tenants[0].owner_crewbiq_id = 'CBQ-E2E-TENANT-B';
  const result = resolveStagingPrerequisites(validEnvironment(), {
    readFile: () => JSON.stringify(mismatched),
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('environment')));
  assert.ok(result.reasons.some(reason => reason.includes('tenant A')));
});

test('legacy schema 1.0 and fleet_loads cannot qualify as current staging evidence', () => {
  const legacy = structuredClone(manifest);
  legacy.schema_version = '1.0';
  legacy.fixtures = legacy.fixtures.map(item => (
    item.entity === 'driver_loads'
      ? { ...item, entity: 'fleet_loads', owner_column: undefined }
      : item
  ));
  const result = resolveStagingPrerequisites(validEnvironment(), {
    readFile: () => JSON.stringify(legacy),
    requireFleetB: true,
  });

  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('schema 1.0 is legacy cleanup-only')));
  assert.ok(result.reasons.some(reason => reason.includes('legacy fleet_loads')));
  assert.ok(result.reasons.some(reason => reason.includes('E2E-FLEET-A driver_loads')));
  assert.ok(result.reasons.some(reason => reason.includes('E2E-FLEET-B driver_loads')));
});

test('missing owner column and cross-tenant load ownership fail closed', () => {
  const unsafe = structuredClone(manifest);
  const loadA = unsafe.fixtures.find(item => item.key === 'load-a-1');
  const loadB = unsafe.fixtures.find(item => item.key === 'load-b-1');
  delete loadA.owner_column;
  loadB.owner_crewbiq_id = 'CBQ-E2E-TENANT-A';
  const result = resolveStagingPrerequisites(validEnvironment(), {
    readFile: () => JSON.stringify(unsafe),
    requireFleetB: true,
  });

  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('owner_column=crewbiq_id')));
  assert.ok(result.reasons.some(reason => reason.includes('E2E-FLEET-B driver_loads')));
});

test('invalid run identity, prefix, or duplicate fixture key fails closed', () => {
  const invalid = structuredClone(manifest);
  invalid.run_id = '../unsafe';
  invalid.display_prefix = 'wrong-prefix';
  invalid.fixtures.push({ ...invalid.fixtures[0] });
  const result = resolveStagingPrerequisites(validEnvironment(), {
    readFile: () => JSON.stringify(invalid),
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('run_id')));
  assert.ok(result.reasons.some(reason => reason.includes('display_prefix')));
  assert.ok(result.reasons.some(reason => reason.includes('duplicate entity keys')));
});

test('staging specs have no production or real Google URL and retain reusable identities', () => {
  const authSource = fs.readFileSync(new URL('./staging-auth-restore.spec.mjs', import.meta.url), 'utf8');
  const fleetSource = fs.readFileSync(new URL('./staging-fleet-integrity.spec.mjs', import.meta.url), 'utf8');
  const tenantSource = fs.readFileSync(new URL('./staging-tenant-isolation.spec.mjs', import.meta.url), 'utf8');
  const offlineSource = fs.readFileSync(new URL('./staging-offline-retry.spec.mjs', import.meta.url), 'utf8');
  const combined = `${authSource}\n${fleetSource}\n${tenantSource}\n${offlineSource}`;
  assert.doesNotMatch(combined, /crewbiq-orchestrator-production/i);
  assert.doesNotMatch(combined, /script\.google\.com/i);
  assert.match(authSource, /legacy-fallback\.invalid/);
  assert.match(combined, /screenshot: 'off'/);
  assert.match(combined, /trace: 'off'/);
  assert.match(combined, /\/v1\/auth\/logout/);
  assert.doesNotMatch(combined, /deprovision|truncate/i);
});

test('fresh browser setup binds PWA transport to the configured staging Orchestrator', async () => {
  const initialState = { cookies: [], origins: [] };
  let initScript;
  let navigatedTo = '';
  const context = {
    storageState: async () => initialState,
    addInitScript: async (callback, value) => { initScript = { callback, value }; },
  };
  const page = {
    goto: async url => { navigatedTo = url; },
  };
  const config = {
    baseUrl: 'https://driver.staging.example.test/',
    orchestratorUrl: 'https://orchestrator.staging.example.test',
  };

  const returned = await openFreshApplication(page, context, config);
  assert.equal(returned, initialState);
  assert.equal(navigatedTo, config.baseUrl);

  const stored = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { setItem: (key, value) => stored.set(key, value) };
  try {
    initScript.callback(initScript.value);
  } finally {
    globalThis.localStorage = previousStorage;
  }
  const expectedSync = 'https://orchestrator.staging.example.test/v1/sync';
  assert.equal(stored.get('fiqD_orchestratorUrl'), expectedSync);
  assert.equal(stored.get('fiqD_orchestratorUrlBackup'), expectedSync);
  assert.equal(stored.get('fiqD__savedSyncUrl'), expectedSync);
  assert.equal(stored.has('fiqD_sessionToken'), false);
});

test('successful direct login is adopted by the PWA browser session', async () => {
  const stored = new Map();
  const page = {
    evaluate: async (callback, value) => {
      const previousStorage = globalThis.localStorage;
      globalThis.localStorage = { setItem: (key, item) => stored.set(key, item) };
      try {
        callback(value);
      } finally {
        globalThis.localStorage = previousStorage;
      }
    },
  };
  const response = {
    status: 200,
    body: { ok: true, session_token: 'synthetic-staging-session' },
  };

  const returned = await persistAuthenticatedSession(page, response);
  assert.equal(returned, response);
  assert.equal(stored.get('fiqD_sessionToken'), 'synthetic-staging-session');

  const apiSource = fs.readFileSync(new URL('./support/staging-api.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(apiSource, /crewbiq-orchestrator-production/i);
});

test('fleet integrity spec mutates only existing IDs and contains exact rollback paths', () => {
  const source = fs.readFileSync(new URL('./staging-fleet-integrity.spec.mjs', import.meta.url), 'utf8');
  assert.match(source, /config\.fleetA\.activeTruckIds\[0\]/);
  assert.match(source, /config\.fleetA\.activeDriverProfileIds\[0\]/);
  assert.match(source, /\{ \.\.\.clone\(originalTruck\), id: targetId/);
  assert.match(source, /cleanup: 'restore-before-state'/);
  assert.match(source, /cleanup: 'restore-truck-and-profile-before-state'/);
  assert.match(source, /window\.saveTruckForm\(\)/);
  assert.match(source, /window\.scopedSave\('trucks'/);
  assert.doesNotMatch(source, /generateFleetEntityId|truck_\+Date\.now|drv_\+Date\.now/);
});

test('TENANT-01 uses an empty business probe and deterministic idempotency key', () => {
  const spec = fs.readFileSync(new URL('./staging-tenant-isolation.spec.mjs', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('./support/staging-api.mjs', import.meta.url), 'utf8');
  assert.match(spec, /requireFleetB: true/);
  assert.match(spec, /pushTenantSubstitutionProbe/);
  assert.match(api, /deterministicProbeRecordId\(config, 'tenant-01'\)/);
  assert.match(api, /loads: \[\]/);
  assert.match(api, /ptiLog: \[\]/);
  assert.match(api, /ownerData: \{\}/);
  assert.doesNotMatch(spec, /delete|truncate|deprovision/i);
});

test('OFFLINE-01 uses one manifest-owned truck, sanitized queue checks, and exact rollback', () => {
  const spec = fs.readFileSync(new URL('./staging-offline-retry.spec.mjs', import.meta.url), 'utf8');
  assert.match(spec, /config\.fleetA\.activeTruckIds\[0\]/);
  assert.match(spec, /page\.route\(syncPattern/);
  assert.match(spec, /route\.abort\('failed'\)/);
  assert.match(spec, /fiqD_pendingSyncOperations/);
  assert.match(spec, /containsSessionToken/);
  assert.match(spec, /observedRequestIds\[0\].*observedRequestIds\[1\]/s);
  assert.match(spec, /pushOwnerData\([\s\S]*originalTruck[\s\S]*'rollback'/);
  assert.match(spec, /retry contract is entity-independent/);
  assert.doesNotMatch(spec, /fleet_loads|driver_loads|insert into|delete from|truncate/i);
});
