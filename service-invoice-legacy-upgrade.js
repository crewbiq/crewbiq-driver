/**
 * CrewBIQ service invoice legacy upgrade v0.1.0
 *
 * When the same invoice already exists as an old flat Service Log entry, the
 * segmented import upgrades that record in place instead of creating a second
 * P&L charge.
 */
(function (global) {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function number(value) {
    const n = Number(value == null || value === '' ? 0 : value);
    return Number.isFinite(n) ? n : 0;
  }
  function normalizeUnit(value) {
    return text(value).replace(/^unit\s*#?\s*/i, '').replace(/[^a-z0-9-]/gi, '').toUpperCase();
  }
  function normalizeWords(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function hasInvoiceLineage(log) {
    return !!(
      log && (
        text(log.sourceInvoiceKey) ||
        text(log.sourceDocumentType) === 'service_invoice' ||
        Array.isArray(log.serviceGroups)
      )
    );
  }

  function truckMatches(log, parent) {
    if (text(log.truckId) && text(parent.truckId)) return text(log.truckId) === text(parent.truckId);
    if (normalizeUnit(log.unitNumber) && normalizeUnit(parent.unitNumber)) {
      return normalizeUnit(log.unitNumber) === normalizeUnit(parent.unitNumber);
    }
    return false;
  }

  function identityEvidence(log, parent) {
    const haystack = normalizeWords([log.category, log.description, log.vendor, log.invoiceNumber].filter(Boolean).join(' '));
    const invoice = normalizeWords(parent.invoiceNumber);
    const vendor = normalizeWords(parent.vendor);
    if (invoice && haystack.includes(invoice)) return true;
    if (vendor && vendor.length >= 6 && haystack.includes(vendor)) return true;
    // Some legacy OCR descriptions are much longer than the parent vendor. Match
    // the first meaningful vendor words only when date/truck/amount already agree.
    const vendorPrefix = vendor.split(' ').filter(function (part) { return part.length > 2; }).slice(0, 3).join(' ');
    return !!(vendorPrefix && vendorPrefix.length >= 6 && haystack.includes(vendorPrefix));
  }

  function isLegacyMatch(log, parent) {
    if (!log || !parent || hasInvoiceLineage(log)) return false;
    return text(log.date) === text(parent.date) &&
      truckMatches(log, parent) &&
      Math.abs(number(log.amount) - number(parent.totalDue)) < 0.01 &&
      identityEvidence(log, parent);
  }

  function upgradeArray(records, state) {
    if (!Array.isArray(records) || !state || !state.parent || !global.CrewBIQServiceInvoice) {
      return { records: records, upgraded: false, legacyId: '' };
    }
    const parent = state.parent;
    const key = global.CrewBIQServiceInvoice.sourceInvoiceKey(parent);
    const invoiceIndex = records.findIndex(function (record) {
      return text(record && record.sourceInvoiceKey) === key;
    });
    if (invoiceIndex < 0) return { records: records, upgraded: false, legacyId: '' };

    const legacyIndex = records.findIndex(function (record, index) {
      return index !== invoiceIndex && isLegacyMatch(record, parent);
    });
    if (legacyIndex < 0) return { records: records, upgraded: false, legacyId: '' };

    const upgraded = records.slice();
    const invoice = { ...upgraded[invoiceIndex] };
    const legacy = upgraded[legacyIndex];
    invoice.id = text(legacy.id) || invoice.id;
    invoice.createdAt = legacy.createdAt || invoice.createdAt;
    invoice.upgradedFromLegacy = true;
    invoice.legacyCategory = legacy.category || '';
    upgraded[invoiceIndex] = invoice;
    upgraded.splice(legacyIndex, 1);
    return { records: upgraded, upgraded: true, legacyId: text(legacy.id) };
  }

  function install() {
    const originalSave = global.saveServiceLogs;
    if (typeof originalSave !== 'function' || originalSave.__crewbiqLegacyUpgrade) return;

    const wrappedSave = function (records) {
      const review = global.CrewBIQServiceInvoice;
      const state = review && typeof review.getState === 'function' ? review.getState() : null;
      const result = upgradeArray(records, state);
      const saved = originalSave.call(this, result.records);
      if (result.upgraded) {
        try {
          localStorage.setItem('fiqD_lastServiceInvoiceUpgrade', JSON.stringify({
            legacyId: result.legacyId,
            invoiceNumber: state && state.parent ? state.parent.invoiceNumber : '',
            upgradedAt: new Date().toISOString()
          }));
        } catch (e) {}
      }
      return saved;
    };
    wrappedSave.__crewbiqLegacyUpgrade = true;
    global.saveServiceLogs = wrappedSave;
  }

  global.CrewBIQServiceLegacyUpgrade = {
    version: '0.1.0',
    isLegacyMatch: isLegacyMatch,
    upgradeArray: upgradeArray,
    install: install
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else setTimeout(install, 0);
  }

  console.info('[CrewBIQ Service Invoice] legacy upgrade v0.1.0 loaded');
})(window);
