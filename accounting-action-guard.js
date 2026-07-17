/**
 * CrewBIQ accounting action guard v0.1.0
 *
 * Adds an explicit zero-deduction exception for a settlement week when a truck
 * is not operating. The exception is stored as a normal weekly snapshot with
 * a durable marker inside `items`, so PostgreSQL restore preserves the audit
 * decision without changing or deleting effective-dated policy history.
 *
 * Significant accounting actions require confirmation before mutation.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';
  const SKIP_CATEGORY = 'week_exception';
  const SKIP_STATUS = 'skipped';
  const previous = {};

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function text(value) { return String(value == null ? '' : value).trim(); }
  function dateText(value) { return text(value).slice(0, 10); }

  function esc(value) {
    if (typeof global.escHtml === 'function') return global.escHtml(text(value));
    return text(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function confirmAction(message) {
    return typeof global.confirm === 'function' ? global.confirm(message) : false;
  }

  function currentTruck() {
    if (typeof global.selectedTruckId !== 'function' || typeof global.findTruckByIdOrUnit !== 'function') return null;
    return global.findTruckByIdOrUnit(global.selectedTruckId('dedTruckSelect'));
  }

  function currentTruckFromModal() {
    const document = global.document;
    const id = text((document && document.getElementById('tfId') || {}).value);
    const unit = text((document && document.getElementById('tfUnit') || {}).value);
    const trucks = typeof global.loadTrucks === 'function' ? global.loadTrucks() : [];
    return trucks.find(function (truck) {
      return text(truck && truck.id) === id || (!!unit && text(truck && truck.unitNumber) === unit);
    }) || null;
  }

  function currentPeriod(truck) {
    const calendar = global.CrewBIQSettlementWeek;
    if (!truck || !calendar || typeof calendar.periodForDate !== 'function') return null;
    return calendar.periodForDate(new Date().toISOString().slice(0, 10), truck);
  }

  function loadWeekly() {
    return typeof global.loadWeeklyDeds === 'function' ? global.loadWeeklyDeds() : [];
  }

  function exactSnapshotIndex(weekly, truck, period) {
    return (Array.isArray(weekly) ? weekly : []).findIndex(function (item) {
      return text(item && item.truckId) === text(truck && truck.id) &&
        dateText(item && item.weekKey) === dateText(period && period.start);
    });
  }

  function skipMarker(snapshot) {
    const items = Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
    return items.find(function (item) {
      return text(item && item.category) === SKIP_CATEGORY && text(item && item.status) === SKIP_STATUS;
    }) || null;
  }

  function isSkippedSnapshot(snapshot) {
    return !!skipMarker(snapshot);
  }

  function truckLabel(truck) {
    const unit = text(truck && truck.unitNumber);
    const company = text(truck && truck.company);
    return (unit ? 'Unit ' + unit : 'this truck') + (company ? ' · ' + company : '');
  }

  function buildSkipSnapshot(existing, truck, period, nowValue) {
    const existingMarker = skipMarker(existing);
    const previousSnapshot = existingMarker && existingMarker.previousSnapshot
      ? clone(existingMarker.previousSnapshot)
      : (existing && !isSkippedSnapshot(existing) ? clone(existing) : null);
    const now = text(nowValue) || new Date().toISOString();
    return {
      ...(existing || {}),
      id: text(existing && existing.id) || ('wd_' + text(truck && truck.id) + '_' + dateText(period && period.start)),
      truckId: text(truck && truck.id),
      unitNumber: text(truck && truck.unitNumber),
      company: text(truck && truck.company),
      weekKey: dateText(period && period.start),
      settlementDate: dateText(period && period.end),
      weekEndDay: Number(period && period.weekEndDay),
      weekType: text(period && period.weekType),
      total: 0,
      items: [{
        id: 'week_skip_' + text(truck && truck.id) + '_' + dateText(period && period.start),
        name: 'Deductions skipped — truck not operating',
        amount: 0,
        category: SKIP_CATEGORY,
        status: SKIP_STATUS,
        reason: 'truck_not_operating',
        periodStart: dateText(period && period.start),
        periodEnd: dateText(period && period.end),
        weekEndDay: Number(period && period.weekEndDay),
        createdAt: now,
        previousSnapshot,
      }],
      skipped: true,
      skippedAt: now,
      resolutionRule: 'manual_zero_deduction_week_exception',
      policySnapshotVersion: 3,
    };
  }

  function restoreSnapshot(skippedSnapshot, truck, period, policies) {
    const marker = skipMarker(skippedSnapshot);
    if (marker && marker.previousSnapshot) return clone(marker.previousSnapshot);

    const api = global.CrewBIQDeductionPolicies;
    if (!api || typeof api.buildWeeklySnapshot !== 'function') return null;
    const restored = api.buildWeeklySnapshot(null, truck, period.start, policies || []);
    restored.settlementDate = period.end;
    restored.weekEndDay = period.weekEndDay;
    restored.weekType = period.weekType;
    restored.resolutionRule = 'policy_active_on_configured_week_end_day';
    return restored;
  }

  function persistWeekly(weekly) {
    if (typeof global.saveWeeklyDeds !== 'function') return false;
    global.saveWeeklyDeds(weekly);
    if (typeof global.renderDeductionsPage === 'function') global.renderDeductionsPage();
    return true;
  }

  function skipCurrentWeek() {
    const truck = currentTruck();
    const period = currentPeriod(truck);
    if (!truck || !period) {
      if (typeof global.toast === 'function') global.toast('Select a truck first', 'err');
      return false;
    }

    const weekly = loadWeekly();
    const index = exactSnapshotIndex(weekly, truck, period);
    const existing = index >= 0 ? weekly[index] : null;
    if (isSkippedSnapshot(existing)) {
      if (typeof global.toast === 'function') global.toast('Deductions are already skipped for this week', 'warn');
      return false;
    }

    const existingText = existing && Number(existing.total || 0)
      ? '\n\nThe existing confirmed amount ' + Number(existing.total || 0).toFixed(2) + ' will be replaced by $0 and retained for Restore.'
      : '';
    const ok = confirmAction(
      'Skip all deductions for ' + truckLabel(truck) + '?\n\n' +
      'Settlement week: ' + period.start + ' – ' + period.end + '\n' +
      'This records a $0 accounting exception for this week only. Policy Start/End dates are not changed.' +
      existingText,
    );
    if (!ok) return false;

    const skipped = buildSkipSnapshot(existing, truck, period);
    if (index >= 0) weekly[index] = skipped;
    else weekly.push(skipped);
    if (!persistWeekly(weekly)) return false;
    if (typeof global.toast === 'function') global.toast('Deductions skipped for ' + period.start + ' – ' + period.end);
    return true;
  }

  function restoreCurrentWeek() {
    const truck = currentTruck();
    const period = currentPeriod(truck);
    if (!truck || !period) {
      if (typeof global.toast === 'function') global.toast('Select a truck first', 'err');
      return false;
    }

    const weekly = loadWeekly();
    const index = exactSnapshotIndex(weekly, truck, period);
    const skipped = index >= 0 ? weekly[index] : null;
    if (!isSkippedSnapshot(skipped)) {
      if (typeof global.toast === 'function') global.toast('This week is not marked as skipped', 'warn');
      return false;
    }

    const ok = confirmAction(
      'Restore deductions for ' + truckLabel(truck) + '?\n\n' +
      'Settlement week: ' + period.start + ' – ' + period.end + '\n' +
      'The $0 week exception will be replaced by the prior confirmed snapshot, or by policies active on ' + period.end + '.',
    );
    if (!ok) return false;

    const marker = skipMarker(skipped);
    let policies = [];
    if (!(marker && marker.previousSnapshot)) {
      const api = global.CrewBIQDeductionPolicies;
      const templates = typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
      policies = api && typeof api.effectivePolicies === 'function'
        ? api.effectivePolicies(templates, truck.id, period.end)
        : [];
      if (!policies.length) {
        if (typeof global.toast === 'function') global.toast('No effective policies on the settlement day', 'warn');
        return false;
      }
    }

    const restored = restoreSnapshot(skipped, truck, period, policies);
    if (!restored) {
      if (typeof global.toast === 'function') global.toast('Could not restore this settlement week', 'err');
      return false;
    }
    weekly[index] = restored;
    if (!persistWeekly(weekly)) return false;
    if (typeof global.toast === 'function') global.toast('Deductions restored for ' + period.start + ' – ' + period.end);
    return true;
  }

  function renderActionCard() {
    const document = global.document;
    if (!document) return;
    const label = document.getElementById('dedWeekLabel');
    const truck = currentTruck();
    const period = currentPeriod(truck);
    if (!label || !truck || !period) return;

    let card = document.getElementById('dedWeekActionCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'dedWeekActionCard';
      card.style.cssText = 'margin:10px 0 14px;padding:12px;border:1px solid var(--bd);border-radius:12px;background:var(--s2)';
      label.insertAdjacentElement('afterend', card);
    }

    const weekly = loadWeekly();
    const index = exactSnapshotIndex(weekly, truck, period);
    const snapshot = index >= 0 ? weekly[index] : null;
    const skipped = isSkippedSnapshot(snapshot);
    card.innerHTML = skipped
      ? '<div style="font-weight:700;color:var(--acc);margin-bottom:5px">Week off · deductions $0</div>' +
        '<div class="muted" style="font-size:11px;margin-bottom:10px">This is an audited exception for ' + esc(period.start) + ' – ' + esc(period.end) + '. Policy periods remain unchanged.</div>' +
        '<button class="btn ghost" style="padding:10px" onclick="CrewBIQAccountingGuard.restoreCurrentWeek()">Restore deductions for this week</button>'
      : '<div style="font-weight:700;margin-bottom:5px">Truck not operating this week?</div>' +
        '<div class="muted" style="font-size:11px;margin-bottom:10px">Record a confirmed $0 deduction exception without changing policy Start/End dates.</div>' +
        '<button class="btn ghost" style="padding:10px;border-color:var(--acc);color:var(--acc)" onclick="CrewBIQAccountingGuard.skipCurrentWeek()">Skip deductions for this week</button>';
  }

  function wrapRender() {
    if (typeof global.renderDeductionsPage !== 'function' || global.renderDeductionsPage.__crewbiqAccountingGuard) return;
    previous.renderDeductionsPage = global.renderDeductionsPage;
    const wrapped = function () {
      const result = previous.renderDeductionsPage.apply(this, arguments);
      renderActionCard();
      return result;
    };
    wrapped.__crewbiqAccountingGuard = true;
    global.renderDeductionsPage = wrapped;
  }

  function wrapApplyPolicies() {
    if (typeof global.applyDedTemplate !== 'function' || global.applyDedTemplate.__crewbiqAccountingGuard) return;
    previous.applyDedTemplate = global.applyDedTemplate;
    const wrapped = function () {
      const truck = currentTruck();
      const period = currentPeriod(truck);
      const weekly = loadWeekly();
      const index = truck && period ? exactSnapshotIndex(weekly, truck, period) : -1;
      // The underlying settlement calendar already confirms replacement of an
      // existing snapshot. Require confirmation here only for a first-time apply
      // so the user receives exactly one prompt for either path.
      if (index < 0 && truck && period) {
        const ok = confirmAction(
          'Apply deductions to ' + truckLabel(truck) + '?\n\n' +
          'Settlement week: ' + period.start + ' – ' + period.end + '\n' +
          'One amount per policy will be recorded using the version active on ' + period.end + '.',
        );
        if (!ok) return false;
      }
      return previous.applyDedTemplate.apply(this, arguments);
    };
    wrapped.__crewbiqAccountingGuard = true;
    global.applyDedTemplate = wrapped;
  }

  function wrapTruckCalendarSave() {
    if (typeof global.saveTruckForm !== 'function' || global.saveTruckForm.__crewbiqAccountingGuard) return;
    previous.saveTruckForm = global.saveTruckForm;
    const wrapped = function () {
      const document = global.document;
      const existing = currentTruckFromModal();
      const selected = text((document && document.getElementById('tfSettlementWeekEnd') || {}).value) || 'legacy';
      const prior = existing && text(existing.weekType).toLowerCase() === 'custom'
        ? String(Number(existing.weekEndDay))
        : 'legacy';
      if (existing && selected !== prior) {
        const labels = global.CrewBIQSettlementWeek && global.CrewBIQSettlementWeek.dayLabels || [];
        const selectedLabel = selected === 'legacy' ? 'Sunday (Mon–Sun)' : (labels[Number(selected)] || selected);
        const ok = confirmAction(
          'Change the settlement-week boundary for ' + truckLabel(existing) + ' to ' + selectedLabel + '?\n\n' +
          'Confirmed historical weekly snapshots remain unchanged. Unconfirmed calculations will use the new boundary.',
        );
        if (!ok) return false;
      }
      return previous.saveTruckForm.apply(this, arguments);
    };
    wrapped.__crewbiqAccountingGuard = true;
    global.saveTruckForm = wrapped;
  }

  function wrapPolicyDelete() {
    if (typeof global.deleteDedTemplate !== 'function' || global.deleteDedTemplate.__crewbiqAccountingGuard) return;
    previous.deleteDedTemplate = global.deleteDedTemplate;
    const wrapped = function (id) {
      const templates = typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
      const policy = templates.find(function (item) { return text(item && item.id) === text(id); });
      const detail = policy
        ? '\n\nPolicy: ' + text(policy.name) + '\nPeriod: ' + dateText(policy.effectiveFrom) + ' – ' + (dateText(policy.effectiveTo) || 'open')
        : '';
      const ok = confirmAction(
        'Delete this deduction policy version?' + detail + '\n\nConfirmed historical weekly snapshots will not be changed.',
      );
      if (!ok) return false;
      return previous.deleteDedTemplate.apply(this, arguments);
    };
    wrapped.__crewbiqAccountingGuard = true;
    global.deleteDedTemplate = wrapped;
  }

  function install() {
    wrapRender();
    wrapApplyPolicies();
    wrapTruckCalendarSave();
    wrapPolicyDelete();
    renderActionCard();
  }

  global.CrewBIQAccountingGuard = {
    version: VERSION,
    confirmAction,
    isSkippedSnapshot,
    skipMarker,
    buildSkipSnapshot,
    restoreSnapshot,
    skipCurrentWeek,
    restoreCurrentWeek,
    render: renderActionCard,
    install,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ Accounting] skipped-week exception and action confirmations v' + VERSION + ' loaded');
})(window);
