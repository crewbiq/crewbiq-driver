/**
 * CrewBIQ load chronology and restored-edit hotfix v0.5.0
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
 *   edit and assigns an ID to an id-less legacy record for safe replacement;
 * - a capture-phase delegated handler invokes the guarded editor directly;
 * - after the form is populated, every likely mobile scroll root is reset and
 *   the actual form card is revealed repeatedly after layout settles. This
 *   defeats Chrome scroll anchoring on long, re-rendered load lists.
 */
(function (global) {
  'use strict';

  const VERSION = '0.5.0';
  const state = {
    getLoads: () => [],
    setLoads: () => {},
    originalEdit: null,
    delegatedInstalled: false,
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
    if (index < 0) return { key: text(key), found: false };

    const current = loads[index];
    const normalized = normalizeEditableLoad(current);
    const changed = Object.keys(normalized).some(name => normalized[name] !== current[name]);
    if (changed) {
      const next = loads.slice();
      next[index] = normalized;
      state.setLoads(sortLoadsByDate(next));
    }
    return { key: normalized.id || text(key), found: true };
  }

  function showEditError(message) {
    console.error('[CrewBIQ Loads] ' + message);
    if (typeof global.toast === 'function') global.toast(message, 'err');
  }

  function uniqueNodes(nodes) {
    return nodes.filter((node, index) => node && nodes.indexOf(node) === index);
  }

  function resetScrollNode(node) {
    if (!node) return;
    try { node.scrollTop = 0; } catch (error) {}
    try { node.scrollLeft = 0; } catch (error) {}
    if (typeof node.scrollTo === 'function') {
      try { node.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
      catch (error) {
        try { node.scrollTo(0, 0); } catch (ignored) {}
      }
    }
  }

  function editorElements() {
    const document = global.document;
    if (!document || typeof document.getElementById !== 'function') {
      return { document: null, page: null, target: null, roots: [], anchors: [] };
    }

    const page = document.getElementById('page-load');
    const editField = document.getElementById('loadEditId');
    const target = editField && typeof editField.closest === 'function'
      ? (editField.closest('.card') || page)
      : page;
    const app = document.getElementById('app');
    const list = document.getElementById('allLoads');
    const roots = uniqueNodes([
      document.scrollingElement,
      document.documentElement,
      document.body,
      app,
      page,
    ]);
    const anchors = uniqueNodes([
      document.documentElement,
      document.body,
      app,
      page,
      list,
      target,
    ]);
    return { document, page, target, roots, anchors };
  }

  function revealLoadEditor() {
    const elements = editorElements();
    if (!elements.document) return;

    const anchorState = elements.anchors.map(node => ({
      node,
      value: node.style ? node.style.overflowAnchor : undefined,
    }));
    anchorState.forEach(({ node }) => {
      if (node.style) node.style.overflowAnchor = 'none';
    });

    const reveal = () => {
      elements.roots.forEach(resetScrollNode);

      if (elements.target) {
        if (elements.target.style) elements.target.style.scrollMarginTop = '78px';
        if (typeof elements.target.scrollIntoView === 'function') {
          try {
            elements.target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
          } catch (error) {
            try { elements.target.scrollIntoView(true); } catch (ignored) {}
          }
        }
      }

      elements.roots.forEach(resetScrollNode);
      if (typeof global.scrollTo === 'function') {
        try { global.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
        catch (error) {
          try { global.scrollTo(0, 0); } catch (ignored) {}
        }
      }
    };

    // Run immediately, after the next layout, and again after Chrome has had a
    // chance to apply scroll anchoring to the re-rendered list.
    reveal();
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(() => global.requestAnimationFrame(reveal));
    }
    setTimeout(reveal, 60);
    setTimeout(reveal, 180);

    setTimeout(() => {
      anchorState.forEach(({ node, value }) => {
        if (!node.style) return;
        if (value) node.style.overflowAnchor = value;
        else if (typeof node.style.removeProperty === 'function') node.style.removeProperty('overflow-anchor');
        else node.style.overflowAnchor = '';
      });
    }, 500);
  }

  function openEditor(key, context) {
    const prepared = prepareLoadForEdit(key);
    if (!prepared.found) {
      showEditError('Load not found. Refresh and try again.');
      return false;
    }
    if (typeof state.originalEdit !== 'function') {
      showEditError('Load editor is not ready. Refresh and try again.');
      return false;
    }
    try {
      const result = state.originalEdit.call(context || global, prepared.key);
      revealLoadEditor();
      return result;
    } catch (error) {
      console.error('[CrewBIQ Loads] Could not open restored load for edit:', error);
      if (typeof global.toast === 'function') {
        global.toast('Could not open this load for editing. Refresh and try again.', 'err');
      }
      return false;
    }
  }

  function wrapEditFunction(original) {
    if (typeof original !== 'function') return original;
    if (original.__crewbiqRestoredEditWrapped) {
      if (!state.originalEdit && original.__crewbiqOriginal) state.originalEdit = original.__crewbiqOriginal;
      return original;
    }
    state.originalEdit = original;
    const wrapped = function (key) {
      return openEditor(key, this);
    };
    wrapped.__crewbiqRestoredEditWrapped = true;
    wrapped.__crewbiqOriginal = original;
    return wrapped;
  }

  function wrapApi(api) {
    if (!api || typeof api.init !== 'function') return api;

    if (!api.init.__crewbiqLoadOrderWrapped) {
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
          getLoads: () => sortLoadsByDate(rawGetLoads()),
          setLoads: value => rawSetLoads(sortLoadsByDate(value)),
        });
      };
      wrappedInit.__crewbiqLoadOrderWrapped = true;
      api.init = wrappedInit;
    }

    if (typeof api.editLoad === 'function') api.editLoad = wrapEditFunction(api.editLoad);
    api.loadDateKey = loadDateKey;
    api.sortLoadsByDate = sortLoadsByDate;
    api.normalizeEditableLoad = normalizeEditableLoad;
    api.prepareLoadForEdit = prepareLoadForEdit;
    api.openEditor = openEditor;
    api.revealLoadEditor = revealLoadEditor;
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

  function parseInlineEditKey(source) {
    const match = text(source).match(/^editLoad\((.*)\)$/s);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      return match[1].replace(/^['"]|['"]$/g, '');
    }
  }

  function installDelegatedPencilGuard() {
    if (state.delegatedInstalled || !global.document) return;
    state.delegatedInstalled = true;
    global.document.addEventListener('click', event => {
      const target = event.target && event.target.closest
        ? event.target.closest('button[onclick^="editLoad("]')
        : null;
      if (!target || typeof state.originalEdit !== 'function') return;
      const key = parseInlineEditKey(target.getAttribute('onclick'));
      if (key == null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openEditor(key, target);
    }, true);
  }

  function installRuntimeGuard() {
    if (global.CrewBIQLoads) wrapApi(global.CrewBIQLoads);
    if (typeof global.editLoad === 'function') global.editLoad = wrapEditFunction(global.editLoad);
    installDelegatedPencilGuard();
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
    openEditor,
    revealLoadEditor,
    parseInlineEditKey,
    wrapEditFunction,
    wrapApi,
    installRuntimeGuard,
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', installRuntimeGuard, { once: true });
    } else {
      installRuntimeGuard();
    }
    setTimeout(installRuntimeGuard, 0);
  }

  console.info('[CrewBIQ Loads] chronology/restored-edit hotfix v' + VERSION + ' loaded');
})(window);
