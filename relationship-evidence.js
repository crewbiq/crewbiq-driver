(function (global) {
  'use strict';

  const ACTIONS = Object.freeze({ TRUCK_OWNERSHIP: 'truck_ownership_read', CARRIER_ASSIGNMENTS: 'carrier_assignments_read' });
  const ERROR_CODES = Object.freeze({
    UNAUTHORIZED: 'relationship_evidence_unauthorized',
    INVALID_RESPONSE: 'relationship_evidence_invalid_response',
    WORKSPACE_MISMATCH: 'relationship_evidence_workspace_mismatch',
    ACCOUNT_MISMATCH: 'relationship_evidence_account_mismatch',
    NETWORK_UNAVAILABLE: 'network_unavailable',
    SERVER_ERROR: 'server_error',
  });

  function text(value) { return String(value == null ? '' : value).trim(); }
  function plainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function validTimestamp(value) {
    const candidate = text(value);
    return !!candidate && /T/.test(candidate) && !Number.isNaN(Date.parse(candidate));
  }
  function fail(code, message, details) { return { ok: false, code, message, details: details || {} }; }
  function activeInterval(value, effectiveAt) {
    if (text(value.status) !== 'active' || !validTimestamp(value.effectiveFrom)) return false;
    const end = value.effectiveTo == null || value.effectiveTo === '' ? null : text(value.effectiveTo);
    if (end && (!validTimestamp(end) || Date.parse(end) <= Date.parse(value.effectiveFrom))) return false;
    const at = Date.parse(effectiveAt);
    return Date.parse(value.effectiveFrom) <= at && (!end || at < Date.parse(end));
  }
  function ownershipRecord(value, context) {
    if (!plainObject(value) || !plainObject(value.provenance)) return null;
    const record = {
      id: text(value.id), workspaceId: text(value.workspaceId), accountId: text(value.accountId), truckId: text(value.truckId),
      status: text(value.status), effectiveFrom: text(value.effectiveFrom),
      effectiveTo: value.effectiveTo == null || value.effectiveTo === '' ? null : text(value.effectiveTo),
      provenance: { ...value.provenance },
    };
    if (!record.id || record.workspaceId !== context.workspaceId || record.accountId !== context.accountId || !record.truckId) return null;
    return activeInterval(record, context.effectiveAt) ? record : null;
  }
  function carrierRecord(value, context) {
    if (!plainObject(value) || !plainObject(value.provenance)) return null;
    const record = {
      id: text(value.id), carrierWorkspaceId: text(value.carrierWorkspaceId), fleetWorkspaceId: text(value.fleetWorkspaceId),
      truckId: text(value.truckId), driverId: value.driverId == null || value.driverId === '' ? null : text(value.driverId),
      status: text(value.status), effectiveFrom: text(value.effectiveFrom),
      effectiveTo: value.effectiveTo == null || value.effectiveTo === '' ? null : text(value.effectiveTo),
      provenance: { ...value.provenance },
    };
    if (!record.id || record.carrierWorkspaceId !== context.workspaceId || !record.fleetWorkspaceId
      || record.fleetWorkspaceId === record.carrierWorkspaceId || !record.truckId) return null;
    return activeInterval(record, context.effectiveAt) ? record : null;
  }
  function normalizeList(values, normalizer, context) {
    const records = [];
    const ids = new Set();
    const trucks = new Set();
    for (let index = 0; index < values.length; index += 1) {
      const record = normalizer(values[index], context);
      if (!record || ids.has(record.id) || trucks.has(record.truckId)) return null;
      ids.add(record.id); trucks.add(record.truckId); records.push(record);
    }
    return records;
  }
  function validateTruckOwnershipResponse(wire, context) {
    context = context || {};
    const expected = { workspaceId: text(context.workspaceId), accountId: text(context.accountId), effectiveAt: text(context.effectiveAt) };
    if (!plainObject(wire) || wire.ok !== true || !Array.isArray(wire.ownerships) || !validTimestamp(expected.effectiveAt))
      return fail(ERROR_CODES.INVALID_RESPONSE, 'TruckOwnership response is malformed', {});
    if (text(wire.workspaceId) !== expected.workspaceId)
      return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'TruckOwnership response does not match active workspace', {});
    if (text(wire.accountId) !== expected.accountId || text(wire.accountIdSpace) !== 'crewbiq_account')
      return fail(ERROR_CODES.ACCOUNT_MISMATCH, 'TruckOwnership response does not match authenticated account', {});
    const ownerships = normalizeList(wire.ownerships, ownershipRecord, expected);
    if (!ownerships) return fail(ERROR_CODES.INVALID_RESPONSE, 'TruckOwnership evidence is malformed or ambiguous', {});
    ownerships.sort(function (a, b) { return a.truckId.localeCompare(b.truckId) || a.id.localeCompare(b.id); });
    return { ok: true, workspaceId: expected.workspaceId, accountId: expected.accountId, ownerships };
  }
  function validateCarrierAssignmentsResponse(wire, context) {
    context = context || {};
    const expected = { workspaceId: text(context.workspaceId), effectiveAt: text(context.effectiveAt) };
    if (!plainObject(wire) || wire.ok !== true || !Array.isArray(wire.assignments) || !validTimestamp(expected.effectiveAt))
      return fail(ERROR_CODES.INVALID_RESPONSE, 'CarrierAssignment response is malformed', {});
    if (text(wire.carrierWorkspaceId) !== expected.workspaceId)
      return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'CarrierAssignment response does not match carrier home workspace', {});
    const assignments = normalizeList(wire.assignments, carrierRecord, expected);
    if (!assignments) return fail(ERROR_CODES.INVALID_RESPONSE, 'CarrierAssignment evidence is malformed or ambiguous', {});
    assignments.sort(function (a, b) {
      return a.fleetWorkspaceId.localeCompare(b.fleetWorkspaceId) || a.truckId.localeCompare(b.truckId) || a.id.localeCompare(b.id);
    });
    return { ok: true, carrierWorkspaceId: expected.workspaceId, assignments };
  }
  function envelope(result) {
    if (!plainObject(result)) return { status: 0, data: result };
    if (plainObject(result.data)) return { status: Number(result.status || 0), data: result.data };
    return { status: Number(result.status || 0), data: result };
  }
  function create(deps) {
    deps = deps || {};
    const request = deps.request;
    const now = typeof deps.now === 'function' ? deps.now : function () { return new Date().toISOString(); };
    async function read(action, context, validator) {
      context = context || {};
      const sessionToken = text(context.sessionToken), workspaceId = text(context.workspaceId), accountId = text(context.accountId);
      if (!sessionToken || !workspaceId || typeof request !== 'function' || (action === ACTIONS.TRUCK_OWNERSHIP && !accountId))
        return fail(ERROR_CODES.UNAUTHORIZED, 'Authenticated canonical relationship context is required', {});
      let result;
      try {
        result = await request(action, action === ACTIONS.TRUCK_OWNERSHIP
          ? { sessionToken, workspaceId, accountId } : { sessionToken, workspaceId });
      } catch (error) {
        const status = Number(error && error.status || 0);
        if (status === 401 || status === 403) return fail(ERROR_CODES.UNAUTHORIZED, 'Relationship evidence request was unauthorized', { status });
        return fail(ERROR_CODES.NETWORK_UNAVAILABLE, 'Relationship evidence server is unavailable', { reason: text(error && error.code) || 'request_failed' });
      }
      const response = envelope(result);
      if (response.status === 401 || response.status === 403)
        return fail(ERROR_CODES.UNAUTHORIZED, 'Relationship evidence request was unauthorized', { status: response.status });
      if (response.status >= 500 || !plainObject(response.data) || response.data.ok === false)
        return fail(ERROR_CODES.SERVER_ERROR, 'Relationship evidence server rejected the request', { status: response.status });
      return validator(response.data, { workspaceId, accountId, effectiveAt: text(context.effectiveAt) || now() });
    }
    return Object.freeze({
      readTruckOwnership: function (context) { return read(ACTIONS.TRUCK_OWNERSHIP, context, validateTruckOwnershipResponse); },
      readCarrierAssignments: function (context) { return read(ACTIONS.CARRIER_ASSIGNMENTS, context, validateCarrierAssignmentsResponse); },
    });
  }
  global.CrewBIQRelationshipEvidence = Object.freeze({ ACTIONS, ERROR_CODES, validateTruckOwnershipResponse, validateCarrierAssignmentsResponse, create });
})(typeof window !== 'undefined' ? window : globalThis);
