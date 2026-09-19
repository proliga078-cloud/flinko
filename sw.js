// Sobe este numero sempre que o formato da cache mudar: o evento 'activate'
// apaga as caches com outro nome.
const CACHE_NAME = 'flinko-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/pedidos.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Estrategia por tipo de pedido:
//  - navegacoes (HTML) e ficheiros .js/.css do proprio site: rede primeiro, cache
//    so se estiver offline. Assim, depois de um deploy, o HTML novo nunca corre
//    com JS antigo (com stale-while-revalidate isto acontecia no 1.o carregamento).
//  - imagens e restantes estaticos: cache primeiro, atualizada em segundo plano.
//  - pedidos a outras origens (Supabase, CDNs, mapas): nao passam pelo SW.
function redePrimeiro(req, fallbackUrl) {
  return fetch(req)
    .then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((res) => res || (fallbackUrl ? caches.match(fallbackUrl) : undefined)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Funcoes Netlify (ex: sitemap dinamico) nunca devem vir de cache.
  if (url.pathname.startsWith('/.netlify/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(redePrimeiro(req, '/index.html'));
    return;
  }
  if (/.(js|css)$/.test(url.pathname)) {
    event.respondWith(redePrimeiro(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Flinko', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Flinko';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/dashboard.html' },
    tag: data.tag || undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
