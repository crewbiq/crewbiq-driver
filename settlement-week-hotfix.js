/**
 * CrewBIQ settlement-week calendar v0.1.0
 *
 * Trucks already persist weekType/weekEndDay in PostgreSQL. This layer exposes
 * the setting in the PWA and gives accounting code one deterministic calendar:
 * legacy trucks keep Monday-Sunday; custom trucks end on the selected weekday.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';
  const LEGACY_WEEK_END_DAY = 0; // Sunday => Monday-Sunday, matching existing PWA week keys.
  const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const previous = {};

  function text(value) { return String(value == null ? '' : value).trim(); }
  function dateText(value) { return text(value).slice(0, 10); }

  function normalizeDay(value, fallback) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) return parsed;
    return fallback == null ? LEGACY_WEEK_END_DAY : fallback;
  }

  function configuredWeekEndDay(truck) {
    if (truck && text(truck.weekType).toLowerCase() === 'custom') {
      return normalizeDay(truck.weekEndDay, LEGACY_WEEK_END_DAY);
    }
    return LEGACY_WEEK_END_DAY;
  }

  function addDays(value, amount) {
    const date = new Date(dateText(value) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + Number(amount || 0));
    return date.toISOString().slice(0, 10);
  }

  function weekEndDate(value, weekEndDay) {
    const date = new Date(dateText(value) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return '';
    const endDay = normalizeDay(weekEndDay, LEGACY_WEEK_END_DAY);
    const delta = (endDay - date.getUTCDay() + 7) % 7;
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }

  function weekStartDate(value, weekEndDay) {
    const end = weekEndDate(value, weekEndDay);
    return end ? addDays(end, -6) : '';
  }

  function periodForDate(value, truck) {
    const weekEndDay = configuredWeekEndDay(truck);
    const end = weekEndDate(value, weekEndDay);
    return {
      weekType: truck && text(truck.weekType).toLowerCase() === 'custom' ? 'custom' : 'legacy',
      weekEndDay,
      weekEndDayLabel: DAY_LABELS[weekEndDay],
      start: end ? addDays(end, -6) : '',
      end,
    };
  }

  function previousPeriod(period) {
    return {
      ...period,
      start: addDays(period && period.start, -7),
      end: addDays(period && period.end, -7),
    };
  }

  function currentTruckFromModal() {
    const id = text((global.document && global.document.getElementById('tfId') || {}).value);
    const unit = text((global.document && global.document.getElementById('tfUnit') || {}).value);
    const trucks = typeof global.loadTrucks === 'function' ? global.loadTrucks() : [];
    return trucks.find(function (truck) {
      return text(truck && truck.id) === id || (!!unit && text(truck && truck.unitNumber) === unit);
    }) || null;
  }

  function ensureTruckWeekField() {
    const document = global.document;
    if (!document || document.getElementById('tfSettlementWeekEnd')) return;
    const companyInput = document.getElementById('tfCompany');
    const modal = document.getElementById('truckModalWrap');
    if (!companyInput || !modal) return;

    const field = document.createElement('div');
    field.className = 'sfield';
    field.id = 'tfSettlementWeekField';
    field.innerHTML =
      '<div class="slabel">Settlement Week Ends On</div>' +
      '<select id="tfSettlementWeekEnd">' +
        '<option value="legacy">Current default · Sunday (Mon–Sun)</option>' +
        DAY_LABELS.map(function (label, day) {
          // Custom Sunday cannot be distinguished by the current PostgreSQL
          // writer because numeric zero is its falsey fallback. The legacy
          // option already represents Sunday safely, so expose Monday-Saturday
          // as explicit custom calendars.
          return day === LEGACY_WEEK_END_DAY ? '' : '<option value="' + day + '">' + label + '</option>';
        }).join('') +
      '</select>' +
      '<div class="muted" style="font-size:10px;margin-top:3px">' +
        'Choose Thursday for a Fri–Thu statement, or Friday for Sat–Fri. ' +
        'The selected boundary applies one weekly deduction amount.' +
      '</div>';

    const companyField = companyInput.closest ? companyInput.closest('.sfield') : companyInput.parentNode;
    if (companyField && companyField.parentNode) companyField.parentNode.insertBefore(field, companyField.nextSibling);
    else modal.appendChild(field);

    const truck = currentTruckFromModal();
    const select = document.getElementById('tfSettlementWeekEnd');
    if (select) {
      select.value = truck && text(truck.weekType).toLowerCase() === 'custom'
        ? String(normalizeDay(truck.weekEndDay, LEGACY_WEEK_END_DAY))
        : 'legacy';
      // Defensive repair for impossible/custom Sunday state: keep the UI on the
      // safe legacy option rather than presenting an option that is not emitted.
      if (!select.value) select.value = 'legacy';
    }
  }

  function openTruckForm() {
    const result = previous.openTruckForm.apply(this, arguments);
    ensureTruckWeekField();
    return result;
  }

  function saveTruckForm() {
    const document = global.document;
    const existing = currentTruckFromModal();
    const existingId = text((document && document.getElementById('tfId') || {}).value);
    const unit = text((document && document.getElementById('tfUnit') || {}).value);
    const selected = text((document && document.getElementById('tfSettlementWeekEnd') || {}).value) || 'legacy';
    if (!unit) return previous.saveTruckForm.apply(this, arguments);

    // The original form saves and immediately queues sync. Intercept those
    // intermediate queue calls, enrich the just-saved truck with its calendar,
    // then schedule sync for the complete final record.
    const queue = global.queueFleetConfigSync;
    if (typeof queue === 'function') global.queueFleetConfigSync = function () {};

    let result;
    try {
      result = previous.saveTruckForm.apply(this, arguments);
    } finally {
      if (typeof queue === 'function') global.queueFleetConfigSync = queue;
    }
    if (document && document.getElementById('truckModalWrap')) return result;
    if (typeof global.loadTrucks !== 'function' || typeof global.saveTrucks !== 'function') return result;

    const trucks = global.loadTrucks();
    const index = trucks.findIndex(function (truck) {
      return (!!existingId && text(truck && truck.id) === existingId) || text(truck && truck.unitNumber) === unit;
    });
    if (index < 0) return result;

    if (selected === 'legacy') {
      trucks[index].weekType = text(existing && existing.weekType) || 'amazon';
      trucks[index].weekEndDay = normalizeDay(existing && existing.weekEndDay, 6);
    } else {
      trucks[index].weekType = 'custom';
      trucks[index].weekEndDay = normalizeDay(selected, LEGACY_WEEK_END_DAY);
    }

    global.saveTrucks(trucks);
    // queueFleetConfigSync is debounced, so this explicit final call is safe even
    // when saveTrucks also queues internally and guarantees the enriched record wins.
    if (typeof queue === 'function') queue();
    if (typeof global.renderTrucksList === 'function') global.renderTrucksList();
    return result;
  }

  function currentTruck() {
    if (typeof global.selectedTruckId !== 'function' || typeof global.findTruckByIdOrUnit !== 'function') return null;
    return global.findTruckByIdOrUnit(global.selectedTruckId('dedTruckSelect'));
  }

  function applyPoliciesForSettlementWeek() {
    const truck = currentTruck();
    const api = global.CrewBIQDeductionPolicies;
    if (!truck || !api || typeof api.effectivePolicies !== 'function' || typeof api.buildWeeklySnapshot !== 'function') {
      if (typeof global.toast === 'function') global.toast('Settlement calendar is unavailable', 'err');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const period = periodForDate(today, truck);
    const templates = typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
    const policies = api.effectivePolicies(templates, truck.id, period.end);
    if (!policies.length) {
      if (typeof global.toast === 'function') global.toast('No effective policies on the settlement day', 'warn');
      return;
    }

    const weekly = typeof global.loadWeeklyDeds === 'function' ? global.loadWeeklyDeds() : [];
    const index = weekly.findIndex(function (item) {
      return dateText(item && item.weekKey) === period.start && text(item && item.truckId) === text(truck.id);
    });
    if (index >= 0 && !global.confirm('Replace this settlement week deductions with the effective policies?')) return;

    const entry = api.buildWeeklySnapshot(index >= 0 ? weekly[index] : null, truck, period.start, policies);
    entry.settlementDate = period.end;
    entry.weekEndDay = period.weekEndDay;
    entry.weekType = period.weekType;
    entry.resolutionRule = 'policy_active_on_configured_week_end_day';
    if (index >= 0) weekly[index] = entry;
    else weekly.push(entry);
    global.saveWeeklyDeds(weekly);
    if (typeof global.renderDeductionsPage === 'function') global.renderDeductionsPage();
    if (typeof global.toast === 'function') global.toast('Applied one policy amount for settlement week ' + period.start + ' – ' + period.end);
  }

  function renderDeductionsPage() {
    const result = previous.renderDeductionsPage.apply(this, arguments);
    const truck = currentTruck();
    const label = global.document && global.document.getElementById('dedWeekLabel');
    if (truck && label) {
      const period = periodForDate(new Date().toISOString().slice(0, 10), truck);
      const display = typeof global.truckDisplay === 'function' ? global.truckDisplay(truck) : ('Unit ' + text(truck.unitNumber));
      label.textContent = display + (truck.company ? ' · ' + text(truck.company) : '') +
        ' / Settlement week ' + period.start + ' – ' + period.end;
    }
    return result;
  }

  function install() {
    if (typeof global.openTruckForm === 'function' && !global.openTruckForm.__crewbiqSettlementWeek) {
      previous.openTruckForm = global.openTruckForm;
      previous.saveTruckForm = global.saveTruckForm;
      const openWrapped = function () { return openTruckForm.apply(this, arguments); };
      const saveWrapped = function () { return saveTruckForm.apply(this, arguments); };
      openWrapped.__crewbiqSettlementWeek = true;
      saveWrapped.__crewbiqSettlementWeek = true;
      global.openTruckForm = openWrapped;
      global.saveTruckForm = saveWrapped;
    }

    if (typeof global.applyDedTemplate === 'function' && !global.applyDedTemplate.__crewbiqSettlementWeek) {
      previous.applyDedTemplate = global.applyDedTemplate;
      const applyWrapped = function () { return applyPoliciesForSettlementWeek.apply(this, arguments); };
      applyWrapped.__crewbiqSettlementWeek = true;
      global.applyDedTemplate = applyWrapped;
    }

    if (typeof global.renderDeductionsPage === 'function' && !global.renderDeductionsPage.__crewbiqSettlementWeek) {
      previous.renderDeductionsPage = global.renderDeductionsPage;
      const renderWrapped = function () { return renderDeductionsPage.apply(this, arguments); };
      renderWrapped.__crewbiqSettlementWeek = true;
      global.renderDeductionsPage = renderWrapped;
    }
  }

  global.CrewBIQSettlementWeek = {
    version: VERSION,
    dayLabels: DAY_LABELS.slice(),
    normalizeDay,
    configuredWeekEndDay,
    weekStartDate,
    weekEndDate,
    periodForDate,
    previousPeriod,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ Accounting] configurable settlement week v' + VERSION + ' loaded');
})(window);
