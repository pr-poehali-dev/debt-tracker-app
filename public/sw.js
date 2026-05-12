const CACHE_NAME = 'debtflow-v16';
const NOTIF_ICON = 'https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/1fc8d648-75a0-4808-a076-fa467c7354e3.jpg';
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
  const show = (async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (e) {
      try {
        data = { body: event.data && event.data.text ? event.data.text() : '' };
      } catch (_) {
        data = {};
      }
    }

    const title = String(data.title || 'Debt-Debt');
    const body = String(data.body || 'Новое уведомление');
    const targetUrl = data.url || '/';
    const uniqueTag = 'debtflow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    try {
      await self.registration.showNotification(title, {
        body,
        icon: NOTIF_ICON,
        badge: NOTIF_ICON,
        tag: uniqueTag,
        renotify: false,
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        data: { url: targetUrl }
      });
      return;
    } catch (err1) {
      try {
        await self.registration.showNotification(title, {
          body,
          icon: NOTIF_ICON,
          tag: uniqueTag
        });
        return;
      } catch (err2) {
        try {
          await self.registration.showNotification(title, { body });
        } catch (_) {}
      }
    }
  })();

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