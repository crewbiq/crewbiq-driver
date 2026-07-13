import { fleetACredentials, fleetBCredentials } from './staging-prerequisites.mjs';
import { redactValue } from './redact.mjs';

export function endpoint(baseUrl, pathname) {
  return new URL(pathname, `${baseUrl}/`).href;
}

export async function browserJson(page, baseUrl, pathname, options = {}) {
  return page.evaluate(async request => {
    try {
      const headers = { Accept: 'application/json' };
      if (request.body !== undefined) headers['Content-Type'] = 'application/json';
      if (request.token) headers.Authorization = `Bearer ${request.token}`;
      const response = await fetch(request.url, {
        method: request.method || 'GET',
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        cache: 'no-store',
      });
      const text = await response.text();
      let body = {};
      try { body = JSON.parse(text); } catch { body = { nonJsonResponse: true }; }
      return { status: response.status, ok: response.ok, body };
    } catch (error) {
      return { status: 0, ok: false, body: { networkError: error.name || 'Error' } };
    }
  }, {
    url: endpoint(baseUrl, pathname),
    method: options.method,
    token: options.token,
    body: options.body,
  });
}

export async function openFreshApplication(page, context, baseUrl) {
  const initialState = await context.storageState();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  return initialState;
}

export async function loginFleetA(page, config, env = process.env) {
  return browserJson(page, config.orchestratorUrl, '/v1/auth/login', {
    method: 'POST',
    body: fleetACredentials(env),
  });
}

export async function loginFleetB(page, config, env = process.env) {
  return browserJson(page, config.orchestratorUrl, '/v1/auth/login', {
    method: 'POST',
    body: fleetBCredentials(env),
  });
}

export async function readMe(page, config, token) {
  return browserJson(page, config.orchestratorUrl, '/v1/me', { token });
}

export async function revokeSession(page, config, token) {
  if (!token) return { status: 0, ok: false, body: { reason: 'missing_token' } };
  return browserJson(page, config.orchestratorUrl, '/v1/auth/logout', {
    method: 'POST',
    token,
  });
}

export async function restoreFleet(page, config, token, claimedOwner = '') {
  const query = claimedOwner ? `?crewbiq_id=${encodeURIComponent(claimedOwner)}` : '';
  return browserJson(page, config.orchestratorUrl, `/v1/fleet/config/pwa${query}`, { token });
}

export function makeRecordId(config, scenarioId, phase) {
  const safeRun = String(config.runId || 'run').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40);
  const random = Math.random().toString(36).slice(2, 10);
  return `e2e_${safeRun}_${scenarioId.toLowerCase()}_${phase}_${Date.now()}_${random}`;
}

export function deterministicProbeRecordId(config, scenarioId) {
  const safeRun = String(config.runId || 'run').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40);
  const safeScenario = String(scenarioId || 'probe').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `e2e_${safeRun}_${safeScenario}_audit_probe`;
}

export async function pushOwnerData(page, config, token, ownerData, scenarioId, phase) {
  const recordId = makeRecordId(config, scenarioId, phase);
  return browserJson(page, config.orchestratorUrl, '/v1/sync/pwa', {
    method: 'POST',
    token,
    body: {
      record_id: recordId,
      type: 'driver_report',
      deviceId: `e2e-${scenarioId.toLowerCase()}-${phase}`,
      driver: {
        crewId: config.fleetA.authCrewbiqId,
        email: 'e2e-redacted@example.test',
      },
      loads: [],
      ptiLog: [],
      ownerData,
    },
  });
}

export async function pushTenantSubstitutionProbe(page, config, token) {
  return browserJson(page, config.orchestratorUrl, '/v1/sync/pwa', {
    method: 'POST',
    token,
    body: {
      record_id: deterministicProbeRecordId(config, 'tenant-01'),
      type: 'driver_report',
      deviceId: 'e2e-tenant-01-probe',
      crewbiq_id: config.fleetB.ownerCrewbiqId,
      ownerKey: 'crew_e2e_tenant_b',
      driver: {
        crewId: config.fleetB.authCrewbiqId,
        crewbiq_id: config.fleetB.authCrewbiqId,
        ownerKey: 'crew_e2e_tenant_b',
        email: 'e2e-redacted@example.test',
        role: 'fleet',
      },
      profile: {
        crewbiq_id: config.fleetB.ownerCrewbiqId,
        ownerKey: 'crew_e2e_tenant_b',
      },
      loads: [],
      ptiLog: [],
      ownerData: {},
    },
  });
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function exactlyOneById(items, id) {
  return (Array.isArray(items) ? items : []).filter(item => item && item.id === id);
}

export async function attachSafeObservations(testInfo, name, observations) {
  const safe = redactValue(observations);
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(safe, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}
