(function (global) {
  'use strict';

  const ACTION = 'account_driver_link_read';
  const ACCOUNT_ID_SPACE = 'crewbiq_account';
  const ERROR_CODES = Object.freeze({
    NOT_FOUND: 'account_driver_link_not_found',
    AMBIGUOUS: 'account_driver_link_ambiguous',
    UNAUTHORIZED: 'account_driver_link_unauthorized',
    INVALID_RESPONSE: 'account_driver_link_invalid_response',
    WORKSPACE_MISMATCH: 'account_driver_link_workspace_mismatch',
    ACCOUNT_MISMATCH: 'account_driver_link_account_mismatch',
    NETWORK_UNAVAILABLE: 'network_unavailable',
    SERVER_ERROR: 'server_error',
  });
  const PROVENANCE_SOURCES = new Set([
    'explicit', 'manual_admin', 'onboarding', 'verified_import', 'system_backfill', 'migration_proven',
  ]);

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

  function normalizeProvenance(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = text(value.source);
    const attributedByAccountId = text(value.attributedByAccountId);
    const attributedAt = text(value.attributedAt);
    const reason = text(value.reason);
    if (!PROVENANCE_SOURCES.has(source) || !attributedByAccountId || !validTimestamp(attributedAt)) return null;
    if (source === 'manual_admin' && !reason) return null;
    return { source, attributedByAccountId, attributedAt, reason: reason || null };
  }

  function normalizeLink(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const linkId = text(value.linkId || value.id);
    const workspaceId = text(value.workspaceId);
    const accountId = text(value.accountId);
    const driverId = text(value.driverId);
    const status = text(value.status);
    const effectiveFrom = text(value.effectiveFrom);
    const effectiveTo = value.effectiveTo == null || value.effectiveTo === '' ? null : text(value.effectiveTo);
    const provenance = normalizeProvenance(value.provenance);
    if (!linkId || !workspaceId || !accountId || !driverId || !['active', 'inactive', 'revoked'].includes(status)) return null;
    if (!validTimestamp(effectiveFrom) || (effectiveTo && !validTimestamp(effectiveTo))) return null;
    if (effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) return null;
    if (!provenance) return null;
    return { linkId, workspaceId, accountId, driverId, status, effectiveFrom, effectiveTo, provenance };
  }

  function isEffective(link, effectiveAt) {
    const at = Date.parse(effectiveAt);
    return link.status === 'active' && Date.parse(link.effectiveFrom) <= at && (!link.effectiveTo || at < Date.parse(link.effectiveTo));
  }

  function validateResponse(wire, context) {
    context = context || {};
    if (!wire || typeof wire !== 'object' || Array.isArray(wire) || wire.ok !== true || !Array.isArray(wire.links)) {
      return fail(ERROR_CODES.INVALID_RESPONSE, 'AccountDriverLink response is malformed', {});
    }
    const expectedWorkspaceId = text(context.workspaceId);
    const expectedAccountId = text(context.accountId);
    const responseWorkspaceId = text(wire.workspaceId);
    const responseAccountId = text(wire.accountId);
    if (!responseWorkspaceId || responseWorkspaceId !== expectedWorkspaceId) {
      return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'AccountDriverLink response does not match active workspace', {});
    }
    if (!responseAccountId || responseAccountId !== expectedAccountId || text(wire.accountIdSpace) !== ACCOUNT_ID_SPACE) {
      return fail(ERROR_CODES.ACCOUNT_MISMATCH, 'AccountDriverLink response does not match authenticated account', {});
    }
    const normalized = [];
    for (let index = 0; index < wire.links.length; index += 1) {
      const link = normalizeLink(wire.links[index]);
      if (!link) return fail(ERROR_CODES.INVALID_RESPONSE, 'AccountDriverLink record is malformed', { index });
      if (link.workspaceId !== expectedWorkspaceId) {
        return fail(ERROR_CODES.WORKSPACE_MISMATCH, 'AccountDriverLink record crosses workspace boundary', { linkId: link.linkId });
      }
      if (link.accountId !== expectedAccountId) {
        return fail(ERROR_CODES.ACCOUNT_MISMATCH, 'AccountDriverLink record belongs to another account', { linkId: link.linkId });
      }
      normalized.push(link);
    }
    const effectiveAt = text(context.effectiveAt);
    if (!validTimestamp(effectiveAt)) return fail(ERROR_CODES.INVALID_RESPONSE, 'A valid effectiveAt timestamp is required', {});
    const active = normalized.filter(function (link) { return isEffective(link, effectiveAt); });
    if (!active.length) return fail(ERROR_CODES.NOT_FOUND, 'No active AccountDriverLink exists', { effectiveAt });
    if (active.length > 1) return fail(ERROR_CODES.AMBIGUOUS, 'Multiple active AccountDriverLinks exist', { effectiveAt, candidateCount: active.length });
    const link = active.reduce(function (_only, candidate) { return candidate; }, null);
    return {
      ok: true,
      link,
      proof: {
        type: 'canonical_account_driver_link',
        proof: 'canonical_account_driver_link',
        workspaceId: link.workspaceId,
        accountId: link.accountId,
        driverId: link.driverId,
        driverProfileId: link.driverId,
        recordCrewId: link.accountId,
        linkId: link.linkId,
        effectiveFrom: link.effectiveFrom,
        effectiveTo: link.effectiveTo,
        provenance: { ...link.provenance },
      },
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
    const now = typeof deps.now === 'function' ? deps.now : function () { return new Date().toISOString(); };

    async function read(context) {
      context = context || {};
      const sessionToken = text(context.sessionToken);
      const workspaceId = text(context.workspaceId);
      const accountId = text(context.accountId);
      if (!sessionToken || !workspaceId || !accountId || typeof request !== 'function') {
        return fail(ERROR_CODES.UNAUTHORIZED, 'Authenticated AccountDriverLink request context is required', {});
      }
      let result;
      try {
        result = await request(ACTION, { sessionToken, workspaceId, accountId });
      } catch (error) {
        const status = Number(error && error.status || 0);
        if (status === 401 || status === 403) return fail(ERROR_CODES.UNAUTHORIZED, 'AccountDriverLink request was unauthorized', { status });
        return fail(ERROR_CODES.NETWORK_UNAVAILABLE, 'AccountDriverLink server is unavailable', {
          reason: text(error && error.code) || 'request_failed',
        });
      }
      const envelope = responseEnvelope(result);
      if (envelope.status === 401 || envelope.status === 403 || (envelope.data && envelope.data.code === 'unauthorized')) {
        return fail(ERROR_CODES.UNAUTHORIZED, 'AccountDriverLink request was unauthorized', { status: envelope.status || 401 });
      }
      if (envelope.status >= 500 || !envelope.data || envelope.data.ok === false) {
        return fail(ERROR_CODES.SERVER_ERROR, 'AccountDriverLink server rejected the request', { status: envelope.status || 0 });
      }
      return validateResponse(envelope.data, {
        workspaceId,
        accountId,
        effectiveAt: text(context.effectiveAt) || now(),
      });
    }

    return Object.freeze({ read });
  }

  global.CrewBIQIdentityLink = Object.freeze({
    ACTION,
    ACCOUNT_ID_SPACE,
    ERROR_CODES,
    validateResponse,
    create,
  });
})(typeof window !== 'undefined' ? window : globalThis);
