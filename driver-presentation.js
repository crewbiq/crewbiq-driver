(function (global) {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function create(deps) {
    deps = deps || {};
    let generation = 0;
    let requestKey = '';
    let request = null;
    const now = typeof deps.now === 'function' ? deps.now : function () { return new Date().toISOString(); };
    function emptyResult(status) {
      return { context: null, projection: null, selfState: { status: status || 'unavailable' }, applyDriver: false };
    }
    function publish(result) {
      if (typeof deps.onResult === 'function') deps.onResult(result);
      return result;
    }
    function input() {
      const session = deps.getSession();
      if (!session || !text(session.sessionToken)) return null;
      const workspace = deps.resolveWorkspace(session);
      const accountId = text(deps.getAccountId(session));
      if (!workspace || workspace.ok !== true || !text(workspace.workspaceId) || !accountId) return null;
      return {
        session,
        sessionToken: text(session.sessionToken),
        workspaceId: text(workspace.workspaceId),
        accountId,
        key: [text(session.sessionToken), text(workspace.workspaceId), accountId].join('|'),
      };
    }
    function invalidate() {
      generation += 1;
      requestKey = '';
      request = null;
      return publish(emptyResult());
    }
    function refresh(force) {
      let current;
      try { current = input(); } catch (_error) { current = null; }
      if (!current) return Promise.resolve(invalidate());
      if (!force && request && requestKey === current.key) return request;
      generation += 1;
      const ownGeneration = generation;
      requestKey = current.key;
      publish(emptyResult());
      const effectiveAt = now();
      let linkResult = null;
      let assignmentResult = null;
      const reader = deps.createSelfReader({
        readAccountDriverLink: async function (payload) {
          linkResult = await deps.readAccountDriverLink(payload);
          return linkResult;
        },
        readCurrentAssignment: async function (payload) {
          assignmentResult = await deps.readCurrentAssignment(payload);
          return assignmentResult;
        },
      });
      request = reader.read({
        sessionToken: current.sessionToken, workspaceId: current.workspaceId,
        accountId: current.accountId, effectiveAt,
      }).then(function (selfState) {
        let latest;
        try { latest = input(); } catch (_error) { latest = null; }
        if (generation !== ownGeneration || !latest || latest.key !== current.key) return emptyResult();
        const context = deps.resolvePresentationContext({
          session: { authenticated: true, activeWorkspaceId: current.workspaceId, accountId: current.accountId },
          memberships: ((current.session || {}).me || {}).memberships,
          legacyPersona: deps.getLegacyPersona(),
          effectiveAt,
          accountDriverLink: linkResult,
          driverTruckAssignments: assignmentResult,
        });
        const projection = deps.projectNavigation(context, deps.navigationModel);
        const applyDriver = selfState && selfState.status === 'success'
          && projection && projection.status === 'resolved'
          && projection.membershipRole === 'driver'
          && !!text(projection.workspaceId)
          && projection.presentationPersona === 'driver';
        return publish({ context, projection, selfState, applyDriver: !!applyDriver, snapshotKey: current.key });
      }).catch(function () {
        if (generation === ownGeneration) return publish(emptyResult());
        return emptyResult();
      });
      return request;
    }
    return Object.freeze({ refresh, invalidate });
  }
  global.CrewBIQDriverPresentation = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
