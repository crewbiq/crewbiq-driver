/**
 * CrewBIQ Offline Sync Queue v0.1.0
 *
 * Preserves authenticated driver_report operations across network failure and
 * reload. Queue entries contain sanitized business payloads only. Session
 * material is injected transiently at send time and is never persisted.
 */
(function (global) {
  'use strict';

  const K = 'fiqD_';
  const QUEUE_KEY = K + 'pendingSyncOperations';
  const STATUS_KEY = K + 'pendingSyncStatus';
  const QUEUE_SCHEMA = '1.0';
  const MAX_QUEUE_LENGTH = 8;
  const MAX_QUEUE_BYTES = 1500000;
  const downstreamFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;
  let queueChain = Promise.resolve();
  let onlineRetryTimer = null;

  if (!downstreamFetch) {
    console.warn('[CrewBIQ Offline Sync] fetch is unavailable');
    return;
  }

  class PendingQueueError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'PendingQueueError';
      this.code = code || 'queue_error';
    }
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requestUrl(input) {
    return typeof input === 'string' ? input : String((input && input.url) || '');
  }

  function requestMethod(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function parseBody(init) {
    const body = init && init.body;
    if (typeof body !== 'string') return null;
    try { return JSON.parse(body); } catch (e) { return null; }
  }

  function isSyncMutation(input, init, body) {
    if (requestMethod(input, init) !== 'POST' || !body || typeof body !== 'object') return false;
    const inner = body.payload && typeof body.payload === 'object' ? body.payload : body;
    return inner.type === 'driver_report' || inner.type === 'pti_report';
  }

  function sanitizeForQueue(value) {
    if (Array.isArray(value)) return value.map(sanitizeForQueue);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (
        lower === 'sessiontoken' ||
        lower === 'authorization' ||
        lower === 'password' ||
        lower === 'x-crewbiq-secret'
      ) continue;
      result[key] = sanitizeForQueue(item);
    }
    return result;
  }

  function containsForbiddenKey(value) {
    if (Array.isArray(value)) return value.some(containsForbiddenKey);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, item]) => {
      const lower = key.toLowerCase();
      return lower === 'sessiontoken' || lower === 'authorization' ||
        lower === 'password' || lower === 'x-crewbiq-secret' ||
        containsForbiddenKey(item);
    });
  }

  function syncTarget(payload) {
    return payload && payload.payload && typeof payload.payload === 'object'
      ? payload.payload
      : payload;
  }

  function secureId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  }

  function ensureRecordId(payload) {
    const target = syncTarget(payload);
    if (!target || typeof target !== 'object') {
      throw new PendingQueueError('Sync payload is invalid', 'invalid_payload');
    }
    let recordId = String(target.record_id || payload.record_id || '').trim();
    if (!recordId) {
      const deviceId = String(target.deviceId || payload.deviceId || 'device')
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .slice(0, 60);
      recordId = 'sync_' + deviceId + '_' + secureId();
      target.record_id = recordId;
    }
    return recordId;
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalValue).join(',') + ']';
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    const ignored = new Set(['record_id', 'sentat', 'sessiontoken', 'authorization', 'password', 'updatedat']);
    const keys = Object.keys(value)
      .filter(key => !ignored.has(key.toLowerCase()))
      .sort();
    return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalValue(value[key])).join(',') + '}';
  }

  function operationIdentity(payload) {
    return canonicalValue(sanitizeForQueue(payload));
  }

  function extractSessionToken(body) {
    const inner = body && body.payload && typeof body.payload === 'object' ? body.payload : null;
    try {
      return String(
        (body && body.sessionToken) ||
        (inner && inner.sessionToken) ||
        localStorage.getItem(K + 'sessionToken') ||
        ''
      ).trim();
    } catch (e) {
      return String((body && body.sessionToken) || (inner && inner.sessionToken) || '').trim();
    }
  }

  function validateEntry(entry) {
    if (!entry || typeof entry !== 'object' || entry.schema_version !== QUEUE_SCHEMA) {
      throw new PendingQueueError('Pending sync queue is invalid', 'invalid_queue');
    }
    if (!entry.payload || typeof entry.payload !== 'object' || containsForbiddenKey(entry.payload)) {
      throw new PendingQueueError('Pending sync queue contains invalid material', 'invalid_queue');
    }
    const recordId = String(entry.record_id || '').trim();
    const payloadRecordId = String((syncTarget(entry.payload) || {}).record_id || '').trim();
    if (!recordId || recordId !== payloadRecordId) {
      throw new PendingQueueError('Pending sync queue record identity is invalid', 'invalid_queue');
    }
  }

  function loadQueue() {
    let raw = '';
    try { raw = localStorage.getItem(QUEUE_KEY) || ''; } catch (e) {
      throw new PendingQueueError('Pending sync queue cannot be read', 'storage_unavailable');
    }
    if (!raw) return [];
    let queue;
    try { queue = JSON.parse(raw); } catch (e) {
      throw new PendingQueueError('Pending sync queue is corrupted', 'invalid_queue');
    }
    if (!Array.isArray(queue) || queue.length > MAX_QUEUE_LENGTH) {
      throw new PendingQueueError('Pending sync queue is outside its safe bounds', 'invalid_queue');
    }
    queue.forEach(validateEntry);
    return queue;
  }

  function writeStatus(queue, state, reason) {
    const status = {
      schema_version: QUEUE_SCHEMA,
      pending_count: queue.length,
      state: ['idle', 'pending', 'offline', 'unauthorized', 'blocked'].includes(state) ? state : 'blocked',
      reason: String(reason || '').slice(0, 80),
      at: new Date().toISOString(),
    };
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(status)); } catch (e) {}
    return status;
  }

  function persistQueue(queue, state, reason) {
    if (!Array.isArray(queue) || queue.length > MAX_QUEUE_LENGTH) {
      throw new PendingQueueError('Pending sync queue is full', 'queue_full');
    }
    queue.forEach(validateEntry);
    const raw = JSON.stringify(queue);
    if (raw.length > MAX_QUEUE_BYTES) {
      throw new PendingQueueError('Pending sync queue exceeds its storage bound', 'queue_too_large');
    }
    try {
      if (queue.length) localStorage.setItem(QUEUE_KEY, raw);
      else localStorage.removeItem(QUEUE_KEY);
      const stored = queue.length ? localStorage.getItem(QUEUE_KEY) : null;
      if ((queue.length && stored !== raw) || (!queue.length && stored !== null)) {
        throw new Error('verification_failed');
      }
    } catch (e) {
      throw new PendingQueueError('Unable to persist pending sync operation', 'storage_unavailable');
    }
    writeStatus(queue, state || (queue.length ? 'pending' : 'idle'), reason);
  }

  function pendingStatus() {
    try {
      const queue = loadQueue();
      const raw = localStorage.getItem(STATUS_KEY);
      const stored = raw ? JSON.parse(raw) : {};
      return {
        pending_count: queue.length,
        state: queue.length ? String(stored.state || 'pending') : 'idle',
        at: String(stored.at || ''),
      };
    } catch (e) {
      return { pending_count: 0, state: 'blocked', at: '' };
    }
  }

  function enqueue(payload) {
    const clean = sanitizeForQueue(cloneJson(payload));
    const recordId = ensureRecordId(clean);
    if (containsForbiddenKey(clean)) {
      throw new PendingQueueError('Sync payload contains forbidden session material', 'invalid_payload');
    }
    const identity = operationIdentity(clean);
    const queue = loadQueue();
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (operationIdentity(queue[index].payload) === identity) {
        return { queue, entry: queue[index], reused: true };
      }
    }
    if (queue.length >= MAX_QUEUE_LENGTH) {
      throw new PendingQueueError('Pending sync queue is full', 'queue_full');
    }
    const entry = {
      schema_version: QUEUE_SCHEMA,
      record_id: recordId,
      created_at: new Date().toISOString(),
      attempts: 0,
      payload: clean,
    };
    queue.push(entry);
    persistQueue(queue, 'pending', 'queued_before_network');
    return { queue, entry, reused: false };
  }

  function responseJson(data, status) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  async function safeResponseData(response) {
    try {
      const value = await response.clone().json();
      return value && typeof value === 'object' ? value : {};
    } catch (e) {
      return {};
    }
  }

  function transientPayload(entry, token) {
    const payload = cloneJson(entry.payload);
    if (token) payload.sessionToken = token;
    return payload;
  }

  async function flushQueue(input, init, currentRecordId, token) {
    const queue = loadQueue();
    let currentResponse = null;
    let flushed = 0;

    while (queue.length) {
      const entry = queue[0];
      entry.attempts = Number(entry.attempts || 0) + 1;
      persistQueue(queue, 'pending', 'attempting');

      let response;
      try {
        response = await downstreamFetch(input, {
          ...(init || {}),
          method: 'POST',
          body: JSON.stringify(transientPayload(entry, token)),
        });
      } catch (error) {
        persistQueue(queue, 'offline', 'network_error');
        return responseJson({
          ok: false,
          pending: true,
          pending_count: queue.length,
          record_id: currentRecordId,
          error: 'Sync saved locally and pending connection restore',
        }, 503);
      }

      const data = await safeResponseData(response);
      if (!response.ok || data.ok === false) {
        const state = response.status === 401 ? 'unauthorized' : 'blocked';
        persistQueue(queue, state, 'http_' + response.status);
        return responseJson({
          ok: false,
          pending: true,
          pending_count: queue.length,
          record_id: currentRecordId,
          upstream_status: response.status,
          error: response.status === 401
            ? 'Login required before pending sync can continue'
            : 'Sync remains pending after server rejection',
        }, response.status || 502);
      }

      if (entry.record_id === currentRecordId) currentResponse = response;
      queue.shift();
      flushed += 1;
      persistQueue(queue, queue.length ? 'pending' : 'idle', queue.length ? 'flushing' : 'complete');
    }

    if (currentResponse) return currentResponse;
    return responseJson({
      ok: true,
      received: true,
      record_id: currentRecordId,
      pending_flushed: flushed,
    }, 200);
  }

  function serialize(task) {
    const run = queueChain.then(task, task);
    queueChain = run.catch(() => undefined);
    return run;
  }

  async function queuedFetch(input, init = {}) {
    const body = parseBody(init);
    if (!isSyncMutation(input, init, body)) return downstreamFetch(input, init);

    return serialize(async () => {
      try {
        const token = extractSessionToken(body);
        const queued = enqueue(body);
        return await flushQueue(input, init, queued.entry.record_id, token);
      } catch (error) {
        const code = error && error.code ? error.code : 'queue_error';
        const status = code === 'queue_full' || code === 'queue_too_large' ? 507 : 409;
        return responseJson({
          ok: false,
          pending: true,
          pending_count: pendingStatus().pending_count,
          error: 'Pending sync queue is unavailable',
          reason: code,
        }, status);
      }
    });
  }

  function showPendingState() {
    const status = pendingStatus();
    if (!status.pending_count) return;
    if (typeof global.setSyncUI === 'function') {
      global.setSyncUI('err', 'Pending sync · ' + status.pending_count);
    }
  }

  global.fetch = queuedFetch;

  const Core = global.CrewBIQCore;
  if (Core && Core.events) {
    Core.events.on('sync:error', () => {
      setTimeout(showPendingState, 0);
    });
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', () => {
      const status = pendingStatus();
      if (!status.pending_count || onlineRetryTimer) return;
      onlineRetryTimer = setTimeout(() => {
        onlineRetryTimer = null;
        if (typeof global.doSync === 'function') global.doSync({ reason: 'online' });
      }, 250);
    });
  }

  setTimeout(showPendingState, 0);

  global.CrewBIQOfflineSync = Object.freeze({
    version: '0.1.0',
    pendingStatus,
    pendingCount: () => pendingStatus().pending_count,
  });

  console.info('[CrewBIQ Offline Sync] v0.1.0 loaded');
})(window);
