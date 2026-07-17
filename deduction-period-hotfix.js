/**
 * CrewBIQ deduction period integrity v0.2.0
 *
 * Adds an explicit optional End Date to truck deduction policy versions, validates
 * closed periods, and keeps adjacent versions non-overlapping. A later version
 * still closes the previous version on the day before its Start Date.
 */
(function (global) {
  'use strict';

  const VERSION = '0.2.0';
  const previous = {};

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function text(value) { return String(value || '').trim(); }
  function dateText(value) { return text(value).slice(0, 10); }
  function normalize(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function hash(value) {
    let h = 2166136261;
    const source = String(value || '');
    for (let i = 0; i < source.length; i += 1) {
      h ^= source.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function dayBefore(value) {
    const date = new Date(dateText(value) + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function effectiveFrom(template) {
    return dateText(template && (template.effectiveFrom || template.effective_from)) || '0001-01-01';
  }

  function effectiveTo(template) {
    return dateText(template && (template.effectiveTo || template.effective_to));
  }

  function policySignature(template, truckId) {
    return [
      text(truckId || (template && template.truckId)),
      normalize(template && template.name),
      normalize(template && template.category),
    ].join('|');
  }

  function versionPolicy(templates, input) {
    const list = clone(Array.isArray(templates) ? templates : []);
    const truckId = text(input && input.truckId);
    const unitNumber = text(input && input.unitNumber);
    const name = text(input && input.name);
    const category = text(input && input.category) || 'other';
    const company = text(input && input.company);
    const start = dateText(input && (input.effectiveFrom || input.startDate));
    const requestedEnd = dateText(input && (input.effectiveTo || input.endDate));

    if (!truckId || !name || !start) {
      return { ok: false, reason: 'truck_name_start_required', templates: list };
    }
    if (requestedEnd && requestedEnd < start) {
      return { ok: false, reason: 'end_before_start', templates: list };
    }

    const signature = [truckId, normalize(name), normalize(category)].join('|');
    const matching = list.filter(function (item) {
      return item && text(item.truckId) === truckId && policySignature(item, truckId) === signature;
    });
    const policyId = matching.map(function (item) {
      return text(item.policyId || item.policy_id);
    }).find(Boolean) || 'dp_' + hash(signature);

    const nextStart = matching
      .map(effectiveFrom)
      .filter(function (value) { return value > start; })
      .sort()[0] || '';
    const latestAllowedEnd = nextStart ? dayBefore(nextStart) : '';
    let normalizedEnd = requestedEnd;
    if (latestAllowedEnd && (!normalizedEnd || normalizedEnd > latestAllowedEnd)) {
      normalizedEnd = latestAllowedEnd;
    }

    matching.forEach(function (oldVersion) {
      const oldStart = effectiveFrom(oldVersion);
      const oldEnd = effectiveTo(oldVersion);
      if (oldStart < start && (!oldEnd || oldEnd >= start)) {
        oldVersion.effectiveTo = dayBefore(start);
      }
    });

    const sameDate = matching.find(function (item) { return effectiveFrom(item) === start; });
    if (sameDate) {
      sameDate.policyId = policyId;
      sameDate.truckId = truckId;
      sameDate.unitNumber = unitNumber;
      sameDate.company = company;
      sameDate.name = name;
      sameDate.amount = Number(input.amount || 0);
      sameDate.category = category;
      sameDate.effectiveFrom = start;
      sameDate.effectiveTo = normalizedEnd;
      sameDate.updatedAt = new Date().toISOString();
      return { ok: true, policy: sameDate, templates: list, updated: true };
    }

    const maxVersion = matching.reduce(function (max, item) {
      return Math.max(max, Number(item.version || 0));
    }, 0);
    const created = {
      id: text(input.id) || ('dt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      policyId,
      version: maxVersion + 1,
      truckId,
      unitNumber,
      company,
      name,
      amount: Number(input.amount || 0),
      category,
      effectiveFrom: start,
      effectiveTo: normalizedEnd,
      createdAt: new Date().toISOString(),
    };
    list.push(created);
    return { ok: true, policy: created, templates: list, updated: false };
  }

  function ensurePeriodFields() {
    const context = global.document && global.document.getElementById('dedPolicyContext');
    const startInput = global.document && global.document.getElementById('dedPolicyEffectiveFrom');
    if (!context || !startInput) return;

    const startField = startInput.closest ? startInput.closest('.sfield') : startInput.parentNode;
    const startLabel = startField && startField.querySelector ? startField.querySelector('.slabel') : null;
    if (startLabel) startLabel.textContent = 'Start Date';

    const existingEnd = global.document.getElementById('dedPolicyEffectiveTo');
    if (existingEnd) return;

    const endField = global.document.createElement('div');
    endField.className = 'sfield';
    endField.id = 'dedPolicyEndField';
    endField.innerHTML =
      '<div class="slabel">End Date (optional)</div>' +
      '<input type="date" id="dedPolicyEffectiveTo">' +
      '<div class="muted" style="font-size:10px;margin-top:3px">Leave empty for an open period. A later version closes it automatically.</div>';

    if (startField && startField.parentNode) {
      startField.parentNode.insertBefore(endField, startField.nextSibling);
    } else {
      context.appendChild(endField);
    }
  }

  function currentTruck() {
    if (typeof global.selectedTruckId !== 'function' || typeof global.findTruckByIdOrUnit !== 'function') return null;
    return global.findTruckByIdOrUnit(global.selectedTruckId('dedTruckSelect'));
  }

  function loadTemplates() {
    return typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
  }

  function openTemplateModal() {
    const result = previous.openAddDedTemplate.apply(this, arguments);
    ensurePeriodFields();
    const endInput = global.document.getElementById('dedPolicyEffectiveTo');
    if (endInput) endInput.value = '';
    return result;
  }

  function savePolicyModal() {
    if (global._dedModalMode !== 'template') return previous.saveDedModal.apply(this, arguments);
    ensurePeriodFields();

    const truck = currentTruck();
    const name = text((global.document.getElementById('dedName') || {}).value);
    const amount = Number((global.document.getElementById('dedAmount') || {}).value || 0);
    const category = text((global.document.getElementById('dedCategory') || {}).value) || 'other';
    const company = text((global.document.getElementById('dedPolicyCompany') || {}).value) || text(truck && truck.company);
    const start = dateText((global.document.getElementById('dedPolicyEffectiveFrom') || {}).value);
    const end = dateText((global.document.getElementById('dedPolicyEffectiveTo') || {}).value);

    if (!truck || !name || !start) {
      if (typeof global.toast === 'function') global.toast('Truck, name and Start Date are required', 'err');
      return;
    }

    const result = versionPolicy(loadTemplates(), {
      truckId: truck.id,
      unitNumber: truck.unitNumber,
      company,
      name,
      amount,
      category,
      effectiveFrom: start,
      effectiveTo: end,
    });
    if (!result.ok) {
      const message = result.reason === 'end_before_start'
        ? 'End Date cannot be before Start Date'
        : 'Deduction period could not be saved';
      if (typeof global.toast === 'function') global.toast(message, 'err');
      return;
    }

    global.saveDedTemplates(result.templates);
    if (typeof global.closeDedModal === 'function') global.closeDedModal();
    if (typeof global.renderDeductionsPage === 'function') global.renderDeductionsPage();
    if (typeof global.toast === 'function') {
      global.toast(result.updated ? 'Deduction period updated' : 'Deduction period saved');
    }
  }

  function install() {
    if (typeof global.openAddDedTemplate !== 'function' || typeof global.saveDedModal !== 'function') return;
    if (global.saveDedModal.__crewbiqDeductionPeriods) return;

    previous.openAddDedTemplate = global.openAddDedTemplate;
    previous.saveDedModal = global.saveDedModal;

    const openWrapped = function () { return openTemplateModal.apply(this, arguments); };
    const saveWrapped = function () { return savePolicyModal.apply(this, arguments); };
    openWrapped.__crewbiqDeductionPeriods = true;
    saveWrapped.__crewbiqDeductionPeriods = true;
    global.openAddDedTemplate = openWrapped;
    global.saveDedModal = saveWrapped;

    ensurePeriodFields();
    if (global.CrewBIQDeductionPolicies) {
      global.CrewBIQDeductionPolicies.versionPolicy = versionPolicy;
    }
  }

  global.CrewBIQDeductionPeriods = {
    version: VERSION,
    versionPolicy,
    dayBefore,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ Deductions] explicit Start/End periods v' + VERSION + ' loaded');
})(window);
