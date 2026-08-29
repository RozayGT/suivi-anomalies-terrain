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

  // Requête de vérification de version : toujours directement au réseau, jamais mise en cache.
  if (url.searchParams.has('v')) return;

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

// ---------------------------------------------------------------
// Notifications : réception et affichage
// ---------------------------------------------------------------

const FIREBASE_PROJECT_ID = 'suivi-anomalies-terrain-83472';
const CATEGORY_LABELS = {
  'percage-insert': 'Perçage / Insert',
  'aiguille': 'Aiguille',
  'crocodile': 'Crocodile',
  'kvb': 'KVB',
  'pedales': 'Pédales',
  'cdv': 'CDV',
  'signaux': 'Signaux',
  'centre': 'Centre',
  'parafoudre': 'Parafoudre',
  'rechauffage': 'Réchauffage',
};

// Le message push n'a pas de contenu : on va chercher la dernière anomalie
// pour composer une notification précise.
async function buildNotificationText() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'anomalies' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: 1,
        },
      }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const doc = rows && rows[0] && rows[0].document;
    if (!doc || !doc.fields) return null;
    const f = doc.fields;
    const val = (k) => (f[k] && f[k].stringValue) || '';
    const cat = CATEGORY_LABELS[val('category')] || '';
    const parts = [val('identifiant'), cat].filter(Boolean).join(' · ');
    const detail = [val('voie') && ('Voie ' + val('voie')), val('equipement')].filter(Boolean).join(' · ');
    const author = val('createdBy');
    return {
      title: 'Nouvelle anomalie' + (parts ? ' — ' + parts : ''),
      body: [detail, author && ('Ajoutée par ' + author)].filter(Boolean).join('\n') || 'Touchez pour ouvrir le suivi.',
    };
  } catch (e) {
    return null;
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const info = await buildNotificationText();
    await self.registration.showNotification(
      (info && info.title) || 'Nouvelle anomalie',
      {
        body: (info && info.body) || 'Une anomalie vient d\u2019être ajoutée.',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: 'nouvelle-anomalie',
        renotify: true,
        data: { url: './' },
      }
    );
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});
