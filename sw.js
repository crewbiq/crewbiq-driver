/**
 * CrewBIQ Driver — Service Worker v1.0.78
 * CrewBIQ Technologies
 *
 * Strategy:
 *   - App shell → Cache First
 *   - External API and POST requests → Network Only (skip cache)
 *   - Everything else → Network First, fallback to cache
 *
 * IMPORTANT: bump CACHE_NAME any time an APP_SHELL file changes. The
 * app-shell cache-first strategy means a stale-installed PWA never sees
 * new deploys of index.html/loads.js/sync.js/etc. until this file's own
 * bytes change -- browsers re-check the registered service worker URL
 * directly (bypassing this worker's own cache-first fetch handler), so
 * a byte difference here is what actually triggers install/activate on
 * an already-installed device. A version bump in index.html's
 * registration query string alone does NOT do this: an installed PWA is
 * still running the OLD index.html, so it never even requests the new
 * query string until this file itself changes.
 */

const CACHE_NAME = 'crewbiq-driver-v79';

const APP_SHELL = [
  '/crewbiq-driver/',
  '/crewbiq-driver/index.html',
  '/crewbiq-driver/core.js',
  '/crewbiq-driver/core-runtime.js',
  '/crewbiq-driver/offline-sync-queue.js',
  '/crewbiq-driver/restore-hotfix.js',
  '/crewbiq-driver/settings-hotfix.js',
  '/crewbiq-driver/owner-snapshot-hotfix.js',
  '/crewbiq-driver/load-order-hotfix.js',
  '/crewbiq-driver/deduction-policy-hotfix.js',
  '/crewbiq-driver/deduction-period-hotfix.js',
  '/crewbiq-driver/settlement-week-hotfix.js',
  '/crewbiq-driver/deduction-trip-resolution.js',
  '/crewbiq-driver/accounting-action-guard.js',
  '/crewbiq-driver/deduction-policy-ui-fix.js',
  '/crewbiq-driver/ocr-hotfix.js',
  '/crewbiq-driver/ocr-invoice-review.js',
  '/crewbiq-driver/ocr-item-alias-hotfix.js',
  '/crewbiq-driver/ocr-service-invoice-review.js',
  '/crewbiq-driver/service-invoice-legacy-upgrade.js',
  '/crewbiq-driver/dispute-tombstone-hotfix.js',
  '/crewbiq-driver/sync.js',
  '/crewbiq-driver/pti.js',
  '/crewbiq-driver/loads.js',
  '/crewbiq-driver/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => {
        console.log('[CrewBIQ SW] App shell cached');
        return self.skipWaiting();
      })
      .catch(err => console.warn('[CrewBIQ SW] Cache install error:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[CrewBIQ SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => {
        console.log('[CrewBIQ SW] v1.0.78 activated');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('railway.app') ||
    event.request.method === 'POST'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (APP_SHELL.some(path => url.pathname === path || url.pathname.endsWith(path.replace('/crewbiq-driver', '')))) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request)
            .then(response => {
              if (!response || response.status !== 200) return response;
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
              return response;
            });
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
