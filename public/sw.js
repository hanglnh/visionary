const CACHE_NAME = 'visionary-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through fetch for now, to satisfy PWA installability requirements
  event.respondWith(fetch(event.request).catch(() => new Response('Offline')));
});
