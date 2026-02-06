
/// <reference lib="webworker" />

/* eslint-disable no-restricted-globals */

// Export empty type to treat this file as a module
export type {};

const CACHE_NAME = 'lp-f4-cache-v7';
const urlsToCache = [
  '/',
  '/index.html',
  '/logo.png',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap'
];

// Install a service worker
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('Cache open failed:', err);
      })
  );
  (self as any).skipWaiting();
});

// Cache and return requests
self.addEventListener('fetch', (event: any) => {
  const request = event.request;

  // 1. Navigation Fallback (For SPA / React Router)
  // If the user navigates to /lobby, /profile etc while offline, return index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // 2. Asset Caching Strategy (Stale-While-Revalidate logic for app shell, Network-First for others)
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Return cached response immediately if found
        if (response) {
          return response;
        }

        // Otherwise fetch from network
        return fetch(request).then(
          (response) => {
            // Check if valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Don't cache API calls to Firebase/Google/Data
            if (
                request.url.includes('firebase') || 
                request.url.includes('googleapis') || 
                request.url.includes('firestore') ||
                request.url.startsWith('chrome-extension')
            ) {
                return response;
            }

            // Cache new assets dynamically
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
            // If offline and image missing, could return a placeholder here
            return new Response("Offline", { status: 503, statusText: "Offline" });
        });
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
