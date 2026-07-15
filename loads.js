/**
 * CrewBIQ Loads Module v0.4.0 — FINAL: Export / Reports
 * CrewBIQ Technologies
 *
 * CHANGELOG v0.4.0:
 *   - getPeriodDates()         — date range for selected period
 *   - getPeriodLabel()         — human-readable period label
 *   - getExportLoads()         — filter loads by selected period
 *   - fmtDateRange()           — format date range string
 *   - fmtDateRangeFromLoads()  — derive date range from load array
 *   - getAccentHex()           — read current accent color for PDF
 *   - csvCell()                — CSV escape helper
 *   - downloadFile()           — trigger browser download
 *   - buildReportText()        — plain text settlement report
 *   - buildReportHTML()        — full HTML/PDF report with logo, KPIs
 *   - exportDriverData(format) — 'csv' or 'pdf'
 *   - shareReport(channel)     — 'whatsapp' | 'email' | 'telegram'
 *
 * All previous functionality (CRUD, Render, Disputes) included unchanged.
 *
 * index.html init (unchanged):
 *   CrewBIQLoads.init({
 *     getDriver:  () => driver,
 *     getLoads:   () => loads,
 *     setLoads:   (v) => { loads = v; },
 *     getPtiLog:  () => ptiLog,
 *     saveAll:    saveAll,
 *     doSync:     () => doSync(),
 *     renderAll:  () => renderAll(),
 *     showPage:   (name) => showPage(name),
 *   });
 */

