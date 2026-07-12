/**
 * CrewBIQ OCR item alias guard v0.1.0
 *
 * Canonicalizes vendor-specific Fuel/DEF item codes before the Phase 2 invoice
 * grouper runs. This protects both new backend responses and older/cached OCR
 * results. Unknown items remain unchanged for manual review.
 */
(function (global) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function canonicalItem(value) {
    const original = text(value);
    if (!original) return '';
    const compact = original.toUpperCase().replace(/[^A-Z0-9]+/g, '');

    // DEF aliases must be checked before generic diesel aliases.
    if (
      compact.startsWith('DEF') ||
      compact === 'DIESELEXHAUST' ||
      compact === 'DIESELEXHAUSTFLUID' ||
      compact === 'DIESELEXHAUSTFLUIDONLY'
    ) {
      return 'DEF';
    }

    if (
      compact.startsWith('ULSD') ||
      ['FUEL', 'DIESEL', 'TRUCKDIESEL', 'DSL', 'DERV'].includes(compact)
    ) {
      return 'Fuel';
    }

    return original;
  }

  function canonicalizeResult(result) {
    if (!result || typeof result !== 'object') return result;
    if (result.document_type !== 'fuel_invoice' && result.requested_document_type !== 'fuel_invoice') {
      return result;
    }
    if (!Array.isArray(result.transactions)) return result;

    let normalized = 0;
    result.transactions.forEach(function (transaction) {
      if (!transaction || typeof transaction !== 'object') return;
      const original = transaction.item;
      const canonical = canonicalItem(original);
      if (canonical && canonical !== original) {
        transaction.item = canonical;
        normalized++;
      }
    });
    if (normalized) result.item_aliases_normalized = normalized;
    return result;
  }

  function patchPublicBuildStops() {
    const review = global.CrewBIQInvoiceReview;
    if (!review || typeof review.buildStops !== 'function' || review.buildStops.__crewbiqItemAliases) return;
    const originalBuildStops = review.buildStops;
    const wrappedBuildStops = function (result) {
      canonicalizeResult(result);
      return originalBuildStops.apply(this, arguments);
    };
    wrappedBuildStops.__crewbiqItemAliases = true;
    review.buildStops = wrappedBuildStops;
  }

  function installRenderGuard() {
    patchPublicBuildStops();
    const originalRender = global.renderScanReview;
    if (typeof originalRender !== 'function' || originalRender.__crewbiqItemAliases) return;

    const wrappedRender = function () {
      canonicalizeResult(global.lastScanResult);
      return originalRender.apply(this, arguments);
    };
    wrappedRender.__crewbiqItemAliases = true;
    global.renderScanReview = wrappedRender;
  }

  global.CrewBIQOCRItemAliases = {
    version: '0.1.0',
    canonicalItem,
    canonicalizeResult,
    patchPublicBuildStops,
  };

  // The Phase 2 review module is already loaded before this adapter.
  patchPublicBuildStops();

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installRenderGuard);
    } else {
      setTimeout(installRenderGuard, 0);
    }
  }

  console.info('[CrewBIQ OCR] item alias guard v0.1.0 loaded');
})(window);
