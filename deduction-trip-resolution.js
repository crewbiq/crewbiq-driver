/**
 * CrewBIQ trip-date deduction resolution v0.1.0
 *
 * Resolves the deduction policy version that applies to every load date and
 * derives deterministic weekly settlement candidates without multiplying a
 * weekly policy by the number of loads. Existing weekly snapshots remain the
 * immutable accounting source of truth for their week.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function text(value) { return String(value || '').trim(); }
  function dateText(value) { return text(value).slice(0, 10); }

  function tripDate(load) {
    return dateText(load && (
      load.pickup || load.pickupDate || load.date || load.delivery ||
      load.deliveryDate || load.completedAt || load.createdAt
    ));
  }

  function weekKey(value) {
    const date = dateText(value);
    if (!date) return '';
    if (typeof global.getWeekKey === 'function') {
      const resolved = dateText(global.getWeekKey(date));
      if (resolved) return resolved;
    }
    const parsed = new Date(date + 'T12:00:00Z');
    if (Number.isNaN(parsed.getTime())) return '';
    const day = parsed.getUTCDay();
    const delta = day === 0 ? -6 : 1 - day;
    parsed.setUTCDate(parsed.getUTCDate() + delta);
    return parsed.toISOString().slice(0, 10);
  }

  function policyId(policy) {
    return text(policy && (policy.policyId || policy.policy_id));
  }

  function policyVersionId(policy) {
    return text(policy && (policy.id || policy.templateId || policy.template_id));
  }

  function policyStart(policy) {
    return dateText(policy && (policy.effectiveFrom || policy.effective_from)) || '0001-01-01';
  }

  function policyEnd(policy) {
    return dateText(policy && (policy.effectiveTo || policy.effective_to));
  }

  function fallbackEffectivePolicies(templates, truckId, targetDate) {
    const target = dateText(targetDate);
    const selected = new Map();
    (Array.isArray(templates) ? templates : []).forEach(function (policy) {
      if (!policy || text(policy.truckId) !== text(truckId)) return;
      const start = policyStart(policy);
      const end = policyEnd(policy);
      if (target && start > target) return;
      if (target && end && end < target) return;
      const lineage = policyId(policy) || [
        text(policy.truckId), text(policy.name).toLowerCase(), text(policy.category).toLowerCase(),
      ].join('|');
      const current = selected.get(lineage);
      if (!current || policyStart(current) < start || (
        policyStart(current) === start && Number(current.version || 0) <= Number(policy.version || 0)
      )) selected.set(lineage, policy);
    });
    return Array.from(selected.values());
  }

  function effectivePolicies(templates, truckId, targetDate) {
    const api = global.CrewBIQDeductionPolicies;
    if (api && typeof api.effectivePolicies === 'function') {
      return api.effectivePolicies(templates, truckId, targetDate);
    }
    return fallbackEffectivePolicies(templates, truckId, targetDate);
  }

  function snapshotItem(policy, truck) {
    return {
      policyId: policyId(policy),
      policyVersionId: policyVersionId(policy),
      version: Number(policy && policy.version || 0),
      name: text(policy && policy.name),
      amount: Number(policy && policy.amount || 0),
      category: text(policy && policy.category) || 'other',
      truckId: text(truck && truck.id),
      unitNumber: text(truck && truck.unitNumber),
      company: text((policy && policy.company) || (truck && truck.company)),
      effectiveFrom: policyStart(policy),
      effectiveTo: policyEnd(policy),
    };
  }

  function loadIdentity(load, index) {
    return text(load && (load.id || load.loadId || load.reference || load.loadNumber)) || ('load_' + index);
  }

  function resolveLoad(load, truck, templates, index) {
    const date = tripDate(load);
    const truckId = text(truck && truck.id) || text(load && load.truckId);
    const policies = date && truckId ? effectivePolicies(templates, truckId, date) : [];
    const items = policies.map(function (policy) { return snapshotItem(policy, truck); });
    return {
      loadId: loadIdentity(load, index || 0),
      tripDate: date,
      weekKey: weekKey(date),
      truckId,
      unitNumber: text((truck && truck.unitNumber) || (load && load.unitNumber)),
      gap: !items.length,
      items,
      total: items.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0),
    };
  }

  function sameTruck(snapshot, truckId) {
    return text(snapshot && snapshot.truckId) === text(truckId);
  }

  function versionKey(item) {
    return text(item.policyVersionId) || [
      text(item.policyId), text(item.effectiveFrom), text(item.effectiveTo), String(Number(item.amount || 0)),
    ].join('|');
  }

  function resolveSettlements(loads, truck, templates, weeklySnapshots) {
    const truckId = text(truck && truck.id);
    const groups = new Map();
    const loadResolutions = (Array.isArray(loads) ? loads : [])
      .map(function (load, index) { return resolveLoad(load, truck, templates, index); })
      .filter(function (resolution) { return !!resolution.weekKey; })
      .sort(function (a, b) {
        return a.tripDate.localeCompare(b.tripDate) || a.loadId.localeCompare(b.loadId);
      });

    loadResolutions.forEach(function (resolution) {
      if (!groups.has(resolution.weekKey)) groups.set(resolution.weekKey, []);
      groups.get(resolution.weekKey).push(resolution);
    });

    const snapshots = Array.isArray(weeklySnapshots) ? weeklySnapshots : [];
    const settlements = Array.from(groups.entries()).map(function (entry) {
      const currentWeek = entry[0];
      const resolutions = entry[1];
      const existing = snapshots.find(function (snapshot) {
        return dateText(snapshot && snapshot.weekKey) === currentWeek && sameTruck(snapshot, truckId);
      });

      if (existing) {
        return {
          id: text(existing.id),
          source: 'immutable_weekly_snapshot',
          immutable: true,
          weekKey: currentWeek,
          truckId,
          unitNumber: text((truck && truck.unitNumber) || existing.unitNumber),
          items: clone(Array.isArray(existing.items) ? existing.items : []),
          total: Number(existing.total || 0),
          loadResolutions: resolutions,
        };
      }

      const distinctVersions = new Map();
      resolutions.forEach(function (resolution) {
        resolution.items.forEach(function (item) {
          const key = versionKey(item);
          if (!distinctVersions.has(key)) distinctVersions.set(key, item);
        });
      });
      const items = Array.from(distinctVersions.values()).sort(function (a, b) {
        return text(a.name).localeCompare(text(b.name)) || text(a.effectiveFrom).localeCompare(text(b.effectiveFrom));
      });
      return {
        id: 'auto_wd_' + truckId + '_' + currentWeek,
        source: 'trip_date_auto',
        immutable: false,
        weekKey: currentWeek,
        truckId,
        unitNumber: text(truck && truck.unitNumber),
        company: text(truck && truck.company),
        items,
        total: items.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0),
        policySnapshotVersion: 2,
        resolutionRule: 'one_charge_per_policy_version_encountered_in_week',
        loadResolutions: resolutions,
      };
    });

    return {
      settlements,
      loadResolutions,
      automaticTotal: settlements
        .filter(function (settlement) { return settlement.source === 'trip_date_auto'; })
        .reduce(function (sum, settlement) { return sum + Number(settlement.total || 0); }, 0),
      gapCount: loadResolutions.filter(function (resolution) { return resolution.gap; }).length,
    };
  }

  function installFinanceWrapper() {
    const original = global.ownerFinanceForTruck;
    if (typeof original !== 'function' || original.__crewbiqTripDateDeductions) return false;

    const wrapped = function (truck, period) {
      const base = original.apply(this, arguments);
      if (!truck || !base || !Array.isArray(base.loads)) return base;
      const templates = typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
      const weekly = typeof global.loadWeeklyDeds === 'function' ? global.loadWeeklyDeds() : [];
      const resolved = resolveSettlements(base.loads, truck, templates, weekly);
      const automatic = Number(resolved.automaticTotal || 0);
      const deductionTotal = Number(base.deductionTotal || 0) + automatic;
      const realNet = Number(base.realNet || 0) - automatic;
      return {
        ...base,
        deductionTotal,
        automaticDeductionTotal: automatic,
        realNet,
        cpm: Number(base.miles || 0) ? realNet / Number(base.miles || 0) : 0,
        deductionSettlements: resolved.settlements,
        deductionLoadResolutions: resolved.loadResolutions,
        deductionResolutionGapCount: resolved.gapCount,
      };
    };
    wrapped.__crewbiqTripDateDeductions = true;
    wrapped.__crewbiqPrevious = original;
    global.ownerFinanceForTruck = wrapped;
    return true;
  }

  global.CrewBIQDeductionTripResolution = {
    version: VERSION,
    tripDate,
    weekKey,
    resolveLoad,
    resolveSettlements,
    installFinanceWrapper,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFinanceWrapper);
    else setTimeout(installFinanceWrapper, 0);
  }

  console.info('[CrewBIQ Deductions] trip-date settlement resolution v' + VERSION + ' loaded');
})(window);
