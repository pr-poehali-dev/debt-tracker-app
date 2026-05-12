const CACHE_NAME = 'debtflow-v10';
const NOTIF_ICON = 'https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/06ebc5e2-b802-4aeb-af0f-994592ccdbcb.jpg';
const STATIC_ASSETS = [
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'Офлайн' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  const isNavigation = event.request.mode === 'navigate' || (event.request.destination === 'document');
  const isHTML = event.request.headers.get('accept')?.includes('text/html');
  const isAppShell = isNavigation || isHTML || url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isAppShell) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  const isHashedAsset = /\/assets\/.+\.[a-f0-9]{6,}\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|gif)$/i.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try { data = { body: event.data && event.data.text ? event.data.text() : '' }; } catch (_) { data = {}; }
  }
  const title = data.title || 'Debt-Debt';
  const body = data.body || 'Новое уведомление';
  const tag = data.tag || ('debtflow-' + Date.now());
  const targetUrl = data.url || '/';

  const show = self.registration.showNotification(title, {
    body,
    icon: NOTIF_ICON,
    badge: NOTIF_ICON,
    tag,
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
    data: { url: targetUrl }
  }).catch((err) => {
    // Fallback: минимальный набор опций если что-то не нравится Android
    return self.registration.showNotification(title, {
      body,
      tag,
      data: { url: targetUrl }
    }).catch(() => {});
  });

  event.waitUntil(show);
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({ type: 'PUSH_RESUBSCRIBE' });
      }
    } catch (e) { /* ignore */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});