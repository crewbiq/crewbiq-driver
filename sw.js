/**
 * CrewBIQ Driver — Service Worker v1.0.25
 * CrewBIQ Technologies
 *
 * Strategy:
 *   - App shell (index.html, core.js, sync.js, pti.js, loads.js) → Cache First
 *   - Google Sheets sync (fetch to external URL) → Network Only (skip cache)
 *   - Everything else → Network First, fallback to cache
 */

const CACHE_NAME = 'crewbiq-driver-v25';

// App shell — these files are cached on install
const APP_SHELL = [
  '/crewbiq-driver/',
  '/crewbiq-driver/index.html',
  '/crewbiq-driver/core.js',
  '/crewbiq-driver/sync.js',
  '/crewbiq-driver/pti.js',
  '/crewbiq-driver/loads.js',
  '/crewbiq-driver/manifest.json',
];

// ── INSTALL ────────────────────────────────────────────────────────────────
// Cache app shell immediately on install

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => {
        console.log('[CrewBIQ SW] App shell cached');
        return self.skipWaiting(); // activate immediately
      })
      .catch(err => console.warn('[CrewBIQ SW] Cache install error:', err))
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────────────
// Delete old caches on activate

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
        console.log('[CrewBIQ SW] v1.0.25 activated');
        return self.clients.claim(); // take control immediately
      })
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Google Sheets / external sync requests → Network Only
  //    Never cache these — always need fresh data
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    event.request.method === 'POST'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. App shell files → Cache First, then network
  //    If cached → serve instantly (works offline)
  //    If not cached → fetch and cache for next time
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

  // 3. Everything else → Network First, fallback to cache
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
