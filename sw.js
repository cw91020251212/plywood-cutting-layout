/* Cutting Optimizer service worker
 * Internal reliability only: network-first HTML/assets with a versioned offline cache.
 * The version is intentionally changed whenever the application bundle changes so
 * installed PWA clients do not keep an old index.html after a release.
 */
const APP_VERSION = '2026-10-08-layout-diversity-1';
const CACHE_NAME = `cutting-optimizer-${APP_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './assets/cut-path-overlay.js?v=4',
  './assets/table-saw-optimizer.js?v=2',
  './assets/part-appearance.js?v=3',
  './assets/part-dimension-display.js?v=2',
  './assets/manifest.webmanifest',
  './assets/favicon.ico',
  './assets/cutting-wood-192.png',
  './assets/cutting-wood-512.png',
  './assets/cutting-wood-180.png'
];

function isSameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

async function cacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(CORE_ASSETS.map(async (asset) => {
    try {
      await cache.add(asset);
    } catch (_) {
      // Optional PWA assets should never prevent installation of the app shell.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCoreAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('cutting-optimizer-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!isSameOriginGet(request)) return;

  event.respondWith((async () => {
    try {
      // Navigations must bypass the browser HTTP cache. Otherwise an older
      // HTML shell can survive even after the app bundle has been updated.
      const networkRequest = request.mode === 'navigate'
        ? new Request(request, { cache: 'no-store' })
        : request;
      const response = await fetch(networkRequest);
      if (response && response.status === 200 && response.type === 'basic') {
        // Do not cache HTML navigations; stale app shells are worse than a
        // temporary offline error and can restore removed controls.
        if (request.mode !== 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
      }
      return response;
    } catch (_) {
      if (request.mode === 'navigate') return Response.error();
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});
