/**
 * CrewBIQ active workspace attribution.
 * Pure resolver: callers must provide the authenticated Orchestrator session.
 */
(function (global) {
  'use strict';

  const ERROR_CODES = Object.freeze({
    NOT_RESOLVED: 'workspace_not_resolved',
    AMBIGUOUS: 'workspace_ambiguous',
    UNAUTHORIZED: 'workspace_unauthorized',
  });

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function failure(code) {
    return { ok: false, code };
  }

  function resolveActiveWorkspace(context) {
    if (!context || typeof context !== 'object' || !text(context.sessionToken)) {
      return failure(ERROR_CODES.UNAUTHORIZED);
    }

    const me = context.me;
    if (!me || typeof me !== 'object') return failure(ERROR_CODES.UNAUTHORIZED);

    const activeWorkspaceId = text(context.activeWorkspaceIdOverride) || text(me.active_workspace_id);
    if (!activeWorkspaceId) return failure(ERROR_CODES.NOT_RESOLVED);

    const memberships = Array.isArray(me.memberships) ? me.memberships : [];
    const matches = memberships.filter((membership) => {
      const workspace = membership && typeof membership === 'object' ? membership.workspace : null;
      return text(workspace && workspace.id) === activeWorkspaceId;
    });

    if (matches.length > 1) return failure(ERROR_CODES.AMBIGUOUS);
    if (matches.length !== 1) return failure(ERROR_CODES.UNAUTHORIZED);

    return { ok: true, workspaceId: activeWorkspaceId };
  }

  function attributeNewRecord(record, context) {
    const nextRecord = record && typeof record === 'object' ? { ...record } : {};
    const resolution = resolveActiveWorkspace(context);
    if (resolution.ok) nextRecord.workspaceId = resolution.workspaceId;
    return { record: nextRecord, resolution };
  }

  global.CrewBIQWorkspaceAttribution = Object.freeze({
    ERROR_CODES,
    resolveActiveWorkspace,
    attributeNewRecord,
  });
})(typeof window !== 'undefined' ? window : globalThis);
