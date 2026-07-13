/**
 * CrewBIQ segmented service invoice review v0.1.0
 *
 * One OCR document creates one accounting parent Service Log entry. Editable
 * child groups provide category detail only and are never charged again.
 */
(function (global) {
  'use strict';

  const CATEGORIES = [
    'Front Axle / Suspension', 'Steering', 'Alignment', 'Oil & Fluids',
    'PM Service', 'Tires', 'Brakes', 'Engine', 'Transmission', 'Electrical',
    'DPF / Emissions', 'Body / Cab', 'Inspection', 'Labor',
    'Parts / Supplies', 'Fees / Tax', 'Other'
  ];
  let state = null;

  function text(value) { return String(value == null ? '' : value).trim(); }
  function number(value) {
    const n = Number(value == null || value === '' ? 0 : value);
    return Number.isFinite(n) ? n : 0;
  }
  function cents(value) { return Math.round((number(value) + Number.EPSILON) * 100); }
  function fromCents(value) { return value / 100; }
  function round2(value) { return fromCents(cents(value)); }
  function esc(value) {
    if (typeof global.escHtml === 'function') return global.escHtml(value);
    return text(value).replace(/[&<>"']/g, function (char) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];
    });
  }
  function money(value) { return '$' + number(value).toFixed(2); }
  function normalizeUnit(value) {
    return text(value).replace(/^unit\s*#?\s*/i, '').replace(/[^a-z0-9-]/gi, '').toUpperCase();
  }
  function stableHash(value) {
    let hash = 2166136261;
    const source = String(value || '');
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function activeTrucks() {
    try {
      return (typeof global.loadTrucks === 'function' ? global.loadTrucks() : [])
        .filter(function (truck) { return truck && truck.active !== false && truck.is_active !== false; });
    } catch (e) { return []; }
  }
  function truckByUnit(unit) {
    const key = normalizeUnit(unit);
    return activeTrucks().find(function (truck) {
      return normalizeUnit(truck.unitNumber) === key;
    }) || null;
  }
  function truckById(id) {
    return activeTrucks().find(function (truck) { return text(truck.id) === text(id); }) || null;
  }
  function truckLabel(truck) {
    if (!truck) return 'Select active truck';
    const unit = truck.unitNumber ? 'Unit ' + truck.unitNumber : 'Truck';
    const name = [truck.year, truck.make, truck.model].filter(Boolean).join(' ');
    return name ? unit + ' - ' + name : unit;
  }
  function truckOptions(selectedId) {
    return '<option value="">Select active truck</option>' + activeTrucks().map(function (truck) {
      return '<option value="' + esc(truck.id) + '"' + (text(selectedId) === text(truck.id) ? ' selected' : '') + '>' +
        esc(truckLabel(truck)) + '</option>';
    }).join('');
  }
  function categoryOptions(selected) {
    return CATEGORIES.map(function (category) {
      return '<option' + (category === selected ? ' selected' : '') + '>' + esc(category) + '</option>';
    }).join('');
  }

  function allocateCents(totalValue, weights) {
    const total = cents(totalValue);
    const safeWeights = weights.map(function (weight) { return Math.max(0, number(weight)); });
    const sum = safeWeights.reduce(function (acc, weight) { return acc + weight; }, 0);
    if (!safeWeights.length) return [];
    if (!sum) {
      const result = safeWeights.map(function () { return 0; });
      result[result.length - 1] = total;
      return result;
    }
    let used = 0;
    return safeWeights.map(function (weight, index) {
      if (index === safeWeights.length - 1) return total - used;
      const share = Math.round(total * weight / sum);
      used += share;
      return share;
    });
  }

  function recalculate() {
    if (!state) return;
    const weights = state.groups.map(function (group) { return Math.max(0, number(group.subtotal)); });
    const discounts = allocateCents(state.parent.discount, weights);
    const taxes = allocateCents(state.parent.tax, weights);
    const fees = allocateCents(state.parent.fees, weights);
    state.groups.forEach(function (group, index) {
      group.allocatedDiscount = fromCents(discounts[index] || 0);
      group.allocatedTax = fromCents(taxes[index] || 0);
      group.allocatedFees = fromCents(fees[index] || 0);
      group.net = round2(number(group.subtotal) - group.allocatedDiscount + group.allocatedTax + group.allocatedFees);
    });
    state.groupSubtotal = round2(state.groups.reduce(function (sum, group) { return sum + number(group.subtotal); }, 0));
    state.allocatedNet = round2(state.groups.reduce(function (sum, group) { return sum + number(group.net); }, 0));
    state.reconciliationDifference = round2(state.allocatedNet - number(state.parent.totalDue));
  }

  function buildState(result) {
    const resultGroups = Array.isArray(result.service_groups) ? result.service_groups : [];
    const groups = resultGroups.map(function (group, index) {
      const components = number(group.parts_amount) + number(group.labor_amount) + number(group.other_amount);
      return {
        id: 'group_' + index,
        category: CATEGORIES.includes(group.category) ? group.category : 'Other',
        description: text(group.description),
        partsAmount: number(group.parts_amount),
        laborAmount: number(group.labor_amount),
        laborHours: number(group.labor_hours),
        otherAmount: number(group.other_amount),
        subtotal: number(group.subtotal) || round2(components),
        partNumbers: Array.isArray(group.part_numbers) ? group.part_numbers.map(text).filter(Boolean) : [],
        allocatedDiscount: 0,
        allocatedTax: 0,
        allocatedFees: 0,
        net: 0
      };
    });
    if (!groups.length) {
      groups.push({
        id: 'group_0', category: 'Other', description: 'Review invoice work',
        partsAmount: 0, laborAmount: 0, laborHours: 0, otherAmount: 0,
        subtotal: number(result.subtotal) || number(result.total_due), partNumbers: [],
        allocatedDiscount: 0, allocatedTax: 0, allocatedFees: 0, net: 0
      });
    }
    const truck = truckByUnit(result.truck_unit);
    const parent = {
      truckId: truck ? text(truck.id) : '',
      unitNumber: normalizeUnit(result.truck_unit || (truck && truck.unitNumber)),
      invoiceNumber: text(result.invoice_number),
      vendor: text(result.vendor),
      location: text(result.location),
      date: text(result.date),
      dueDate: text(result.due_date),
      odometer: number(result.odometer),
      subtotal: number(result.subtotal) || round2(groups.reduce(function (sum, group) { return sum + group.subtotal; }, 0)),
      discount: number(result.discount),
      tax: number(result.tax),
      fees: number(result.fees),
      totalDue: number(result.total_due),
      fromFund: true
    };
    if (!parent.totalDue) parent.totalDue = round2(parent.subtotal - parent.discount + parent.tax + parent.fees);
    state = {
      requestId: text(result.request_id),
      result: result,
      parent: parent,
      groups: groups,
      groupSubtotal: 0,
      allocatedNet: 0,
      reconciliationDifference: 0
    };
    recalculate();
    return state;
  }

  function updateParent(field, value) {
    if (!state) return;
    if (['odometer','subtotal','discount','tax','fees','totalDue'].includes(field)) {
      state.parent[field] = Math.max(0, number(value));
    } else if (field === 'fromFund') {
      state.parent.fromFund = !!value;
    } else {
      state.parent[field] = text(value);
    }
    recalculate();
    render();
  }
  function assignTruck(value) {
    if (!state) return;
    const truck = truckById(value);
    state.parent.truckId = truck ? text(truck.id) : '';
    state.parent.unitNumber = truck ? normalizeUnit(truck.unitNumber) : '';
    render();
  }
  function updateGroup(index, field, value) {
    if (!state || !state.groups[index]) return;
    const group = state.groups[index];
    if (['partsAmount','laborAmount','laborHours','otherAmount','subtotal'].includes(field)) {
      group[field] = Math.max(0, number(value));
      if (field !== 'subtotal') {
        const components = group.partsAmount + group.laborAmount + group.otherAmount;
        if (components > 0) group.subtotal = round2(components);
      }
    } else {
      group[field] = text(value);
    }
    recalculate();
    render();
  }
  function addGroup() {
    if (!state) return;
    state.groups.push({
      id: 'group_' + Date.now(), category: 'Other', description: '',
      partsAmount: 0, laborAmount: 0, laborHours: 0, otherAmount: 0,
      subtotal: 0, partNumbers: [], allocatedDiscount: 0,
      allocatedTax: 0, allocatedFees: 0, net: 0
    });
    recalculate();
    render();
  }
  function removeGroup(index) {
    if (!state || state.groups.length <= 1) return;
    state.groups.splice(index, 1);
    recalculate();
    render();
  }

  function sourceInvoiceKey(parent) {
    return [
      'service_invoice', text(parent.vendor).toLowerCase(), text(parent.invoiceNumber).toLowerCase(),
      text(parent.date), normalizeUnit(parent.unitNumber), number(parent.totalDue).toFixed(2)
    ].join('|');
  }
  function isDuplicate(log, key, parent) {
    if (!log) return false;
    if (key && text(log.sourceInvoiceKey) === key) return true;
    return text(log.invoiceNumber).toLowerCase() === text(parent.invoiceNumber).toLowerCase() &&
      text(log.vendor).toLowerCase() === text(parent.vendor).toLowerCase() &&
      text(log.date) === text(parent.date) &&
      text(log.truckId) === text(parent.truckId) &&
      Math.abs(number(log.amount) - number(parent.totalDue)) < 0.01;
  }

  function importInvoice() {
    if (!state) return;
    const parent = state.parent;
    if (!parent.truckId) return global.toast && global.toast('Assign the invoice to an active truck', 'err');
    if (!parent.date) return global.toast && global.toast('Service date is required', 'err');
    if (!parent.totalDue) return global.toast && global.toast('Invoice total is required', 'err');
    if (!state.groups.length || state.groups.some(function (group) { return !group.description || !group.subtotal; })) {
      return global.toast && global.toast('Every service group needs a description and subtotal', 'err');
    }
    if (Math.abs(state.reconciliationDifference) > 0.02) {
      return global.toast && global.toast('Group allocations do not reconcile to invoice total', 'err');
    }

    const key = sourceInvoiceKey(parent);
    const logs = typeof global.loadServiceLogs === 'function' ? global.loadServiceLogs() : [];
    if (logs.some(function (log) { return isDuplicate(log, key, parent); })) {
      return global.toast && global.toast('0 invoices imported · duplicate skipped', 'warn');
    }
    const message = 'Import invoice ' + (parent.invoiceNumber || '') + ' for ' + money(parent.totalDue) +
      ' with ' + state.groups.length + ' service groups?';
    if (typeof global.confirm === 'function' && !global.confirm(message)) return;

    const groups = state.groups.map(function (group) {
      return {
        category: group.category,
        description: group.description,
        partsAmount: round2(group.partsAmount),
        laborAmount: round2(group.laborAmount),
        laborHours: number(group.laborHours),
        otherAmount: round2(group.otherAmount),
        subtotal: round2(group.subtotal),
        allocatedDiscount: round2(group.allocatedDiscount),
        allocatedTax: round2(group.allocatedTax),
        allocatedFees: round2(group.allocatedFees),
        net: round2(group.net),
        partNumbers: group.partNumbers.slice()
      };
    });
    const entry = {
      id: 'svc_invoice_' + stableHash(key),
      date: parent.date,
      odometer: Math.round(parent.odometer || 0),
      amount: round2(parent.totalDue),
      category: 'Service Invoice',
      description: [parent.vendor, parent.invoiceNumber ? 'Invoice ' + parent.invoiceNumber : ''].filter(Boolean).join(' · '),
      fromFund: !!parent.fromFund,
      truckId: parent.truckId,
      unitNumber: parent.unitNumber,
      invoiceNumber: parent.invoiceNumber,
      vendor: parent.vendor,
      location: parent.location,
      subtotal: round2(parent.subtotal),
      discount: round2(parent.discount),
      tax: round2(parent.tax),
      fees: round2(parent.fees),
      sourceRequestId: state.requestId,
      sourceInvoiceKey: key,
      sourceDocumentType: 'service_invoice',
      serviceGroups: groups,
      createdAt: new Date().toISOString(),
      synced: false
    };
    logs.unshift(entry);
    global.saveServiceLogs(logs);
    if (typeof global.showPage === 'function') global.showPage('service');
    if (typeof global.renderServicePage === 'function') global.renderServicePage();
    if (global.toast) global.toast('1 service invoice imported · counted once', 'ok');
  }

  function groupCard(group, index) {
    return '<div style="border:1px solid var(--bd);border-radius:12px;padding:12px;margin-top:10px;background:var(--s2)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>Work group ' + (index + 1) + '</strong>' +
      (state.groups.length > 1 ? '<button onclick="CrewBIQServiceInvoice.removeGroup(' + index + ')" style="background:none;border:none;color:var(--rd);font-size:18px">×</button>' : '') + '</div>' +
      '<div class="sfield" style="margin-top:10px"><div class="slabel">Category</div><select onchange="CrewBIQServiceInvoice.updateGroup(' + index + ',\'category\',this.value)">' + categoryOptions(group.category) + '</select></div>' +
      '<div class="sfield"><div class="slabel">Description</div><input value="' + esc(group.description) + '" onchange="CrewBIQServiceInvoice.updateGroup(' + index + ',\'description\',this.value)"></div>' +
      '<div class="frow"><div class="fg"><div class="slabel">Parts $</div><input type="number" step="0.01" value="' + number(group.partsAmount).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateGroup(' + index + ',\'partsAmount\',this.value)"></div>' +
      '<div class="fg"><div class="slabel">Labor $</div><input type="number" step="0.01" value="' + number(group.laborAmount).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateGroup(' + index + ',\'laborAmount\',this.value)"></div></div>' +
      '<div class="frow"><div class="fg"><div class="slabel">Other $</div><input type="number" step="0.01" value="' + number(group.otherAmount).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateGroup(' + index + ',\'otherAmount\',this.value)"></div>' +
      '<div class="fg"><div class="slabel">Group subtotal $</div><input type="number" step="0.01" value="' + number(group.subtotal).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateGroup(' + index + ',\'subtotal\',this.value)"></div></div>' +
      '<div class="muted" style="font-size:11px">Allocated: discount -' + money(group.allocatedDiscount) + ' · tax +' + money(group.allocatedTax) + ' · fees +' + money(group.allocatedFees) + '</div>' +
      '<div style="font-weight:800;margin-top:4px">Group net: ' + money(group.net) + '</div>' +
      (group.partNumbers.length ? '<div class="muted" style="font-size:11px;margin-top:4px">Parts: ' + esc(group.partNumbers.join(', ')) + '</div>' : '') +
    '</div>';
  }

  function render() {
    const el = document.getElementById('scanReviewCard');
    if (!el || !state) return;
    const parent = state.parent;
    const diff = state.reconciliationDifference;
    const warnings = (state.result.warnings || []).map(function (warning) {
      return '<div class="muted" style="color:var(--am);font-size:11px">⚠ ' + esc(warning) + '</div>';
    }).join('');
    el.innerHTML = '<div class="card">' +
      '<div style="font-size:16px;font-weight:900;color:var(--acc)">🔧 Service Invoice Review</div>' +
      '<div class="muted">One parent charge · ' + state.groups.length + ' category groups · file not stored</div>' +
      '<div class="sfield" style="margin-top:12px"><div class="slabel">Assign to truck</div><select onchange="CrewBIQServiceInvoice.assignTruck(this.value)">' + truckOptions(parent.truckId) + '</select></div>' +
      '<div class="frow"><div class="fg"><div class="slabel">Invoice #</div><input value="' + esc(parent.invoiceNumber) + '" onchange="CrewBIQServiceInvoice.updateParent(\'invoiceNumber\',this.value)"></div>' +
      '<div class="fg"><div class="slabel">Date</div><input type="date" value="' + esc(parent.date) + '" onchange="CrewBIQServiceInvoice.updateParent(\'date\',this.value)"></div></div>' +
      '<div class="sfield"><div class="slabel">Vendor</div><input value="' + esc(parent.vendor) + '" onchange="CrewBIQServiceInvoice.updateParent(\'vendor\',this.value)"></div>' +
      '<div class="sfield"><div class="slabel">Location</div><input value="' + esc(parent.location) + '" onchange="CrewBIQServiceInvoice.updateParent(\'location\',this.value)"></div>' +
      '<div class="frow"><div class="fg"><div class="slabel">Odometer</div><input type="number" value="' + (parent.odometer || '') + '" onchange="CrewBIQServiceInvoice.updateParent(\'odometer\',this.value)"></div>' +
      '<div class="fg"><div class="slabel">Subtotal $</div><input type="number" step="0.01" value="' + number(parent.subtotal).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateParent(\'subtotal\',this.value)"></div></div>' +
      '<div class="frow"><div class="fg"><div class="slabel">Discount $</div><input type="number" step="0.01" value="' + number(parent.discount).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateParent(\'discount\',this.value)"></div>' +
      '<div class="fg"><div class="slabel">Tax $</div><input type="number" step="0.01" value="' + number(parent.tax).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateParent(\'tax\',this.value)"></div></div>' +
      '<div class="frow"><div class="fg"><div class="slabel">Fees $</div><input type="number" step="0.01" value="' + number(parent.fees).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateParent(\'fees\',this.value)"></div>' +
      '<div class="fg"><div class="slabel">Total due $</div><input type="number" step="0.01" value="' + number(parent.totalDue).toFixed(2) + '" onchange="CrewBIQServiceInvoice.updateParent(\'totalDue\',this.value)"></div></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--mu)"><input type="checkbox" ' + (parent.fromFund ? 'checked' : '') + ' onchange="CrewBIQServiceInvoice.updateParent(\'fromFund\',this.checked)"> Charge confirmed parent total to maintenance fund</label>' +
      '<div style="margin-top:12px;font-weight:800">Service groups</div>' +
      state.groups.map(groupCard).join('') +
      '<button class="btn ghost" style="margin-top:10px" onclick="CrewBIQServiceInvoice.addGroup()">+ Add work group</button>' +
      '<div style="margin-top:12px;padding:10px;border:1px solid var(--bd);border-radius:10px">' +
        '<div>Groups subtotal: <strong>' + money(state.groupSubtotal) + '</strong></div>' +
        '<div>Allocated net: <strong>' + money(state.allocatedNet) + '</strong></div>' +
        '<div>Invoice due: <strong>' + money(parent.totalDue) + '</strong></div>' +
        '<div style="color:' + (Math.abs(diff) <= 0.02 ? 'var(--gr)' : 'var(--rd)') + '">Difference: ' + (diff >= 0 ? '+' : '') + money(diff) + '</div>' +
      '</div>' +
      (warnings ? '<div style="margin-top:8px">' + warnings + '</div>' : '') +
      '<button class="btn primary" style="margin-top:12px" onclick="CrewBIQServiceInvoice.importInvoice()">Import 1 invoice — ' + money(parent.totalDue) + '</button>' +
      '<div class="muted" style="font-size:11px;margin-top:8px">The parent total is counted once in Maintenance, Expenses ledger, Real Net and ROI. Groups are analytical breakdown only.</div>' +
    '</div>';
  }

  function invoiceHistoryCard(entry) {
    const groups = Array.isArray(entry.serviceGroups) ? entry.serviceGroups : [];
    const groupRows = groups.map(function (group) {
      return '<div style="padding:7px 0;border-bottom:1px solid var(--bd)"><div style="display:flex;justify-content:space-between;gap:8px"><strong>' + esc(group.category) + '</strong><strong>' + money(group.net) + '</strong></div><div class="muted">' + esc(group.description) + '</div><div class="muted" style="font-size:10px">Parts ' + money(group.partsAmount) + ' · Labor ' + money(group.laborAmount) + ' · Other ' + money(group.otherAmount) + '</div></div>';
    }).join('');
    return '<details class="item"><summary class="item-inner" style="cursor:pointer;list-style:none"><div><div class="item-title">Service Invoice ' + esc(entry.invoiceNumber || '') + ' — ' + esc(entry.vendor || '') + '</div><div class="muted">' + esc(entry.date) + (entry.odometer ? ' · ' + Number(entry.odometer).toLocaleString() + ' mi' : '') + ' · ' + groups.length + ' groups' + (entry.fromFund ? ' · from fund' : '') + '</div></div><div class="item-title red">' + money(entry.amount) + '</div></summary><div style="padding:0 12px 10px"><div class="muted">Subtotal ' + money(entry.subtotal) + ' − discount ' + money(entry.discount) + ' + tax ' + money(entry.tax) + ' + fees ' + money(entry.fees) + '</div>' + groupRows + '<div class="item-actions"><button onclick="deleteServiceLog(\'' + esc(entry.id) + '\')" style="color:var(--rd)">🗑️ Delete invoice</button></div></div></details>';
  }

  function renderEnhancedServiceHistory() {
    const listEl = document.getElementById('serviceList');
    if (!listEl || typeof global.loadServiceLogs !== 'function') return;
    let selectedTruck = null;
    try {
      const select = document.getElementById('svcTruckSelect');
      selectedTruck = typeof global.findTruckByIdOrUnit === 'function' ? global.findTruckByIdOrUnit(select && select.value) : null;
    } catch (e) {}
    const logs = global.loadServiceLogs().filter(function (entry) {
      return typeof global.recordMatchesTruck === 'function' ? global.recordMatchesTruck(entry, selectedTruck) : true;
    }).slice().sort(function (a, b) { return text(b.date).localeCompare(text(a.date)); });
    listEl.innerHTML = logs.map(function (entry) {
      if (entry.sourceDocumentType === 'service_invoice' || Array.isArray(entry.serviceGroups)) return invoiceHistoryCard(entry);
      return '<div class="item"><div class="item-inner"><div><div class="item-title">' + esc(entry.category) + (entry.description ? ' — ' + esc(entry.description) : '') + '</div><div class="muted">' + esc(entry.date) + (entry.odometer ? ' · ' + Number(entry.odometer).toLocaleString() + ' mi' : '') + (entry.fromFund ? ' · from fund' : '') + '</div></div><div class="item-title red">' + money(entry.amount) + '</div></div><div class="item-actions"><button onclick="editServiceLog(\'' + esc(entry.id) + '\')">✏️ Edit</button><button onclick="deleteServiceLog(\'' + esc(entry.id) + '\')" style="color:var(--rd)">🗑️</button></div></div>';
    }).join('') || '<div class="empty">No service entries yet</div>';
  }

  function renderExpenseLedger() {
    const page = document.getElementById('page-expenses');
    const manualList = document.getElementById('expensesList');
    if (!page || !manualList || typeof global.loadServiceLogs !== 'function') return;
    let section = document.getElementById('serviceInvoiceExpenseLedger');
    if (!section) {
      section = document.createElement('div');
      section.id = 'serviceInvoiceExpenseLedger';
      manualList.parentNode.insertBefore(section, manualList);
    }
    const invoices = global.loadServiceLogs().filter(function (entry) {
      return entry.sourceDocumentType === 'service_invoice' || Array.isArray(entry.serviceGroups);
    }).sort(function (a, b) { return text(b.date).localeCompare(text(a.date)); });
    const total = invoices.reduce(function (sum, entry) { return sum + number(entry.amount); }, 0);
    section.innerHTML = '<div class="section-title">Service Invoices · Canonical Ledger</div>' +
      '<div class="card" style="margin-top:0"><div style="display:flex;justify-content:space-between"><div><strong>' + invoices.length + ' invoices</strong><div class="muted">Read-only view from Service Log · not duplicated in manual Expenses</div></div><strong class="red">' + money(total) + '</strong></div>' +
      invoices.slice(0, 12).map(function (entry) {
        return '<div style="padding:9px 0;border-top:1px solid var(--bd);margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px"><strong>' + esc(entry.vendor || 'Service invoice') + ' ' + esc(entry.invoiceNumber || '') + '</strong><strong class="red">' + money(entry.amount) + '</strong></div><div class="muted">' + esc(entry.date) + ' · Unit ' + esc(entry.unitNumber || '') + ' · ' + ((entry.serviceGroups || []).length) + ' groups</div></div>';
      }).join('') + '</div>';
  }

  function install() {
    const originalScanRender = global.renderScanReview;
    if (typeof originalScanRender === 'function' && !originalScanRender.__crewbiqServiceInvoice) {
      const wrapped = function () {
        const result = global.lastScanResult;
        if (result && result.ok && (result.document_type === 'service_invoice' || result.requested_document_type === 'service_invoice') && Array.isArray(result.service_groups)) {
          if (!state || state.requestId !== text(result.request_id)) buildState(result);
          render();
          return;
        }
        state = null;
        return originalScanRender.apply(this, arguments);
      };
      wrapped.__crewbiqServiceInvoice = true;
      global.renderScanReview = wrapped;
    }

    const originalServiceRender = global.renderServicePage;
    if (typeof originalServiceRender === 'function' && !originalServiceRender.__crewbiqServiceInvoice) {
      const wrapped = function () {
        const result = originalServiceRender.apply(this, arguments);
        renderEnhancedServiceHistory();
        return result;
      };
      wrapped.__crewbiqServiceInvoice = true;
      global.renderServicePage = wrapped;
    }

    const originalShowPage = global.showPage;
    if (typeof originalShowPage === 'function' && !originalShowPage.__crewbiqServiceInvoice) {
      const wrapped = function (page) {
        const result = originalShowPage.apply(this, arguments);
        if (page === 'expenses') setTimeout(renderExpenseLedger, 0);
        if (page === 'service') setTimeout(renderEnhancedServiceHistory, 0);
        return result;
      };
      wrapped.__crewbiqServiceInvoice = true;
      global.showPage = wrapped;
    }
  }

  global.CrewBIQServiceInvoice = {
    version: '0.1.0',
    buildState: buildState,
    allocateCents: allocateCents,
    recalculate: recalculate,
    sourceInvoiceKey: sourceInvoiceKey,
    isDuplicate: isDuplicate,
    updateParent: updateParent,
    assignTruck: assignTruck,
    updateGroup: updateGroup,
    addGroup: addGroup,
    removeGroup: removeGroup,
    importInvoice: importInvoice,
    render: render,
    renderExpenseLedger: renderExpenseLedger,
    getState: function () { return state; }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ Service Invoice] segmented review v0.1.0 loaded');
})(window);
