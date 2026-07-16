export const ROLE_MISSIONS = Object.freeze({
  fleet: Object.freeze({
    role: 'fleet',
    applicationRole: 'fleet',
    tenantAliases: ['A'],
    specs: ['tests/e2e/staging-fleet-integrity.spec.mjs'],
    journeys: ['DEVICE-01', 'EDIT-01', 'RESTORE-02', 'DRIVER-CRUD-01'],
  }),
  driver: Object.freeze({
    role: 'driver',
    applicationRole: 'driver',
    tenantAliases: ['A'],
    specs: [
      'tests/e2e/staging-auth-restore.spec.mjs',
      'tests/e2e/staging-load-lifecycle.spec.mjs',
      'tests/e2e/staging-pti-lifecycle.spec.mjs',
      'tests/e2e/staging-expenses-lifecycle.spec.mjs',
      'tests/e2e/staging-dispute-lifecycle.spec.mjs',
      'tests/e2e/staging-dispute-delete.spec.mjs',
    ],
    journeys: [
      'AUTH-01', 'AUTH-02', 'RESTORE-01', 'LEGACY-01', 'LOAD-01', 'PTI-01',
      'EXPENSES-01', 'DISPUTE-01', 'DISPUTE-DELETE-01',
    ],
  }),
  recovery: Object.freeze({
    role: 'recovery',
    applicationRole: 'fleet',
    tenantAliases: ['A'],
    specs: ['tests/e2e/staging-offline-retry.spec.mjs'],
    journeys: ['OFFLINE-01'],
  }),
  security: Object.freeze({
    role: 'security',
    applicationRole: 'fleet',
    tenantAliases: ['A', 'B'],
    specs: [
      'tests/e2e/staging-tenant-isolation.spec.mjs',
      'tests/e2e/staging-tenant-id-collision.spec.mjs',
    ],
    journeys: ['TENANT-01', 'TENANT-ID-01'],
  }),
});

export const ALL_ROLE_NAMES = Object.freeze(Object.keys(ROLE_MISSIONS));

export function resolveRoleMissions(role = 'all') {
  if (role === 'all') return ALL_ROLE_NAMES.map(name => ROLE_MISSIONS[name]);
  const mission = ROLE_MISSIONS[role];
  if (!mission) throw new Error(`Unknown mission role: ${role}`);
  return [mission];
}

export function missionEnvironment(role = 'all') {
  const missions = resolveRoleMissions(role);
  const aliases = [...new Set(missions.flatMap(mission => mission.tenantAliases))];
  const applications = [...new Set(missions.map(mission => mission.applicationRole))];
  const specs = [...new Set(missions.flatMap(mission => mission.specs))];
  const journeys = [...new Set(missions.flatMap(mission => mission.journeys))];
  return {
    missionRole: role,
    testerRole: 'ai-browser-mission-runner',
    applicationRole: applications.length === 1 ? applications[0] : 'multi-role',
    tenantAliases: aliases.join(','),
    specs,
    journeys,
  };
}
