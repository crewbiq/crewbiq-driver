import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ALL_ROLE_NAMES,
  missionEnvironment,
  resolveRoleMissions,
  ROLE_MISSIONS,
} from './missions/role-missions.mjs';

test('role mission catalog covers the staging journey families', () => {
  assert.deepEqual(ALL_ROLE_NAMES, ['fleet', 'driver', 'recovery', 'security']);
  assert.equal(resolveRoleMissions('all').length, 4);
  for (const role of ALL_ROLE_NAMES) {
    const mission = ROLE_MISSIONS[role];
    assert.ok(mission.specs.length, `${role} must have executable specs`);
    assert.ok(mission.journeys.length, `${role} must have declared journeys`);
    assert.ok(mission.tenantAliases.length, `${role} must declare tenant scope`);
  }
});

test('all missions produce a deduplicated safe runner environment', () => {
  const env = missionEnvironment('all');
  assert.equal(env.testerRole, 'ai-browser-mission-runner');
  assert.equal(env.applicationRole, 'multi-role');
  assert.equal(env.tenantAliases, 'A,B');
  assert.equal(env.specs.length, 4);
  assert.ok(env.journeys.includes('TENANT-01'));
});

test('all missions execute each role separately with isolated artifact directories', () => {
  const runner = fs.readFileSync(new URL('./run-role-missions.mjs', import.meta.url), 'utf8');
  assert.match(runner, /role === 'all' \? ALL_ROLE_NAMES : \[role\]/);
  assert.match(runner, /artifacts\/e2e\/roles\/\$\{roleName\}/);
  assert.match(runner, /E2E_APPLICATION_ROLE: mission\.applicationRole/);
});

test('unknown mission roles fail closed', () => {
  assert.throws(() => missionEnvironment('production-admin'), /Unknown mission role/);
});

console.log('Role mission runner contract: ok');
