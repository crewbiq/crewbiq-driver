/**
 * CrewBIQ OCR authenticated transport v0.1.0
 *
 * Intercepts only OCR extraction requests. Files are sent once to the
 * Bearer-authenticated Orchestrator endpoint, never to Apps Script or the
 * legacy secret path. The selected browser file is cleared after extraction.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  const previousFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;

  if (!previousFetch || !global.CrewBIQCore || !global.CrewBIQCore.orchestratorTransport) {
    console.error('[CrewBIQ OCR] authenticated transport is unavailable');
    return;
  }

  function methodOf(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function urlOf(input) {
    return String((input && input.url) || input || '');
  }

  function isOcrExtract(url, method) {
    return method === 'POST' && /\/v1\/ocr\/extract(?:\/pwa)?\/?(?:\?.*)?$/i.test(url);
  }

  function sessionToken() {
    try {
      return String(localStorage.getItem(K + 'sessionToken') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function authenticatedEndpoint() {
    const base = global.CrewBIQCore.orchestratorTransport.getOrchestratorBase();
    return String(base || '').replace(/\/$/, '') + '/v1/ocr/extract/pwa';
  }

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  async function routedFetch(input, init = {}) {
    const method = methodOf(input, init);
    const originalUrl = urlOf(input);
    if (!isOcrExtract(originalUrl, method)) {
      return previousFetch(input, init);
    }

    const token = sessionToken();
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        reason: 'auth_required',
        stored: false,
        review_required: false,
        warnings: [],
      });
    }

    const headers = new Headers(init.headers || (input && input.headers) || {});
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', 'Bearer ' + token);
    headers.delete('X-CrewBIQ-Secret');
    headers.delete('x-crewbiq-secret');

    return previousFetch(authenticatedEndpoint(), {
      ...init,
      method: 'POST',
      headers,
      cache: 'no-store',
    });
  }

  function installUiGuards() {
    const originalErrorMessage = global.scanErrorMessage;
    if (typeof originalErrorMessage === 'function' && !originalErrorMessage.__crewbiqOcrAuth) {
      const wrappedErrorMessage = function (result, httpStatus) {
        const reason = result && result.reason;
        if (httpStatus === 401 || reason === 'auth_required') {
          return 'Your session expired. Log in again before scanning.';
        }
        if (httpStatus === 413 || reason === 'file_too_large') {
          return 'File is too large. Max 8 MB.';
        }
        return originalErrorMessage.apply(this, arguments);
      };
      wrappedErrorMessage.__crewbiqOcrAuth = true;
      global.scanErrorMessage = wrappedErrorMessage;
    }

    const originalExtract = global.extractScanDocument;
    if (typeof originalExtract === 'function' && !originalExtract.__crewbiqOcrAuth) {
      const wrappedExtract = async function () {
        try {
          return await originalExtract.apply(this, arguments);
        } finally {
          try {
            const fileEl = document.getElementById('scanFile');
            if (fileEl) fileEl.value = '';
          } catch (e) {}
        }
      };
      wrappedExtract.__crewbiqOcrAuth = true;
      global.extractScanDocument = wrappedExtract;
    }
  }

  global.fetch = routedFetch;
  global.CrewBIQOCR = {
    version: '0.1.0',
    authenticatedEndpoint,
    sessionToken,
    isOcrExtract,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installUiGuards);
    } else {
      setTimeout(installUiGuards, 0);
    }
  }

  console.info('[CrewBIQ OCR] authenticated transport v0.1.0 loaded');
})(window);
