// Service worker : stratégie "réseau d'abord".
// Objectif : l'appareil récupère toujours la dernière version publiée quand il a du
// réseau, tout en gardant une copie locale pour continuer à fonctionner hors ligne.

const CACHE_NAME = 'anomalies-runtime';

self.addEventListener('install', (event) => {
  // La nouvelle version prend la main immédiatement, sans attendre la fermeture des onglets.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Laisse passer sans interférer tout ce qui ne vient pas du site lui-même
  // (Firebase, polices Google, etc.) : ces requêtes gèrent déjà leur propre cache.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
