import fs from 'node:fs';
import path from 'node:path';

const allowedEnvironments = new Set(['staging', 'test']);
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const requiredSecretNames = [
  'CREWBIQ_E2E_FLEET_A_EMAIL',
  'CREWBIQ_E2E_FLEET_A_PASSWORD',
];

function checkedUrl(name, value, environment, allowedHosts, reasons) {
  if (!value) {
    reasons.push(`${name} is required`);
    return null;
  }
  try {
    const url = new URL(value);
    const localTest = environment === 'test' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(localTest && url.protocol === 'http:')) {
      reasons.push(`${name} must use HTTPS, except explicit localhost test runs`);
    }
    if (url.username || url.password) reasons.push(`${name} must not contain credentials`);
    if (url.hostname.toLowerCase().includes('production')) {
      reasons.push(`${name} must not use a production host`);
    }
    if (!allowedHosts.has(url.hostname.toLowerCase())) {
      reasons.push(`${name} host is not present in E2E_ALLOWED_HOSTS`);
    }
    return url;
  } catch {
    reasons.push(`${name} is not a valid URL`);
    return null;
  }
}

function readManifest(manifestPath, environment, reasons, readFile) {
  if (!manifestPath) {
    reasons.push('E2E_FIXTURE_MANIFEST_PATH is required');
    return null;
  }
  try {
    const manifest = JSON.parse(readFile(manifestPath));
    if (manifest.schema_version !== '1.0') reasons.push('Fixture manifest schema_version must be 1.0');
    if (manifest.environment !== environment) reasons.push('Fixture manifest environment does not match E2E_ENVIRONMENT');
    if (!runIdPattern.test(String(manifest.run_id || ''))) {
      reasons.push('Fixture manifest run_id is missing or invalid');
    }
    if (manifest.display_prefix !== `E2E-${manifest.run_id || ''}-`) {
      reasons.push('Fixture manifest display_prefix does not match run_id');
    }
    if (!Array.isArray(manifest.identities) || !Array.isArray(manifest.tenants) || !Array.isArray(manifest.fixtures)) {
      reasons.push('Fixture manifest is missing identities, tenants, or fixtures');
      return null;
    }
    const keys = manifest.fixtures.map(item => `${item.entity}:${item.key}`);
    if (new Set(keys).size !== keys.length) reasons.push('Fixture manifest contains duplicate entity keys');
    return manifest;
  } catch {
    reasons.push('E2E fixture manifest is missing or invalid');
    return null;
  }
}

function fleetAContract(manifest, reasons) {
  if (!manifest) return null;
  const identity = manifest.identities.find(item => item.alias === 'E2E-FLEET-A');
  if (!identity || identity.role !== 'fleet' || !identity.owner_crewbiq_id) {
    reasons.push('Fixture manifest does not contain the E2E-FLEET-A fleet identity');
    return null;
  }
  const tenant = manifest.tenants.find(item => item.alias === 'A');
  if (!tenant || tenant.owner_crewbiq_id !== identity.owner_crewbiq_id) {
    reasons.push('Fixture manifest tenant A does not match E2E-FLEET-A');
  }
  const owned = manifest.fixtures.filter(item => item.owner_crewbiq_id === identity.owner_crewbiq_id);
  const ids = (entity, active) => owned
    .filter(item => item.entity === entity && item.is_active === active)
    .map(item => item.key)
    .sort();
  const contract = {
    identityAlias: identity.alias,
    authCrewbiqId: identity.auth_crewbiq_id,
    applicationRole: identity.role,
    ownerCrewbiqId: identity.owner_crewbiq_id,
    activeTruckIds: ids('trucks', true),
    inactiveTruckIds: ids('trucks', false),
    activeDriverProfileIds: ids('fleet_driver_profiles', true),
    inactiveDriverProfileIds: ids('fleet_driver_profiles', false),
  };
  for (const [name, values] of Object.entries(contract)) {
    if (name.endsWith('Ids') && values.length === 0) reasons.push(`Fixture manifest has no ${name}`);
  }
  return contract;
}

export function resolveStagingPrerequisites(env = process.env, options = {}) {
  const reasons = [];
  const environment = String(env.E2E_ENVIRONMENT || '').trim().toLowerCase();
  if (!allowedEnvironments.has(environment)) {
    reasons.push('E2E_ENVIRONMENT must be exactly staging or test');
  }
  if (String(env.E2E_AUTHENTICATED_RUN || '') !== '1') {
    reasons.push('E2E_AUTHENTICATED_RUN must equal 1');
  }
  for (const name of requiredSecretNames) {
    if (!String(env[name] || '')) reasons.push(`${name} must be supplied at runtime`);
  }

  const allowedHosts = new Set(
    String(env.E2E_ALLOWED_HOSTS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowedHosts.size === 0) reasons.push('E2E_ALLOWED_HOSTS is required');
  const baseUrl = checkedUrl('E2E_BASE_URL', env.E2E_BASE_URL, environment, allowedHosts, reasons);
  const orchestratorUrl = checkedUrl(
    'E2E_ORCHESTRATOR_URL', env.E2E_ORCHESTRATOR_URL, environment, allowedHosts, reasons,
  );
  const readFile = options.readFile || (filePath => fs.readFileSync(filePath, 'utf8'));
  const manifest = readManifest(env.E2E_FIXTURE_MANIFEST_PATH, environment, reasons, readFile);
  const fleetA = fleetAContract(manifest, reasons);

  return {
    ready: reasons.length === 0,
    reasons,
    config: reasons.length === 0 ? {
      environment,
      baseUrl: baseUrl.href,
      orchestratorUrl: orchestratorUrl.origin,
      manifestReference: path.basename(env.E2E_FIXTURE_MANIFEST_PATH),
      runId: manifest.run_id,
      displayPrefix: manifest.display_prefix,
      fleetA,
    } : null,
  };
}

export function fleetACredentials(env = process.env) {
  return {
    email: String(env.CREWBIQ_E2E_FLEET_A_EMAIL || ''),
    password: String(env.CREWBIQ_E2E_FLEET_A_PASSWORD || ''),
  };
}
