/**
 * CrewBIQ OCR multi-driver invoice review v0.2.0
 *
 * Replaces the unsafe direct invoice importer with an editable, truck-aware
 * confirmation flow. No records are written until the final Import action.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  let state = null;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function number(value) {
    const n = Number(value == null || value === '' ? 0 : value);
    return Number.isFinite(n) ? n : 0;
  }

  function round2(value) {
    return Math.round((number(value) + Number.EPSILON) * 100) / 100;
  }

  function normalizeUnit(value) {
    return text(value).replace(/^unit\s*#?\s*/i, '').replace(/[^a-z0-9-]/gi, '').toUpperCase();
  }

  function normalizeItem(value) {
    const item = text(value).toLowerCase();
    if (item === 'def' || item.includes('diesel exhaust')) return 'def';
    if (item === 'ulsd' || item.includes('fuel') || item.includes('diesel')) return 'fuel';
    return '';
  }

  function netAmount(tx) {
    return round2(number(tx && tx.amount) - number(tx && tx.discount) + number(tx && tx.fees));
  }

  function activeTrucks() {
    try {
      if (typeof global.loadTrucks === 'function') {
        return (global.loadTrucks() || []).filter(function (truck) {
          return truck && truck.active !== false && truck.is_active !== false;
        });
      }
    } catch (e) {}
    return [];
  }

  function currentDriver() {
    try {
      const parsed = JSON.parse(localStorage.getItem(K + 'driver') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function truckByUnit(trucks, unit) {
    const normalized = normalizeUnit(unit);
    return (trucks || []).find(function (truck) {
      return normalizeUnit(truck && truck.unitNumber) === normalized;
    }) || null;
  }

  function stopGroupKey(tx, fallbackDriver, fallbackUnit) {
    return [
      normalizeUnit(tx.unit || fallbackUnit),
      text(tx.driver || fallbackDriver).toLowerCase(),
      text(tx.date),
      text(tx.location).toLowerCase(),
      text(tx.state).toLowerCase(),
    ].join('|');
  }

  function buildStops(result, trucks, currentUnit) {
    const groups = new Map();
    const transactions = Array.isArray(result && result.transactions) ? result.transactions : [];
    const fallbackDriver = text(result && result.driver);
    const fallbackUnit = normalizeUnit(result && result.unit);

    transactions.forEach(function (tx, rowIndex) {
      if (!tx || typeof tx !== 'object') return;
      const item = normalizeItem(tx.item);
      if (!item || !text(tx.date)) return;

      const unit = normalizeUnit(tx.unit || fallbackUnit);
      const driver = text(tx.driver || fallbackDriver);
      const key = stopGroupKey(tx, fallbackDriver, fallbackUnit);
      let stop = groups.get(key);
      if (!stop) {
        const truck = truckByUnit(trucks, unit);
        stop = {
          key,
          driver,
          unit,
          date: text(tx.date),
          location: text(tx.location),
          state: text(tx.state).toUpperCase(),
          truckId: truck ? text(truck.id) : '',
          selected: !!truck && normalizeUnit(currentUnit) === unit,
          fuelGallons: 0,
          fuelCost: 0,
          defGallons: 0,
          defCost: 0,
          grossAmount: 0,
          discount: 0,
          fees: 0,
          netTotal: 0,
          sourceRows: [],
        };
        groups.set(key, stop);
      }

      const gallons = number(tx.gallons);
      const gross = number(tx.amount);
      const discount = number(tx.discount);
      const fees = number(tx.fees);
      const net = netAmount(tx);

      stop.sourceRows.push(rowIndex);
      stop.grossAmount = round2(stop.grossAmount + gross);
      stop.discount = round2(stop.discount + discount);
      stop.fees = round2(stop.fees + fees);
      stop.netTotal = round2(stop.netTotal + net);
      if (item === 'fuel') {
        stop.fuelGallons = round2(stop.fuelGallons + gallons);
        stop.fuelCost = round2(stop.fuelCost + net);
      } else {
        stop.defGallons = round2(stop.defGallons + gallons);
        stop.defCost = round2(stop.defCost + net);
      }
    });

    return Array.from(groups.values()).sort(function (a, b) {
      return a.date === b.date ? a.unit.localeCompare(b.unit) : a.date.localeCompare(b.date);
    });
  }

  function esc(value) {
    if (typeof global.escHtml === 'function') return global.escHtml(value);
    return text(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function truckLabel(truck) {
    if (!truck) return '';
    const unit = truck.unitNumber ? 'Unit ' + truck.unitNumber : 'Truck';
    const name = [truck.year, truck.make, truck.model].filter(Boolean).join(' ');
    return name ? unit + ' - ' + name : unit;
  }

  function truckOptions(selectedId) {
    const trucks = activeTrucks();
    return '<option value="">Select active truck</option>' + trucks.map(function (truck) {
      const id = text(truck.id);
      return '<option value="' + esc(id) + '"' + (id === text(selectedId) ? ' selected' : '') + '>' +
        esc(truckLabel(truck)) + '</option>';
    }).join('');
  }

  function money(value) {
    return '$' + number(value).toFixed(2);
  }

  function stopLocation(stop) {
    const location = text(stop && stop.location);
    const stateValue = text(stop && stop.state).toUpperCase();
    if (!stateValue || location.toUpperCase().includes(stateValue)) return location;
    return location ? location + ' (' + stateValue + ')' : stateValue;
  }

  function selectedStops() {
    return state ? state.stops.filter(function (stop) { return stop.selected; }) : [];
  }

  function selectedTotal() {
    return round2(selectedStops().reduce(function (sum, stop) { return sum + number(stop.netTotal); }, 0));
  }

  function unmatchedSelected() {
    return selectedStops().filter(function (stop) { return !text(stop.truckId); });
  }

  function updateSummary() {
    if (!state) return;
    const selected = selectedStops();
    const summary = document.getElementById('ocrInvoiceSelectionSummary');
    const button = document.getElementById('ocrInvoiceImportBtn');
    if (summary) {
      summary.textContent = selected.length + ' selected stop' + (selected.length === 1 ? '' : 's') +
        ' · ' + money(selectedTotal());
    }
    if (button) {
      const blocked = !selected.length || unmatchedSelected().length > 0;
      button.disabled = blocked;
      button.textContent = blocked
        ? (selected.length ? 'Assign a truck before import' : 'Select stops to import')
        : 'Import ' + selected.length + ' selected stop' + (selected.length === 1 ? '' : 's') + ' — ' + money(selectedTotal());
    }
  }

  function update(index, field, value) {
    if (!state || !state.stops[index]) return;
    const stop = state.stops[index];
    if (['fuelGallons', 'fuelCost', 'defGallons', 'defCost'].includes(field)) {
      stop[field] = Math.max(0, number(value));
      stop.netTotal = round2(stop.fuelCost + stop.defCost);
    } else if (field === 'selected') {
      stop.selected = !!value;
    } else {
      stop[field] = text(value);
      if (field === 'location') stop.state = '';
    }
    updateSummary();
  }

  function assignTruck(index, truckId) {
    if (!state || !state.stops[index]) return;
    const truck = activeTrucks().find(function (item) { return text(item.id) === text(truckId); }) || null;
    state.stops[index].truckId = truck ? text(truck.id) : '';
    if (truck) state.stops[index].unit = normalizeUnit(truck.unitNumber);
    if (!truck) state.stops[index].selected = false;
    renderInvoiceState();
  }

  function selectCurrentUnit() {
    if (!state) return;
    const unit = normalizeUnit(currentDriver().unitNumber);
    state.stops.forEach(function (stop) {
      stop.selected = !!stop.truckId && stop.unit === unit;
    });
    renderInvoiceState();
  }

  function selectAllMatched() {
    if (!state) return;
    state.stops.forEach(function (stop) { stop.selected = !!stop.truckId; });
    renderInvoiceState();
  }

  function renderStop(stop, index) {
    const disabled = !stop.truckId;
    return '<div style="border:1px solid var(--bd);border-radius:12px;padding:12px;margin-top:10px;background:var(--s2)">' +
      '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<input type="checkbox" id="ocrInvCheck' + index + '" ' + (stop.selected ? 'checked' : '') +
          (disabled ? ' disabled' : '') +
          ' onchange="CrewBIQInvoiceReview.update(' + index + ',\'selected\',this.checked)" style="width:20px;height:20px;margin-top:3px">' +
        '<div style="flex:1">' +
          '<div style="font-weight:800">' + esc(stop.date) + ' · ' + esc(stop.location) + (stop.state ? ' (' + esc(stop.state) + ')' : '') + '</div>' +
          '<div class="muted">' + esc(stop.driver || 'Driver unknown') + ' · Unit ' + esc(stop.unit || 'unknown') + '</div>' +
        '</div>' +
        '<div style="text-align:right"><strong>' + money(stop.netTotal) + '</strong><div class="muted">net</div></div>' +
      '</div>' +
      '<div style="margin-top:10px"><div class="label">Assign to truck</div><select onchange="CrewBIQInvoiceReview.assignTruck(' + index + ',this.value)">' + truckOptions(stop.truckId) + '</select></div>' +
      '<div class="frow" style="margin-top:10px"><div class="fg"><div class="label">Date</div><input type="date" value="' + esc(stop.date) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'date\',this.value)"></div>' +
      '<div class="fg"><div class="label">Driver</div><input value="' + esc(stop.driver) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'driver\',this.value)"></div></div>' +
      '<div class="fg"><div class="label">Location</div><input value="' + esc(stopLocation(stop)) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'location\',this.value)"></div>' +
      '<div class="frow" style="margin-top:10px"><div class="fg"><div class="label">Fuel gal</div><input type="number" step="0.001" value="' + number(stop.fuelGallons) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'fuelGallons\',this.value)"></div>' +
      '<div class="fg"><div class="label">Fuel net $</div><input type="number" step="0.01" value="' + number(stop.fuelCost).toFixed(2) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'fuelCost\',this.value)"></div></div>' +
      '<div class="frow"><div class="fg"><div class="label">DEF gal</div><input type="number" step="0.001" value="' + number(stop.defGallons) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'defGallons\',this.value)"></div>' +
      '<div class="fg"><div class="label">DEF net $</div><input type="number" step="0.01" value="' + number(stop.defCost).toFixed(2) + '" onchange="CrewBIQInvoiceReview.update(' + index + ',\'defCost\',this.value)"></div></div>' +
      '<div class="muted" style="font-size:11px">Gross ' + money(stop.grossAmount) + ' − discount ' + money(stop.discount) + ' + fees ' + money(stop.fees) + ' = net ' + money(stop.netTotal) + '</div>' +
      (disabled ? '<div style="color:var(--rd);font-size:11px;margin-top:6px">This unit is not matched to an active truck. Assign it before selecting.</div>' : '') +
    '</div>';
  }

  function renderInvoiceState() {
    const el = document.getElementById('scanReviewCard');
    if (!el || !state) return;
    const result = state.result;
    const totals = result.totals || {};
    const allTotal = round2(state.stops.reduce(function (sum, stop) { return sum + number(stop.netTotal); }, 0));
    const invoiceDue = number(totals.total_due);
    const difference = round2(allTotal - invoiceDue);
    const missingIdentity = state.stops.some(function (stop) { return !stop.unit || !stop.driver; });
    const warningHtml = (result.warnings || []).map(function (warning) {
      return '<div class="muted" style="font-size:11px;color:var(--am)">⚠ ' + esc(warning) + '</div>';
    }).join('');

    el.innerHTML = '<div class="card">' +
      '<div style="font-size:15px;font-weight:800;color:var(--acc)">⛽ Fuel Invoice Review</div>' +
      '<div class="muted">' + esc(result.vendor || '') + (result.invoice_number ? ' #' + esc(result.invoice_number) : '') +
        (result.period_start ? ' · ' + esc(result.period_start) + ' → ' + esc(result.period_end || '') : '') + '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:12px">' +
        '<span>' + state.stops.length + ' grouped stops</span>' +
        '<span>All net: <strong>' + money(allTotal) + '</strong></span>' +
        '<span>Invoice due: <strong>' + money(invoiceDue) + '</strong></span>' +
      '</div>' +
      (Math.abs(difference) > 0.02 ? '<div style="color:var(--rd);font-size:11px;margin-top:6px">Totals differ by ' + money(difference) + '. Review every row.</div>' : '') +
      (missingIdentity ? '<div style="color:var(--rd);font-size:11px;margin-top:6px">Some rows have no driver or unit. Rescan before importing them.</div>' : '') +
      (warningHtml ? '<div style="margin-top:8px">' + warningHtml + '</div>' : '') +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn ghost" onclick="CrewBIQInvoiceReview.selectCurrentUnit()">Current unit only</button>' +
      '<button class="btn ghost" onclick="CrewBIQInvoiceReview.selectAllMatched()">Select all matched</button></div>' +
      state.stops.map(renderStop).join('') +
      '<div id="ocrInvoiceSelectionSummary" style="font-weight:800;margin-top:14px"></div>' +
      '<button id="ocrInvoiceImportBtn" class="btn primary" onclick="CrewBIQInvoiceReview.importSelected()" style="margin-top:10px"></button>' +
      '<div class="muted" style="font-size:11px;margin-top:8px">Nothing is saved until this final Import button is confirmed. Net cost equals amount − discount + fees.</div>' +
    '</div>';
    updateSummary();
  }

  function renderForResult(result) {
    const trucks = activeTrucks();
    const currentUnit = normalizeUnit(currentDriver().unitNumber);
    const requestId = text(result && result.request_id) || 'invoice_' + Date.now();
    if (!state || state.requestId !== requestId) {
      state = {
        requestId,
        result,
        stops: buildStops(result, trucks, currentUnit),
      };
    }
    renderInvoiceState();
  }

  function sourceStopKey(stop, invoiceNumber) {
    return [
      text(invoiceNumber).toLowerCase(),
      normalizeUnit(stop.unit),
      text(stop.date),
      stopLocation(stop).toLowerCase(),
      number(stop.fuelGallons).toFixed(3),
      number(stop.defGallons).toFixed(3),
    ].join('|');
  }

  function isDuplicate(log, entry) {
    if (!log) return false;
    if (entry.sourceStopKey && text(log.sourceStopKey) === entry.sourceStopKey) return true;
    return text(log.truckId) === text(entry.truckId) &&
      text(log.date) === text(entry.date) &&
      text(log.location).toLowerCase() === text(entry.location).toLowerCase() &&
      Math.abs(number(log.fuelGallons) - number(entry.fuelGallons)) < 0.001 &&
      Math.abs(number(log.defGallons) - number(entry.defGallons)) < 0.001 &&
      Math.abs(number(log.fuelCost) - number(entry.fuelCost)) < 0.01 &&
      Math.abs(number(log.defCost) - number(entry.defCost)) < 0.01;
  }

  function entryFromStop(stop, result, index) {
    const fuelGallons = number(stop.fuelGallons);
    const fuelCost = round2(stop.fuelCost);
    return {
      id: 'fuel_ocr_' + Date.now() + '_' + index + '_' + Math.random().toString(36).slice(2, 6),
      date: text(stop.date),
      odometer: 0,
      fuelGallons,
      fuelCost,
      defGallons: number(stop.defGallons),
      defCost: round2(stop.defCost),
      mpg: 0,
      ppg: fuelGallons > 0 ? Math.round((fuelCost / fuelGallons) * 10000) / 10000 : 0,
      location: stopLocation(stop),
      truckId: text(stop.truckId),
      unitNumber: normalizeUnit(stop.unit),
      driverName: text(stop.driver),
      invoiceNumber: text(result && result.invoice_number),
      sourceRequestId: text(result && result.request_id),
      sourceDocumentType: 'fuel_invoice',
      sourceStopKey: sourceStopKey(stop, result && result.invoice_number),
      fuelGrossAmount: round2(stop.grossAmount),
      invoiceDiscount: round2(stop.discount),
      invoiceFees: round2(stop.fees),
      createdAt: new Date().toISOString(),
      synced: false,
    };
  }

  function importSelected() {
    if (!state) return;
    const selected = selectedStops();
    if (!selected.length) {
      if (typeof global.toast === 'function') global.toast('Select at least one stop', 'err');
      return;
    }
    if (unmatchedSelected().length) {
      if (typeof global.toast === 'function') global.toast('Assign every selected stop to an active truck', 'err');
      return;
    }
    const invalid = selected.find(function (stop) {
      return !text(stop.date) || (!number(stop.fuelGallons) && !number(stop.defGallons));
    });
    if (invalid) {
      if (typeof global.toast === 'function') global.toast('Each selected stop needs a date and fuel or DEF gallons', 'err');
      return;
    }

    const message = 'Import ' + selected.length + ' stop' + (selected.length === 1 ? '' : 's') +
      ' with net total ' + money(selectedTotal()) + '?';
    if (typeof global.confirm === 'function' && !global.confirm(message)) return;

    const logs = typeof global.loadFuelLogs === 'function' ? (global.loadFuelLogs() || []) : [];
    let imported = 0;
    let skipped = 0;
    selected.forEach(function (stop, index) {
      const entry = entryFromStop(stop, state.result, index);
      if (logs.some(function (log) { return isDuplicate(log, entry); })) {
        skipped++;
        return;
      }
      logs.unshift(entry);
      imported++;
    });

    if (imported && typeof global.saveFuelLogs === 'function') global.saveFuelLogs(logs);
    if (imported && typeof global.showPage === 'function') global.showPage('fuel');
    if (imported && typeof global.renderFuelPage === 'function') global.renderFuelPage();
    if (typeof global.toast === 'function') {
      global.toast(imported + ' stop' + (imported === 1 ? '' : 's') + ' imported' + (skipped ? ' · ' + skipped + ' duplicate skipped' : ''), imported ? 'ok' : 'warn');
    }
  }

  function install() {
    const originalRender = global.renderScanReview;
    if (typeof originalRender === 'function' && !originalRender.__crewbiqInvoiceReview) {
      const wrappedRender = function () {
        const result = global.lastScanResult;
        if (result && result.ok && (result.document_type === 'fuel_invoice' || result.requested_document_type === 'fuel_invoice')) {
          renderForResult(result);
          return;
        }
        state = null;
        return originalRender.apply(this, arguments);
      };
      wrappedRender.__crewbiqInvoiceReview = true;
      global.renderScanReview = wrappedRender;
    }

    global.applyInvoiceToFuelLogs = importSelected;
  }

  global.CrewBIQInvoiceReview = {
    version: '0.2.0',
    netAmount,
    buildStops,
    sourceStopKey,
    isDuplicate,
    entryFromStop,
    update,
    assignTruck,
    selectCurrentUnit,
    selectAllMatched,
    importSelected,
    renderForResult,
    getState: function () { return state; },
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ OCR] multi-driver invoice review v0.2.0 loaded');
})(window);
