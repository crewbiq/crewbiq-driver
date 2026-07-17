/**
 * CrewBIQ load chronology hotfix v0.1.0
 *
 * The canonical load date remains pickup-first. Older/imported records that do
 * not contain a pickup date fall back to their delivery date instead of being
 * assigned an empty sort key and collecting at the bottom of the list.
 *
 * This file loads before loads.js, so it intercepts CrewBIQLoads assignment and
 * wraps init() before the application supplies its load accessors.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';

  function normalizeDate(value) {
    const raw = String(value == null ? '' : value).trim();
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
    api.loadDateKey = loadDateKey;
    api.sortLoadsByDate = sortLoadsByDate;
    api.loadOrderVersion = VERSION;
    return api;
  }

  const existingDescriptor = Object.getOwnPropertyDescriptor(global, 'CrewBIQLoads');
  if (existingDescriptor && existingDescriptor.configurable === false) {
    wrapApi(global.CrewBIQLoads);
  } else {
    let current = global.CrewBIQLoads;
    Object.defineProperty(global, 'CrewBIQLoads', {
      configurable: true,
      enumerable: true,
      get() { return current; },
      set(value) {
        current = wrapApi(value);
      },
    });
    if (current) current = wrapApi(current);
  }

  global.CrewBIQLoadOrder = {
    version: VERSION,
    normalizeDate,
    loadDateKey,
    sortLoadsByDate,
    wrapApi,
  };

  console.info('[CrewBIQ Loads] chronology hotfix v' + VERSION + ' loaded');
})(window);
