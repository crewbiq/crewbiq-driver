(function (global) {
  'use strict';

  const ACTIONS = Object.freeze({
    CURRENT: 'driver_truck_assignment_current_read',
    HISTORY: 'driver_truck_assignment_history_read',
    AS_OF: 'driver_truck_assignment_as_of_read',
  });
  const ERROR_CODES = Object.freeze({
    NOT_FOUND: 'driver_truck_assignment_not_found',
    AMBIGUOUS: 'driver_truck_assignment_ambiguous',
    UNAUTHORIZED: 'driver_truck_assignment_unauthorized',
    INVALID_RESPONSE: 'driver_truck_assignment_invalid_response',
    WORKSPACE_MISMATCH: 'driver_truck_assignment_workspace_mismatch',
    DRIVER_MISMATCH: 'driver_truck_assignment_driver_mismatch',
    NETWORK_UNAVAILABLE: 'network_unavailable',
    SERVER_ERROR: 'server_error',
  });
  const ASSIGNMENT_TYPES = new Set(['solo', 'team', 'temporary', 'other']);
  const STATUSES = new Set(['active', 'closed', 'revoked']);

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function fail(code, message, details) {
    return { ok: false, code, message, details: details || {} };
  }

  function validTimestamp(value) {
    const candidate = text(value);
    return !!candidate && /T/.test(candidate) && !Number.isNaN(Date.parse(candidate));
  }

  function plainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeAssignment(value) {
    if (!plainObject(value)) return null;
    const id = text(value.id);
    const workspaceId = text(value.workspace_id);
    const driverId = text(value.driver_id);
    const truckId = text(value.truck_id);
    const effectiveFrom = text(value.effective_from);
    const effectiveTo = value.effective_to == null || value.effective_to === '' ? null : text(value.effective_to);
    const assignmentType = text(value.assignment_type);
    const status = text(value.status);
    const version = value.version;
    const createdAt = text(value.created_at);
    const updatedAt = text(value.updated_at);
    if (!id || !workspaceId || !driverId || !truckId) return null;
    if (!validTimestamp(effectiveFrom) || (effectiveTo && !validTimestamp(effectiveTo))) return null;
    if (effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) return null;
    if (!ASSIGNMENT_TYPES.has(assignmentType) || !STATUSES.has(status)) return null;
    if (!Number.isInteger(version) || version < 1 || !validTimestamp(createdAt) || !validTimestamp(updatedAt)) return null;
    if (!plainObject(value.provenance)) return null;
    return {
      id,
      workspaceId,
      driverId,
      truckId,
      effectiveFrom,
      effectiveTo,
      assignmentType,
      status,
      version,
      createdAt,
      updatedAt,
      provenance: { ...value.provenance },
    };
  }

  function isEffective(assignment, effectiveAt) {
    const at = Date.parse(effectiveAt);
    return assignment.status !== 'revoked'
      && Date.parse(assignment.effectiveFrom) <= at
      && (!assignment.effectiveTo || at < Date.parse(assignment.effectiveTo));
  }

  function validateResponse(wire, context) {
    context = context || {};
    const expectedView = text(context.view);
    const expectedWorkspaceId = text(context.workspaceId);
    const expectedDriverId = text(context.driverId);
    if (!plainObject(wire) || wire.ok !== true || !Array.isArray(wire.assignments) || text(wire.view) !== expectedView) {
      return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment response is malformed', {});
    }
    if (!expectedWorkspaceId || text(wire.workspace_id) !== expectedWorkspaceId) {
      return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'DriverTruckAssignment response does not match active workspace', {});
    }
    if (!expectedDriverId) {
      return fail(ERROR_CODES.DRIVER_MISMATCH, 'A proven Driver ID is required', {});
    }

    const assignments = [];
    const assignmentIds = new Set();
    let previousKey = null;
    for (let index = 0; index < wire.assignments.length; index += 1) {
      const assignment = normalizeAssignment(wire.assignments[index]);
      if (!assignment) return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment record is malformed', { index });
      if (assignment.workspaceId !== expectedWorkspaceId) {
        return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'DriverTruckAssignment record crosses workspace boundary', { assignmentId: assignment.id });
      }
      if (assignment.driverId !== expectedDriverId) {
        return fail(ERROR_CODES.DRIVER_MISMATCH, 'DriverTruckAssignment record belongs to another Driver', { assignmentId: assignment.id });
      }
      if (assignmentIds.has(assignment.id)) {
        return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment response contains a duplicate ID', { assignmentId: assignment.id });
      }
      const orderKey = assignment.effectiveFrom + '\u0000' + assignment.id;
      if (previousKey !== null && orderKey < previousKey) {
        return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment history is not deterministic', { index });
      }
      previousKey = orderKey;
      assignmentIds.add(assignment.id);
      assignments.push(assignment);
    }

    if (expectedView === 'history') {
      return { ok: true, workspaceId: expectedWorkspaceId, driverId: expectedDriverId, assignments };
    }

    const responseAsOf = text(wire.as_of);
    if (!validTimestamp(responseAsOf)) {
      return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment effective timestamp is malformed', {});
    }
    const requestedAsOf = text(context.effectiveAt);
    if (expectedView === 'as_of' && (!validTimestamp(requestedAsOf) || Date.parse(requestedAsOf) !== Date.parse(responseAsOf))) {
      return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment response uses an unexpected effective timestamp', {});
    }
    if (assignments.some(function (assignment) { return !isEffective(assignment, responseAsOf); })) {
      return fail(ERROR_CODES.INVALID_RESPONSE, 'DriverTruckAssignment response contains a non-effective assignment', {});
    }
    if (!assignments.length) {
      return fail(ERROR_CODES.NOT_FOUND, 'No effective DriverTruckAssignment exists', { effectiveAt: responseAsOf });
    }
    if (assignments.length > 1) {
      return fail(ERROR_CODES.AMBIGUOUS, 'Multiple effective DriverTruckAssignments exist', {
        effectiveAt: responseAsOf,
        candidateCount: assignments.length,
      });
    }
    const assignment = assignments.reduce(function (_only, candidate) { return candidate; }, null);
    return {
      ok: true,
      workspaceId: expectedWorkspaceId,
      driverId: expectedDriverId,
      effectiveAt: responseAsOf,
      assignment,
    };
  }

  function responseEnvelope(result) {
    if (!result || typeof result !== 'object') return { status: 0, data: result };
    if (result.data && typeof result.data === 'object') return { status: Number(result.status || 0), data: result.data };
    return { status: Number(result.status || 0), data: result };
  }

  function create(deps) {
    deps = deps || {};
    const request = deps.request;

    async function read(view, action, context) {
      context = context || {};
      const sessionToken = text(context.sessionToken);
      const workspaceId = text(context.workspaceId);
      const driverId = text(context.driverId);
      const effectiveAt = text(context.effectiveAt);
      if (!sessionToken || !workspaceId || !driverId || typeof request !== 'function') {
        return fail(ERROR_CODES.UNAUTHORIZED, 'Authenticated workspace and proven Driver context are required', {});
      }
      if (view === 'as_of' && !validTimestamp(effectiveAt)) {
        return fail(ERROR_CODES.INVALID_RESPONSE, 'A valid effectiveAt timestamp is required', {});
      }
      let result;
      try {
        const payload = { sessionToken, workspaceId, driverId };
        if (view === 'as_of') payload.effectiveAt = effectiveAt;
        result = await request(action, payload);
      } catch (error) {
        const status = Number(error && error.status || 0);
        if (status === 401 || status === 403) return fail(ERROR_CODES.UNAUTHORIZED, 'DriverTruckAssignment request was unauthorized', { status });
        return fail(ERROR_CODES.NETWORK_UNAVAILABLE, 'DriverTruckAssignment server is unavailable', {
          reason: text(error && error.code) || 'request_failed',
        });
      }
      const envelope = responseEnvelope(result);
      if (envelope.status === 401 || envelope.status === 403) {
        return fail(ERROR_CODES.UNAUTHORIZED, 'DriverTruckAssignment request was unauthorized', { status: envelope.status });
      }
      if (envelope.status >= 500 || !envelope.data || envelope.data.ok === false) {
        return fail(ERROR_CODES.SERVER_ERROR, 'DriverTruckAssignment server rejected the request', { status: envelope.status || 0 });
      }
      return validateResponse(envelope.data, { view, workspaceId, driverId, effectiveAt });
    }

    return Object.freeze({
      readCurrent: function (context) { return read('current', ACTIONS.CURRENT, context); },
      readHistory: function (context) { return read('history', ACTIONS.HISTORY, context); },
      readAsOf: function (context) { return read('as_of', ACTIONS.AS_OF, context); },
    });
  }

  global.CrewBIQDriverTruckAssignment = Object.freeze({
    ACTIONS,
    ERROR_CODES,
    validateResponse,
    create,
  });
})(typeof window !== 'undefined' ? window : globalThis);