(function (global) {
  'use strict';

  const Core = global.CrewBIQCore;
  if (!Core) {
    console.error('[CrewBIQ Loads] CrewBIQCore not found. Load core.js first.');
    return;
  }

  const K = 'fiqD_';

  function identitySlug(value){ return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60); }
  function ownerKey(){ const d=_get.driver?_get.driver():null; if(!d) return ''; const crew=identitySlug(d.crewId||''); const email=identitySlug(d.email||''); return crew ? 'crew_'+crew : (email ? 'email_'+email : ''); }

  // ── ACCESSORS ──────────────────────────────────────────────────────────────

  let _get = { driver: null, loads: null, ptiLog: null };
  let _set = { loads: null };
  let _saveAll   = null;
  let _doSync    = null;
  let _renderAll = null;
  let _showPage  = null;
  let _ready = false;

  // ── SORT HELPER ───────────────────────────────────────────────
  // Always newest pickup date first. Called every time loads are written.
  function _sortLoads(arr) {
    return arr.slice().sort((a, b) => {
      const da = a.pickup || a.date || '0000';
      const db = b.pickup || b.date || '0000';
      return db > da ? 1 : db < da ? -1 : 0;
    });
  }

  function init(opts) {
    _get.driver  = opts.getDriver;
    _get.loads   = opts.getLoads;
    // Wrap setLoads to always sort before saving
    const _rawSetLoads = opts.setLoads;
    _set.loads   = (v) => _rawSetLoads(_sortLoads(v));
    _get.ptiLog  = opts.getPtiLog || (() => []);
    _saveAll     = opts.saveAll;
    _doSync      = opts.doSync;
    _renderAll   = opts.renderAll;
    _showPage    = opts.showPage;
    _ready = true;

    Core.events.on('driver:pay_settings_changed', (payload) => {
      const effectiveDate = (payload && payload.effectiveDate) || _today();
      const rates         = (payload && payload.rates) || null;
      const count = recalcLoadsFrom(effectiveDate, rates);
      console.info(`[CrewBIQ Loads] Recalculated ${count} load(s) from ${effectiveDate}`);
    });

    Core.events.on('sync:success', () => {
      if (_renderAll) _renderAll();
    });

    document.addEventListener('click', closeAllMenus);
    console.info('[CrewBIQ Loads] init() complete');
  }

  function assertReady() {
    if (!_ready) {
      console.error('[CrewBIQ Loads] Not initialized. Call CrewBIQLoads.init() first.');
      return false;
    }
    return true;
  }

  // ── UTILS ─────────────────────────────────────────────────────────────────

  function _fmt(n)        { return global.fmt       ? global.fmt(n)       : Core.utils.fmt(n); }
  function _today()       { return global.today      ? global.today()      : Core.utils.today(); }
  function _escHtml(s)    { return global.escHtml    ? global.escHtml(s)   : Core.utils.escHtml(s); }
  function _getWeekKey(d) { return global.getWeekKey ? global.getWeekKey(d): d; }
  function _toast(m, t)   { Core.toast(m, t); }
  function loadEventPayload(load) {
    const driver = _get.driver ? _get.driver() : null;
    return {
      loadId: load && load.loadId,
      gross: Number(load && load.gross || 0),
      loadedMiles: Number(load && load.loadedMiles || 0),
      deadMiles: Number(load && load.deadMiles || 0),
      status: load && load.status || 'active',
      driverId: load && load.crewId || driver && driver.crewId || '',
      truckId: load && load.truckId || '',
      unitNumber: load && load.unitNumber || driver && driver.unitNumber || '',
      timestamp: new Date().toISOString(),
    };
  }

  function stableLocalLoadId(load) {
    const key = String((load && (load.id || load.loadId || load.record_id || load.key)) || '').trim();
    return key ? 'l_' + identitySlug(key) : 'l_' + Date.now();
  }

  function loadActionKey(load) {
    return String((load && (load.id || load.loadId || load.record_id || load.key)) || '').trim();
  }

  function isLoadMatch(load, key) {
    key = String(key || '').trim();
    if (!key || !load) return false;
    return String(load.id || '') === key ||
           String(load.loadId || '') === key ||
           String(load.record_id || '') === key ||
           String(load.key || '') === key ||
           loadActionKey(load) === key;
  }

  function actionArg(value) {
    return JSON.stringify(String(value || '')).replace(/"/g, '&quot;');
  }

  function getOwnerTrucks() {
    if (typeof global.loadTrucks !== 'function') return [];
    try {
      return (global.loadTrucks() || []).filter(t => t && t.active !== false);
    } catch (e) {
      return [];
    }
  }

  function truckLabel(truck) {
    if (!truck) return '';
    const unit = truck.unitNumber ? `Unit ${truck.unitNumber}` : 'Truck';
    const name = [truck.year, truck.make, truck.model].filter(Boolean).join(' ');
    return name ? `${unit} - ${name}` : unit;
  }

  function findTruckByIdOrUnit(value) {
    const trucks = getOwnerTrucks();
    const key = String(value || '').trim();
    if (!key) return null;
    return trucks.find(t => String(t.id || '') === key || String(t.unitNumber || '') === key) || null;
  }

  function getLoadTruckSelection() {
    const select = document.getElementById('loadTruckSelect');
    const selected = select ? select.value : '';
    const truck = findTruckByIdOrUnit(selected);
    return { truckId: truck ? truck.id : '', unitNumber: truck ? truck.unitNumber : '' };
  }

  function populateLoadTruckSelect(preferred = '') {
    const row = document.getElementById('loadTruckRow');
    const select = document.getElementById('loadTruckSelect');
    if (!row || !select) return;

    const trucks = getOwnerTrucks();
    if (!trucks.length) {
      row.style.display = 'none';
      select.innerHTML = '';
      return;
    }

    const driver = _get.driver ? _get.driver() : null;
    const preferredTruck = findTruckByIdOrUnit(preferred)
      || findTruckByIdOrUnit(select.value)
      || findTruckByIdOrUnit(driver && driver.unitNumber);
    const selectedId = preferredTruck ? preferredTruck.id : trucks[0].id;

    row.style.display = '';
    select.innerHTML = trucks.map(t => {
      const selected = t.id === selectedId ? ' selected' : '';
      return `<option value="${_escHtml(t.id)}"${selected}>${_escHtml(truckLabel(t))}</option>`;
    }).join('');
  }

  // ── DISPUTES STORAGE ──────────────────────────────────────────────────────

  // Scoped by driver identity (scopedLoad/scopedSave, defined in index.html)
  // like loads/ptiLog/expenses — a flat key here would mix disputes across
  // driver identities that share a device/browser. One-time migration below
  // (mirrors loadDriverScopedData()'s allowLegacy pattern for loads/ptiLog)
  // so any disputes already stored under the old flat key before this patch
  // aren't silently orphaned.
  function getDriverDisputed() {
    if (typeof scopedLoad !== 'function') {
      try { return JSON.parse(localStorage.getItem(K + 'disputed') || '[]'); }
      catch(e) { return []; }
    }
    let scoped = scopedLoad('disputed', null);
    if (scoped === null) {
      try {
        const legacy = JSON.parse(localStorage.getItem(K + 'disputed') || 'null');
        scoped = Array.isArray(legacy) ? legacy : [];
      } catch(e) { scoped = []; }
      if (typeof scopedSave === 'function') scopedSave('disputed', scoped);
    }
    return scoped;
  }

  function setDriverDisputed(v) {
    if (typeof scopedSave === 'function') { scopedSave('disputed', v); return; }
    localStorage.setItem(K + 'disputed', JSON.stringify(v));
  }

  function getDisputeForLoad(loadId) {
    return getDriverDisputed().find(d => d.loadId === loadId) || null;
  }

  // ── PAY CALCULATION ───────────────────────────────────────────────────────

  function calcDriverPay(gross, loadedMiles, totalMiles) {
    const driver = _get.driver ? _get.driver() : null;
    if (!driver) return 0;
    return calcDriverPayWith(gross, loadedMiles, totalMiles, {
      payType: driver.payType, cpmRate: driver.cpmRate,
      grossPercent: driver.grossPercent, cpmBase: driver.cpmBase,
    });
  }

  function calcDriverPayWith(gross, loadedMiles, totalMiles, rates) {
    if (!rates) return 0;
    if (rates.payType === 'gross_percent') return gross * (rates.grossPercent || 0) / 100;
    const miles = rates.cpmBase === 'total' ? totalMiles : loadedMiles;
    return miles * (rates.cpmRate || 0);
  }

  function recalcLoadsFrom(effectiveDate, rates) {
    if (!assertReady()) return 0;
    const driver   = _get.driver();
    const useRates = rates || {
      payType: driver.payType, cpmRate: driver.cpmRate,
      grossPercent: driver.grossPercent, cpmBase: driver.cpmBase,
    };
    let count = 0;
    const updated = _get.loads().map(x => {
      const pickupDate = x.pickup || x.date || '';
      if (pickupDate < effectiveDate) return x;
      count++;
      const newPay = calcDriverPayWith(x.gross, x.loadedMiles, x.totalMiles, useRates)
                   + Number(x.detention || 0) + Number(x.layover || 0);
      return { ...x, driverPay: newPay, synced: false };
    });
    _set.loads(updated);
    _saveAll();
    return count;
  }

  // ── INPUT HELPERS ─────────────────────────────────────────────────────────

  function maskGross(el) {
    const v = el.value.replace(/[^\d]/g, '');
    if (!v) { el.value = ''; return; }
    el.value = (parseInt(v) / 100).toFixed(2);
  }

  function calcPreview() {
    const loaded    = parseFloat(document.getElementById('loadedMiles').value) || 0;
    const dead      = parseFloat(document.getElementById('deadMiles').value)   || 0;
    const gross     = parseFloat(document.getElementById('grossInput').value)  || 0;
    const detention = parseFloat(document.getElementById('detentionPay').value)|| 0;
    const layover   = parseFloat(document.getElementById('layoverPay').value)  || 0;
    const total     = loaded + dead;
    const basePay   = calcDriverPay(gross, loaded, total);
    const pay       = basePay + detention + layover;
    document.getElementById('loadPreview').innerHTML =
      `<div class="line"><span>Total Miles</span><strong>${total.toLocaleString()}</strong></div>
       <div class="line"><span>Base Pay</span><strong>${_fmt(basePay)}</strong></div>
       ${(detention + layover) > 0 ? `<div class="line"><span>Additional Pay</span><strong class="green">+${_fmt(detention + layover)}</strong></div>` : ''}
       <div class="line"><span>My Pay</span><strong class="amber">${_fmt(pay)}</strong></div>
       <div class="line"><span>Pay / total mile</span><strong>${total ? (pay / total).toFixed(3) : '—'}</strong></div>`;
  }

  function getWeekLoads() {
    if (!assertReady()) return [];
    const wk = _getWeekKey(_today());
    return _get.loads().filter(x => _getWeekKey(x.pickup || x.date || '') === wk);
  }

  // ── FORM ──────────────────────────────────────────────────────────────────

  function resetLoadForm() {
    document.getElementById('loadEditId').value        = '';
    document.getElementById('loadId').value            = '';
    document.getElementById('pickupDate').value        = _today();
    document.getElementById('deliveryDate').value      = '';
    document.getElementById('pickupLocation').value    = '';
    document.getElementById('deliveryLocation').value  = '';
    document.getElementById('loadedMiles').value       = '';
    document.getElementById('deadMiles').value         = '0';
    document.getElementById('grossInput').value        = '';
    document.getElementById('loadNotes').value         = '';
    document.getElementById('loadPreview').innerHTML   = '';
    document.getElementById('saveLoadBtn').textContent = 'Add Load';
    document.getElementById('cancelEditBtn').style.display = 'none';
    const det = document.getElementById('detentionPay');
    const lay = document.getElementById('layoverPay');
    if (det) det.value = '';
    if (lay) lay.value = '';
    populateLoadTruckSelect();
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  function saveLoad() {
    if (!assertReady()) return;
    const loadId = document.getElementById('loadId').value.trim();
    const loaded = parseFloat(document.getElementById('loadedMiles').value) || 0;
    const gross  = parseFloat(document.getElementById('grossInput').value)  || 0;
    if (!loadId) return _toast('Load ID required', 'err');
    if (!loaded) return _toast('Loaded miles required', 'err');
    if (!gross && _get.driver().payType === 'gross_percent') return _toast('Gross required', 'err');
    const dead      = parseFloat(document.getElementById('deadMiles').value)   || 0;
    const detention = parseFloat(document.getElementById('detentionPay').value)|| 0;
    const layover   = parseFloat(document.getElementById('layoverPay').value)  || 0;
    const total     = loaded + dead;
    const pay       = calcDriverPay(gross, loaded, total) + detention + layover;
    const editId    = document.getElementById('loadEditId').value;
    const pickupVal = document.getElementById('pickupDate').value;
    const loads     = _get.loads();
    const driver    = _get.driver();
    const truckSel  = getLoadTruckSelection();
    if (!editId && loads.find(x => x.loadId === loadId)) return _toast('Load ID already exists', 'err');
    if (!editId) {
      const sameDate = loads.filter(x => x.pickup === pickupVal);
      if (sameDate.length > 0) {
        const ok = confirm(`⚠️ Load(s) already exist for ${pickupVal}:\n` +
          sameDate.map(x => `• ${x.loadId} ($${(x.gross||0).toFixed(2)})`).join('\n') +
          '\n\nAdd another load for this date?');
        if (!ok) return;
      }
    }
    const existingEntry = editId ? loads.find(x => x.id === editId) : null;
    const entry = {
      id: editId || ('l_' + Date.now()), loadId, gross,
      loadedMiles: loaded, deadMiles: dead, totalMiles: total,
      driverPay: pay, detention, layover,
      pickup: pickupVal, delivery: document.getElementById('deliveryDate').value,
      pickupLocation: document.getElementById('pickupLocation').value.trim(),
      deliveryLocation: document.getElementById('deliveryLocation').value.trim(),
      notes: document.getElementById('loadNotes').value.trim(),
      truckId: truckSel.truckId || (existingEntry && existingEntry.truckId) || '',
      unitNumber: truckSel.unitNumber || driver.unitNumber,
      driverName: driver.name,
      ownerKey: ownerKey(), crewId: driver.crewId || '', driverEmail: driver.email || '',
      status:    (existingEntry && existingEntry.status)    || 'active',
      adjAmount: (existingEntry && existingEntry.adjAmount) || 0,
      synced: false,
    };
    let updated = editId ? loads.map(x => x.id === editId ? entry : x) : [...loads, entry];
    _set.loads(updated); // setLoads wrapper auto-sorts
    _saveAll();
    resetLoadForm();
    if (_renderAll) _renderAll();
    _toast('Load saved');
    if (_doSync) _doSync();
    const eventPayload = loadEventPayload(entry);
    Core.events.emit(editId ? 'load:updated' : 'load:created', eventPayload);
    Core.events.emit('load:saved', { id: entry.id, loadId: entry.loadId, isEdit: !!editId });
  }

  function editLoad(id) {
    if (!assertReady()) return;
    const x = _get.loads().find(l => isLoadMatch(l, id));
    if (!x) return;
    document.getElementById('loadEditId').value   = x.id;
    document.getElementById('loadId').value       = x.loadId || '';
    document.getElementById('pickupDate').value   = x.pickup || '';
    document.getElementById('deliveryDate').value = x.delivery || '';
    document.getElementById('pickupLocation').value   = x.pickupLocation || '';
    document.getElementById('deliveryLocation').value = x.deliveryLocation || '';
    document.getElementById('loadedMiles').value  = x.loadedMiles || '';
    document.getElementById('deadMiles').value    = x.deadMiles || '0';
    document.getElementById('grossInput').value   = (x.gross || 0).toFixed(2);
    document.getElementById('loadNotes').value    = x.notes || '';
    const det = document.getElementById('detentionPay');
    const lay = document.getElementById('layoverPay');
    if (det) det.value = x.detention ? x.detention.toFixed(2) : '';
    if (lay) lay.value = x.layover   ? x.layover.toFixed(2)   : '';
    populateLoadTruckSelect(x.truckId || x.unitNumber || '');
    document.getElementById('saveLoadBtn').textContent     = 'Save Changes';
    document.getElementById('cancelEditBtn').style.display = 'block';
    calcPreview();
    if (_showPage) _showPage('load');
  }

  function deleteLoad(id) {
    if (!assertReady()) return;
    if (!confirm('Delete this load?')) return;
    const deleted = _get.loads().find(x => isLoadMatch(x, id));
    _set.loads(_get.loads().filter(x => !isLoadMatch(x, id)));
    _saveAll();
    if (_renderAll) _renderAll();
    _toast('Deleted');
    if (deleted) Core.events.emit('load:deleted', loadEventPayload(deleted));
  }

  function setLoadStatus(id, status) {
    if (!assertReady()) return;
    const targetLoad = _get.loads().find(x => isLoadMatch(x, id));
    if (!targetLoad) {
      _toast('Load not found. Refresh and try again.', 'err');
      return;
    }
    const resolvedDispute = targetLoad ? getDisputeForLoad(targetLoad.loadId) : null;
    if (resolvedDispute && (resolvedDispute.status === 'won' || resolvedDispute.status === 'lost')) {
      const locked = resolvedDispute.status === 'won' ? 'won' : 'lost';
      const allowed = (locked === 'won' && status === 'success') || (locked === 'lost' && status === 'cancel');
      if (!allowed) {
        _toast('This load is locked by resolved dispute. Reopen dispute first.', 'warn');
        return;
      }
    }
    const driver = _get.driver();
    const isCPM  = driver.payType !== 'gross_percent';
    _set.loads(_get.loads().map(x => {
      if (!isLoadMatch(x, id)) return x;
      const base = { ...x, id: x.id || stableLocalLoadId(x) };
      // Cancel: CPM still gets paid for miles driven; gross% gets 0
      if (status === 'cancel') {
        const cancelPay = isCPM
          ? calcDriverPay(x.gross, x.loadedMiles, x.totalMiles) + Number(x.detention || 0) + Number(x.layover || 0)
          : 0;
        return { ...base, status, driverPay: cancelPay, statusUpdatedAt:new Date().toISOString(), synced: false };
      }
      // Adj: recalc from adjAmount if set
      if (status === 'adj' && x.adjAmount) {
        const adjPay = calcDriverPayWith(x.adjAmount, x.loadedMiles, x.totalMiles, {
          payType: driver.payType, cpmRate: driver.cpmRate,
          grossPercent: driver.grossPercent, cpmBase: driver.cpmBase,
        }) + Number(x.detention || 0) + Number(x.layover || 0);
        return { ...base, status, driverPay: adjPay, statusUpdatedAt:new Date().toISOString(), synced: false };
      }
      // Active/success: restore pay from original gross
      if (status === 'active' || status === 'success') {
        const restoredPay = calcDriverPay(x.gross, x.loadedMiles, x.totalMiles)
                          + Number(x.detention || 0) + Number(x.layover || 0);
        return { ...base, status, driverPay: restoredPay, statusUpdatedAt:new Date().toISOString(), synced: false };
      }
      return { ...base, status, statusUpdatedAt:new Date().toISOString(), synced: false };
    }));
    _saveAll();
    if (_renderAll) _renderAll();
    const labels = { success:'✅ Success', cancel:'❌ Cancelled', active:'🔵 Active', adj:'🔧 Adj' };
    _toast(labels[status] || 'Updated');
    Core.events.emit('load:status_changed', { id, status });
  }

  // ── DISPUTES CRUD ─────────────────────────────────────────────────────────

  function addDriverDisputed() {
    if (!assertReady()) return;
    const loadId = (document.getElementById('dDisputeLoadId').value || '').trim().toUpperCase();
    if (!loadId) return _toast('Load ID required', 'err');
    const amount = parseFloat(document.getElementById('dDisputeAmount').value) || 0;
    const miles  = parseFloat(document.getElementById('dDisputeMiles').value)  || 0;
    const note   = (document.getElementById('dDisputeNote').value || '').trim();
    const existing = getDriverDisputed();
    if (existing.find(d => d.loadId === loadId && d.status === 'pending'))
      return _toast('Dispute already exists for this load', 'err');
    const entry = { id: 'd_' + Date.now(), loadId, amount, miles, note, status: 'pending', createdAt: _today() };
    existing.push(entry);
    setDriverDisputed(existing);
    _set.loads(_get.loads().map(x => x.loadId === loadId ? { ...x, status: 'disputed', statusUpdatedAt:new Date().toISOString(), synced: false } : x));
    _saveAll();
    document.getElementById('dDisputeLoadId').value = '';
    document.getElementById('dDisputeAmount').value = '';
    document.getElementById('dDisputeMiles').value  = '';
    document.getElementById('dDisputeNote').value   = '';
    if (_renderAll) _renderAll();
    _toast('Dispute added ⚖️');
    Core.events.emit('dispute:added', { loadId, disputeId: entry.id });
  }

  function driverResolveDispute(id, status) {
    if (!assertReady()) return;
    const list    = getDriverDisputed();
    const dispute = list.find(d => d.id === id);
    if (!dispute) return;
    const linkedLoad = _get.loads().find(x => x.loadId === dispute.loadId);
    const isAdjustmentDispute = !!(linkedLoad && linkedLoad.status === 'adj') || /adjust/i.test(dispute.note || '');
    if (isAdjustmentDispute && status === 'lost') status = 'won';
    dispute.status     = status;
    dispute.resolvedAt = _today();
    dispute.resolvedPayDate = dispute.resolvedAt;
    dispute.resolutionType = isAdjustmentDispute ? 'adjustment' : (status === 'won' ? 'won' : 'lost');
    setDriverDisputed(list);
    if (status === 'won') {
      const driver = _get.driver();
      const isCPM  = driver.payType !== 'gross_percent';
      _set.loads(_get.loads().map(x => {
        if (x.loadId !== dispute.loadId) return x;
        const newGross  = dispute.amount || x.gross;
        const newLoaded = dispute.miles  || x.loadedMiles;
        const newTotal  = newLoaded + (x.deadMiles || 0);
        const newPay    = calcDriverPay(newGross, newLoaded, newTotal)
                        + Number(x.detention || 0) + Number(x.layover || 0);
        return { ...x, gross: newGross, loadedMiles: newLoaded, totalMiles: newTotal,
                 driverPay: newPay, adjAmount: isCPM ? 0 : newGross, status: 'success', statusUpdatedAt:new Date().toISOString(), synced: false };
      }));
      _toast('Dispute won ✅ — load paid');
    } else {
      const driver = _get.driver();
      const isCPM  = driver.payType !== 'gross_percent';
      _set.loads(_get.loads().map(x => {
        if (x.loadId !== dispute.loadId) return x;
        // CPM: still pay for miles even on lost dispute
        const cancelPay = isCPM
          ? calcDriverPay(x.gross, x.loadedMiles, x.totalMiles) + Number(x.detention||0) + Number(x.layover||0)
          : 0;
        return { ...x, status: 'cancel', driverPay: cancelPay, statusUpdatedAt:new Date().toISOString(), synced: false };
      }));
      _toast('Dispute lost ❌ — load cancelled');
    }
    _saveAll();
    if (_renderAll) _renderAll();
    Core.events.emit('dispute:resolved', { id, status, loadId: dispute.loadId });
  }

  function driverReopenDispute(id) {
    const list    = getDriverDisputed();
    const dispute = list.find(d => d.id === id);
    if (!dispute) return;
    dispute.status = 'pending';
    delete dispute.resolvedAt;
    setDriverDisputed(list);
    _set.loads(_get.loads().map(x =>
      x.loadId === dispute.loadId ? { ...x, status: 'disputed', statusUpdatedAt:new Date().toISOString(), synced: false } : x
    ));
    _saveAll();
    if (_renderAll) _renderAll();
    _toast('Dispute reopened ⚖️');
  }

  function driverDeleteDispute(id) {
    if (!confirm('Delete this dispute?')) return;
    setDriverDisputed(getDriverDisputed().filter(d => d.id !== id));
    if (_renderAll) _renderAll();
    _toast('Dispute deleted');
    Core.events.emit('dispute:deleted', { id });
  }

  function goToDisputeWithLoad(loadId, type) {
    if (_showPage) _showPage('disputes');
    setTimeout(() => {
      const el = document.getElementById('dDisputeLoadId');
      if (el) { el.value = loadId; el.focus(); }
      if (type === 'adj') {
        const load = _get.loads().find(x => x.loadId === loadId);
        if (load) {
          const amtEl  = document.getElementById('dDisputeAmount');
          const noteEl = document.getElementById('dDisputeNote');
          if (amtEl)  amtEl.value  = (load.gross || '').toString();
          if (noteEl) noteEl.value = 'Adjustment';
        }
      }
    }, 50);
  }

  function promptAdj(id) {
    if (!assertReady()) return;
    const load = _get.loads().find(x => x.id === id);
    if (!load) return;
    const input = prompt(`Adjustment amount for ${load.loadId}:\n(actual payment received)`, load.gross || '');
    if (input === null) return;
    const adj = parseFloat(input);
    if (isNaN(adj) || adj < 0) return _toast('Invalid amount', 'err');
    _set.loads(_get.loads().map(x =>
      x.id === id ? { ...x, status: 'adj', adjAmount: adj, statusUpdatedAt:new Date().toISOString(), synced: false } : x
    ));
    _saveAll();
    if (_renderAll) _renderAll();
    _toast(`Adj set: ${_fmt(adj)}`);
    Core.events.emit('load:status_changed', { id, status: 'adj', adjAmount: adj });
  }

  // ── EXPORT HELPERS ────────────────────────────────────────────────────────

  function getPeriodDates() {
    const t  = _today();
    const p  = (document.getElementById('exportPeriod') || {}).value || 'week';
    const wk = _getWeekKey(t);
    const ym = t.slice(0, 7);
    const yr = t.slice(0, 4);
    if (p === 'custom') {
      return {
        from: (document.getElementById('exportFrom') || {}).value || t,
        to:   (document.getElementById('exportTo')   || {}).value || t,
      };
    }
    if (p === 'week')      return { from: wk, to: t };
    if (p === 'lastweek') {
      const prev = new Date(new Date(wk) - 7 * 86400000);
      const prevKey = prev.toISOString().slice(0, 10);
      const prevEnd = new Date(new Date(wk) - 86400000).toISOString().slice(0, 10);
      return { from: prevKey, to: prevEnd };
    }
    if (p === 'month')     return { from: ym + '-01', to: t };
    if (p === 'lastmonth') {
      const d = new Date(t);
      d.setDate(1); d.setMonth(d.getMonth() - 1);
      const from = d.toISOString().slice(0, 7) + '-01';
      const to   = new Date(new Date(ym + '-01') - 86400000).toISOString().slice(0, 10);
      return { from, to };
    }
    if (p === 'year')      return { from: yr + '-01-01', to: t };
    return { from: '2000-01-01', to: t }; // all
  }

  function getPeriodLabel() {
    const p = (document.getElementById('exportPeriod') || {}).value || 'week';
    const labels = {
      week: 'This Week', lastweek: 'Last Week', month: 'This Month',
      lastmonth: 'Last Month', year: 'This Year', all: 'All Time', custom: 'Custom Range',
    };
    return labels[p] || p;
  }

  function getExportLoads() {
    const { from, to } = getPeriodDates();
    return _get.loads().filter(x => {
      const d = x.pickup || x.date || '';
      return d >= from && d <= to;
    });
  }

  function fmtDateRange(from, to) {
    if (!from && !to) return '';
    const opts = { month: 'short', day: 'numeric' };
    const f = from ? new Date(from + 'T12:00:00').toLocaleDateString('en-US', opts) : '';
    const t = to   ? new Date(to   + 'T12:00:00').toLocaleDateString('en-US', opts) : '';
    return f === t ? f : `${f} – ${t}`;
  }

  function fmtDateRangeFromLoads(rLoads) {
    if (!rLoads.length) return '';
    const dates = rLoads.map(x => x.pickup || x.date || '').filter(Boolean).sort();
    return fmtDateRange(dates[0], dates[dates.length - 1]);
  }

  function getAccentHex() {
    const name = localStorage.getItem('fiqD_accent') || 'blue';
    const map  = { orange:'#f59e0b', blue:'#3b82f6', green:'#10b981', red:'#ef4444', purple:'#8b5cf6', cyan:'#06b6d4' };
    return map[name] || '#3b82f6';
  }

  function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadFile(content, type, filename) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── BUILD REPORT TEXT ─────────────────────────────────────────────────────

  function buildReportText() {
    const driver   = _get.driver();
    const rLoads   = getExportLoads();
    const period   = getPeriodLabel();
    const dateRange = fmtDateRangeFromLoads(rLoads);
    const gross    = rLoads.reduce((s, x) => s + Number(x.gross     || 0), 0);
    const pay      = rLoads.reduce((s, x) => s + Number(x.driverPay || 0), 0);
    const lmi      = rLoads.reduce((s, x) => s + Number(x.loadedMiles || 0), 0);
    const dmi      = rLoads.reduce((s, x) => s + Number(x.deadMiles   || 0), 0);
    const det      = rLoads.reduce((s, x) => s + Number(x.detention  || 0), 0);
    const lay      = rLoads.reduce((s, x) => s + Number(x.layover    || 0), 0);
    const tmi      = lmi + dmi;

    let txt = `DRIVER SETTLEMENT REPORT\n`;
    txt += `${'='.repeat(40)}\n`;
    txt += `Driver: ${driver.name || ''}\n`;
    txt += `Truck:  ${driver.truckName || ''} · Unit ${driver.unitNumber || ''}\n`;
    txt += `Period: ${period}${dateRange ? ' (' + dateRange + ')' : ''}\n`;
    txt += `${'='.repeat(40)}\n\n`;
    txt += `SUMMARY\n${'-'.repeat(24)}\n`;
    txt += `Total Loads:    ${rLoads.length}\n`;
    txt += `Gross Revenue:  ${_fmt(gross)}\n`;
    txt += `Driver Pay:     ${_fmt(pay)}\n`;
    txt += `Loaded Miles:   ${lmi.toLocaleString()}\n`;
    txt += `Dead Miles:     ${dmi.toLocaleString()}\n`;
    txt += `Total Miles:    ${tmi.toLocaleString()}\n`;
    if (det > 0) txt += `Detention Pay:  ${_fmt(det)}\n`;
    if (lay > 0) txt += `Layover Pay:    ${_fmt(lay)}\n`;
    if (tmi > 0) {
      txt += `$/Total Mile:   $${(pay / tmi).toFixed(3)}\n`;
      txt += `Gross/Mile:     $${(gross / tmi).toFixed(3)}\n`;
    }
    txt += `\nLOADS\n${'-'.repeat(24)}\n`;
    rLoads.forEach((x, i) => {
      txt += `${i + 1}. ${x.loadId}  ${x.pickup || ''}\n`;
      txt += `   Gross: ${_fmt(x.gross)}  Pay: ${_fmt(x.driverPay)}\n`;
      txt += `   ${(x.loadedMiles || 0).toLocaleString()} loaded + ${(x.deadMiles || 0).toLocaleString()} dead mi\n`;
      if (x.notes) txt += `   Note: ${x.notes}\n`;
    });
    txt += `\n${'='.repeat(40)}\n`;
    txt += `Generated: ${new Date().toLocaleString()}\n`;
    return txt;
  }

  // ── BUILD REPORT HTML (PDF) ───────────────────────────────────────────────

  function buildReportHTML() {
    const driver    = _get.driver();
    const isCPM     = driver.payType !== 'gross_percent';
    const allLoads  = getExportLoads();
    const dispList  = getDriverDisputed();
    const wonIds    = new Set(dispList.filter(d => d.status === 'won').map(d => d.loadId));
    const pendingIds= new Set(dispList.filter(d => d.status === 'pending').map(d => d.loadId));
    const lostIds   = new Set(dispList.filter(d => d.status === 'lost').map(d => d.loadId));

    // Categorize. IMPORTANT: older loads may have no status; treat them as active
    // so PDF reports never look empty after migrations.
    const statusOf = (x) => x.status || 'active';
    const paidLoads     = allLoads.filter(x => statusOf(x) === 'success' || wonIds.has(x.loadId));
    const activeLoads   = allLoads.filter(x => statusOf(x) === 'active' && !pendingIds.has(x.loadId) && !wonIds.has(x.loadId));
    const adjLoads      = allLoads.filter(x => statusOf(x) === 'adj' && !wonIds.has(x.loadId));
    const disputedLoads = allLoads.filter(x => pendingIds.has(x.loadId) || (statusOf(x) === 'disputed' && !wonIds.has(x.loadId)));
    const cancelLoads   = allLoads.filter(x => statusOf(x) === 'cancel' || lostIds.has(x.loadId));

    const period    = getPeriodLabel();
    const dateRange = fmtDateRangeFromLoads(allLoads);
    const acc       = getAccentHex();
    const logo      = localStorage.getItem('fiqD_logo') || '';
    const company   = driver.company || driver.truckName || 'CrewBIQ Driver';

    // KPI from paid + active + adj
    const kpiLoads = [...paidLoads, ...activeLoads, ...adjLoads];
    const gross = kpiLoads.reduce((s,x)=>s+Number(x.gross||0),0);
    const pay   = kpiLoads.reduce((s,x)=>s+Number(x.driverPay||0),0);
    const lmi   = kpiLoads.reduce((s,x)=>s+Number(x.loadedMiles||0),0);
    const dmi   = kpiLoads.reduce((s,x)=>s+Number(x.deadMiles||0),0);
    const det   = kpiLoads.reduce((s,x)=>s+Number(x.detention||0),0);
    const lay   = kpiLoads.reduce((s,x)=>s+Number(x.layover||0),0);
    const tmi   = lmi + dmi;

    const kpis = [
      { icon: '\u{1F4E6}', label: 'Loads',     value: kpiLoads.length },
      ...(isCPM ? [] : [{ icon: '\u{1F4B0}', label: 'Gross', value: _fmt(gross) }]),
      { icon: '\u{1F4B5}', label: 'My Pay',    value: _fmt(pay) },
      { icon: '\u{1F6E3}', label: 'Loaded Mi', value: lmi.toLocaleString() },
      { icon: '\u21A9\uFE0F', label: 'Dead Mi', value: dmi.toLocaleString() },
      { icon: '\u{1F4CA}', label: '$/Mi',      value: tmi ? '$'+(pay/tmi).toFixed(3) : '\u2014' },
    ];

    const kpiHTML = kpis.map(k =>
      `<div style="background:#f8fafc;border-radius:8px;padding:10px 12px;text-align:center;flex:1;min-width:70px">
        <div style="font-size:18px;margin-bottom:4px">${k.icon}</div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${k.label}</div>
        <div style="font-size:15px;font-weight:800;color:#0f172a">${k.value}</div>
      </div>`
    ).join('');

    function makeSection(title, loads, hColor) {
      if (!loads.length) return '';
      const tpay  = loads.reduce((s,x)=>s+Number(x.driverPay||0),0);
      const tgross= loads.reduce((s,x)=>s+Number(x.gross||0),0);
      const tmi2  = loads.reduce((s,x)=>s+Number(x.totalMiles||0),0);
      const rows  = loads.map((x,i) => {
        const addl = (x.detention||0)+(x.layover||0);
        const sx = statusOf(x);
        const statusLabel = sx==='success'?'\u2705 Success':sx==='adj'?`\uD83D\uDD27 Adj`:sx==='cancel'?'\u274C Cancelled':'\u{1F535} Active';
        return `<tr style="border-bottom:1px solid #e2e8f0;background:${i%2===0?'#fff':'#f8fafc'}">
          <td style="padding:7px 10px;font-weight:600;font-size:12px">${_escHtml(x.loadId)}<br>
            <span style="font-size:10px;color:#94a3b8">${x.pickup||''}${x.delivery?' \u2192 '+x.delivery:''}</span><br>
            <span style="font-size:10px;color:${hColor}">${statusLabel}</span>
          </td>
          <td style="padding:7px 10px;font-size:11px">${(x.loadedMiles||0).toLocaleString()}<br><span style="color:#94a3b8;font-size:10px">+${(x.deadMiles||0).toLocaleString()}</span></td>
          ${isCPM?'':`<td style="padding:7px 10px;font-size:12px;font-weight:600">${_fmt(x.gross)}</td>`}
          <td style="padding:7px 10px;font-size:12px;font-weight:700;color:${hColor}">${_fmt(x.driverPay)}${addl>0?`<br><span style="font-size:10px;color:#10b981">+${_fmt(addl)}</span>`:''}</td>
        </tr>`;
      }).join('');
      return `
  <div style="margin-bottom:18px">
    <div style="font-size:12px;font-weight:700;color:${hColor};margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">${title} (${loads.length})</div>
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <table class="report-table" style="width:100%;border-collapse:collapse">
        <thead><tr style="background:${hColor};color:#fff">
          <th style="padding:8px 10px;text-align:left;font-size:11px">Load ID</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px">Miles</th>
          ${isCPM?'':`<th style="padding:8px 10px;text-align:left;font-size:11px">Gross</th>`}
          <th style="padding:8px 10px;text-align:left;font-size:11px">My Pay</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#f1f5f9;font-weight:800">
          <td colspan="2" style="padding:7px 10px;font-size:11px">${loads.length} load${loads.length!==1?'s':''} \u00B7 ${tmi2.toLocaleString()} mi</td>
          ${isCPM?'':`<td style="padding:7px 10px;font-size:12px">${_fmt(tgross)}</td>`}
          <td style="padding:7px 10px;font-size:12px;color:${hColor}">${_fmt(tpay)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>`;
    }

    const tablesHTML =
      makeSection('\u2705 Paid', paidLoads, '#10b981') +
      makeSection('\u{1F535} Active', activeLoads, acc) +
      makeSection('\uD83D\uDD27 Adjusted', adjLoads, '#8b5cf6') +
      makeSection('\u2696\uFE0F Disputed', disputedLoads, '#f59e0b') +
      makeSection('\u274C Cancelled', cancelLoads, '#ef4444');

    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Settlement — ${driver.name||''}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#0f172a;padding:16px;max-width:800px;margin:0 auto;overflow-x:hidden}
    @media print{body{padding:8px}}
    @media(max-width:600px){.report-table td,.report-table th{padding:5px 6px!important;font-size:10px!important}}
  </style>
</head><body>
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:3px solid ${acc};margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:12px">
      ${logo?`<img src="${logo}" style="height:48px;width:48px;object-fit:contain;border-radius:8px">`:`<svg viewBox="0 0 160 160" style="width:48px;height:48px;background:${acc};border-radius:8px;padding:6px"><polygon points="80,8 142,44 142,116 80,152 18,116 18,44" fill="none" stroke="white" stroke-width="3"/><line x1="80" y1="8" x2="80" y2="50" stroke="white" stroke-width="2"/><line x1="142" y1="44" x2="110" y2="62" stroke="white" stroke-width="2"/><line x1="18" y1="44" x2="50" y2="62" stroke="white" stroke-width="2"/><line x1="80" y1="152" x2="80" y2="110" stroke="white" stroke-width="2"/><line x1="142" y1="116" x2="110" y2="98" stroke="white" stroke-width="2"/><line x1="18" y1="116" x2="50" y2="98" stroke="white" stroke-width="2"/><polygon points="80,50 110,67 110,101 80,118 50,101 50,67" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><circle cx="80" cy="84" r="10" fill="white" opacity="0.9"/><line x1="80" y1="94" x2="80" y2="118" stroke="white" stroke-width="2"/></svg>`}
      <div>
        <div style="font-size:18px;font-weight:900">${_escHtml(company)}</div>
        <div style="font-size:11px;color:#64748b">Driver Settlement Report</div>
        <div style="font-size:10px;color:${acc};font-weight:700;letter-spacing:1px;margin-top:2px">CrewBIQ Technologies \u00B7 CrewBIQ</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700;color:${acc}">${period}</div>
      ${dateRange?`<div style="font-size:11px;color:#64748b">${dateRange}</div>`:''}
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
    </div>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,transparent,${acc} 20%,#60a5fa 50%,${acc} 80%,transparent);width:100%;margin-bottom:14px"></div>
  <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap">
    <div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Driver</div><div style="font-size:14px;font-weight:700">${_escHtml(driver.name||'')}</div></div>
    <div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Truck</div><div style="font-size:14px;font-weight:700">${_escHtml(driver.truckName||'')} \u00B7 Unit ${_escHtml(driver.unitNumber||'')}</div></div>
    ${driver.plate?`<div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Plate</div><div style="font-size:14px;font-weight:700">${_escHtml(driver.plate)}</div></div>`:''}
    <div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Pay Type</div><div style="font-size:14px;font-weight:700">${isCPM?'$'+(driver.cpmRate||0)+'/mi CPM':(driver.grossPercent||0)+'% Gross'}</div></div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${kpiHTML}</div>
  ${det>0||lay>0?`<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${det>0?`<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;font-size:12px"><span style="color:#64748b">Detention: </span><strong style="color:#10b981">${_fmt(det)}</strong></div>`:''}${lay>0?`<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;font-size:12px"><span style="color:#64748b">Layover: </span><strong style="color:#10b981">${_fmt(lay)}</strong></div>`:''}</div>`:''}
  ${tablesHTML}
  <div style="text-align:center;font-size:10px;color:#94a3b8;padding-top:10px;border-top:1px solid #e2e8f0">
    Generated by CrewBIQ Driver \u00B7 CrewBIQ Technologies \u00B7 ${new Date().toLocaleString()}
  </div>
</body></html>`;
  }


  // ── EXPORT & SHARE ────────────────────────────────────────────────────────

  function exportDriverData(format) {
    if (!assertReady()) return;
    const driver  = _get.driver();
    const rLoads  = getExportLoads();
    if (!rLoads.length) return _toast('No loads for selected period', 'err');
    const period  = getPeriodLabel().replace(/\s/g, '_');
    const dateStr = _today();

    if (format === 'csv') {
      const headers = ['Load ID','Pickup','Delivery','Loaded Mi','Dead Mi','Total Mi','Gross','Driver Pay','Detention','Layover','Status','Notes'];
      const rows = rLoads.map(x => [
        x.loadId, x.pickup || '', x.delivery || '',
        x.loadedMiles || 0, x.deadMiles || 0, x.totalMiles || 0,
        (x.gross || 0).toFixed(2), (x.driverPay || 0).toFixed(2),
        (x.detention || 0).toFixed(2), (x.layover || 0).toFixed(2),
        x.status || '', x.notes || '',
      ].map(csvCell).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      downloadFile(csv, 'text/csv', `CrewBIQ_${driver.unitNumber || 'driver'}_${period}_${dateStr}.csv`);
      _toast('CSV downloaded 📊');

    } else if (format === 'pdf') {
      const html = buildReportHTML();
      const safeUnit = String(driver.unitNumber || driver.name || 'driver').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'driver';
      const filename = `CrewBIQ_${safeUnit}_${period}_${dateStr}.html`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');

      if (!win) {
        URL.revokeObjectURL(url);
        downloadFile(html, 'text/html;charset=utf-8', filename);
        return _toast('Popup blocked - printable HTML report downloaded', 'warn');
      }

      let printAttempted = false;
      const tryPrint = () => {
        if (printAttempted) return;
        printAttempted = true;
        try { win.focus(); win.print(); } catch(e) {}
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
      try {
        win.addEventListener('load', () => setTimeout(tryPrint, 700));
      } catch(e) {
        setTimeout(tryPrint, 1200);
      }
      setTimeout(tryPrint, 2000);
      _toast('Report opened - use Print / Save as PDF');
    }
  }

  function shareReport(channel) {
    if (!assertReady()) return;
    const driver  = _get.driver();
    const rLoads  = getExportLoads();
    const period  = getPeriodLabel();
    const gross   = rLoads.reduce((s, x) => s + Number(x.gross     || 0), 0);
    const pay     = rLoads.reduce((s, x) => s + Number(x.driverPay || 0), 0);
    const lmi     = rLoads.reduce((s, x) => s + Number(x.loadedMiles || 0), 0);
    const dateRange = fmtDateRangeFromLoads(rLoads);

    const text = [
      `📋 *Driver Settlement — ${period}*`,
      dateRange ? `📅 ${dateRange}` : '',
      `👤 ${driver.name || ''} · Unit ${driver.unitNumber || ''}`,
      `🚛 ${driver.truckName || ''}`,
      ``,
      `📦 Loads: *${rLoads.length}*`,
      `💰 Gross: *${_fmt(gross)}*`,
      `💵 My Pay: *${_fmt(pay)}*`,
      `🛣 Loaded Miles: *${lmi.toLocaleString()}*`,
      ``,
      `_Generated by CrewBIQ Driver_`,
    ].filter(Boolean).join('\n');

    const encoded = encodeURIComponent(text);
    const urls = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      telegram: `https://t.me/share/url?url=&text=${encoded}`,
      email:    `mailto:?subject=${encodeURIComponent('Settlement Report — ' + period)}&body=${encoded}`,
    };

    const url = urls[channel];
    if (url) window.open(url, '_blank');
  }

  // ── STATUS DROPDOWN MENUS ─────────────────────────────────────────────────

  function toggleStatusMenu(e, menuId) {
    e.stopPropagation();
    closeAllMenus();
    const m = document.getElementById(menuId);
    if (!m) return;
    const btn = e.currentTarget, rect = btn.getBoundingClientRect();
    const menuH = 220, spaceBelow = window.innerHeight - rect.bottom, spaceAbove = rect.top;
    m.style.left  = rect.left + 'px';
    m.style.width = Math.max(rect.width, 200) + 'px';
    if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
      m.style.top = (rect.bottom + 4) + 'px'; m.style.bottom = 'auto';
    } else {
      m.style.top = 'auto'; m.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    }
    m.classList.add('open');
  }

  function closeAllMenus() {
    document.querySelectorAll('.status-menu.open').forEach(m => m.classList.remove('open'));
  }

  // ── RENDER HOME ───────────────────────────────────────────────────────────

  function renderHome() {
    if (!assertReady()) return;
    const loads = _get.loads(), ptiLog = _get.ptiLog(), wkLoads = getWeekLoads();
    const disputedList = getDriverDisputed();
    const pendingIds   = new Set(disputedList.filter(d => d.status === 'pending').map(d => d.loadId));
    const activeLoads   = wkLoads.filter(x => x.status !== 'cancel' && !(x.status === 'disputed' || pendingIds.has(x.loadId)));
    const disputedLoads = wkLoads.filter(x => x.status === 'disputed' || pendingIds.has(x.loadId));
    const gross = activeLoads.reduce((s, x) => s + Number(x.gross     || 0), 0);
    const pay   = activeLoads.reduce((s, x) => s + Number(x.driverPay || 0), 0);
    const lmi   = wkLoads.filter(x => x.status !== 'cancel').reduce((s, x) => s + Number(x.loadedMiles || 0), 0);
    const dmi   = wkLoads.filter(x => x.status !== 'cancel').reduce((s, x) => s + Number(x.deadMiles   || 0), 0);
    const disputedGross = disputedLoads.reduce((s, x) => s + Number(x.gross || 0), 0);
    document.getElementById('homeWeekNet').textContent  = _fmt(pay);
    document.getElementById('homeWeekSub').textContent  = `gross ${_fmt(gross)} · ${(lmi + dmi).toLocaleString()} mi · ${wkLoads.length} loads${disputedGross > 0 ? ' · ⚖️ ' + _fmt(disputedGross) + ' disputed' : ''}`;
    document.getElementById('homeMyPay').textContent    = _fmt(pay);
    document.getElementById('homeGross').textContent    = _fmt(gross);
    document.getElementById('homeLoadedMi').textContent = lmi.toLocaleString();
    document.getElementById('homeDeadMi').textContent   = dmi.toLocaleString();
    document.getElementById('homeLoads').innerHTML = loads.slice(0, 5).map((x, i) => {
      const isDisputed  = x.status === 'disputed' || pendingIds.has(x.loadId);
      const key = x.id || loadActionKey(x);
      const keyArg = actionArg(key);
      const loadIdArg = actionArg(x.loadId || '');
      const menuId = 'smenu_h_' + i + '_' + identitySlug(key || x.loadId || '');
      const statusColor = x.status === 'success' ? 'var(--gr)' : x.status === 'cancel' ? 'var(--rd)' : x.status === 'adj' ? 'var(--acc)' : isDisputed ? '#f59e0b' : 'var(--mu)';
      const statusLabel = x.status === 'success' ? '✅ Success' : x.status === 'cancel' ? '❌ Cancelled' : x.status === 'adj' ? `🔧 Adj ${_fmt(x.adjAmount || 0)}` : isDisputed ? '⚖️ Disputed' : '🔵 Active';
      const borderColor = isDisputed ? '#f59e0b' : x.status === 'success' ? 'var(--gr)' : x.status === 'cancel' ? 'var(--rd)' : x.status === 'adj' ? 'var(--acc)' : 'var(--bd)';
      const addlPay = (x.detention || 0) + (x.layover || 0);
      return `<div class="item" style="border-left:3px solid ${borderColor}">
        <div class="item-inner">
          <div>
            <div class="item-title">${_escHtml(x.loadId)} <span style="font-size:11px;font-weight:500;color:${statusColor}">${statusLabel}</span></div>
            <div class="muted">${x.pickup || ''}${x.delivery ? ' → ' + x.delivery : ''}</div>
            <div class="muted">${(x.loadedMiles || 0).toLocaleString()} loaded · ${(x.deadMiles || 0).toLocaleString()} dead</div>
            ${addlPay > 0 ? `<div class="muted" style="color:var(--gr);font-size:11px">+${_fmt(addlPay)} additional</div>` : ''}
          </div>
          <div style="text-align:right">
            <div class="item-title" style="color:${isDisputed ? '#f59e0b' : x.status === 'cancel' ? 'var(--rd)' : 'var(--tx)'}">${_fmt(x.gross)}</div>
            <div class="muted amber">${_fmt(x.driverPay)}</div>
            <div class="muted" style="font-size:10px">${x.synced ? '☁️' : '📱'}</div>
          </div>
        </div>
        <div class="item-actions">
          <div class="status-dropdown" style="flex:1">
            <button onclick="toggleStatusMenu(event,'${menuId}')" style="width:100%;color:${statusColor}">⚡ Status ▾</button>
            <div class="status-menu" id="${menuId}">
              <button onclick="setLoadStatus(${keyArg},'active');closeAllMenus()">🔵 Active</button>
              <button onclick="setLoadStatus(${keyArg},'success');closeAllMenus()" style="color:var(--gr)">✅ Success</button>
              <button onclick="closeAllMenus();goToDisputeWithLoad(${loadIdArg},'cancel')" style="color:var(--rd)">❌ Cancel → Dispute</button>
              <button onclick="closeAllMenus();goToDisputeWithLoad(${loadIdArg},'adj')" style="color:var(--acc)">🔧 Adj → Dispute</button>
            </div>
          </div>
          <button onclick="editLoad(${keyArg})" style="border-left:1px solid var(--bd)">✏️ Edit</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty">No loads this week</div>';
    const todayPTI = ptiLog.find(p => p.date === _today());
    document.getElementById('homePtiStatus').innerHTML = todayPTI
      ? `<div class="line"><span>Today's PTI</span><span class="${todayPTI.passed ? 'green' : 'amber'}">${todayPTI.passed ? '✅ Passed' : '⚠️ Issues noted'}</span></div>
         <div class="line"><span>Odometer</span><span>${(todayPTI.odometer || 0).toLocaleString()} mi</span></div>`
      : `<div style="color:var(--rd);font-weight:700;text-align:center;padding:10px">⚠️ PTI not completed today</div>
         <button onclick="forcePTI()" class="btn primary" style="margin-top:8px;padding:10px">Run PTI Now</button>`;
  }

  // ── RENDER LOAD PAGE ──────────────────────────────────────────────────────

  function renderLoadPage() {
    if (!assertReady()) return;
    populateLoadTruckSelect();
    const loads = _get.loads();
    const dispIds = new Set(getDriverDisputed().filter(d => d.status === 'pending').map(d => d.loadId));
    document.getElementById('allLoads').innerHTML = loads.map((x, i) => {
      const isDisp = dispIds.has(x.loadId);
      const addlPay = (x.detention || 0) + (x.layover || 0);
      const key = x.id || loadActionKey(x);
      const keyArg = actionArg(key);
      const loadIdArg = actionArg(x.loadId || '');
      const menuId = 'smenu_l_' + i + '_' + identitySlug(key || x.loadId || '');
      const statusColor = x.status === 'success' ? 'var(--gr)' : x.status === 'cancel' ? 'var(--rd)' : x.status === 'adj' ? 'var(--acc)' : isDisp ? '#f59e0b' : 'var(--bl)';
      const statusBadge = x.status === 'success' ? '<span style="color:var(--gr);font-size:11px">✅ Success</span>'
        : x.status === 'cancel' ? '<span style="color:var(--rd);font-size:11px">❌ Cancelled</span>'
        : x.status === 'adj'    ? `<span style="color:var(--acc);font-size:11px">🔧 Adj ${_fmt(x.adjAmount || 0)}</span>`
        : isDisp                ? '<span style="color:#f59e0b;font-size:11px">⚖️ Disputed</span>'
        :                         '<span style="color:var(--bl);font-size:11px">🔵 Active</span>';
      const borderColor = isDisp ? '#f59e0b' : x.status === 'success' ? 'var(--gr)' : x.status === 'cancel' ? 'var(--rd)' : x.status === 'adj' ? 'var(--acc)' : 'var(--bd)';
      return `<div class="item" style="border-left:3px solid ${borderColor}">
        <div class="item-inner">
          <div>
            <div class="item-title">${_escHtml(x.loadId)} ${statusBadge}</div>
            <div class="muted">${x.pickup || ''} ${x.delivery ? '→ ' + x.delivery : ''}</div>
            ${(x.pickupLocation || x.deliveryLocation) ? `<div class="muted">${_escHtml(x.pickupLocation || '')} ${x.deliveryLocation ? '→ ' + _escHtml(x.deliveryLocation) : ''}</div>` : ''}
            <div class="muted">${(x.loadedMiles || 0).toLocaleString()} mi · ${_fmt(x.gross)}</div>
            ${x.detention > 0 ? `<div class="muted" style="font-size:11px;color:var(--gr)">Detention: ${_fmt(x.detention)}</div>` : ''}
            ${x.layover   > 0 ? `<div class="muted" style="font-size:11px;color:var(--gr)">Layover: ${_fmt(x.layover)}</div>`   : ''}
          </div>
          <div style="text-align:right">
            <div class="item-title amber">${_fmt(x.driverPay)}</div>
            ${addlPay > 0 ? `<div class="muted" style="color:var(--gr);font-size:11px">+${_fmt(addlPay)}</div>` : ''}
            <div class="muted">${x.synced ? '☁️ synced' : '📱 local'}</div>
          </div>
        </div>
        <div class="item-actions">
          <div class="status-dropdown" style="flex:1.5">
            <button onclick="toggleStatusMenu(event,'${menuId}')" style="width:100%;color:${statusColor}">⚡ Status ▾</button>
            <div class="status-menu" id="${menuId}">
              <button onclick="setLoadStatus(${keyArg},'active');closeAllMenus()">🔵 Active</button>
              <button onclick="setLoadStatus(${keyArg},'success');closeAllMenus()" style="color:var(--gr)">✅ Success</button>
              <button onclick="closeAllMenus();goToDisputeWithLoad(${loadIdArg},'cancel')" style="color:var(--rd)">❌ Cancel → Dispute</button>
              <button onclick="closeAllMenus();goToDisputeWithLoad(${loadIdArg},'adj')" style="color:var(--acc)">🔧 Adj → Dispute</button>
            </div>
          </div>
          <button onclick="editLoad(${keyArg})" style="border-left:1px solid var(--bd)">✏️</button>
          <button onclick="deleteLoad(${keyArg})" style="border-left:1px solid var(--bd);color:var(--rd)">🗑️</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty">No loads yet</div>';
  }

  // ── RENDER STATS ──────────────────────────────────────────────────────────

  function renderStats() {
    if (!assertReady()) return;
    const loads = _get.loads();
    const period = document.getElementById('statsPeriod').value;
    const t = _today();
    let filtered = loads;
    if (period === 'week') {
      const wk = _getWeekKey(t);
      filtered = loads.filter(x => _getWeekKey(x.pickup || x.date || '') === wk);
    } else if (period === 'month') {
      const ym = t.slice(0, 7);
      filtered = loads.filter(x => (x.pickup || '').slice(0, 7) === ym);
    }
    const gross = filtered.reduce((s, x) => s + Number(x.gross       || 0), 0);
    const pay   = filtered.reduce((s, x) => s + Number(x.driverPay   || 0), 0);
    const lmi   = filtered.reduce((s, x) => s + Number(x.loadedMiles || 0), 0);
    const dmi   = filtered.reduce((s, x) => s + Number(x.deadMiles   || 0), 0);
    const tmi   = lmi + dmi;
    document.getElementById('stGross').textContent    = _fmt(gross);
    document.getElementById('stPay').textContent      = _fmt(pay);
    document.getElementById('stLoadedMi').textContent = lmi.toLocaleString();
    document.getElementById('stDeadMi').textContent   = dmi.toLocaleString();
    document.getElementById('stLoads').textContent    = filtered.length;
    document.getElementById('stAvgLoad').textContent  = filtered.length ? _fmt(pay / filtered.length) : '$0';
    document.getElementById('stGpm').textContent      = tmi ? '$' + (gross / tmi).toFixed(2) : '$0';
    document.getElementById('stPpm').textContent      = tmi ? '$' + (pay   / tmi).toFixed(2) : '$0';
    const wkMap = {};
    loads.forEach(x => {
      const wk = _getWeekKey(x.pickup || x.date || '');
      if (!wk) return;
      if (!wkMap[wk]) wkMap[wk] = { gross: 0, pay: 0, loads: 0, lmi: 0 };
      wkMap[wk].gross += Number(x.gross       || 0);
      wkMap[wk].pay   += Number(x.driverPay   || 0);
      wkMap[wk].loads += 1;
      wkMap[wk].lmi   += Number(x.loadedMiles || 0);
    });
    const wks = Object.keys(wkMap).sort().reverse().slice(0, 8);
    document.getElementById('weeklyBreakdown').innerHTML = wks.map(wk => `
      <div class="line">
        <span><strong>Wk ${wk}</strong><br><span class="muted">${wkMap[wk].loads} loads · ${wkMap[wk].lmi.toLocaleString()} mi</span></span>
        <span style="text-align:right"><strong>${_fmt(wkMap[wk].pay)}</strong><br><span class="muted">gross ${_fmt(wkMap[wk].gross)}</span></span>
      </div>`).join('') || '<div class="muted" style="padding:10px">No data</div>';
  }

  // ── RENDER DISPUTES PAGE ──────────────────────────────────────────────────

  function renderDriverDisputedPage() {
    const list = getDriverDisputed();
    const el   = document.getElementById('driverDisputedList');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="empty">No disputes</div>'; return; }
    el.innerHTML = list.slice().reverse().map(d => {
      const isPending   = d.status === 'pending';
      const isWon       = d.status === 'won';
      const linkedLoad  = _get.loads().find(x => x.loadId === d.loadId);
      const isAdjDispute= !!(linkedLoad && linkedLoad.status === 'adj') || /adjust/i.test(d.note || '') || d.resolutionType === 'adjustment';
      const statusColor = isPending ? '#f59e0b' : isWon ? 'var(--gr)' : 'var(--rd)';
      const statusLabel = isPending ? (isAdjDispute ? '🔧 Adj Pending' : '⚖️ Pending') : isWon ? (isAdjDispute ? '🔧 Corrected' : '✅ Won') : '❌ Lost';
      return `<div class="item" style="border-left:3px solid ${statusColor};margin-bottom:8px">
        <div class="item-inner">
          <div>
            <div class="item-title">${_escHtml(d.loadId)} <span style="font-size:11px;color:${statusColor}">${statusLabel}</span></div>
            <div class="muted">${d.createdAt || ''}${d.note ? ' · ' + _escHtml(d.note) : ''}</div>
            ${d.amount ? `<div class="muted">Amount: <strong>${_fmt(d.amount)}</strong></div>` : ''}
            ${d.miles  ? `<div class="muted">Miles: <strong>${d.miles.toLocaleString()}</strong></div>` : ''}
          </div>
          <div style="text-align:right;font-size:11px;color:var(--mu)">${d.resolvedAt ? 'Resolved ' + d.resolvedAt : ''}</div>
        </div>
        <div class="item-actions">
          ${isPending
            ? (isAdjDispute
                ? `<button onclick="driverResolveDispute('${d.id}','won')" style="color:var(--gr);flex:1">✅ Confirm</button>
                   <button onclick="driverResolveDispute('${d.id}','won')" style="color:var(--acc);flex:1;border-left:1px solid var(--bd)">🔧 Correct Price</button>`
                : `<button onclick="driverResolveDispute('${d.id}','won')"  style="color:var(--gr);flex:1">✅ Won</button>
                   <button onclick="driverResolveDispute('${d.id}','lost')" style="color:var(--rd);flex:1;border-left:1px solid var(--bd)">❌ Lost</button>`)
            : `<button onclick="driverReopenDispute('${d.id}')" style="flex:1">↩️ Reopen</button>`}
          <button onclick="driverDeleteDispute('${d.id}')" style="color:var(--rd);border-left:1px solid var(--bd)">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  const CrewBIQLoads = {
    version: '0.4.0',
    init,
    calcDriverPay, calcDriverPayWith, recalcLoadsFrom,
    maskGross, calcPreview, getWeekLoads,
    saveLoad, editLoad, deleteLoad, resetLoadForm, setLoadStatus,
    toggleStatusMenu, closeAllMenus,
    getDriverDisputed, setDriverDisputed,
    addDriverDisputed, driverResolveDispute, driverReopenDispute,
    driverDeleteDispute, renderDriverDisputedPage, goToDisputeWithLoad, promptAdj,
    getPeriodDates, getPeriodLabel, getExportLoads,
    fmtDateRange, fmtDateRangeFromLoads, getAccentHex,
    csvCell, downloadFile,
    buildReportText, buildReportHTML,
    exportDriverData, shareReport,
    renderHome, renderLoadPage, renderStats,
  };

  global.CrewBIQLoads = CrewBIQLoads;

  // ── BACKWARD COMPATIBILITY ─────────────────────────────────────────────────

  global.calcDriverPay            = calcDriverPay;
  global.maskGross                = maskGross;
  global.calcPreview              = calcPreview;
  global.getWeekLoads             = getWeekLoads;
  global.saveLoad                 = saveLoad;
  global.editLoad                 = editLoad;
  global.deleteLoad               = deleteLoad;
  global.resetLoadForm            = resetLoadForm;
  global.setLoadStatus            = setLoadStatus;
  global.toggleStatusMenu         = toggleStatusMenu;
  global.closeAllMenus            = closeAllMenus;
  global.recalcLoadsFrom          = recalcLoadsFrom;
  global.getDriverDisputed        = getDriverDisputed;
  global.setDriverDisputed        = setDriverDisputed;
  global.addDriverDisputed        = addDriverDisputed;
  global.driverResolveDispute     = driverResolveDispute;
  global.driverReopenDispute      = driverReopenDispute;
  global.driverDeleteDispute      = driverDeleteDispute;
  global.renderDriverDisputedPage = renderDriverDisputedPage;
  global.goToDisputeWithLoad      = goToDisputeWithLoad;
  global.promptAdj                = promptAdj;
  global.renderHome               = renderHome;
  global.renderLoadPage           = renderLoadPage;
  global.renderStats              = renderStats;
  global.exportDriverData         = exportDriverData;
  global.shareReport              = shareReport;
  global.buildReportHTML          = buildReportHTML;
  global.buildReportText          = buildReportText;
  global.csvCell                  = csvCell;
  global.downloadFile             = downloadFile;
  global.getAccentHex             = getAccentHex;
  global.getExportLoads           = getExportLoads;
  global.getPeriodLabel           = getPeriodLabel;

  console.info('[CrewBIQ Loads] v0.4.0 loaded');

})(window);
