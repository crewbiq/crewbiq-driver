/**
 * CrewBIQ effective-dated deduction policies v0.1.0
 *
 * Deduction templates are versioned per stable truck. Company is audit context;
 * the stable truck ID and effective week determine which version applies. Weekly
 * deductions remain immutable snapshots after confirmation.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';
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

  function templatePolicyId(template, truckId) {
    const explicit = text(template && (template.policyId || template.policy_id));
    if (explicit) return explicit;
    return 'dp_' + hash([
      text(truckId || (template && template.truckId)),
      normalize(template && template.name),
      normalize(template && template.category),
    ].join('|'));
  }

  function effectiveFrom(template) {
    return dateText(template && (template.effectiveFrom || template.effective_from)) || '0001-01-01';
  }

  function effectiveTo(template) {
    return dateText(template && (template.effectiveTo || template.effective_to));
  }

  function versionSort(a, b) {
    const byDate = effectiveFrom(a).localeCompare(effectiveFrom(b));
    if (byDate) return byDate;
    return Number(a.version || 0) - Number(b.version || 0);
  }

  function effectivePolicies(templates, truckId, targetDate) {
    const target = dateText(targetDate);
    const grouped = new Map();

    (Array.isArray(templates) ? templates : []).forEach(function (template) {
      if (!template || text(template.truckId) !== text(truckId)) return;
      const start = effectiveFrom(template);
      const end = effectiveTo(template);
      if (target && start > target) return;
      if (target && end && end < target) return;

      const policyId = templatePolicyId(template, truckId);
      const current = grouped.get(policyId);
      if (!current || versionSort(current, template) <= 0) grouped.set(policyId, template);
    });

    return Array.from(grouped.values()).sort(function (a, b) {
      return text(a.name).localeCompare(text(b.name));
    });
  }

  function versionPolicy(templates, input) {
    const list = clone(Array.isArray(templates) ? templates : []);
    const truckId = text(input && input.truckId);
    const unitNumber = text(input && input.unitNumber);
    const name = text(input && input.name);
    const category = text(input && input.category) || 'other';
    const company = text(input && input.company);
    const start = dateText(input && input.effectiveFrom);
    if (!truckId || !name || !start) return { ok: false, reason: 'truck_name_effective_required', templates: list };

    const signature = [truckId, normalize(name), normalize(category)].join('|');
    const matching = list.filter(function (item) {
      if (!item || text(item.truckId) !== truckId) return false;
      const itemSignature = [truckId, normalize(item.name), normalize(item.category)].join('|');
      return itemSignature === signature;
    });
    const policyId = matching.map(function (item) { return text(item.policyId); }).find(Boolean)
      || 'dp_' + hash(signature);

    const laterDates = matching.map(effectiveFrom).filter(function (value) { return value > start; }).sort();
    const nextDate = laterDates[0] || '';
    const newEnd = nextDate ? dayBefore(nextDate) : '';

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
      sameDate.effectiveTo = newEnd;
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
      effectiveTo: newEnd,
      createdAt: new Date().toISOString(),
    };
    list.push(created);
    return { ok: true, policy: created, templates: list, updated: false };
  }

  function buildWeeklySnapshot(existing, truck, weekKey, policies) {
    const items = (Array.isArray(policies) ? policies : []).map(function (policy) {
      return {
        policyId: templatePolicyId(policy, truck && truck.id),
        policyVersionId: text(policy.id),
        name: text(policy.name),
        amount: Number(policy.amount || 0),
        category: text(policy.category) || 'other',
        truckId: text(truck && truck.id),
        unitNumber: text(truck && truck.unitNumber),
        company: text(policy.company || (truck && truck.company)),
        effectiveFrom: effectiveFrom(policy),
        effectiveTo: effectiveTo(policy),
      };
    });
    const total = items.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    const companies = Array.from(new Set(items.map(function (item) { return text(item.company); }).filter(Boolean)));
    return {
      ...(existing || {}),
      id: text(existing && existing.id) || ('wd_' + text(truck && truck.id) + '_' + dateText(weekKey)),
      truckId: text(truck && truck.id),
      unitNumber: text(truck && truck.unitNumber),
      company: companies.join(' / ') || text(truck && truck.company),
      weekKey: dateText(weekKey),
      items,
      total,
      policyAppliedAt: new Date().toISOString(),
      policySnapshotVersion: 1,
    };
  }

  function currentTruck() {
    if (typeof global.selectedTruckId !== 'function' || typeof global.findTruckByIdOrUnit !== 'function') return null;
    return global.findTruckByIdOrUnit(global.selectedTruckId('dedTruckSelect'));
  }

  function currentWeek() {
    return typeof global.getDedWeekKey === 'function'
      ? global.getDedWeekKey()
      : new Date().toISOString().slice(0, 10);
  }

  function loadTemplates() {
    return typeof global.loadDedTemplates === 'function' ? global.loadDedTemplates() : [];
  }

  function ensurePolicyFields() {
    const modal = global.document && global.document.getElementById('dedModal');
    if (!modal || global.document.getElementById('dedPolicyContext')) return;
    const actionRow = Array.from(modal.querySelectorAll('div')).find(function (node) {
      return node.querySelector && node.querySelector('button[onclick="saveDedModal()"]');
    });
    if (!actionRow || !actionRow.parentNode) return;

    const wrapper = global.document.createElement('div');
    wrapper.id = 'dedPolicyContext';
    wrapper.style.display = 'none';
    wrapper.innerHTML =
      '<div style="border:1px solid var(--bd);border-radius:12px;padding:12px;margin-bottom:12px;background:var(--s2)">' +
        '<div class="slabel" style="margin-bottom:8px">Policy Scope</div>' +
        '<div class="sfield"><div class="slabel">Truck</div><input id="dedPolicyTruck" readonly></div>' +
        '<div class="sfield"><div class="slabel">Company / Carrier</div><input id="dedPolicyCompany" placeholder="Company name"></div>' +
        '<div class="sfield"><div class="slabel">Effective From Week</div><input type="date" id="dedPolicyEffectiveFrom">' +
          '<div class="muted" style="font-size:10px;margin-top:3px">Previous weekly settlements remain unchanged.</div></div>' +
      '</div>';
    actionRow.parentNode.insertBefore(wrapper, actionRow);
  }

  function openTemplateModal() {
    ensurePolicyFields();
    global._dedModalMode = 'template';
    global._dedEditIdx = -1;
    const truck = currentTruck();
    const title = global.document.getElementById('dedModalTitle');
    const name = global.document.getElementById('dedName');
    const amount = global.document.getElementById('dedAmount');
    const category = global.document.getElementById('dedCategory');
    const context = global.document.getElementById('dedPolicyContext');
    if (title) title.textContent = 'Add Deduction Policy';
    if (name) name.value = '';
    if (amount) amount.value = '';
    if (category) category.value = 'insurance';
    if (context) context.style.display = '';
    const truckInput = global.document.getElementById('dedPolicyTruck');
    const companyInput = global.document.getElementById('dedPolicyCompany');
    const effectiveInput = global.document.getElementById('dedPolicyEffectiveFrom');
    if (truckInput) truckInput.value = truck && typeof global.truckDisplay === 'function' ? global.truckDisplay(truck) : text(truck && truck.unitNumber);
    if (companyInput) companyInput.value = text(truck && truck.company);
    if (effectiveInput) effectiveInput.value = currentWeek();
    if (typeof global.showDedModal === 'function') global.showDedModal();
  }

  function savePolicyModal() {
    if (global._dedModalMode !== 'template') return previous.saveDedModal.apply(this, arguments);
    const truck = currentTruck();
    const name = text((global.document.getElementById('dedName') || {}).value);
    const amount = Number((global.document.getElementById('dedAmount') || {}).value || 0);
    const category = text((global.document.getElementById('dedCategory') || {}).value) || 'other';
    const company = text((global.document.getElementById('dedPolicyCompany') || {}).value) || text(truck && truck.company);
    const start = dateText((global.document.getElementById('dedPolicyEffectiveFrom') || {}).value) || currentWeek();
    if (!truck || !name) {
      if (typeof global.toast === 'function') global.toast('Truck and name required', 'err');
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
    });
    if (!result.ok) {
      if (typeof global.toast === 'function') global.toast('Policy could not be saved', 'err');
      return;
    }
    global.saveDedTemplates(result.templates);
    if (typeof global.closeDedModal === 'function') global.closeDedModal();
    renderPolicyPage();
    if (typeof global.toast === 'function') global.toast(result.updated ? 'Policy version updated' : 'Policy version saved');
  }

  function applyPolicies() {
    const truck = currentTruck();
    const weekKey = currentWeek();
    if (!truck) {
      if (typeof global.toast === 'function') global.toast('Select a truck', 'err');
      return;
    }
    const policies = effectivePolicies(loadTemplates(), truck.id, weekKey);
    if (!policies.length) {
      if (typeof global.toast === 'function') global.toast('No effective policies for this truck and week', 'warn');
      return;
    }

    const weekly = typeof global.loadWeeklyDeds === 'function' ? global.loadWeeklyDeds() : [];
    const index = weekly.findIndex(function (item) {
      return dateText(item.weekKey) === weekKey && text(item.truckId) === text(truck.id);
    });
    if (index >= 0 && !global.confirm('Replace this week\'s deductions with the effective truck policies?')) return;
    const entry = buildWeeklySnapshot(index >= 0 ? weekly[index] : null, truck, weekKey, policies);
    if (index >= 0) weekly[index] = entry;
    else weekly.push(entry);
    global.saveWeeklyDeds(weekly);
    renderPolicyPage();
    if (typeof global.toast === 'function') global.toast('Applied ' + policies.length + ' policy item(s)');
  }

  function assignLegacyTemplate(id) {
    const legacy = loadTemplates().find(function (item) { return text(item.id) === text(id); });
    const truck = currentTruck();
    if (!legacy || !truck) return;
    const result = versionPolicy(loadTemplates(), {
      truckId: truck.id,
      unitNumber: truck.unitNumber,
      company: text(truck.company),
      name: legacy.name,
      amount: legacy.amount,
      category: legacy.category,
      effectiveFrom: currentWeek(),
    });
    if (!result.ok) return;
    global.saveDedTemplates(result.templates);
    renderPolicyPage();
    if (typeof global.toast === 'function') global.toast('Legacy template assigned to Unit ' + text(truck.unitNumber));
  }

  function statusFor(template, weekKey) {
    const start = effectiveFrom(template);
    const end = effectiveTo(template);
    if (start > weekKey) return { label: 'future', color: 'var(--acc)' };
    if (end && end < weekKey) return { label: 'ended', color: 'var(--mu)' };
    return { label: 'active', color: 'var(--gr)' };
  }

  function renderPolicyPage() {
    if (typeof previous.renderDeductionsPage === 'function') previous.renderDeductionsPage();
    ensurePolicyFields();
    const truck = currentTruck();
    const weekKey = currentWeek();
    const listElement = global.document && global.document.getElementById('dedTemplateList');
    const label = global.document && global.document.getElementById('dedWeekLabel');
    if (label && truck) {
      label.textContent = (typeof global.truckDisplay === 'function' ? global.truckDisplay(truck) : ('Unit ' + text(truck.unitNumber))) +
        (truck.company ? ' · ' + text(truck.company) : '') + ' / Week of ' + weekKey;
    }
    if (!listElement) return;

    const templates = loadTemplates();
    const versions = templates.filter(function (item) { return text(item.truckId) === text(truck && truck.id); })
      .sort(function (a, b) { return versionSort(b, a); });
    const legacy = templates.filter(function (item) { return !text(item.truckId); });

    let html = '<div class="muted" style="font-size:11px;margin-bottom:10px">Policies are scoped to this truck. Company and effective week are retained for audit history.</div>';
    if (versions.length) {
      html += versions.map(function (item) {
        const status = statusFor(item, weekKey);
        return '<div class="line" style="padding:9px 0;border-bottom:1px solid var(--bd)">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
            '<div><div style="font-weight:700">' + global.escHtml(item.name) + '</div>' +
              '<div class="muted" style="font-size:10px">' + global.escHtml(item.company || 'No company') +
              ' · from ' + global.escHtml(effectiveFrom(item)) + (effectiveTo(item) ? ' to ' + global.escHtml(effectiveTo(item)) : '') +
              ' · <span style="color:' + status.color + '">' + status.label + '</span></div></div>' +
            '<div style="display:flex;align-items:center;gap:8px"><strong>' + global.fmt(item.amount) + '</strong>' +
              '<button onclick="deleteDedTemplate(\'' + global.escHtml(item.id) + '\')" style="background:none;border:none;color:var(--rd);cursor:pointer">✕</button></div>' +
          '</div></div>';
      }).join('');
    } else {
      html += '<div class="empty" style="padding:12px 0">No policies for this truck yet</div>';
    }

    if (legacy.length) {
      html += '<div class="muted" style="font-size:11px;margin-top:12px;color:var(--acc)">Legacy unassigned templates</div>' +
        legacy.map(function (item) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd)">' +
            '<span>' + global.escHtml(item.name) + ' · ' + global.fmt(item.amount) + '</span>' +
            '<button onclick="CrewBIQDeductionPolicies.assignLegacyTemplate(\'' + global.escHtml(item.id) + '\')" style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);padding:5px 8px;cursor:pointer">Assign here</button>' +
          '</div>';
        }).join('');
    }
    listElement.innerHTML = html;
  }

  function install() {
    if (typeof global.openAddDedTemplate !== 'function' || typeof global.saveDedModal !== 'function') return;
    previous.openAddDedTemplate = global.openAddDedTemplate;
    previous.saveDedModal = global.saveDedModal;
    previous.applyDedTemplate = global.applyDedTemplate;
    previous.renderDeductionsPage = global.renderDeductionsPage;

    global.openAddDedTemplate = openTemplateModal;
    global.saveDedModal = savePolicyModal;
    global.applyDedTemplate = applyPolicies;
    global.renderDeductionsPage = renderPolicyPage;
    ensurePolicyFields();
  }

  global.CrewBIQDeductionPolicies = {
    version: VERSION,
    effectivePolicies,
    versionPolicy,
    buildWeeklySnapshot,
    assignLegacyTemplate,
    render: renderPolicyPage,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ Deductions] effective-dated truck policies v' + VERSION + ' loaded');
})(window);
