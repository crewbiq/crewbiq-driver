/**
 * CrewBIQ load chronology and restored-edit hotfix v0.2.0
 *
 * Chronology:
 * - pickup remains the canonical load date;
 * - older/imported records without pickup fall back to delivery;
 * - restored lists are sorted on read without rewriting storage.
 *
 * Editing:
 * - PostgreSQL/legacy restores may return monetary fields as strings;
 * - loads.js historically called `.toFixed()` directly on those values, so the
 *   pencil button aborted before opening the form;
 * - this adapter normalizes the selected in-memory record immediately before
 *   edit and assigns an ID to an id-less legacy record for safe replacement.
 *
 * This file loads before loads.js and intercepts both CrewBIQLoads and the
 * backwards-compatible global editLoad assignment.
 */
(function (global) {
  'use strict';

  const VERSION = '0.2.0';
  const state = {
    getLoads: () => [],
    setLoads: () => {},
  };

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeDate(value) {
    const raw = text(value);
    if (!raw) return '';

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) {
      return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
    }

    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toISOString().slice(0, 10);
  }

  function loadDateKey(load) {
    if (!load || typeof load !== 'object') return '';
    const candidates = [
      load.pickup,
      load.pickupDate,
      load.date,
      load.delivery,
      load.deliveryDate,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeDate(candidate);
      if (normalized) return normalized;
    }
    return '';
  }

  function sortLoadsByDate(loads) {
    return (Array.isArray(loads) ? loads : [])
      .map((load, index) => ({ load, index, date: loadDateKey(load) }))
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.index - b.index;
      })
      .map(item => item.load);
  }

  function loadKey(load) {
    return text(load && (load.id || load.loadId || load.record_id || load.key));
  }

  function isLoadMatch(load, key) {
    const wanted = text(key);
    if (!wanted || !load) return false;
    return [load.id, load.loadId, load.record_id, load.key]
      .some(value => text(value) === wanted) || loadKey(load) === wanted;
  }

  function stableLegacyId(load) {
    const raw = loadKey(load) || [
      loadDateKey(load),
      text(load && load.unitNumber),
      text(load && load.gross),
    ].filter(Boolean).join('_') || String(Date.now());
    const slug = raw.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    return 'l_' + (slug || Date.now());
  }

  function finiteNumber(value, fallback = 0) {
    if (value === '' || value == null) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeEditableLoad(load) {
    if (!load || typeof load !== 'object') return load;
    return {
      ...load,
      id: text(load.id) || stableLegacyId(load),
      gross: finiteNumber(load.gross),
      loadedMiles: finiteNumber(load.loadedMiles),
      deadMiles: finiteNumber(load.deadMiles),
      totalMiles: finiteNumber(
        load.totalMiles,
        finiteNumber(load.loadedMiles) + finiteNumber(load.deadMiles),
      ),
      driverPay: finiteNumber(load.driverPay),
      detention: finiteNumber(load.detention),
      layover: finiteNumber(load.layover),
      adjAmount: finiteNumber(load.adjAmount),
    };
  }

  function prepareLoadForEdit(key) {
    const loads = Array.isArray(state.getLoads()) ? state.getLoads() : [];
    const index = loads.findIndex(load => isLoadMatch(load, key));
    if (index < 0) return text(key);

    const current = loads[index];
    const normalized = normalizeEditableLoad(current);
    const changed = Object.keys(normalized).some(name => normalized[name] !== current[name]);
    if (changed) {
      const next = loads.slice();
      next[index] = normalized;
      state.setLoads(sortLoadsByDate(next));
    }
    return normalized.id || text(key);
  }

  function wrapEditFunction(original) {
    if (typeof original !== 'function' || original.__crewbiqRestoredEditWrapped) return original;
    const wrapped = function (key) {
      const preparedKey = prepareLoadForEdit(key);
      try {
        return original.call(this, preparedKey);
      } catch (error) {
        console.error('[CrewBIQ Loads] Could not open restored load for edit:', error);
        if (typeof global.toast === 'function') {
          global.toast('Could not open this load for editing. Refresh and try again.', 'err');
        }
        return false;
      }
    };
    wrapped.__crewbiqRestoredEditWrapped = true;
    wrapped.__crewbiqOriginal = original;
    return wrapped;
  }

  function wrapApi(api) {
    if (!api || typeof api.init !== 'function' || api.init.__crewbiqLoadOrderWrapped) return api;

    const originalInit = api.init;
    const wrappedInit = function (options = {}) {
      const rawGetLoads = typeof options.getLoads === 'function'
        ? options.getLoads
        : () => [];
      const rawSetLoads = typeof options.setLoads === 'function'
        ? options.setLoads
        : () => {};

      state.getLoads = rawGetLoads;
      state.setLoads = rawSetLoads;

      return originalInit.call(this, {
        ...options,
        // Sorting on read repairs display order immediately after restore/import
        // without rewriting the user's stored records merely by opening a page.
        getLoads: () => sortLoadsByDate(rawGetLoads()),
        // Sorting on write preserves the same deterministic order for new edits.
        setLoads: value => rawSetLoads(sortLoadsByDate(value)),
      });
    };
    wrappedInit.__crewbiqLoadOrderWrapped = true;
    api.init = wrappedInit;
    if (typeof api.editLoad === 'function') api.editLoad = wrapEditFunction(api.editLoad);
    api.loadDateKey = loadDateKey;
    api.sortLoadsByDate = sortLoadsByDate;
    api.normalizeEditableLoad = normalizeEditableLoad;
    api.prepareLoadForEdit = prepareLoadForEdit;
    api.loadOrderVersion = VERSION;
    return api;
  }

  function installIntercept(name, wrapper) {
    const descriptor = Object.getOwnPropertyDescriptor(global, name);
    if (descriptor && descriptor.configurable === false) {
      if (global[name]) global[name] = wrapper(global[name]);
      return;
    }

    let current = global[name];
    Object.defineProperty(global, name, {
      configurable: true,
      enumerable: true,
      get() { return current; },
      set(value) { current = wrapper(value); },
    });
    if (current) current = wrapper(current);
  }

  installIntercept('CrewBIQLoads', wrapApi);
  installIntercept('editLoad', wrapEditFunction);

  global.CrewBIQLoadOrder = {
    version: VERSION,
    normalizeDate,
    loadDateKey,
    sortLoadsByDate,
    normalizeEditableLoad,
    prepareLoadForEdit,
    wrapEditFunction,
    wrapApi,
  };

  console.info('[CrewBIQ Loads] chronology/restored-edit hotfix v' + VERSION + ' loaded');
})(window);
