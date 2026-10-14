// Active Service Worker cleanup worker
// Unregisters any active or stale Service Worker instances and clears all Workbox / Serwist cache storage.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .then(() => self.registration.unregister())
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Pass through all requests directly to the network
    return;
});