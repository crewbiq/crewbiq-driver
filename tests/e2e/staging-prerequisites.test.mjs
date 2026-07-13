import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { resolveStagingPrerequisites } from './support/staging-prerequisites.mjs';

const manifest = {
  schema_version: '1.0',
  environment: 'staging',
  run_id: 'fleet-integrity-01',
  display_prefix: 'E2E-fleet-integrity-01-',
  tenants: [{ alias: 'A', owner_crewbiq_id: 'CBQ-E2E-TENANT-A' }],
  identities: [{
    alias: 'E2E-FLEET-A',
    auth_crewbiq_id: 'CBQ-E2E-FLEET-A',
    role: 'fleet',
    owner_crewbiq_id: 'CBQ-E2E-TENANT-A',
  }],
  fixtures: [
    { entity: 'trucks', key: 'truck-active', owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: true },
    { entity: 'trucks', key: 'truck-inactive', owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: false },
    {
      entity: 'fleet_driver_profiles', key: 'driver-active',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: true,
    },
    {
      entity: 'fleet_driver_profiles', key: 'driver-inactive',
      owner_crewbiq_id: 'CBQ-E2E-TENANT-A', is_active: false,
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
    CREWBIQ_E2E_FLEET_A_PASSWORD: 'password-secret-canary',
  };
}

test('missing prerequisites are not ready and never include secret values', () => {
  const env = {
    CREWBIQ_E2E_FLEET_A_PASSWORD: 'password-secret-canary',
  };
  const result = resolveStagingPrerequisites(env, { readFile: () => { throw new Error('missing'); } });
  assert.equal(result.ready, false);
  assert.equal(result.config, null);
  assert.doesNotMatch(JSON.stringify(result), /password-secret-canary/);
});

test('production and non-allowlisted hosts fail closed', () => {
  const env = validEnvironment();
  env.E2E_BASE_URL = 'https://crewbiq-driver-production.example.test';
  env.E2E_ALLOWED_HOSTS = 'crewbiq-driver-production.example.test';
  const result = resolveStagingPrerequisites(env, { readFile: () => JSON.stringify(manifest) });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some(reason => reason.includes('production host')));
  assert.ok(result.reasons.some(reason => reason.includes('not present in E2E_ALLOWED_HOSTS')));
});

test('valid staging prerequisites expose exact active and inactive manifest IDs', () => {
  const result = resolveStagingPrerequisites(validEnvironment(), {
    readFile: () => JSON.stringify(manifest),
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.config.runId, 'fleet-integrity-01');
  assert.equal(result.config.displayPrefix, 'E2E-fleet-integrity-01-');
  assert.equal(result.config.fleetA.applicationRole, 'fleet');
  assert.equal(result.config.fleetA.ownerCrewbiqId, 'CBQ-E2E-TENANT-A');
  assert.deepEqual(result.config.fleetA.activeTruckIds, ['truck-active']);
  assert.deepEqual(result.config.fleetA.inactiveTruckIds, ['truck-inactive']);
  assert.deepEqual(result.config.fleetA.activeDriverProfileIds, ['driver-active']);
  assert.deepEqual(result.config.fleetA.inactiveDriverProfileIds, ['driver-inactive']);
  assert.doesNotMatch(JSON.stringify(result), /password-secret-canary/);
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
  const combined = `${authSource}\n${fleetSource}`;
  assert.doesNotMatch(combined, /crewbiq-orchestrator-production/i);
  assert.doesNotMatch(combined, /script\.google\.com/i);
  assert.match(authSource, /legacy-fallback\.invalid/);
  assert.match(combined, /screenshot: 'off'/);
  assert.match(combined, /trace: 'off'/);
  assert.match(combined, /\/v1\/auth\/logout/);
  assert.doesNotMatch(combined, /deprovision|truncate/i);
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
