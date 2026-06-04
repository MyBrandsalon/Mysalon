// ════════════════════════════════════════════════════════════════
//  MYSALON — SERVICE WORKER (PWA)
//  Enables offline use of app shells and static assets.
//  Version bump _SW_VER_ to force cache refresh on deploy.
// ════════════════════════════════════════════════════════════════

var _SW_VER_  = 'mysalon-v1.0.0';
var _CACHE_   = _SW_VER_ + '-static';

// Files to pre-cache on install (app shells only — data comes from Supabase)
var PRECACHE = [
  '/',
  '/index.html',
  '/register-salon.html',
  '/login-stylist.html',
  '/app-stylist.html',
  '/login-owner.html',
  '/app-owner.html',
  '/login-franchise.html',
  '/app-franchise.html',
  '/login-customer.html',
  '/app-customer.html',
  '/login-superadmin.html',
  '/app-superadmin.html',
  '/queue-join.html',
  '/queue-display.html',
  '/upgrade.html',
  '/_mysalon.js',
  // Google Fonts (cache subset of loaded fonts)
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// ── Install: pre-cache app shells ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(_CACHE_).then(function(cache) {
      return cache.addAll(PRECACHE).catch(function(err) {
        // Non-fatal: some assets may fail (e.g. if offline during install)
        console.warn('[MySalon SW] Pre-cache partial failure:', err);
      });
    }).then(function() {
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ── Activate: clear old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== _CACHE_; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: network-first for API, cache-first for static ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Always network-first for Supabase API calls (real-time data)
  if(url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        // If offline and no cache: return empty JSON so app doesn't crash
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Cache-first for static assets (HTML, JS, fonts, images)
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if(cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful GET responses for static files
        if(event.request.method === 'GET' && response.status === 200) {
          var cloned = response.clone();
          caches.open(_CACHE_).then(function(cache) {
            cache.put(event.request, cloned);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback: return cached index if available
        return caches.match('/index.html');
      });
    })
  );
});

// ── Background sync: queue offline actions ──
// (Placeholder — implement with Background Sync API when needed)
self.addEventListener('sync', function(event) {
  if(event.tag === 'sync-entries') {
    event.waitUntil(syncPendingEntries());
  }
});

function syncPendingEntries() {
  // Future: read from IndexedDB pending queue and POST to Supabase
  return Promise.resolve();
}
