/**
 * CrewBIQ Driver — Service Worker v1.0.57
 * CrewBIQ Technologies
 *
 * Strategy:
 *   - App shell → Cache First
 *   - External API and POST requests → Network Only (skip cache)
 *   - Everything else → Network First, fallback to cache
 */

const CACHE_NAME = 'crewbiq-driver-v58';

// App shell — these files are cached on install
const APP_SHELL = [
  '/crewbiq-driver/',
  '/crewbiq-driver/index.html',
  '/crewbiq-driver/core.js',
  '/crewbiq-driver/core-runtime.js',
  '/crewbiq-driver/restore-hotfix.js',
  '/crewbiq-driver/sync.js',
  '/crewbiq-driver/pti.js',
  '/crewbiq-driver/loads.js',
  '/crewbiq-driver/manifest.json',
];

// ── INSTALL ────────────────────────────────────────────────────────────────

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

// ── ACTIVATE ───────────────────────────────────────────────────────────────

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
        console.log('[CrewBIQ SW] v1.0.57 activated');
        return self.clients.claim();
      })
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // External APIs and all POST requests → Network Only.
  // Never cache auth, restore, sync, OCR, or Google integration traffic.
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('railway.app') ||
    event.request.method === 'POST'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell files → Cache First, then network.
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

  // Everything else → Network First, fallback to cache.
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
