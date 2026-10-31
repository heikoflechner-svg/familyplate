'use strict';

// Bump SW_VERSION on every meaningful deployment to flush old caches.
// The browser detects byte-for-byte changes in this file and installs an update.
const SW_VERSION = 'fp-sw-v1';
const CACHE_STATIC = SW_VERSION + '-static';
const CACHE_PAGES  = SW_VERSION + '-pages';

// ── Install ────────────────────────────────────────────────────────────────────
// Pre-cache the app shell so the app can open fully offline.
// We do NOT skipWaiting here — the UI update-banner controls activation.
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_PAGES)
      .then(function(cache) { return cache.addAll(['/']); })
      .catch(function() { /* Offline at install time – skip pre-cache */ })
  );
});

// ── Activate ───────────────────────────────────────────────────────────────────
// Remove caches that belong to older SW versions.
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_STATIC && k !== CACHE_PAGES; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url;

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  try { url = new URL(request.url); } catch(e) { return; }

  // Only same-origin requests (Supabase, third-party APIs etc. pass through)
  if (url.origin !== self.location.origin) return;

  // /api/** → NetworkOnly: never cache server-side data endpoints
  if (url.pathname.startsWith('/api/')) return;

  // /_next/static/** → CacheFirst
  // These files have content-hashed names and are truly immutable.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(function(cache) {
        return cache.match(request).then(function(cached) {
          if (cached) return cached;
          return fetch(request).then(function(response) {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Navigation requests (HTML) → NetworkFirst
  // Always tries the network so users see the latest version when online.
  // Falls back to the cached page when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_PAGES).then(function(c) { c.put(request, clone); });
          }
          return response;
        })
        .catch(function() {
          return caches.match(request).then(function(r) {
            return r || caches.match('/');
          });
        })
    );
    return;
  }
});

// ── Messages ───────────────────────────────────────────────────────────────────
// The UI sends SKIP_WAITING when the user taps the "Neue Version" banner.
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
