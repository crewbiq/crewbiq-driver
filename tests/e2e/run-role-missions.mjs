import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ALL_ROLE_NAMES, missionEnvironment } from './missions/role-missions.mjs';

const roleArg = process.argv.find(value => value.startsWith('--role='));
const role = roleArg ? roleArg.slice('--role='.length) : process.env.E2E_MISSION_ROLE || 'all';
const environment = process.env.E2E_ENVIRONMENT || 'staging';

if (!['staging', 'test'].includes(environment)) {
  console.error(`not_run: role missions require staging/test environment, received ${environment}`);
  process.exit(0);
}

const roles = role === 'all' ? ALL_ROLE_NAMES : [role];
let exitCode = 0;

for (const roleName of roles) {
  let mission;
  try {
    mission = missionEnvironment(roleName);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const childEnv = {
    ...process.env,
    E2E_ENVIRONMENT: environment,
    E2E_AUTHENTICATED_RUN: '1',
    E2E_MISSION_ROLE: mission.missionRole,
    E2E_TESTER_ROLE: mission.testerRole,
    E2E_APPLICATION_ROLE: mission.applicationRole,
    E2E_TENANT_ALIASES: mission.tenantAliases,
    E2E_MISSION_JOURNEYS: mission.journeys.join(','),
    E2E_AGENT_MODE: process.env.E2E_AGENT_MODE || 'scripted-mission',
    E2E_AGENT_CONTROLLER: process.env.E2E_AGENT_CONTROLLER || 'playwright-role-runner',
    E2E_ARTIFACT_DIR: process.env.E2E_ARTIFACT_DIR || `artifacts/e2e/roles/${roleName}`,
  };

  console.log(JSON.stringify({
    event: 'mission_start',
    role: mission.missionRole,
    journeys: mission.journeys,
    specs: mission.specs,
    environment,
    artifact_dir: childEnv.E2E_ARTIFACT_DIR,
  }, null, 2));

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url)), 'test', ...mission.specs],
    { stdio: 'inherit', env: childEnv },
  );

  if (result.status == null || result.status !== 0) exitCode = result.status || 1;
}

process.exit(exitCode);
