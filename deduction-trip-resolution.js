/**
 * CrewBIQ settlement-date deduction resolution v0.2.0
 *
 * Loads are grouped into the truck/company settlement calendar. One policy
 * version per lineage is selected on the configured settlement-week end date,
 * so a mid-week Start Date never charges both old and new weekly amounts.
 * Existing weekly snapshots remain immutable and always suppress auto charges.
 */
(function (global) {
  'use strict';

  const VERSION = '0.2.0';

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function text(value) { return String(value == null ? '' : value).trim(); }
  function dateText(value) { return text(value).slice(0, 10); }

  function addDays(value, amount) {
    const date = new Date(dateText(value) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + Number(amount || 0));
    return date.toISOString().slice(0, 10);
  }

  function tripDate(load) {
    return dateText(load && (
      load.pickup || load.pickupDate || load.date || load.delivery ||
      load.deliveryDate || load.completedAt || load.createdAt
    ));
  }

  function fallbackWeekEndDay(truck) {
    if (truck && text(truck.weekType).toLowerCase() === 'custom') {
      const parsed = Number(truck.weekEndDay);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) return parsed;
    }
    return 0; // Existing PWA behavior: Monday-Sunday.
  }

  function settlementPeriod(value, truck) {
    const api = global.CrewBIQSettlementWeek;
    if (api && typeof api.periodForDate === 'function') return api.periodForDate(value, truck);

    const date = new Date(dateText(value) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) {
      return { weekType: 'legacy', weekEndDay: 0, weekEndDayLabel: 'Sunday', start: '', end: '' };
    }
    const weekEndDay = fallbackWeekEndDay(truck);
    const delta = (weekEndDay - date.getUTCDay() + 7) % 7;
    date.setUTCDate(date.getUTCDate() + delta);
    const end = date.toISOString().slice(0, 10);
    return {
      weekType: truck && text(truck.weekType).toLowerCase() === 'custom' ? 'custom' : 'legacy',
      weekEndDay,
      weekEndDayLabel: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekEndDay],
      start: addDays(end, -6),
      end,
    };
  }

  function weekKey(value, weekEndDay) {
    const pseudoTruck = { weekType: 'custom', weekEndDay };
    return settlementPeriod(value, pseudoTruck).start;
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

  function policyLineage(policy, truckId) {
    return policyId(policy) || [
      text(truckId || (policy && policy.truckId)),
      text(policy && policy.name).toLowerCase(),
      text(policy && policy.category).toLowerCase(),
    ].join('|');
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
      const lineage = policyLineage(policy, truckId);
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
    const period = settlementPeriod(date, truck);
    const policies = date && truckId ? effectivePolicies(templates, truckId, date) : [];
    const items = policies.map(function (policy) { return snapshotItem(policy, truck); });
    return {
      loadId: loadIdentity(load, index || 0),
      tripDate: date,
      weekKey: period.start,
      settlementDate: period.end,
      weekEndDay: period.weekEndDay,
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

  function recordPeriod(snapshot) {
    const start = dateText(snapshot && snapshot.weekKey);
    const end = dateText(snapshot && (snapshot.settlementDate || snapshot.weekEndDate)) || (start ? addDays(start, 6) : '');
    return { start, end };
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart <= bEnd && bStart <= aEnd;
  }

  function snapshotMatch(snapshots, truckId, period) {
    const relevant = (Array.isArray(snapshots) ? snapshots : []).filter(function (snapshot) {
      return sameTruck(snapshot, truckId);
    });
    const exact = relevant.find(function (snapshot) {
      return dateText(snapshot && snapshot.weekKey) === period.start;
    });
    if (exact) return { exact, overlaps: [] };

    const overlaps = relevant.filter(function (snapshot) {
      const snapshotPeriod = recordPeriod(snapshot);
      return rangesOverlap(period.start, period.end, snapshotPeriod.start, snapshotPeriod.end);
    });
    return { exact: null, overlaps };
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

    const settlements = Array.from(groups.entries()).map(function (entry) {
      const currentWeek = entry[0];
      const resolutions = entry[1];
      const period = {
        start: currentWeek,
        end: resolutions[0].settlementDate,
        weekEndDay: resolutions[0].weekEndDay,
      };
      const match = snapshotMatch(weeklySnapshots, truckId, period);

      if (match.exact) {
        return {
          id: text(match.exact.id),
          source: 'immutable_weekly_snapshot',
          immutable: true,
          weekKey: currentWeek,
          settlementDate: period.end,
          weekEndDay: period.weekEndDay,
          truckId,
          unitNumber: text((truck && truck.unitNumber) || match.exact.unitNumber),
          items: clone(Array.isArray(match.exact.items) ? match.exact.items : []),
          total: Number(match.exact.total || 0),
          loadResolutions: resolutions,
        };
      }

      // A custom calendar may overlap older Monday-based snapshots. Never invent
      // another charge on top of already-confirmed historical weeks; surface the
      // conflict for review and keep the automatic amount at zero.
      if (match.overlaps.length) {
        return {
          id: 'guard_wd_' + truckId + '_' + currentWeek,
          source: 'legacy_snapshot_overlap_guard',
          immutable: true,
          weekKey: currentWeek,
          settlementDate: period.end,
          weekEndDay: period.weekEndDay,
          truckId,
          unitNumber: text(truck && truck.unitNumber),
          items: [],
          total: 0,
          gap: false,
          guardedSnapshotIds: match.overlaps.map(function (snapshot) { return text(snapshot.id); }).filter(Boolean),
          loadResolutions: resolutions,
        };
      }

      // One weekly amount: resolve every policy lineage once on the configured
      // settlement date. A version change inside the week therefore selects only
      // the version active on the accounting boundary day.
      const policies = effectivePolicies(templates, truckId, period.end);
      const items = policies.map(function (policy) { return snapshotItem(policy, truck); });
      return {
        id: 'auto_wd_' + truckId + '_' + currentWeek,
        source: 'settlement_date_auto',
        immutable: false,
        weekKey: currentWeek,
        settlementDate: period.end,
        weekEndDay: period.weekEndDay,
        truckId,
        unitNumber: text(truck && truck.unitNumber),
        company: text(truck && truck.company),
        items,
        total: items.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0),
        gap: !items.length,
        policySnapshotVersion: 2,
        resolutionRule: 'one_policy_version_active_on_configured_week_end_day',
        loadResolutions: resolutions,
      };
    });

    return {
      settlements,
      loadResolutions,
      automaticTotal: settlements
        .filter(function (settlement) { return settlement.source === 'settlement_date_auto'; })
        .reduce(function (sum, settlement) { return sum + Number(settlement.total || 0); }, 0),
      gapCount: settlements.filter(function (settlement) { return settlement.gap; }).length,
      overlapGuardCount: settlements.filter(function (settlement) {
        return settlement.source === 'legacy_snapshot_overlap_guard';
      }).length,
    };
  }

  function recordMatchesTruck(record, truck) {
    if (typeof global.recordMatchesTruck === 'function') return global.recordMatchesTruck(record, truck);
    if (!truck) return true;
    return text(record && record.truckId) === text(truck.id) ||
      (!!truck.unitNumber && text(record && record.unitNumber) === text(truck.unitNumber));
  }

  function recordInBounds(record, dateField, bounds) {
    if (!bounds || (!bounds.from && !bounds.to)) return true;
    const date = dateText(record && (record[dateField] || record.pickup || record.date || record.weekKey));
    if (!date) return false;
    return (!bounds.from || date >= bounds.from) && (!bounds.to || date <= bounds.to);
  }

  function boundsForTruck(truck, period) {
    const today = new Date().toISOString().slice(0, 10);
    const calendar = global.CrewBIQSettlementWeek;
    if ((period === 'week' || period === 'lastweek') && calendar && typeof calendar.periodForDate === 'function') {
      let resolved = calendar.periodForDate(today, truck);
      if (period === 'lastweek' && typeof calendar.previousPeriod === 'function') resolved = calendar.previousPeriod(resolved);
      return { from: resolved.start, to: resolved.end };
    }
    if (typeof global.financePeriodBounds === 'function') return global.financePeriodBounds(period || 'week');
    return { from: '', to: '' };
  }

  function calcDriverPay(load, profiles, truckId) {
    if (typeof global.calcFleetDriverPay === 'function') {
      return global.calcFleetDriverPay(load, profiles, truckId);
    }
    return Number(load && load.driverPay || 0);
  }

  function calculateFinance(truck, period) {
    const bounds = boundsForTruck(truck, period || 'week');
    const allLoads = Array.isArray(global.loads) ? global.loads : [];
    const truckLoads = allLoads.filter(function (load) { return recordMatchesTruck(load, truck); });
    const tLoads = truckLoads.filter(function (load) { return recordInBounds(load, 'pickup', bounds); });
    const fuels = (typeof global.loadFuelLogs === 'function' ? global.loadFuelLogs() : [])
      .filter(function (item) { return recordMatchesTruck(item, truck) && recordInBounds(item, 'date', bounds); });
    const services = (typeof global.loadServiceLogs === 'function' ? global.loadServiceLogs() : [])
      .filter(function (item) { return recordMatchesTruck(item, truck) && recordInBounds(item, 'date', bounds); });
    const allWeekly = typeof global.loadWeeklyDeds === 'function' ? global.loadWeeklyDeds() : [];
    const deductions = allWeekly.filter(function (item) {
      if (!sameTruck(item, text(truck && truck.id))) return false;
      const accountingDate = dateText(item && (item.settlementDate || item.weekEndDate || item.weekKey));
      return recordInBounds({ date: accountingDate }, 'date', bounds);
    });

    const profiles = typeof global.loadDriverProfiles === 'function' ? global.loadDriverProfiles() : [];
    const truckId = text(truck && truck.id);
    const gross = tLoads.reduce(function (sum, load) { return sum + Number(load.gross || 0); }, 0);
    const driverPay = tLoads.reduce(function (sum, load) {
      return sum + calcDriverPay(load, profiles, truckId);
    }, 0);
    const miles = tLoads.reduce(function (sum, load) {
      return sum + (Number(load.totalMiles || 0) || (Number(load.loadedMiles || 0) + Number(load.deadMiles || 0)));
    }, 0);
    const dispatchFee = tLoads.reduce(function (sum, load) {
      const rate = Number(load.dispatchPercent != null ? load.dispatchPercent : (truck && truck.dispatchPercent) || 0);
      return sum + Number(load.dispatchFee != null ? load.dispatchFee : (Number(load.gross || 0) * rate / 100));
    }, 0);
    const fuelCost = fuels.reduce(function (sum, item) {
      return sum + Number(item.fuelCost || 0) + Number(item.defCost || 0);
    }, 0);
    const serviceCost = services.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    const confirmedDeductionTotal = deductions.reduce(function (sum, item) { return sum + Number(item.total || 0); }, 0);

    const templates = typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
    const resolved = resolveSettlements(truckLoads, truck, templates, allWeekly);
    const settlements = resolved.settlements.filter(function (settlement) {
      return recordInBounds({ date: settlement.settlementDate || settlement.weekKey }, 'date', bounds);
    });
    const automaticDeductionTotal = settlements
      .filter(function (settlement) { return settlement.source === 'settlement_date_auto'; })
      .reduce(function (sum, settlement) { return sum + Number(settlement.total || 0); }, 0);

    const deductionTotal = confirmedDeductionTotal + automaticDeductionTotal;
    const truckNet = gross - dispatchFee;
    const ownerNet = truckNet - driverPay;
    const realNet = ownerNet - fuelCost - serviceCost - deductionTotal;
    return {
      loads: tLoads,
      gross,
      dispatchFee,
      truckNet,
      driverPay,
      ownerNet,
      fuelCost,
      serviceCost,
      deductionTotal,
      confirmedDeductionTotal,
      automaticDeductionTotal,
      realNet,
      miles,
      cpm: miles ? realNet / miles : 0,
      deductionSettlements: settlements,
      deductionLoadResolutions: resolved.loadResolutions.filter(function (resolution) {
        return recordInBounds({ date: resolution.tripDate }, 'date', bounds);
      }),
      deductionResolutionGapCount: settlements.filter(function (settlement) { return settlement.gap; }).length,
      deductionOverlapGuardCount: settlements.filter(function (settlement) {
        return settlement.source === 'legacy_snapshot_overlap_guard';
      }).length,
      settlementBounds: bounds,
    };
  }

  function installFinanceWrapper() {
    const original = global.ownerFinanceForTruck;
    if (typeof original !== 'function' || original.__crewbiqSettlementDateDeductions) return false;

    const wrapped = function (truck, period) {
      if (!truck) return original.apply(this, arguments);
      return calculateFinance(truck, period || 'week');
    };
    wrapped.__crewbiqSettlementDateDeductions = true;
    wrapped.__crewbiqPrevious = original;
    global.ownerFinanceForTruck = wrapped;
    return true;
  }

  global.CrewBIQDeductionTripResolution = {
    version: VERSION,
    tripDate,
    weekKey,
    settlementPeriod,
    resolveLoad,
    resolveSettlements,
    calculateFinance,
    installFinanceWrapper,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFinanceWrapper);
    else setTimeout(installFinanceWrapper, 0);
  }

  console.info('[CrewBIQ Deductions] settlement-date resolution v' + VERSION + ' loaded');
})(window);
