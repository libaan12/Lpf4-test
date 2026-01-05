
/// <reference lib="webworker" />

/* eslint-disable no-restricted-globals */

// Export empty type to treat this file as a module and prevent global scope collisions
export type {};

const CACHE_NAME = 'lp-f4-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  'https://files.catbox.moe/qn40s6.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap'
];

// Install a service worker
self.addEventListener('install', (event: any) => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  (self as any).skipWaiting();
});

// Cache and return requests
self.addEventListener('fetch', (event: any) => {
  // Skip cross-origin requests like Firebase or Google Analytics from strict caching if needed
  // But for CDN assets we want to try cache first
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Only cache if it matches our allowed list or is same origin
                // This is a simple strategy, can be refined
                if (event.request.url.startsWith(self.location.origin)) {
                    cache.put(event.request, responseToCache);
                }
              });

            return response;
          }
        );
      })
  );
});

// Update a service worker
self.addEventListener('activate', (event: any) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    })
  );
  (self as any).clients.claim();
});
