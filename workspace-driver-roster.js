(function (global) {
  'use strict';

  const ACTION = 'workspace_driver_roster_read';
  const ERROR_CODES = Object.freeze({
    UNAUTHORIZED: 'workspace_driver_roster_unauthorized',
    INVALID_RESPONSE: 'workspace_driver_roster_invalid_response',
    WORKSPACE_MISMATCH: 'workspace_driver_roster_workspace_mismatch',
    NETWORK_UNAVAILABLE: 'network_unavailable',
    SERVER_ERROR: 'server_error',
  });
  const DRIVER_STATUSES = new Set(['active', 'inactive']);

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function fail(code, message, details) {
    return { ok: false, code, message, details: details || {} };
  }

  function validDate(value) {
    const candidate = text(value);
    return !!candidate && !Number.isNaN(Date.parse(candidate));
  }

  function normalizeDriver(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const driverId = text(value.driver_id);
    const workspaceId = text(value.workspace_id);
    const name = text(value.name);
    const status = text(value.status);
    const effectiveFrom = text(value.effective_from);
    const effectiveTo = value.effective_to == null || value.effective_to === '' ? null : text(value.effective_to);
    if (!driverId || !workspaceId || !name || !DRIVER_STATUSES.has(status) || !validDate(effectiveFrom)) return null;
    if (effectiveTo && (!validDate(effectiveTo) || Date.parse(effectiveTo) < Date.parse(effectiveFrom))) return null;
    return { driverId, workspaceId, name, status, effectiveFrom, effectiveTo };
  }

  function validateResponse(wire, context) {
    context = context || {};
    if (!wire || typeof wire !== 'object' || Array.isArray(wire) || wire.ok !== true || !Array.isArray(wire.drivers)) {
      return fail(ERROR_CODES.INVALID_RESPONSE, 'Workspace Driver roster response is malformed', {});
    }
    const expectedWorkspaceId = text(context.workspaceId);
    const responseWorkspaceId = text(wire.workspace_id);
    if (!expectedWorkspaceId || responseWorkspaceId !== expectedWorkspaceId) {
      return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'Workspace Driver roster response does not match active workspace', {});
    }
    const drivers = [];
    const driverIds = new Set();
    for (let index = 0; index < wire.drivers.length; index += 1) {
      const driver = normalizeDriver(wire.drivers[index]);
      if (!driver) return fail(ERROR_CODES.INVALID_RESPONSE, 'Workspace Driver roster record is malformed', { index });
      if (driver.workspaceId !== expectedWorkspaceId) {
        return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'Workspace Driver roster record crosses workspace boundary', { driverId: driver.driverId });
      }
      if (driverIds.has(driver.driverId)) {
        return fail(ERROR_CODES.INVALID_RESPONSE, 'Workspace Driver roster contains a duplicate Driver ID', { driverId: driver.driverId });
      }
      driverIds.add(driver.driverId);
      drivers.push(driver);
    }
    return { ok: true, workspaceId: expectedWorkspaceId, drivers };
  }

  function responseEnvelope(result) {
    if (!result || typeof result !== 'object') return { status: 0, data: result };
    if (result.data && typeof result.data === 'object') return { status: Number(result.status || 0), data: result.data };
    return { status: Number(result.status || 0), data: result };
  }

  function create(deps) {
    deps = deps || {};
    const request = deps.request;

    async function read(context) {
      context = context || {};
      const sessionToken = text(context.sessionToken);
      const workspaceId = text(context.workspaceId);
      if (!sessionToken || !workspaceId || typeof request !== 'function') {
        return fail(ERROR_CODES.UNAUTHORIZED, 'Authenticated workspace Driver roster context is required', {});
      }
      let result;
      try {
        result = await request(ACTION, { sessionToken, workspaceId });
      } catch (error) {
        const status = Number(error && error.status || 0);
        if (status === 401 || status === 403) return fail(ERROR_CODES.UNAUTHORIZED, 'Workspace Driver roster request was unauthorized', { status });
        return fail(ERROR_CODES.NETWORK_UNAVAILABLE, 'Workspace Driver roster server is unavailable', {
          reason: text(error && error.code) || 'request_failed',
        });
      }
      const envelope = responseEnvelope(result);
      if (envelope.status === 401 || envelope.status === 403) {
        return fail(ERROR_CODES.UNAUTHORIZED, 'Workspace Driver roster request was unauthorized', { status: envelope.status });
      }
      if (envelope.status >= 500 || !envelope.data || envelope.data.ok === false) {
        return fail(ERROR_CODES.SERVER_ERROR, 'Workspace Driver roster server rejected the request', { status: envelope.status || 0 });
      }
      return validateResponse(envelope.data, { workspaceId });
    }

    return Object.freeze({ read });
  }

  global.CrewBIQWorkspaceDriverRoster = Object.freeze({ ACTION, ERROR_CODES, validateResponse, create });
})(typeof window !== 'undefined' ? window : globalThis);
