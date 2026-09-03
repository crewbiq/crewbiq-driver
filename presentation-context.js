(function (global) {
  'use strict';

  const ROLES = new Set(['driver', 'fleet', 'carrier']);
  const LEGACY_PERSONAS = new Set(['driver', 'owner_op', 'fleet']);
  function text(value) { return String(value == null ? '' : value).trim(); }
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function timestamp(value) { const item = text(value); return item && /T/.test(item) && !Number.isNaN(Date.parse(item)) ? item : null; }
  function workspaceIdOf(value) { return text(value && (value.workspaceId || value.workspace_id || (value.workspace || {}).id)); }
  function emptyScope() { return { carrierAssignmentIds: [], accountDriverLinkId: null, truckOwnershipIds: [], currentDriverTruckAssignment: null }; }
  function empty(status, legacyPersona) {
    return { status, workspaceId: null, membershipRole: null, capabilities: [], relationshipScope: emptyScope(), legacyPersona };
  }
  function legacyPersonaOf(evidence) {
    const value = text(evidence && evidence.legacyPersona);
    return LEGACY_PERSONAS.has(value) ? value : null;
  }
  function effective(value, effectiveAt) {
    if (!object(value) || text(value.status) !== 'active') return false;
    const start = timestamp(value.effectiveFrom || value.effective_from);
    const rawEnd = value.effectiveTo == null ? value.effective_to : value.effectiveTo;
    const end = rawEnd == null || rawEnd === '' ? null : timestamp(rawEnd);
    const at = timestamp(effectiveAt);
    return !!start && !!at && (!rawEnd || !!end) && (!end || Date.parse(end) > Date.parse(start))
      && Date.parse(start) <= Date.parse(at) && (!end || Date.parse(at) < Date.parse(end));
  }
  function uniqueSorted(values) { return Array.from(new Set(values)).sort(); }
  function accountDriverLink(evidence, workspaceId, accountId, effectiveAt) {
    const envelope = evidence.accountDriverLink;
    const link = object(envelope) && envelope.ok === true && object(envelope.link) ? envelope.link : null;
    if (!link || workspaceIdOf(link) !== workspaceId || text(link.accountId) !== accountId
      || !text(link.linkId || link.id) || !text(link.driverId) || !effective(link, effectiveAt)) return null;
    return link;
  }
  function ownershipIds(evidence, workspaceId, accountId, effectiveAt) {
    const envelope = evidence.truckOwnership;
    if (!object(envelope) || envelope.ok !== true || !Array.isArray(envelope.ownerships)) return [];
    const ids = [];
    for (const row of envelope.ownerships) {
      if (!object(row) || workspaceIdOf(row) !== workspaceId || text(row.accountId) !== accountId
        || !text(row.id) || !text(row.truckId) || !effective(row, effectiveAt)) return [];
      ids.push(text(row.id));
    }
    return ids.length === new Set(ids).size ? uniqueSorted(ids) : [];
  }
  function carrierAssignmentIds(evidence, workspaceId, effectiveAt, role) {
    if (role !== 'carrier') return [];
    const envelope = evidence.carrierAssignments;
    if (!object(envelope) || envelope.ok !== true || !Array.isArray(envelope.assignments)) return [];
    const ids = [];
    for (const row of envelope.assignments) {
      if (!object(row) || text(row.carrierWorkspaceId || row.carrier_workspace_id) !== workspaceId
        || !text(row.fleetWorkspaceId || row.fleet_workspace_id) || !text(row.id)) continue;
      if (effective(row, effectiveAt)) ids.push(text(row.id));
    }
    return ids.length === new Set(ids).size ? uniqueSorted(ids) : [];
  }
  function currentAssignment(evidence, workspaceId, driverId, effectiveAt) {
    if (!driverId) return null;
    const envelope = evidence.driverTruckAssignments;
    if (!object(envelope) || envelope.ok !== true) return null;
    const rows = Array.isArray(envelope.assignments) ? envelope.assignments : object(envelope.assignment) ? [envelope.assignment] : [];
    const current = [];
    for (const row of rows) {
      const truckId = text(row && (row.truckId || row.truck_id));
      const rowDriverId = text(row && (row.driverId || row.driver_id));
      const start = timestamp(row && (row.effectiveFrom || row.effective_from));
      if (!object(row) || workspaceIdOf(row) !== workspaceId || rowDriverId !== driverId || !truckId || !start) return null;
      if (effective(row, effectiveAt)) current.push({ truckId, driverId: rowDriverId, effectiveFrom: start });
    }
    return current.length === 1 ? current[0] : null;
  }

  function resolvePresentationContext(sessionEvidence) {
    const evidence = object(sessionEvidence) ? sessionEvidence : {};
    const persona = legacyPersonaOf(evidence);
    const session = object(evidence.session) ? evidence.session : null;
    const workspaceId = text(session && (session.activeWorkspaceId || session.active_workspace_id));
    const accountId = text(session && (session.accountId || session.account_id || session.crewbiq_id));
    const authenticated = !!session && (session.authenticated === true || !!text(session.sessionToken || session.session_token));
    if (!authenticated || !workspaceId || !Array.isArray(evidence.memberships)) return empty('unavailable', persona);
    const memberships = evidence.memberships.filter(function (membership) {
      return object(membership) && text(membership.status) === 'active' && workspaceIdOf(membership) === workspaceId;
    });
    if (!memberships.length) return empty('unavailable', persona);
    if (memberships.length !== 1) return empty('ambiguous', persona);
    const membership = memberships[0];
    const roles = Array.isArray(membership.roles) ? membership.roles.map(text).filter(Boolean) : [];
    if (roles.length !== 1 || !ROLES.has(roles[0])) return empty('unauthorized', persona);
    const role = roles[0];
    const effectiveAt = timestamp(evidence.effectiveAt);
    const link = accountDriverLink(evidence, workspaceId, accountId, effectiveAt);
    const capabilities = Array.isArray(membership.capabilities) ? uniqueSorted(membership.capabilities.map(text).filter(Boolean)) : [];
    return {
      status: 'resolved', workspaceId, membershipRole: role, capabilities,
      relationshipScope: {
        carrierAssignmentIds: carrierAssignmentIds(evidence, workspaceId, effectiveAt, role),
        accountDriverLinkId: link ? text(link.linkId || link.id) : null,
        truckOwnershipIds: ownershipIds(evidence, workspaceId, accountId, effectiveAt),
        currentDriverTruckAssignment: currentAssignment(evidence, workspaceId, link ? text(link.driverId) : '', effectiveAt),
      },
      legacyPersona: persona,
    };
  }
  global.CrewBIQPresentationContext = Object.freeze({ resolvePresentationContext });
})(typeof window !== 'undefined' ? window : globalThis);
