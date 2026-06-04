// ─────────────────────────────────────────────────────────────────────────
//  MySalon — Service Worker (minimal)
//  Place at site root: /service-worker.js
//
//  WHY THIS EXISTS
//  Android (Chrome/Edge) won't trigger the install prompt unless the page
//  has a registered service worker that listens for fetch events. We don't
//  actually need offline-first behavior here — we just need to satisfy
//  the install criteria. So this SW does a network-only passthrough.
//
//  IF YOU WANT OFFLINE LATER
//  Replace the fetch handler with a cache-first or stale-while-revalidate
//  strategy. Keep an eye on Supabase API calls — those should NOT be cached
//  (network-only with no-store) to avoid showing stale data.
// ─────────────────────────────────────────────────────────────────────────

const SW_VERSION = 'bb-v1';

self.addEventListener('install', (event) => {
  // Skip the waiting phase so updated SWs activate immediately on next nav
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any open tabs as soon as the new SW activates
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-only passthrough. The handler must exist (even as a no-op-ish
  // function) for Chrome to consider the PWA installable.
  event.respondWith(fetch(event.request));
});
