// ─────────────────────────────────────────────────────────────────────────
//  MySalon — Service Worker (minimal)
//  Place at: /Mysalon/service-worker.js
//
//  WHY THIS EXISTS
//  Android (Chrome/Edge) won't trigger the install prompt unless the page
//  has a registered service worker that listens for fetch events. We don't
//  actually need offline-first behavior here — we just need to satisfy
//  the install criteria. So this SW does a network-only passthrough.
//
//  The fetch handler catches failures so Chrome doesn't log hundreds of
//  uncaught promise rejections when requests fail (e.g. offline or
//  when the app fires many concurrent requests).
// ─────────────────────────────────────────────────────────────────────────

const SW_VERSION = 'mysalon-v1';

self.addEventListener('install', (event) => {
  // Skip the waiting phase so updated SWs activate immediately on next nav
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any open tabs as soon as the new SW activates
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-only passthrough with error handling.
  // Without the .catch(), any failed fetch (network error, 404, offline)
  // surfaces as an uncaught promise rejection in the console.
  event.respondWith(
    fetch(event.request).catch(function(err) {
      // Let the browser handle the failure normally — don't swallow it
      // silently, but also don't let it become an uncaught rejection.
      return Response.error();
    })
  );
});
