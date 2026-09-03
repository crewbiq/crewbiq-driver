(function (global) {
  'use strict';

  const CANONICAL_ROLES = new Set(['driver', 'fleet', 'carrier']);
  const LEGACY_PERSONAS = new Set(['driver', 'owner_op', 'fleet']);
  function text(value) { return String(value == null ? '' : value).trim(); }
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function empty(status, reason) {
    return Object.freeze({
      status,
      reason,
      workspaceId: null,
      membershipRole: null,
      presentationPersona: null,
      roleConfig: null,
      functionGroups: Object.freeze([]),
      roleMenuTargets: Object.freeze([]),
      groupedTargets: Object.freeze([]),
      bottomDestinations: Object.freeze([]),
      pageRegistry: null,
    });
  }
  function validModel(model) {
    return object(model) && object(model.ROLE_CONFIG) && object(model.PAGE_REGISTRY)
      && Array.isArray(model.FUNCTION_GROUPS)
      && typeof model.roleConfig === 'function'
      && typeof model.visibleFunctionGroups === 'function'
      && typeof model.roleMenuTargets === 'function'
      && typeof model.groupedTargets === 'function'
      && typeof model.bottomDestinationsForRole === 'function';
  }
  function personaFor(context) {
    const role = text(context.membershipRole);
    const legacy = text(context.legacyPersona);
    if (role === 'driver') return 'driver';
    if (role !== 'fleet') return null;
    if (legacy === 'driver' || legacy === 'owner_op') return legacy;
    return 'fleet';
  }

  function projectNavigation(presentationContext, navigationModel) {
    const context = object(presentationContext) ? presentationContext : {};
    const status = text(context.status);
    if (status !== 'resolved') {
      return empty(['unavailable', 'unauthorized', 'ambiguous'].includes(status) ? status : 'unavailable', 'presentation_context_not_resolved');
    }
    const role = text(context.membershipRole);
    const workspaceId = text(context.workspaceId);
    if (!CANONICAL_ROLES.has(role) || !workspaceId || !validModel(navigationModel)) {
      return empty('unauthorized', 'navigation_projection_input_invalid');
    }
    if (role === 'carrier') return empty('unavailable', 'carrier_navigation_not_available');
    const legacy = text(context.legacyPersona);
    if (legacy && !LEGACY_PERSONAS.has(legacy)) return empty('unauthorized', 'legacy_persona_invalid');
    const persona = personaFor(context);
    const roleConfig = navigationModel.roleConfig(persona);
    if (!roleConfig || roleConfig !== navigationModel.ROLE_CONFIG[persona]) {
      return empty('unavailable', 'navigation_model_inconsistent');
    }
    return Object.freeze({
      status: 'resolved',
      reason: null,
      workspaceId,
      membershipRole: role,
      presentationPersona: persona,
      roleConfig,
      functionGroups: navigationModel.visibleFunctionGroups(persona),
      roleMenuTargets: navigationModel.roleMenuTargets(persona),
      groupedTargets: navigationModel.groupedTargets(persona),
      bottomDestinations: navigationModel.bottomDestinationsForRole(persona),
      pageRegistry: navigationModel.PAGE_REGISTRY,
    });
  }

  global.CrewBIQNavigationProjection = Object.freeze({ projectNavigation });
})(typeof window !== 'undefined' ? window : globalThis);
